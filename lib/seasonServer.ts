import { prisma } from './prisma';
import { BOARDS, seasonAt, type BoardId } from './season';

/** add to a player's score on a "higher is better" board for the CURRENT season. Never throws: a missing table must not break the action that earned it. */
export async function addSeasonScore(userId: string, board: BoardId, delta: number) {
  if (!(delta > 0)) return;
  const season = seasonAt().index, key = { userId_season_board: { userId, season, board } };
  try {
    try { await prisma.seasonScore.upsert({ where: key, update: { score: { increment: Math.floor(delta) } }, create: { userId, season, board, score: Math.floor(delta) } }); }
    catch (e: any) { if (e?.code !== 'P2002') throw e; await prisma.seasonScore.update({ where: key, data: { score: { increment: Math.floor(delta) } } }); }   // two first-ever writes raced: the row exists now
  } catch (e) { console.error('season score', e); }
}

/** the top of one board for one season, plus where `userId` stands */
export async function seasonStandings(board: BoardId, season: number, userId: string, take = 30) {
  const asc = BOARDS[board].lowerIsBetter, dir = asc ? 'asc' : 'desc';
  const rows = await prisma.seasonScore.findMany({ where: { season, board }, orderBy: [{ score: dir }, { updatedAt: 'asc' }], take: take + 10 });
  const users = await prisma.user.findMany({ where: { id: { in: rows.map(r => r.userId) } }, select: { id: true, username: true } }), name = new Map(users.map(u => [u.id, u.username]));
  const top = rows.filter(r => name.has(r.userId)).slice(0, take).map((r, i) => ({ rank: i + 1, name: name.get(r.userId)!, score: r.score, you: r.userId === userId }));   // rows of deleted accounts are skipped
  const mine = await prisma.seasonScore.findUnique({ where: { userId_season_board: { userId, season, board } } });
  const rank = mine ? (await prisma.seasonScore.count({ where: { season, board, score: asc ? { lt: mine.score } : { gt: mine.score } } })) + 1 : null;
  return { top, me: mine ? { rank, score: mine.score } : null };
}
