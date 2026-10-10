import { storeItems } from './catalog';
import { SHOP } from './interiors';

/* Player-run business economics (BIZJOBS.md). Pure functions, shared by the API routes and the UI.
   Every number a player can influence is clamped here, on the server side of the trust line. */
export const COGS_RATE = 0.5;              // supplier cost = 50% of the list price, paid out of every sale
export const MIN_MARKUP = 0.5, MAX_MARKUP = 3;
export const MIN_WAGE = 2_000, MAX_WAGE = 200_000; // naira per hour on shift
export const MAX_SHIFT_MS = 8 * 3600_000;  // a shift pays for at most 8 hours
export const ACCRUE_CAP_MINS = 120;        // idle revenue is settled for at most this many minutes per visit
export const ROLES = ['cashier', 'waiter', 'chef', 'security', 'driver', 'manager'] as const;
export const maxStaff = (level: number) => Math.min(15, 3 + 2 * level);

export type Sellable = { id: string; name: string; base: number; service: boolean };
/** Everything a business of this type can sell: its own services plus the store catalog. */
export function sellable(type: string): Sellable[] {
  const out: Sellable[] = (SHOP[type] || []).filter(i => !i.grant).map(i => ({ id: i.id, name: i.label, base: i.cost, service: true }));
  for (const i of storeItems(type)) if (!out.some(o => o.id === i.id)) out.push({ id: i.id, name: i.name, base: i.cost, service: false });
  return out;
}
export type PriceCfg = { markup: number; prices?: unknown };
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const cleanMarkup = (n: unknown) => Math.round(clamp(Number(n) || 1, MIN_MARKUP, MAX_MARKUP) * 100) / 100;
/** Only known item ids, each held between 50% and 300% of list price. */
export function cleanPrices(type: string, input: unknown): Record<string, number> {
  const ok = new Map(sellable(type).map(s => [s.id, s.base])), out: Record<string, number> = {};
  if (input && typeof input === 'object') for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const base = ok.get(k), n = Math.round(Number(v));
    if (base && Number.isFinite(n)) out[k] = clamp(n, Math.ceil(base * MIN_MARKUP), Math.floor(base * MAX_MARKUP));
  }
  return out;
}
const overrides = (c: PriceCfg) => (c.prices && typeof c.prices === 'object' ? (c.prices as Record<string, number>) : {});
/** What a customer pays for one unit of `id` at this business, or null if it does not sell it. */
export function priceOf(type: string, c: PriceCfg, id: string): number | null {
  const s = sellable(type).find(x => x.id === id); if (!s) return null;
  const o = overrides(c)[id];
  return typeof o === 'number' ? o : Math.max(1, Math.round(s.base * c.markup));
}
/** Average price relative to list price across everything it sells (1 = list). Drives how many customers choose this business. */
export function priceIndex(type: string, c: PriceCfg): number {
  const list = sellable(type); if (!list.length) return 1;
  const o = overrides(c); let sum = 0;
  for (const s of list) sum += (typeof o[s.id] === 'number' ? o[s.id] : s.base * c.markup) / s.base;
  return sum / list.length;
}
/** Share of customers a business wins against its rivals: cheaper than the local market wins customers, dearer loses them.
    The market includes an unseen "city average" at list price so a lone shop cannot charge anything it likes. */
export function priceFactor(mine: number, rivals: number[]): number {
  const market = (1 + rivals.reduce((a, b) => a + b, 0)) / (1 + rivals.length);
  return clamp(Math.pow(market / mine, 1.8), 0.05, 2.2);
}
export const staffFactor = (onShift: number, npcStaff: number) => 1 + 0.12 * Math.min(6, onShift) + 0.03 * Math.min(10, npcStaff);
export const repFactor = (rep: number) => 0.8 + Math.max(0, Math.min(100, rep)) / 250;

export type Settle = { revenue: number; cogs: number; overhead: number; net: number };
/** Idle sales while the owner was away. `gross` is what a list-price crowd would spend; the crowd size and the price paid both move. */
export function settle(mins: number, o: { level: number; staff: number; rep: number; eventBonus: number; index: number; factor: number; onShift: number }): Settle {
  const gross = mins * (3500 + o.level * 1800 + o.eventBonus * 1200);
  const crowd = gross * o.factor * staffFactor(o.onShift, o.staff) * repFactor(o.rep);
  const revenue = Math.round(crowd * o.index), cogs = Math.round(crowd * COGS_RATE), overhead = Math.round(mins * (900 + o.staff * 220));
  return { revenue, cogs, overhead, net: revenue - cogs - overhead };
}
/** Wage due for a shift that started at `from`, locked at `wage` naira per hour. */
export const shiftPay = (from: Date, wage: number, now = Date.now()) => Math.floor(Math.min(MAX_SHIFT_MS, Math.max(0, now - from.getTime())) / 3600_000 * wage);
export const onShiftNow = (clockedInAt: Date | null, now = Date.now()) => !!clockedInAt && now - clockedInAt.getTime() < MAX_SHIFT_MS;
