import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';
import { loadState } from '../../../lib/game';
import { weatherAt } from '../../../lib/worldClock';
import { activeCityEvents, districtProfile } from '../../../lib/livingCity';

// Base fares. Rain pushes taxi demand (price) up and bike demand down; traffic events add a surcharge.
const PRICE = { taxi: 2500, bike: 800, bus: 300, keke: 500, shuttle: 6000, train: 1500, private_driver: 15000 } as const;
type Kind = keyof typeof PRICE;
export const dynamic = 'force-dynamic';

async function fareFor(kind: Kind, district?: string) {
  const wx = weatherAt(), events = await activeCityEvents();
  const rain = wx.rain > 0.5, storm = !!wx.storm;
  const surge = events.some(e => e.kind === 'traffic' || e.kind === 'flood') ? 1.2 : 1;
  const weather = kind === 'taxi' || kind === 'private_driver' ? (rain ? 1.3 : 1) : kind === 'bike' || kind === 'keke' ? (storm ? 1.5 : rain ? 0.85 : 1) : 1;
  const wealth = district ? 0.8 + districtProfile(district).wealth / 250 : 1; // Maitama costs more than Kubwa
  return Math.round(PRICE[kind] * surge * weather * wealth / 50) * 50;
}

export async function GET() {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const ch = await prisma.character.findUnique({ where: { userId: u.id }, select: { district: true } });
  const fares = Object.fromEntries(await Promise.all((Object.keys(PRICE) as Kind[]).map(async k => [k, await fareFor(k, ch?.district)])));
  return NextResponse.json({ fares });
}

export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({}));
  const ch = await prisma.character.findUnique({ where: { userId: u.id }, select: { district: true } });

  // Player-as-driver: a Driver profession earns a fare for carrying a passenger (server-side cooldown, rating grows).
  if (b.action === 'drive_fare') {
    const st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
    if (st.profile.profession !== 'driver') return err('Only the Driver profession can take passengers.', 403);
    const last = await prisma.transaction.findFirst({ where: { userId: u.id, description: { startsWith: 'driver-fare' } }, orderBy: { createdAt: 'desc' } });
    if (last && Date.now() - last.createdAt.getTime() < 30_000) return err('No passenger waiting yet. Try again shortly.', 429);
    const kind: Kind = b.kind === 'bike' ? 'bike' : 'taxi';
    const fare = await fareFor(kind, ch?.district);
    const earn = Math.round(fare * 1.6);
    await prisma.$transaction([
      prisma.save.update({ where: { userId: u.id }, data: { cash: { increment: earn }, fame: { increment: 1 } } }),
      prisma.transaction.create({ data: { userId: u.id, type: 'EARN', amount: earn, description: `driver-fare:${kind}` } }),
      prisma.reputation.upsert({ where: { userId: u.id }, update: { trust: { increment: 1 }, score: { increment: 1 } }, create: { userId: u.id, score: 51, trust: 51 } }),
    ]);
    return NextResponse.json({ ok: true, earned: earn });
  }

  const kind = String(b.kind || '') as Kind;
  if (!(kind in PRICE)) return err('Transport unavailable.', 400);
  const price = await fareFor(kind, ch?.district);
  const save = await prisma.save.findUnique({ where: { userId: u.id } });
  if (!save) return err('Create your character first.', 409);
  if (save.cash < price) return err(`You need ₦${price.toLocaleString()} for this ride.`, 402);
  await prisma.$transaction([
    prisma.save.update({ where: { userId: u.id }, data: { cash: { decrement: price } } }),
    prisma.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -price, description: `${kind}:city transport` } }),
  ]);
  return NextResponse.json({ ok: true, price, cash: save.cash - price });
}
