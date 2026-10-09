import { prisma } from './prisma';
/* Server-side "are these two real players really next to each other?" check, shared by robbing and carjacking.
   Uses the last positions each player reported (same plausibility rule as /api/shot) so nobody can mug from across the map. */
const MAX_SPEED = 30, POS_SLACK = 12, POS_MAX_AGE = 30_000;
const plausible = (c: { x: number; z: number }, row: { x: number; z: number; updatedAt: Date }, now: number) =>
  Math.hypot(c.x - row.x, c.z - row.z) <= MAX_SPEED * ((now - row.updatedAt.getTime()) / 1000) + POS_SLACK;

export async function checkNear(userId: string, targetName: string, s: { x: number; z: number }, t: { x: number; z: number }, range: number) {
  if (![s.x, s.z, t.x, t.z].every(Number.isFinite)) return { ok: false as const, reason: 'Bad positions.' };
  const now = Date.now();
  const rows = await prisma.playerPosition.findMany({ where: { OR: [{ userId }, { username: { equals: targetName, mode: 'insensitive' } }] } });
  const me = rows.find(r => r.userId === userId), him = rows.find(r => r.userId !== userId);
  if (!me || !him) return { ok: false as const, reason: 'That player is not nearby.' };
  if (now - me.updatedAt.getTime() > POS_MAX_AGE || now - him.updatedAt.getTime() > POS_MAX_AGE) return { ok: false as const, reason: 'That player is not nearby.' };
  if (!plausible(s, me, now) || !plausible(t, him, now)) return { ok: false as const, reason: 'Position check failed.' };
  if (Math.hypot(s.x - t.x, s.z - t.z) > range + 1.5) return { ok: false as const, reason: 'Too far away: get closer.' };
  return { ok: true as const, him, me };
}
