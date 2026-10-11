import { prisma } from './prisma';
import { editHome, readHome } from './homeStore';
/* Placed furniture: one row per piece in HomeFurniture (HOME-SAVE.md). Placing, storing and selling a piece are single-row INSERT / DELETE statements,
   so two people working on different pieces can never collide, and "delete returns count 1" gives exactly-once refunds and payouts. */
export type Piece = { by?: string; id: string; itemKey: string; name: string; e: string; cat: string; cost: number; condition: number; x: number; z: number; r: number; fp?: [number, number] };
type Row = { id: string; homeId: string; byId: string; itemKey: string; name: string; e: string; cat: string; cost: number; condition: number; x: number; z: number; r: number; fpW: number | null; fpD: number | null };
const n = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const s = (v: unknown, max: number) => String(v ?? '').slice(0, max);

export const toPiece = (r: Row): Piece => ({ by: r.byId, id: r.id, itemKey: r.itemKey, name: r.name, e: r.e, cat: r.cat, cost: r.cost, condition: r.condition, x: r.x, z: r.z, r: r.r, ...(r.fpW != null && r.fpD != null ? { fp: [r.fpW, r.fpD] as [number, number] } : {}) });
export const toRow = (homeId: string, p: Piece, at?: Date) => ({ id: s(p.id, 64), homeId, byId: s(p.by || homeId, 64), itemKey: s(p.itemKey, 64), name: s(p.name, 80), e: s(p.e, 16), cat: s(p.cat, 32), cost: Math.round(n(p.cost)), condition: Math.round(n(p.condition, 100)), x: n(p.x), z: n(p.z), r: n(p.r), fpW: p.fp ? n(p.fp[0]) : null, fpD: p.fp ? n(p.fp[1]) : null, ...(at ? { createdAt: at } : {}) });

/** The house's placed furniture, oldest first. Call ensureFurniture first. */
export async function listFurniture(homeId: string): Promise<Piece[]> {
  const rows: Row[] = await prisma.homeFurniture.findMany({ where: { homeId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  return rows.map(toPiece);
}

/** Houses saved before this table existed keep their furniture inside the layout blob (`owned`). The first time anybody touches a house's furniture the pieces are copied into the table and
    removed from the blob. Safe to run at the same moment from several requests (rows are inserted with skipDuplicates, and only the copied ids are removed from the blob). */
export async function ensureFurniture(homeId: string): Promise<Record<string, unknown>> {
  const { meta } = await readHome(homeId);
  const old = (Array.isArray(meta.owned) ? meta.owned : []).filter((p: unknown): p is Piece => !!p && typeof (p as Piece).id === 'string' && !!(p as Piece).id);
  if (!old.length && meta.owned === undefined) return meta;
  const t0 = Date.now();
  if (old.length) await prisma.homeFurniture.createMany({ data: old.map((p, i) => toRow(homeId, p, new Date(t0 + i))), skipDuplicates: true });
  const moved = new Set(old.map(p => p.id));
  // anything still in the blob afterwards was added by an older server in the meantime (copied next time); entries without an id are junk and dropped
  await editHome(homeId, m => { const rest = (Array.isArray(m.owned) ? m.owned : []).filter((p: { id?: unknown } | null) => !!p && typeof p.id === 'string' && !!p.id && !moved.has(p.id)); const next = { ...m }; if (rest.length) next.owned = rest; else delete next.owned; return next; });
  return meta;
}
