import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';
import { loadState } from '../../../lib/game';
import { WANTED_AT } from '../../../lib/profile';
export const dynamic = 'force-dynamic';
// Only real police officers (real players) can see the wanted list.
export async function GET() {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const me = await loadState(u.id); if (!me || me.profile.profession !== 'police') return err('Officers only.', 403);
  const rows = await prisma.save.findMany({ where: { heat: { gte: WANTED_AT }, jailUntil: null, userId: { not: u.id } }, select: { heat: true, user: { select: { username: true } } }, take: 50, orderBy: { heat: 'desc' } });
  return NextResponse.json({ wanted: rows.map((r: { user: { username: string }; heat: number }) => ({ name: r.user.username, heat: r.heat })) });
}
