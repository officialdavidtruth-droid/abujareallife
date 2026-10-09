import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, serverError } from '../../../lib/auth';
import { fareFor } from '../../../lib/transportFare';

export const dynamic = 'force-dynamic';

const REQUEST_TTL = 120_000;   // the rider has two minutes to accept
const ACCEPTED_TTL = 300_000;  // an accepted ride that never starts is cancelled and refunded
const LIM = 135;               // walkable limit of the city
const HAS_NUM = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

/** Pay the fare back to the sender and close the ride. Only runs for a ride that was really charged (accepted / riding). */
async function refund(id: string, from: string[]) {
  const claimed = await prisma.rideRequest.updateMany({ where: { id, status: { in: from } }, data: { status: 'cancelled' } });
  if (claimed.count !== 1) return false;
  const r = await prisma.rideRequest.findUnique({ where: { id } });
  if (r && r.fare > 0) await prisma.$transaction([
    prisma.save.update({ where: { userId: r.fromUserId }, data: { cash: { increment: r.fare } } }),
    prisma.transaction.create({ data: { userId: r.fromUserId, type: 'EARN', amount: r.fare, description: `ride-refund:${r.toName}` } }),
  ]).catch(() => {});
  return true;
}

/** Lazy clean-up of this player's stale rides (no cron needed). */
async function sweep(userId: string) {
  const now = Date.now();
  await prisma.rideRequest.updateMany({ where: { status: 'pending', createdAt: { lt: new Date(now - REQUEST_TTL) }, OR: [{ toUserId: userId }, { fromUserId: userId }] }, data: { status: 'expired' } });
  const stale = await prisma.rideRequest.findMany({ where: { status: 'accepted', updatedAt: { lt: new Date(now - ACCEPTED_TTL) }, OR: [{ toUserId: userId }, { fromUserId: userId }] }, select: { id: true } });
  for (const s of stale) await refund(s.id, ['accepted']);
}

const view = (r: { id: string; fromName: string; toName: string; kind: string; destName: string; destX: number; destZ: number; fare: number; status: string; createdAt: Date }) =>
  ({ id: r.id, from: r.fromName, to: r.toName, kind: r.kind, destName: r.destName, destX: r.destX, destZ: r.destZ, fare: r.fare, status: r.status, expiresIn: Math.max(0, Math.round((r.createdAt.getTime() + REQUEST_TTL - Date.now()) / 1000)) });

async function getImpl() {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  await sweep(u.id);
  const since = new Date(Date.now() - 10 * 60_000);
  const [incoming, accepted, outgoing] = await Promise.all([
    prisma.rideRequest.findMany({ where: { toUserId: u.id, status: 'pending' }, orderBy: { createdAt: 'asc' }, take: 5 }),
    prisma.rideRequest.findMany({ where: { toUserId: u.id, status: 'accepted' }, orderBy: { createdAt: 'asc' }, take: 3 }),
    prisma.rideRequest.findMany({ where: { fromUserId: u.id, updatedAt: { gt: since } }, orderBy: { updatedAt: 'desc' }, take: 10 }),
  ]);
  return NextResponse.json({ incoming: incoming.map(view), accepted: accepted.map(view), outgoing: outgoing.map(view) });
}

