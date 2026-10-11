import { prisma } from './prisma';
/* Housemates (HOUSEMATES.md): a player can live in someone else's house. The owner invites, the invited player accepts, and from then on the
   house's rooms, furniture and layout are shared. Pure server helpers; the table is HouseMate (status pending | live). */
export const MAX_MATES = 4;   // live + pending invites per house

export type Home = { id: string; username: string; shared: boolean };

/** The house this account lives in: its own, or the owner's when it is a live housemate there. */
export async function resolveHome(userId: string, username: string): Promise<Home> {
  const row = await prisma.houseMate.findFirst({ where: { mateId: userId, status: 'live' }, select: { ownerId: true } });
  if (!row) return { id: userId, username, shared: false };
  const o = await prisma.user.findUnique({ where: { id: row.ownerId }, select: { id: true, username: true } });
  return o ? { id: o.id, username: o.username, shared: true } : { id: userId, username, shared: false };
}
