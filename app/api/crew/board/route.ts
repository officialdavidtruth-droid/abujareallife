import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { currentUser, err, serverError } from '../../../../lib/auth';
import { cupStandings, settleDue } from '../../../../lib/crewServer';
export const dynamic = 'force-dynamic';

/* Crew leaderboard: rating (cup placings + turf wars), then districts held. Also today's live Crew Cup table. Cup table is cached 20 s: it reads every crew's earnings. */
let cache: { at: number; ev: string; table: Awaited<ReturnType<typeof cupStandings>> } | null = null;
export async function GET() {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    await settleDue();
    const [crews, mine, cupEv] = await Promise.all([
      prisma.crew.findMany({ orderBy: [{ rating: 'desc' }, { createdAt: 'asc' }], take: 30, include: { _count: { select: { members: true, turf: true } } } }),
      prisma.crewMember.findUnique({ where: { userId: u.id }, select: { crewId: true } }),
      prisma.crewEvent.findFirst({ where: { kind: 'cup', status: 'active' }, orderBy: { startsAt: 'desc' } }),
    ]);
    let cup: { rank: number; name: string; tag: string; kind: string; score: number; mine: boolean }[] = [], endsIn = 0;
    if (cupEv) {
      if (!cache || cache.ev !== cupEv.id || Date.now() - cache.at > 20_000) cache = { at: Date.now(), ev: cupEv.id, table: await cupStandings(cupEv, new Date()) };
      cup = cache.table.slice(0, 10).map((r, i) => ({ rank: i + 1, name: r.name, tag: r.tag, kind: r.kind, score: r.score, mine: r.id === mine?.crewId }));
      endsIn = Math.max(0, Math.ceil((cupEv.endsAt.getTime() - Date.now()) / 1000));
    }
    return NextResponse.json({ top: crews.map((c, i) => ({ rank: i + 1, name: c.name, tag: c.tag, kind: c.kind, rating: c.rating, members: c._count.members, turf: c._count.turf, mine: c.id === mine?.crewId })), cup, cupEndsIn: endsIn });
  } catch (e) { return serverError(e); }
}
