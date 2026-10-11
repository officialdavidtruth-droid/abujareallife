import { NextResponse } from 'next/server';
import { addSeasonScore } from '../../../lib/seasonServer';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, serverError } from '../../../lib/auth';
import { loadState } from '../../../lib/game';
import { weatherAt } from '../../../lib/worldClock';
import { DRIVER_FARES, quoteEarn } from '../../../lib/earnCap';
import { activeCityEvents, districtProfile } from '../../../lib/livingCity';

// Base fares. Rain pushes taxi demand (price) up and bike demand down; traffic events add a surcharge.
const PRICE = { taxi: 2500, bike: 800, bus: 300, keke: 500, shuttle: 6000, train: 1500, private_driver: 15000 } as const;
type Kind = keyof typeof PRICE;
export const dynamic = 'force-dynamic';

async function fareFor(kind: Kind, district?: string) {
  const wx = weatherAt(), events: { kind: string }[] = await activeCityEvents().catch(() => []);
  const rain = wx.rain > 0.5, storm = !!wx.storm;
  const surge = events.some(e => e.kind === 'traffic' || e.kind === 'flood') ? 1.2 : 1;
  const weather = kind === 'taxi' || kind === 'private_driver' ? (rain ? 1.3 : 1) : kind === 'bike' || kind === 'keke' ? (storm ? 1.5 : rain ? 0.85 : 1) : 1;
  const wealth = district ? 0.8 + districtProfile(district).wealth / 250 : 1; // Maitama costs more than Kubwa
  return Math.round(PRICE[kind] * surge * weather * wealth / 50) * 50;
}

async function getImpl() {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const ch = await prisma.character.findUnique({ where: { userId: u.id }, select: { district: true } }).catch(() => null);
  const fares = Object.fromEntries(await Promise.all((Object.keys(PRICE) as Kind[]).map(async k => [k, await fareFor(k, ch?.district)])));
  return NextResponse.json({ fares });
}

async function postImpl(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({}));
  const ch = await prisma.character.findUnique({ where: { userId: u.id }, select: { district: true } }).catch(() => null);

  // Player-as-driver: a Driver profession earns a fare for carrying a passenger (server-side cooldown, rating grows).
  if (b.action === 'drive_fare') {
    const st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
    if (st.profile.profession !== 'driver') return err('Only the Driver profession can take passengers.', 403);
    if (st.jailLeft) return err('You are in jail.', 403);
    const kind: Kind = b.kind === 'bike' ? 'bike' : 'taxi';
    const fare = await fareFor(kind, ch?.district);
    const base = Math.round(fare * 1.6);
    // The 30 s cooldown AND the daily limit (lib/earnCap.ts: diminishing pay, hard ceiling) are checked and the fare paid under a lock on the player's row, so parallel requests cannot each collect a fare.
    const paid = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 FROM "Save" WHERE "userId" = ${u.id} FOR UPDATE`;
      const last = await tx.transaction.findFirst({ where: { userId: u.id, description: { startsWith: 'driver-fare' } }, orderBy: { createdAt: 'desc' } });
      if (last && Date.now() - last.createdAt.getTime() < 30_000) return { ok: false as const, why: 'wait' as const };
      const q = await quoteEarn(tx, u.id, DRIVER_FARES, base);
      if (q.pay <= 0) return { ok: false as const, why: 'cap' as const, note: q.note };
      await tx.save.update({ where: { userId: u.id }, data: { cash: { increment: q.pay }, fame: { increment: q.mult >= 1 ? 1 : 0 } } });
      await tx.transaction.create({ data: { userId: u.id, type: 'EARN', amount: q.pay, description: `driver-fare:${kind}` } });
      await tx.reputation.upsert({ where: { userId: u.id }, update: { trust: { increment: 1 }, score: { increment: 1 } }, create: { userId: u.id, score: 51, trust: 51 } });
      return { ok: true as const, earned: q.pay, note: q.note, fame: q.mult >= 1 ? 1 : 0 };
    });
    if (!paid.ok) return paid.why === 'cap' ? err(paid.note, 429) : err('No passenger waiting yet. Try again shortly.', 429);
    if (paid.fame) await addSeasonScore(u.id, 'fame', paid.fame);
    return NextResponse.json({ ok: true, earned: paid.earned, note: paid.note });
  }

  const kind = String(b.kind || '') as Kind;
  if (!(kind in PRICE)) return err('Transport unavailable.', 400);
  const price = await fareFor(kind, ch?.district);
  const st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
  if (st.jailLeft) return err('You are in jail.', 403);
  const paid = await prisma.$transaction(async tx => {
    const r = await tx.save.updateMany({ where: { userId: u.id, cash: { gte: price } }, data: { cash: { decrement: price } } });   // the guard makes it impossible to go below zero
    if (!r.count) return false;
    await tx.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -price, description: `${kind}:city transport` } });
    return true;
  });
  if (!paid) return err(`You need ₦${price.toLocaleString()} for this ride.`, 402);
  const n = await loadState(u.id);
  return NextResponse.json({ ok: true, price, cash: n!.save.cash });
}

export async function GET() { try { return await getImpl(); } catch (e) { return serverError(e); } }
export async function POST(req: Request) { try { return await postImpl(req); } catch (e) { return serverError(e); } }
