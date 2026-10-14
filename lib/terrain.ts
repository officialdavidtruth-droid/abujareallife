/* Terrain and water for Abuja Real Life. Pure functions (no React / three) so the game, the minimap and tests can all share them.

   The city, its player houses, the airport and the railway sit on a perfectly FLAT core (height 0, |x| and |z| <= CORE). Nothing in the city changes.
   Past the core the land rolls into hills and countryside, a river winds round the east and south, and a big lake (Jabi style) fills the west.

   terrainH(x, z)  ground height in metres (0 inside the core, negative under water)
   WATER_Y         the water surface height (lakes, river and sea all share one level)
   waterDepth(x,z) metres of water above the ground (0 on dry land)
   World coordinates: +x east, +z south (map up = -z). */

export const CORE = 305;            // flat square (half-size) that holds the whole city, houses, airport and railway
export const BLEND = 130;           // metres over which the land rises from flat to full hills
export const WORLD_LIM = 860;       // walkable / drivable / swimmable limit (the plane may fly to 850)
export const WATER_Y = -1.1;        // water surface: below the city ground (0) so the city never floods
export const SWIM_DEPTH = 1.05;     // deeper than this you swim instead of wade
export const BOAT_DEPTH = 0.9;      // boats need at least this much water

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const sstep = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* ───── smooth value noise (deterministic, same on every client) ───── */
const hash = (x: number, y: number) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
function vnoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x: number, z: number, oct = 4) => { let a = .5, f = 1, s = 0; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f + i * 17.3, z * f - i * 9.1); a *= .5; f *= 2.03; } return s; };   // 0..~.94

/* ───── the river: a winding centre line (world metres). It enters from the north-east hills, runs south past the east of the city and
        bends west along the south of it, then drains into the lake. Width and depth are set below. ───── */
export const RIVER: [number, number][] = [
  [430, -880], [470, -700], [420, -540], [500, -380], [520, -230], [470, -60], [530, 110], [500, 290], [420, 430], [330, 520], [180, 560], [40, 640], [-60, 760], [-110, 920],
];
const RIVER_W = 15;      // half-width of the water at the surface (so ~30 m across)
const RIVER_BANK = 85;   // distance over which the banks slope up to the land

function distToPolyline(x: number, z: number, pts: [number, number][]) {
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1), px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
    if (d < best) best = d;
  }
  return best;
}

/* ───── the lake / sea in the west: an irregular bowl with a small island. Its shore stays 100+ m clear of the city core. ───── */
export const LAKE = { x: -800, z: -110, r: 330 };
const ISLAND = { x: -790, z: -150, r: 75 };

/** raw hill height before water is carved (always >= 0) */
function hills(x: number, z: number) {
  const big = fbm(x * .0042 + 11.7, z * .0042 - 4.2, 4), mid = fbm(x * .013 - 3.1, z * .013 + 8.8, 3);
  return Math.pow(big, 1.55) * 64 + mid * 5.5;
}

/** ground height in metres. 0 across the whole city core. */
export function terrainH(x: number, z: number): number {
  const ex = Math.max(Math.abs(x) - CORE, 0), ez = Math.max(Math.abs(z) - CORE, 0), e = Math.hypot(ex, ez);
  if (e <= 0) return 0;
  const k = sstep(0, BLEND, e);                       // 0 at the edge of the core, 1 well out in the country (flat start, no step)
  let h = k * hills(x, z);
  // the lake: a bowl whose rim sits at the shore (gentle beach slope)
  const ld = Math.hypot(x - LAKE.x, (z - LAKE.z) * 1.1) + (fbm(x * .01, z * .01, 3) - .5) * 80;
  if (ld < LAKE.r + 90) {
    const bowl = sstep(LAKE.r + 90, LAKE.r - 40, ld);              // 0 on the far shore, 1 deep in the lake
    h = h * (1 - bowl) + -14 * bowl;
    const id = Math.hypot(x - ISLAND.x, z - ISLAND.z) + (fbm(x * .03 + 5, z * .03, 2) - .5) * 26;
    if (id < ISLAND.r) h += (7.5 - h) * sstep(ISLAND.r, ISLAND.r * .25, id);
  }
  // the river: a channel with banks easing up to the land
  const rd = distToPolyline(x, z, RIVER);
  if (rd < RIVER_W + RIVER_BANK) {
    const shoreH = WATER_Y + .3;
    let r: number;
    if (rd >= RIVER_W) { const u = sstep(RIVER_W + RIVER_BANK, RIVER_W, rd); r = h * (1 - u) + shoreH * u; }
    else r = shoreH + (WATER_Y - 3.4 - shoreH) * sstep(RIVER_W, RIVER_W * .5, rd);
    h = Math.min(h, r);
  }
  // the world ends in open sea instead of a wall
  const edge = Math.max(Math.abs(x), Math.abs(z)), shore = sstep(WORLD_LIM - 90, WORLD_LIM + 10, edge);
  if (shore > 0) h = h * (1 - shore) + (-10) * shore;
  return h;
}

