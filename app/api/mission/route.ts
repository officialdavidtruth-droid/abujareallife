import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, throttled } from '../../../lib/auth';
import { clampHeat, loadState } from '../../../lib/game';
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

  // start and claim run under a lock on the player's row: parallel requests can no longer create several start rows
  // (and so claim the same contract several times) or pass the cooldown check together.
  if (b.action === 'start') {
    return prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 FROM "Save" WHERE "userId" = ${u.id} FOR UPDATE`;
      const done = await tx.transaction.findFirst({ where: { userId: u.id, description: 'mission:' + m.id, createdAt: { gte: since(MISSION_COOLDOWN_MS) } } });
      if (done) return err('You already completed this contract. Try again later.', 429);
      await tx.transaction.deleteMany({ where: { userId: u.id, description: { startsWith: 'mission-start:' } } }); // one active contract at a time
      const row = await tx.transaction.create({ data: { userId: u.id, type: 'MISSION', amount: 0, description: 'mission-start:' + m.id } });
      if (m.heat) { await tx.save.update({ where: { userId: u.id }, data: { heat: { increment: m.heat }, heatAt: new Date() } }); await clampHeat(tx, [u.id]); } // chase contracts put the police on you at once
      return NextResponse.json({ ok: true, startedAt: row.createdAt.getTime(), heatAdded: m.heat });
    });
  }

  if (b.action === 'claim') {
    return prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 FROM "Save" WHERE "userId" = ${u.id} FOR UPDATE`;
      const start = await tx.transaction.findFirst({ where: { userId: u.id, description: 'mission-start:' + m.id, createdAt: { gte: since(MISSION_WINDOW_MS) } }, orderBy: { createdAt: 'desc' } });
      if (!start) return err('Start the mission first.');
      if (await tx.transaction.findFirst({ where: { userId: u.id, description: 'mission:' + m.id, createdAt: { gte: since(MISSION_COOLDOWN_MS) } }, select: { id: true } })) return err('You already completed this contract. Try again later.', 429);
      if (Date.now() - start.createdAt.getTime() < m.minSecs * 1000) return err('Too fast. No pay.', 429);
      if (Date.now() - start.createdAt.getTime() > m.deadlineSecs * 1000 + MISSION_GRACE_MS) { await tx.transaction.deleteMany({ where: { userId: u.id, description: { startsWith: 'mission-start:' } } }); return err('Mission failed: time ran out.', 410); }
      await tx.transaction.deleteMany({ where: { userId: u.id, description: { startsWith: 'mission-start:' } } });   // consume every start row, not just this one
      await tx.save.update({ where: { userId: u.id }, data: { cash: { increment: m.reward } } });
      await tx.transaction.create({ data: { userId: u.id, type: 'EARN', amount: m.reward, description: 'mission:' + m.id } });
      const n = await tx.save.findUnique({ where: { userId: u.id }, select: { cash: true } });
      return NextResponse.json({ ok: true, reward: m.reward, cash: n?.cash ?? 0 });
    });
  }
  return err('Unknown action.');
}
