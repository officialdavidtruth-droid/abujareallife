import { prisma } from './prisma';
import { PLOT_COUNT } from './houses';
/* House plots are stored: User.houseSlot (unique, null until assigned) is the player's plot number in lib/houses.ts PLOTS.
   A new account gets the lowest free plot and keeps it for good; deleting an account frees its plot for the next player but moves nobody else.
   The unique index makes two parallel requests safe: the loser gets P2002, re-reads the taken plots and tries the next one. */
const conflict = (e: unknown) => (e as { code?: string } | null)?.code === 'P2002';
const takenSlots = async () => new Set((await prisma.user.findMany({ where: { houseSlot: { not: null } }, select: { houseSlot: true } })).map(r => r.houseSlot as number));

/** Give each of these accounts the lowest free plot (in the order given). Stops quietly when the street is full. */
async function assign(ids: string[]): Promise<void> {
  if (!ids.length) return;
  let taken = await takenSlots();
  for (const id of ids) {
    for (let tries = 0; tries < 8; tries++) {
      let slot = 0; while (taken.has(slot)) slot++;
      if (slot >= PLOT_COUNT) return;
      try { await prisma.user.updateMany({ where: { id, houseSlot: null }, data: { houseSlot: slot } }); taken.add(slot); break; }
      catch (e) { if (!conflict(e)) throw e; taken = await takenSlots(); }
    }
  }
}
/** Every account that has no plot yet gets one, oldest account first. Cheap when nobody is waiting. */
export async function assignSlots(limit = 200): Promise<void> {
  const need = await prisma.user.findMany({ where: { houseSlot: null }, select: { id: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: limit });
  await assign(need.map(r => r.id));
}
/** This account's plot number (assigning one if it has none), or null when the street is completely full. */
export async function ensureSlot(userId: string): Promise<number | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { houseSlot: true } }); if (!u) return null;
  if (u.houseSlot != null) return u.houseSlot;
  await assign([userId]);
  return (await prisma.user.findUnique({ where: { id: userId }, select: { houseSlot: true } }))?.houseSlot ?? null;
}
