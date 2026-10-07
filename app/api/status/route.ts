import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';
import { loadState, publicState, tickActivity } from '../../../lib/game';
export const dynamic = 'force-dynamic';
export async function GET() {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
  await tickActivity(u.id, st.save);
  const q = st.save.questId || ''; // an 8-12 min shift or task must not lose its 'inside' flag (it expires after 30 min)
  if (st.save.inside && (q.startsWith(`shift:${st.save.inside}:`) || q.startsWith(`mtask:${st.save.inside}:`))) await prisma.save.update({ where: { userId: u.id }, data: { insideAt: new Date() } });
  const fresh = await loadState(u.id);
  return NextResponse.json(publicState(fresh || st));
}
