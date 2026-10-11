/* Player houses on the street (GTA style): every player owns a house with their name on it, standing along the outer ring road with a driveway,
   so you can drive home, park, walk to the door and press E.

   Pure data + a tiny client store (no React / three), shared by the 3D city (components/PlayerHouses.tsx), the game shell (components/Sim.tsx) and the server (app/api/houses).
   World coordinates only (the scaled 33 m street grid, see lib/roadRoute.ts).

   Layout: the outer ring road is index +-5. Outside it there is open ground, and every cross road leaves a 24 m gap between two stub roads.
   Each gap on each of the four sides holds 3 lots (8 m wide). A house is 6 x 8 m, set back FRONT metres from the road edge, facing the road.
   Lots that would sit on a chop yard, the airport, a lamp post or a utility pole are dropped, so the plot list is the same for everyone. */
import { GRID, WS, halfW } from './roadRoute';
import { YARDS } from './chopData';
import { ROOFS, WALLS, defaultStyle, sanitizeStyle, type Style } from './houseStyle';
import { NO_SEC, unpackSec, type Sec } from './security';

export const HOUSE_W = 6, HOUSE_D = 8, FRONT = 6.2, LOTS_PER_GAP = 3;
export const DOOR_R = 2.4;   // how close to the door you must stand to use it
const RING = 5;
const SIDES: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];   // outward direction of east, south, west and north side of the ring road

export type Pt = { x: number; z: number };
export type Box = { x0: number; x1: number; z0: number; z1: number };
export type Plot = {
  slot: number; x: number; z: number;          // centre of the house
  rot: number;                                  // three.js rotation.y: local +z (the front) points at the road
  nx: number; nz: number;                       // direction from the road away from the house
  lat: number;                                  // sideways offset of the driveway in the house's own x (0 or +-2 m)
  door: Pt; exit: Pt & { r: number };           // front door, and where you stand when you step out (r = facing, same convention as START.r)
  car: Pt & { r: number };                      // where your car is parked on the driveway (nose to the road)
  solid: Box;                                   // footprint of the house body
};
export type HouseInfo = Plot & { u: string; mine: boolean; wall: string; roof: string; floors: 1 | 2; nepo: boolean; style: Style; sec: Sec };   // style: see lib/houseStyle.ts

const hsh = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };

/* Things already standing in the outer strip. These mirror CityScenery.LAMP_PTS and CityLook.POLES (keep in step if those formulas change). */
const POSTS: Pt[] = (() => {
  const a: Pt[] = [];
  for (let i = -RING; i <= RING; i++) {
    const sgn = ((i % 2) + 2) % 2 === 0 ? 1 : -1, off = sgn * (halfW(i) + .5), c = i * GRID, o = halfW(i) + 1.1;
    for (let j = -RING; j <= RING - 1; j++) {
      const p = (j + .25) * GRID, mid = (j + .5) * GRID;
      a.push({ x: p, z: c + off }, { x: c + off, z: p });
      for (const s of [1, -1]) a.push({ x: mid, z: c + s * o }, { x: c + s * o, z: mid });
    }
  }
  return a;
})();

/* Ground that is already taken: the four chop yards (14.5 m pads) and the airport (mirrors AIR in CityScenery: runway + terminal). */
const AIR = { x: 122 * WS, z: -12 * WS, s: 1.8 };
const KEEP_OUT: Box[] = [
  ...YARDS.map(y => ({ x0: y.x - 9, x1: y.x + 9, z0: y.z - 9, z1: y.z + 9 })),
  { x0: AIR.x - 11 * AIR.s - 1.5, x1: AIR.x + 11 * AIR.s + 1.5, z0: AIR.z - 9.5 * AIR.s - 1.5, z1: AIR.z + 3.5 * AIR.s + 1.5 },
];
const hit = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
const hasPost = (b: Box, m: number) => POSTS.some(p => p.x > b.x0 - m && p.x < b.x1 + m && p.z > b.z0 - m && p.z < b.z1 + m);

