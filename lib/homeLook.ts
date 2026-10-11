/* Per-player home look: wall paint, floor, rug, sofa, bedding and bed frame.
   Every account gets its own look by default (hashed from the username), so no two homes start out the same; players can change any of it
   under Home design > Style. Stored with the home layout (/api/home/layout) as a compact "w,f,r,s,b,k" string. */
export type HomeLook = { w: number; f: number; r: number; s: number; b: number; k: number };

export const HOME_WALLS: [string, string, string][] = [
  ['Warm cream', '#e6dccb', '#ddd2bf'], ['Sage green', '#cfd9c6', '#c3cfb9'], ['Sky blue', '#cfe0ec', '#c2d5e4'], ['Blush pink', '#ecd3d0', '#e2c5c1'],
  ['Butter yellow', '#f0e2b8', '#e6d6a8'], ['Soft lilac', '#dcd2e6', '#d0c5dc'], ['Greige', '#d6d0c6', '#cac3b8'], ['Terracotta', '#dcb59b', '#d0a68b'],
  ['Fresh mint', '#cde8dc', '#bfdccf'], ['Slate blue', '#a9b4bf', '#9ba7b3'], ['Charcoal', '#6a6e75', '#5e626a'], ['Ocean teal', '#9ec8c9', '#8fbbbd'],
];
/* kind: wood = plank texture tinted, tile = square tiles, marble = smooth and glossy */
export const HOME_FLOORS: [string, string, 'wood' | 'tile' | 'marble'][] = [
  ['Natural oak', '#ffffff', 'wood'], ['Dark walnut', '#8a6a55', 'wood'], ['Honey pine', '#f0c88a', 'wood'], ['Ash grey', '#b9bcc0', 'wood'],
  ['Cream tiles', '#efe8d8', 'tile'], ['Charcoal tiles', '#4a4d52', 'tile'], ['White marble', '#e9eaec', 'marble'], ['Terracotta tiles', '#b9684a', 'tile'],
];
export const HOME_RUGS: [string, string, string][] = [
  ['Wine', '#5a1620', '#7d2330'], ['Navy', '#1e2f55', '#2f4a80'], ['Forest', '#1f4a37', '#2f6b50'], ['Mustard', '#a67a1f', '#d0a23a'], ['Plum', '#4a2a55', '#6d3f80'],
  ['Teal', '#1d5a60', '#2f8088'], ['Sand', '#a89270', '#cbb78f'], ['Charcoal', '#2a2d32', '#41454c'], ['Rose', '#8a4a5a', '#b86c80'], ['Ivory', '#cfc6b0', '#e9e2d0'],
];
export const HOME_SOFAS: [string, string, string][] = [
  ['Navy', '#243a5e', '#2d4263'], ['Charcoal', '#3a3d44', '#464a52'], ['Emerald', '#1f5a44', '#2a7058'], ['Burgundy', '#5e1a2a', '#76263a'], ['Mustard', '#a8821f', '#bf9a30'],
  ['Cream', '#cfc4aa', '#ddd3bb'], ['Teal', '#1f5a63', '#2b707b'], ['Blush', '#c9959f', '#d8a8b1'], ['Tan leather', '#8a5a30', '#9c6a3c'], ['Olive', '#58602f', '#6b7440'],
];
export const HOME_BEDDING: [string, string, string][] = [
  ['Emerald', '#0f5c45', '#0c4d3a'], ['Navy', '#1e3560', '#172a4d'], ['Wine', '#6a1d2c', '#561624'], ['Ivory', '#e8e1cf', '#d6cdb6'], ['Slate', '#4a5360', '#3b434e'],
  ['Rose', '#c98a98', '#b5788a'], ['Gold', '#b8902c', '#9c7820'], ['Teal', '#17636b', '#10515a'], ['Lavender', '#8a77b0', '#74629a'], ['Burnt orange', '#c8662a', '#aa551f'],
];
export const HOME_FRAMES: [string, string, string][] = [
  ['Walnut', '#4a2f1d', '#5d3b25'], ['Natural oak', '#a97e4e', '#bd9060'], ['Ebony', '#1d1b1a', '#2c2928'], ['Whitewash', '#e0d9c8', '#eee8da'], ['Cherry', '#6a2f24', '#7c3a2d'], ['Ash grey', '#8c8d8a', '#9c9d9a'],
];
const PILLOWS: [string, string][] = [['#d99a42', '#b43c35'], ['#e8e4da', '#8a8f98'], ['#e07aa1', '#7aa7e0'], ['#f2c14e', '#3d5a80'], ['#cfe3d8', '#2f7d4f']];

