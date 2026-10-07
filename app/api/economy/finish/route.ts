import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { currentUser, err } from '../../../../lib/auth';
import { ACTS, MIN_JOB_MS } from '../../../../lib/economy';

// Pays out the open job ticket once (single use), and only after a minimum real time.
export async function POST() {
  const u = await currentUser();
  if (!u) return err('Not signed in.', 401);
  const s = await prisma.save.findUnique({ where: { userId: u.id } });
  const pay = s?.jobAct ? ACTS[s.jobAct]?.pay : undefined;
  if (!s || !s.jobAct || !s.jobAt || !pay) return err('No job to finish.', 400);
  if (Date.now() - s.jobAt.getTime() < MIN_JOB_MS) return NextResponse.json({ error: 'That was too fast — no pay.', cash: s.cash }, { status: 429 });
  const r = await prisma.save.updateMany({ where: { userId: u.id, jobAct: s.jobAct, jobAt: s.jobAt }, data: { cash: { increment: pay }, jobAct: null, jobAt: null } });
  if (!r.count) return err('Already paid.', 409);
  await prisma.transaction.create({ data: { userId: u.id, type: 'EARN', amount: pay, description: s.jobAct } });
  const n = await prisma.save.findUnique({ where: { userId: u.id } });
  return NextResponse.json({ cash: n?.cash ?? 0, paid: pay });
}
