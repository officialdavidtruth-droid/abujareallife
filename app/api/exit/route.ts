import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';
export async function POST() {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  await prisma.save.updateMany({ where: { userId: u.id }, data: { inside: null, insideAt: null } });
  await prisma.save.updateMany({ where: { userId: u.id, OR: [{ questId: { startsWith: 'shift:' } }, { questId: { startsWith: 'mtask:' } }] }, data: { questId: null, questAt: null } }); // walking out forfeits an unfinished shift
  return NextResponse.json({ ok: true });
}