export const HOME_LOOK_GROUPS: { key: keyof HomeLook; label: string; e: string; list: { name: string; sw: string }[] }[] = [
  { key: 'w', label: 'Walls', e: '🎨', list: HOME_WALLS.map(x => ({ name: x[0], sw: x[1] })) },
  { key: 'f', label: 'Floor', e: '🪵', list: HOME_FLOORS.map(x => ({ name: x[0], sw: x[1] === '#ffffff' ? '#b98d58' : x[1] })) },
  { key: 'r', label: 'Rugs', e: '🟫', list: HOME_RUGS.map(x => ({ name: x[0], sw: x[2] })) },
  { key: 's', label: 'Sofa', e: '🛋️', list: HOME_SOFAS.map(x => ({ name: x[0], sw: x[1] })) },
  { key: 'b', label: 'Bedding', e: '🛏️', list: HOME_BEDDING.map(x => ({ name: x[0], sw: x[1] })) },
  { key: 'k', label: 'Bed frame', e: '🪑', list: HOME_FRAMES.map(x => ({ name: x[0], sw: x[1] })) },
];
const LEN: Record<keyof HomeLook, number> = { w: HOME_WALLS.length, f: HOME_FLOORS.length, r: HOME_RUGS.length, s: HOME_SOFAS.length, b: HOME_BEDDING.length, k: HOME_FRAMES.length };

const hsh = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export function defaultHomeLook(username: string): HomeLook {
  const h = hsh(username || 'guest'), h2 = hsh((username || 'guest') + ':home');
  return { w: h % LEN.w, f: (h >>> 5) % LEN.f, r: (h >>> 9) % LEN.r, s: h2 % LEN.s, b: (h2 >>> 6) % LEN.b, k: (h2 >>> 11) % LEN.k };
}
export function sanitizeHomeLook(v: unknown, fallback: HomeLook): HomeLook {
  const p = typeof v === 'string' ? v.split(',').map(Number) : Array.isArray(v) ? v.map(Number) : [];
  const keys: (keyof HomeLook)[] = ['w', 'f', 'r', 's', 'b', 'k'], out = { ...fallback };
  keys.forEach((k, i) => { const n = p[i]; if (Number.isInteger(n) && n >= 0 && n < LEN[k]) out[k] = n; });
  return out;
}
export const packHomeLook = (l: HomeLook) => [l.w, l.f, l.r, l.s, l.b, l.k].join(',');

/** Concrete colours for a look (what the 3D room reads). */
export function resolveHomeLook(l: HomeLook) {
  const w = HOME_WALLS[l.w], f = HOME_FLOORS[l.f], r = HOME_RUGS[l.r], r2 = HOME_RUGS[(l.r + 4) % HOME_RUGS.length], s = HOME_SOFAS[l.s], b = HOME_BEDDING[l.b], k = HOME_FRAMES[l.k], p = PILLOWS[l.s % PILLOWS.length];
  return { w1: w[1], w2: w[2], floorTint: f[1], floorKind: f[2], rug1a: r[1], rug1b: r[2], rug2a: r2[1], rug2b: r2[2], sofa: s[1], sofa2: s[2], pil1: p[0], pil2: p[1], bed: b[1], bed2: b[2], wood: k[1], wood2: k[2] };
}
export type HomeColors = ReturnType<typeof resolveHomeLook>;