function build(): Plot[] {
  const out: Plot[] = [];
  const dist = RING * GRID + halfW(RING) + FRONT + HOUSE_D / 2;      // centre of every house along its side's outward axis
  for (const [nx, nz] of SIDES) {
    const tx = nz !== 0 ? 1 : 0, tz = nx !== 0 ? 1 : 0;              // the axis the ring road runs along on this side
    const rot = Math.atan2(-nx, -nz), c = Math.cos(rot), s = Math.sin(rot);
    for (let k = -RING; k < RING; k++) {
      const a0 = k * GRID + halfW(k), a1 = (k + 1) * GRID - halfW(k + 1), w = (a1 - a0) / LOTS_PER_GAP;
      for (let n = 0; n < LOTS_PER_GAP; n++) {
        const a = a0 + w * (n + .5), x = nx * dist + tx * a, z = nz * dist + tz * a;
        const world = (lx: number, lz: number): Pt => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c });   // house-local (+z = front) to world
        const box = (p: Pt, hx: number, hz: number): Box => (Math.abs(s) > .5 ? { x0: p.x - hz, x1: p.x + hz, z0: p.z - hx, z1: p.z + hx } : { x0: p.x - hx, x1: p.x + hx, z0: p.z - hz, z1: p.z + hz });
        // the whole lot, from the road edge back past the house
        const d0 = RING * GRID + halfW(RING), d1 = dist + HOUSE_D / 2 + 1.5;
        const lot: Box = tx ? { x0: a - w / 2, x1: a + w / 2, z0: nz > 0 ? d0 : -d1, z1: nz > 0 ? d1 : -d0 } : { x0: nx > 0 ? d0 : -d1, x1: nx > 0 ? d1 : -d0, z0: a - w / 2, z1: a + w / 2 };
        if (KEEP_OUT.some(b => hit(b, lot))) continue;
        const solid = box({ x, z }, HOUSE_W / 2, HOUSE_D / 2);
        if (hasPost(solid, 1)) continue;
        let lat = NaN;
        for (const l of [0, 2, -2]) { if (!hasPost(box(world(l, HOUSE_D / 2 + FRONT / 2), 1.9, FRONT / 2 + .2), .5)) { lat = l; break; } }
        if (Number.isNaN(lat)) continue;
        const door = world(0, HOUSE_D / 2), ex = world(0, HOUSE_D / 2 + .8), car = world(lat, HOUSE_D / 2 + 3.9);
        out.push({ slot: out.length, x, z, rot, nx, nz, lat, door, exit: { ...ex, r: Math.atan2(-nx, -nz) }, car: { ...car, r: Math.atan2(nz, -nx) }, solid });
      }
    }
  }
  return out;
}

export const PLOTS: Plot[] = build();
export const PLOT_COUNT = PLOTS.length;   // houses the street has room for; accounts are given plots in sign-up order

/** Classic keeps its old random height; Modern and Mansion are two storeys, Villa one. */
export const floorsFor = (style: Style, u: string): 1 | 2 => (style.d === 0 ? (hsh(u + 'f') < .4 ? 2 : 1) : style.d === 2 ? 1 : 2);
export function decorate(slot: number, u: string, mine: boolean, nepo = false, code?: string | null, sec: Sec = NO_SEC): HouseInfo | null {
  const p = PLOTS[slot]; if (!p) return null;
  const style = (code ? sanitizeStyle(code, nepo) : null) ?? defaultStyle(u, nepo);
  const floors = floorsFor(style, u);
  return { ...p, u, mine, nepo, style, wall: WALLS[style.w] ?? WALLS[0], roof: ROOFS[style.r] ?? ROOFS[0], floors, sec };
}

/* ───────────── client store ───────────── */
export const HOUSES = { list: [] as HouseInfo[], mine: null as HouseInfo | null, shared: false, ver: 0, loading: false };   // mine = the house you LIVE in; shared = it is a housemate's (not yours)

/** Fetch every player's house (and which one is yours). Safe to call often; it fails quietly when offline. */
export async function loadHouses(): Promise<void> {
  if (HOUSES.loading || typeof window === 'undefined') return;
  HOUSES.loading = true;
  try {
    const r = await fetch('/api/houses', { cache: 'no-store' }); if (!r.ok) return;
    const d = await r.json() as { houses?: { slot: number; u: string; o?: string; s?: string; g?: { d?: number; g?: number; a?: number } }[]; mine?: number; shared?: boolean };
    const list = (d.houses || []).map(h => decorate(h.slot, String(h.u), h.slot === d.mine, h.o === 'NEPO', h.s, unpackSec(h.g))).filter((h): h is HouseInfo => !!h);
    HOUSES.list = list; HOUSES.mine = list.find(h => h.mine) ?? null; HOUSES.shared = !!d.shared; HOUSES.ver++;
    window.dispatchEvent(new CustomEvent('arl-houses'));
  } catch { /* offline: keep what we have */ } finally { HOUSES.loading = false; }
}

/** The house whose front door is within DOOR_R of (x, z), if any. */
export function nearDoor(x: number, z: number): HouseInfo | null {
  let best: HouseInfo | null = null, bd = DOOR_R;
  for (const h of HOUSES.list) { const dx = h.door.x - x; if (dx > DOOR_R || dx < -DOOR_R) continue; const d = Math.hypot(dx, h.door.z - z); if (d < bd) { bd = d; best = h; } }
  return best;
}