async function postImpl(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({}));
  const action = String(b.action || 'order');

  if (action === 'order') {
    const toName = String(b.to || '').trim();
    if (!toName) return err('Pick a player.', 400);
    const rider = await prisma.user.findUnique({ where: { usernameKey: toName.toLowerCase() }, select: { id: true, username: true } });
    if (!rider) return err('Player not found.', 404);
    if (rider.id === u.id) return err('You cannot order a ride for yourself: hail one in the street.', 400);
    const kind = b.kind === 'bike' ? 'bike' : 'taxi';
    const x = Number(b.destX), z = Number(b.destZ);
    if (!HAS_NUM(x) || !HAS_NUM(z) || Math.abs(x) > LIM || Math.abs(z) > LIM) return err('Pick a destination inside the city.', 400);
    const destName = String(b.destName || 'Meeting point').slice(0, 60);
    await sweep(u.id);
    // the rider has to be online right now, otherwise nobody can accept
    const pos = await prisma.playerPosition.findUnique({ where: { userId: rider.id }, select: { updatedAt: true, district: true } });
    if (!pos || Date.now() - pos.updatedAt.getTime() > 45_000) return err(`${rider.username} is not online right now.`, 409);
    const open = await prisma.rideRequest.count({ where: { fromUserId: u.id, status: 'pending' } });
    if (open >= 3) return err('You already have 3 ride requests waiting for an answer.', 429);
    const dup = await prisma.rideRequest.findFirst({ where: { fromUserId: u.id, toUserId: rider.id, status: 'pending' } });
    if (dup) return err(`You already sent ${rider.username} a ride request. Wait for their answer.`, 409);
    const fare = await fareFor(kind, pos.district);
    const save = await prisma.save.findUnique({ where: { userId: u.id }, select: { cash: true } });
    if (!save) return err('Create your character first.', 409);
    if (save.cash < fare) return err(`You need ₦${fare.toLocaleString()} to pay for this ride.`, 402);
    const r = await prisma.rideRequest.create({ data: { fromUserId: u.id, fromName: u.username, toUserId: rider.id, toName: rider.username, kind, destName, destX: x, destZ: z, fare } });
    return NextResponse.json({ ok: true, ride: view(r) });
  }

  const id = String(b.id || ''); if (!id) return err('Missing ride.', 400);
  const ride = await prisma.rideRequest.findUnique({ where: { id } });
  if (!ride) return err('Ride not found.', 404);

  if (action === 'accept') {
    if (ride.toUserId !== u.id) return err('This ride is not for you.', 403);
    const claimed = await prisma.rideRequest.updateMany({ where: { id, status: 'pending', createdAt: { gt: new Date(Date.now() - REQUEST_TTL) } }, data: { status: 'accepted' } });
    if (claimed.count !== 1) return err('This ride request has expired or was cancelled.', 409);
    // the sender pays now, atomically: the balance check and the deduction are one statement
    const paid = await prisma.save.updateMany({ where: { userId: ride.fromUserId, cash: { gte: ride.fare } }, data: { cash: { decrement: ride.fare } } });
    if (paid.count !== 1) {
      await prisma.rideRequest.update({ where: { id }, data: { status: 'cancelled' } }).catch(() => {});
      return err(`${ride.fromName} can no longer afford this ride.`, 402);
    }
    await prisma.transaction.create({ data: { userId: ride.fromUserId, type: 'SPEND', amount: -ride.fare, description: `${ride.kind}:ride for ${ride.toName}` } }).catch(() => {});
    return NextResponse.json({ ok: true, ride: view({ ...ride, status: 'accepted' }) });
  }
  if (action === 'decline') {
    if (ride.toUserId !== u.id) return err('This ride is not for you.', 403);
    const r = await prisma.rideRequest.updateMany({ where: { id, status: 'pending' }, data: { status: 'declined' } });
    return NextResponse.json({ ok: r.count === 1 });
  }
  if (action === 'cancel') {
    if (ride.fromUserId !== u.id) return err('This is not your request.', 403);
    const r = await prisma.rideRequest.updateMany({ where: { id, status: 'pending' }, data: { status: 'cancelled' } });
    if (r.count === 1) return NextResponse.json({ ok: true });
    const ok = await refund(id, ['accepted']); // already accepted but the rider has not climbed in yet: money back
    return NextResponse.json({ ok });
  }
  if (action === 'refund') { // the rider's game could not start the ride (no road route): give the sender their money back
    if (ride.toUserId !== u.id) return err('This ride is not for you.', 403);
    return NextResponse.json({ ok: await refund(id, ['accepted']) });
  }
  if (action === 'complete') {
    if (ride.toUserId !== u.id) return err('This ride is not for you.', 403);
    const r = await prisma.rideRequest.updateMany({ where: { id, status: 'riding' }, data: { status: 'completed' } });
    return NextResponse.json({ ok: r.count === 1 });
  }
  return err('Unknown action.', 400);
}

export async function GET() { try { return await getImpl(); } catch (e) { return serverError(e); } }
export async function POST(req: Request) { try { return await postImpl(req); } catch (e) { return serverError(e); } }
