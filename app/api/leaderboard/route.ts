import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';
import { fameTier } from '../../../lib/profile';
export const dynamic = 'force-dynamic';
// Most popular players. Elites and influencers are just the top tiers of this list.
export async function GET() {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const rows = await prisma.save.findMany({ orderBy: [{ fame: 'desc' }, { updatedAt: 'asc' }], take: 30, select: { fame: true, origin: true, user: { select: { username: true } } } });
  const mine = await prisma.save.findUnique({ where: { userId: u.id }, select: { fame: true } });
  const rank = mine ? (await prisma.save.count({ where: { fame: { gt: mine.fame } } })) + 1 : null;
  const top = rows.map((r, i) => ({ rank: i + 1, name: r.user.username, fame: r.fame, origin: r.origin, tier: fameTier(r.fame).id, you: r.user.username === u.username }));
  return NextResponse.json({ top, me: mine ? { rank, fame: mine.fame, tier: fameTier(mine.fame).id } : null });
}
