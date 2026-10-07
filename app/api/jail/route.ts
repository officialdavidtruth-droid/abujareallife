import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';
import { loadState } from '../../../lib/game';
import { BAIL_PER_SEC } from '../../../lib/profile';
export const dynamic = 'force-dynamic';
export async function GET() {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
  return NextResponse.json({ jailLeft: st.jailLeft, bail: st.jailLeft * BAIL_PER_SEC });
}
export async function POST() { // pay bail
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const st = await loadState(u.id); if (!st || !st.jailLeft) return err('You are not in jail.', 409);
  const bail = st.jailLeft * BAIL_PER_SEC;
  const r = await prisma.save.updateMany({ where: { userId: u.id, cash: { gte: bail } }, data: { cash: { decrement: bail }, jailUntil: null, heat: 0 } });
  if (!r.count) return err(`Bail is ₦${bail.toLocaleString()}. You cannot afford it.`, 402);
  await prisma.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -bail, description: 'bail' } });
  return NextResponse.json({ ok: true });
}
