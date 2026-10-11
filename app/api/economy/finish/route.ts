import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { currentUser, err } from '../../../../lib/auth';
import { ACTS, MIN_JOB_MS, capGroupFor } from '../../../../lib/economy';
import { quoteEarn, lockPlayer } from '../../../../lib/earnCap';

// Pays out the open job ticket once (single use), only after a minimum real time, and never beyond the daily limits in lib/earnCap.ts.
export async function POST() {
  const u = await currentUser();
  if (!u) return err('Not signed in.', 401);
  const s = await prisma.save.findUnique({ where: { userId: u.id } });
  const base = s?.jobAct ? ACTS[s.jobAct]?.pay : undefined;
  if (!s || !s.jobAct || !s.jobAt || !base) return err('No job to finish.', 400);
  if (Date.now() - s.jobAt.getTime() < MIN_JOB_MS) return NextResponse.json({ error: 'That was too fast — no pay.', cash: s.cash }, { status: 429 });
  const act = s.jobAct, at = s.jobAt, grp = capGroupFor(act);
  // Lock the player's row, work out today's rate from their EARN history, then pay and record in one transaction (parallel finishes cannot beat the limit).
  const res = await prisma.$transaction(async tx => {
    await lockPlayer(tx, u.id);
    const q = grp ? await quoteEarn(tx, u.id, grp, base) : { pay: base, note: '', capped: false, mult: 1, remaining: Infinity, runs: 0, earned: 0 };
    const r = await tx.save.updateMany({ where: { userId: u.id, jobAct: act, jobAt: at }, data: { jobAct: null, jobAt: null, ...(q.pay > 0 ? { cash: { increment: q.pay } } : {}) } });
    if (!r.count) return { dup: true as const };
    if (q.pay > 0) await tx.transaction.create({ data: { userId: u.id, type: 'EARN', amount: q.pay, description: act } });
    return { dup: false as const, q };
  });
  if (res.dup) return err('Already paid.', 409);
  const n = await prisma.save.findUnique({ where: { userId: u.id } });
  if (res.q.pay <= 0) return NextResponse.json({ error: res.q.note, cash: n?.cash ?? 0, capped: true }, { status: 429 });
  return NextResponse.json({ cash: n?.cash ?? 0, paid: res.q.pay, mult: res.q.mult, note: res.q.note });
}
