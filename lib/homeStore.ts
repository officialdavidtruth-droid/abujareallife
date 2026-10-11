import { prisma } from './prisma';
/* One house = one hidden inventory row ("home_layout") holding the layout, look, sold fixtures and placed furniture (HOME-SAVE.md).
   Several people can edit it at once (owner + housemates), so every change goes through editHome(): read the row, change a copy, and write it back
   ONLY if nobody else wrote in between. The row's `quantity` is the version counter (it starts at 1 on old rows and goes up by one per save), and the
   write is a single atomic UPDATE ... WHERE quantity = <version we read>. If it lost the race, editHome() re-reads and re-applies the change. */
export const HOME_KEY = 'home_layout';
export class HomeStop extends Error { constructor(public msg: string, public code = 400) { super(msg); } }
export class HomeBusy extends Error { constructor() { super('The house is busy right now. Try again.'); } }
export type Meta = Record<string, unknown>;
const asMeta = (m: unknown): Meta => (m && typeof m === 'object' && !Array.isArray(m) ? { ...(m as Meta) } : {});

export async function readHome(homeId: string): Promise<{ meta: Meta; v: number }> {
  const r = await prisma.inventoryItem.findUnique({ where: { userId_itemKey: { userId: homeId, itemKey: HOME_KEY } }, select: { metadata: true, quantity: true } });
  return { meta: asMeta(r?.metadata), v: r ? Math.max(1, r.quantity) : 0 };
}
/** Write `meta` if the row is still at version `v` (0 = no row yet). Returns false when somebody else saved first. */
export async function commitHome(homeId: string, v: number, meta: Meta): Promise<boolean> {
  if (v === 0) {
    try { await prisma.inventoryItem.create({ data: { userId: homeId, itemKey: HOME_KEY, name: 'Home layout', quantity: 1, metadata: meta as never } }); return true; }
    catch (e) { if ((e as { code?: string })?.code === 'P2002') return false; throw e; }
  }
  const r = await prisma.inventoryItem.updateMany({ where: { userId: homeId, itemKey: HOME_KEY, quantity: v }, data: { metadata: meta as never, quantity: v + 1 } });
  return r.count === 1;
}
/** Change a house safely. `change` gets a fresh copy of the data and returns the new data; it may throw HomeStop to refuse. It can run more than once, so keep side effects OUT of it. */
export async function editHome(homeId: string, change: (m: Meta) => Meta, tries = 8): Promise<Meta> {
  for (let i = 0; i < tries; i++) {
    const { meta, v } = await readHome(homeId), next = change(meta);
    if (await commitHome(homeId, v, next)) return next;
    await new Promise(r => setTimeout(r, 15 + Math.random() * 40 * (i + 1)));   // somebody else saved first: breathe, re-read, try again
  }
  throw new HomeBusy();
}
