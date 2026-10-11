/* How a player's house on the street LOOKS (pure data, shared by the 3D city, the customiser and the server).
   - Colours (walls, roof, trim, front door) are free to change at any time.
   - Designs (Classic / Modern / Villa / Mansion) and Extras (gate, columns, balcony, palms, garden, glow) are paid ONCE and can then be switched on and off for free.
   - A NEPO baby's family already built them a Mansion with every extra: those are free for NEPO accounts (a NEPO house with no saved style shows the Mansion look by default).
   Stored as one hidden inventory row (itemKey "home_style", metadata { s: "d,w,r,t,k,x,od,ox" }), so no database migration is needed. The server owns prices and ownership. */

export type DesignDef = { id: number; key: 'classic' | 'modern' | 'villa' | 'mansion'; name: string; e: string; price: number; blurb: string };
export const DESIGNS: DesignDef[] = [
  { id: 0, key: 'classic', name: 'Classic', e: '🏠', price: 0, blurb: 'The standard street house.' },
  { id: 1, key: 'modern', name: 'Modern', e: '🏢', price: 2_500_000, blurb: 'Flat roof, glass front, floating upper floor.' },
  { id: 2, key: 'villa', name: 'Villa', e: '🏡', price: 5_000_000, blurb: 'Wide terracotta roof, shutters and a gabled porch.' },
  { id: 3, key: 'mansion', name: 'Mansion', e: '🏰', price: 15_000_000, blurb: 'Two storeys, grand entrance, double doors and a rooftop balustrade.' },
];
export type ExtraDef = { bit: number; key: 'gate' | 'columns' | 'balcony' | 'palms' | 'garden' | 'glow'; name: string; e: string; price: number; blurb: string };
export const EXTRAS: ExtraDef[] = [
  { bit: 1, key: 'gate', name: 'Gate & wall', e: '🚧', price: 1_500_000, blurb: 'Boundary wall with a gated driveway and lit pillars.' },
  { bit: 2, key: 'columns', name: 'Grand columns', e: '🏛️', price: 1_200_000, blurb: 'Tall columns and a pediment over the front door.' },
  { bit: 4, key: 'balcony', name: 'Balcony', e: '🪟', price: 2_000_000, blurb: 'A glass-railed balcony above the entrance.' },
  { bit: 8, key: 'palms', name: 'Palm trees', e: '🌴', price: 900_000, blurb: 'Two palms in the front yard.' },
  { bit: 16, key: 'garden', name: 'Garden', e: '🌿', price: 800_000, blurb: 'Hedges and flower beds along the front.' },
  { bit: 32, key: 'glow', name: 'Night glow', e: '✨', price: 1_800_000, blurb: 'Glowing light strips under the roof, bright after dark.' },
];
export const ALL_EXTRAS = EXTRAS.reduce((m, e) => m | e.bit, 0);

/* The first 10 walls and first 6 roofs are the original street colours (so existing houses keep their look). */
export const WALLS = ['#e9dcc3', '#d8c8a8', '#cdd8c4', '#dcc4c0', '#c4d0e2', '#e8d5b7', '#bdcfcb', '#dfcbdc', '#f0e6d2', '#d6cdb8', '#f7f4ee', '#2b2d33', '#e8d9b5', '#8fb6a6', '#c9a27a', '#7f8c9a', '#b85c50', '#f2c9d0'];
export const ROOFS = ['#6b3f2a', '#4a4f58', '#7a2f2f', '#2f4a3a', '#5a4a3a', '#3d3f6b', '#b8892e', '#e8e8ea', '#1e3a5f', '#1b1b1f'];
export const TRIMS = ['#f4efe6', '#d4a937', '#1d1d20', '#a0693c', '#b9bec6', '#1f7a52', '#7a1f2b', '#1f3a6b'];
export const DOORS = ['#3b2a1e', '#1d1d20', '#7a1f2b', '#1f3a6b', '#d4a937', '#f4efe6', '#1f7a52'];

export type Style = { d: number; w: number; r: number; t: number; k: number; x: number; od: number; ox: number };   // design, wall, roof, trim, door colour, extras on, designs owned, extras owned
const clampI = (v: unknown, n: number, d = 0) => { const i = Math.trunc(Number(v)); return Number.isFinite(i) && i >= 0 && i < n ? i : d; };
const mask = (v: unknown, max: number) => { const i = Math.trunc(Number(v)); return Number.isFinite(i) ? (i & max) : 0; };
export const FREE_DESIGNS = 1, ALL_DESIGNS = 15;

/** What the account gets for free: a NEPO baby owns every design and extra. */
export const freeOwned = (nepo: boolean) => nepo ? { od: ALL_DESIGNS, ox: ALL_EXTRAS } : { od: FREE_DESIGNS, ox: 0 };

export function sanitizeStyle(raw: unknown, nepo: boolean): Style | null {
  const a = typeof raw === 'string' ? raw.split(',') : Array.isArray(raw) ? raw : null; if (!a || a.length < 6) return null;
  const f = freeOwned(nepo);
  const od = (mask(a[6], ALL_DESIGNS) | f.od), ox = (mask(a[7], ALL_EXTRAS) | f.ox);
  const d = clampI(a[0], DESIGNS.length), x = mask(a[5], ALL_EXTRAS);
  return { d, w: clampI(a[1], WALLS.length), r: clampI(a[2], ROOFS.length), t: clampI(a[3], TRIMS.length), k: clampI(a[4], DOORS.length), x, od, ox };
}
export const encodeStyle = (s: Style) => [s.d, s.w, s.r, s.t, s.k, s.x, s.od, s.ox].join(',');

const hsh = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };
/** The look a house has until its owner changes it. */
export function defaultStyle(u: string, nepo: boolean): Style {
  if (nepo) return { d: 3, w: 10, r: 6, t: 1, k: 4, x: ALL_EXTRAS, od: ALL_DESIGNS, ox: ALL_EXTRAS };
  return { d: 0, w: Math.floor(hsh(u) * 10) % 10, r: Math.floor(hsh(u + 'r') * 6) % 6, t: 0, k: 0, x: 0, od: FREE_DESIGNS, ox: 0 };
}

/** What changing from `owned` to `next` costs: designs and extras not owned yet (turned on / chosen now) are bought; colours are free. */
export function styleCost(next: Style, nepo: boolean): { cost: number; buys: string[] } {
  const f = freeOwned(nepo), od = next.od | f.od, ox = next.ox | f.ox;
  let cost = 0; const buys: string[] = [];
  const dd = DESIGNS[next.d]; if (!((od >> next.d) & 1) && dd) { cost += dd.price; buys.push(dd.name); }
  for (const e of EXTRAS) if ((next.x & e.bit) && !(ox & e.bit)) { cost += e.price; buys.push(e.name); }
  return { cost, buys };
}
/** Mark everything the style uses as owned (after paying for it). */
export const withOwned = (s: Style, nepo: boolean): Style => { const f = freeOwned(nepo); return { ...s, od: s.od | f.od | (1 << s.d), ox: s.ox | f.ox | s.x }; };
