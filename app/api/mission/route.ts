import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, throttled } from '../../../lib/auth';
import { loadState } from '../../../lib/game';
import { MISSIONS, MISSION_COOLDOWN_MS, MISSION_GRACE_MS, MISSION_WINDOW_MS } from '../../../lib/missions';
/* Missions are tracked with Transaction rows (no schema change needed):
   'mission-start:<id>'  amount 0     -> the contract is active (deleted when claimed / abandoned)
   'mission:<id>'        EARN reward  -> the contract was paid (also the cooldown marker) */
const since = (ms: number) => new Date(Date.now() - ms);

export async function GET() {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const [paid, started] = await Promise.all([
    prisma.transaction.findMany({ where: { userId: u.id, description: { startsWith: 'mission:' }, createdAt: { gte: since(MISSION_COOLDOWN_MS) } }, select: { description: true } }),
    prisma.transaction.findFirst({ where: { userId: u.id, description: { startsWith: 'mission-start:' }, createdAt: { gte: since(MISSION_WINDOW_MS) } }, orderBy: { createdAt: 'desc' }, select: { description: true, createdAt: true } }),
  ]);
  return NextResponse.json({ ok: true, completed: paid.map(p => p.description.slice('mission:'.length)), active: started ? started.description.slice('mission-start:'.length) : null, startedAt: started ? started.createdAt.getTime() : null });
}

export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({}));
  if (throttled('mission:' + u.id, 30, 10 * 60_000)) return err('Slow down.', 429);
  const st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
  if (st.jailLeft) return err('You are in jail.', 403);

  if (b.action === 'abandon') {
    await prisma.transaction.deleteMany({ where: { userId: u.id, description: { startsWith: 'mission-start:' } } });
    return NextResponse.json({ ok: true });
  }
  const m = MISSIONS.find(x => x.id === b.id); if (!m) return err('Unknown mission.');

  if (b.action === 'start') {
    const done = await prisma.transaction.findFirst({ where: { userId: u.id, description: 'mission:' + m.id, createdAt: { gte: since(MISSION_COOLDOWN_MS) } } });
    if (done) return err('You already completed this contract. Try again later.', 429);
    await prisma.transaction.deleteMany({ where: { userId: u.id, description: { startsWith: 'mission-start:' } } }); // one active contract at a time
    const row = await prisma.transaction.create({ data: { userId: u.id, type: 'MISSION', amount: 0, description: 'mission-start:' + m.id } });
    if (m.heat) await prisma.save.update({ where: { userId: u.id }, data: { heat: { increment: m.heat }, heatAt: new Date() } }); // chase contracts put the police on you at once
    return NextResponse.json({ ok: true, startedAt: row.createdAt.getTime(), heatAdded: m.heat });
  }

  if (b.action === 'claim') {
    const start = await prisma.transaction.findFirst({ where: { userId: u.id, description: 'mission-start:' + m.id, createdAt: { gte: since(MISSION_WINDOW_MS) } }, orderBy: { createdAt: 'desc' } });
    if (!start) return err('Start the mission first.');
    if (Date.now() - start.createdAt.getTime() < m.minSecs * 1000) return err('Too fast. No pay.', 429);
    if (Date.now() - start.createdAt.getTime() > m.deadlineSecs * 1000 + MISSION_GRACE_MS) { await prisma.transaction.deleteMany({ where: { id: start.id } }); return err('Mission failed: time ran out.', 410); }
    const del = await prisma.transaction.deleteMany({ where: { id: start.id } });   // atomic: only one claim can consume the start row
    if (del.count !== 1) return err('Already claimed.', 409);
    await prisma.save.update({ where: { userId: u.id }, data: { cash: { increment: m.reward } } });
    await prisma.transaction.create({ data: { userId: u.id, type: 'EARN', amount: m.reward, description: 'mission:' + m.id } });
    const n = await loadState(u.id);
    return NextResponse.json({ ok: true, reward: m.reward, cash: n!.save.cash });
  }
  return err('Unknown action.');
}