export const waterDepth = (x: number, z: number) => Math.max(0, WATER_Y - terrainH(x, z));
export const inWater = (x: number, z: number) => waterDepth(x, z) > 0.02;
export const isSwimming = (x: number, z: number) => waterDepth(x, z) > SWIM_DEPTH;

/** ground normal-ish steepness (rise over run) for colouring and slope checks */
export function slopeAt(x: number, z: number) {
  const e = 2, dx = terrainH(x + e, z) - terrainH(x - e, z), dz = terrainH(x, z + e) - terrainH(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

/** a spot on the shore for the lake and river boats: [x, z, heading of the boat (three.js rotation.y, bow along +x like the cars), name] */
export const DOCKS: { id: string; name: string; x: number; z: number; r: number; px: number; pz: number }[] = [
  // px,pz = where you stand (the pier head, on land); x,z = where the boat floats (in water). Filled in by findDocks() below.
];

/** find a dock by walking from a starting point towards a water point until land turns to water */
function makeDock(id: string, name: string, sx: number, sz: number, tx: number, tz: number) {
  const L = Math.hypot(tx - sx, tz - sz) || 1, ux = (tx - sx) / L, uz = (tz - sz) / L;
  let lx = sx, lz = sz, wx = tx, wz = tz, found = false;
  for (let d = 0; d <= L; d += 1) {
    const x = sx + ux * d, z = sz + uz * d;
    if (waterDepth(x, z) > BOAT_DEPTH + .6) { wx = x; wz = z; lx = sx + ux * Math.max(0, d - 10); lz = sz + uz * Math.max(0, d - 10); found = true; break; }
  }
  if (!found) return null;
  // step further into the water so the boat floats clear of the shore
  const bx = wx + ux * 5, bz = wz + uz * 5;
  return { id, name, x: bx, z: bz, r: Math.atan2(-uz, ux), px: lx, pz: lz };
}
for (const d of [
  makeDock('lake', 'Lake Jabi Marina', -340, -110, -560, -110),
  makeDock('lake2', 'Lakeside Pier', -340, 130, -560, 90),
  makeDock('river', 'River Landing', 330, -230, 520, -230),
  makeDock('river2', 'Southbank Landing', 100, 380, 100, 620),
]) if (d) DOCKS.push(d);

/** nearest dock within `r` metres of a point */
export const dockNear = (x: number, z: number, r = 14) => { let b: (typeof DOCKS)[number] | null = null, bd = r; for (const d of DOCKS) { const dd = Math.min(Math.hypot(d.x - x, d.z - z), Math.hypot(d.px - x, d.pz - z)); if (dd < bd) { bd = dd; b = d; } } return b; };

/** colour of the ground at a point (r,g,b 0..1): sand by the water, grass, dry savanna, rock on steep or high ground */
export function groundColor(x: number, z: number, h: number, slope: number): [number, number, number] {
  const n = fbm(x * .05 + 40, z * .05 - 20, 2), n2 = vnoise(x * .4, z * .4);
  const bed = h < WATER_Y - 0.4;
  if (bed) return [.24 + n * .08, .27 + n * .06, .22];                                  // dark silty bed (seen through shallow water)
  if (h < WATER_Y + .85) return [.78 + n * .08, .7 + n * .06, .5 + n * .05];           // sand
  const grass: [number, number, number] = [.27 + n * .12, .46 + n * .1 - n2 * .03, .2 + n * .05];
  const dry: [number, number, number] = [.55 + n * .1, .5 + n * .08, .28];
  const rock: [number, number, number] = [.44 + n2 * .06, .42 + n2 * .05, .4 + n2 * .05];
  const dryK = sstep(.35, .75, fbm(x * .006 - 7, z * .006 + 3, 2)), rockK = Math.max(sstep(.42, .75, slope), sstep(38, 58, h));
  const g: [number, number, number] = [grass[0] + (dry[0] - grass[0]) * dryK * .8, grass[1] + (dry[1] - grass[1]) * dryK * .8, grass[2] + (dry[2] - grass[2]) * dryK * .8];
  return [g[0] + (rock[0] - g[0]) * rockK, g[1] + (rock[1] - g[1]) * rockK, g[2] + (rock[2] - g[2]) * rockK];
}

/** deterministic tree / rock scatter outside the core, away from the water. Returns [x, z, size, kind] */
export function scatter(count: number, seed: number, minH: number, maxH: number, maxSlope: number): [number, number, number, number][] {
  const out: [number, number, number, number][] = []; let i = 0, tries = 0;
  while (out.length < count && tries < count * 30) {
    tries++; i++;
    const x = (hash(i, seed) * 2 - 1) * (WORLD_LIM - 30), z = (hash(seed, i * 7 + 3) * 2 - 1) * (WORLD_LIM - 30);
    if (Math.max(Math.abs(x), Math.abs(z)) < CORE + 6) continue;
    if (fbm(x * .008 + seed, z * .008, 2) < .42) continue;   // cheap test first: thin out the woods away from the "forest" noise
    const h = terrainH(x, z); if (h < minH || h > maxH || slopeAt(x, z) > maxSlope) continue;
    out.push([x, z, .7 + hash(i * 3, seed + 9) * .9, Math.floor(hash(i, seed + 5) * 3)]);
  }
  return out;
}
