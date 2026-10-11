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

/* ───── Visitors (HOME-DOOR.md) ───── */
export const VISIT = { knockMs: 60_000, allowMs: 90 * 60_000, cardMs: 3 * 60_000 };   // a knock waits 60 s; a welcome lasts 90 min (kept fresh while you are inside); a "come in" card shows 3 min

/** The house a player is looking at: their own home, or (with ?visit=<owner>) a house they have been let into. Returns null when the visit is not allowed. */
export async function resolveView(userId: string, username: string, visit?: string | null): Promise<Home | null> {
  if (!visit) return resolveHome(userId, username);
  const o = await prisma.user.findUnique({ where: { usernameKey: visit.trim().toLowerCase() }, select: { id: true, username: true } });
  if (!o) return null;
  const v = await prisma.homeVisit.findUnique({ where: { ownerId_guestId: { ownerId: o.id, guestId: userId } } });
  if (!v || v.status !== 'allowed' || Date.now() - v.updatedAt.getTime() > VISIT.allowMs) return null;
  return { id: o.id, username: o.username, shared: true };
}
