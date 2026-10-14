/* Terrain and water for Abuja Real Life. Pure functions (no React / three) so the game, the minimap and tests can all share them.

   The city, its player houses, the airport and the railway sit on a perfectly FLAT core (height 0, |x| and |z| <= CORE). Nothing in the city changes.
   Past the core the land rolls into hills and countryside, a river winds round the east and south, and a big lake (Jabi style) fills the west.

   Four highways leave the city core (east, north, south, west). They are graded into the land (cuttings and embankments) and cross the river and
   any water on bridges. terrainH() is the GROUND (a bridge never fills the river under it); deckH()/driveH()/groundFor() add the bridge deck on top.

   terrainH(x, z)  ground height in metres (0 inside the core, negative under water; includes highway cuttings/embankments)
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
  const ridge = Math.pow(Math.max(0, big - .28), 1.28) * 210;
  const detail = (mid - .42) * 20 + (fbm(x * .032 + 21, z * .032 - 17, 2) - .45) * 5;
  return Math.max(0, ridge + detail);
}

/** natural ground (hills, lake, river, sea) before highways are graded in. 0 across the whole city core. */
function baseH(x: number, z: number): number {
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

/* ───────────── highways and bridges ─────────────
   Each highway starts on a city boulevard just past the ring road, runs straight through the house rows (which are inside the core) and then bends
   out across the countryside. Its height profile (prof) is the natural ground smoothed into a gentle grade; wherever the natural ground is water
   (river, lake arm) the road becomes a BRIDGE span: a deck at DECK_Y with a ramp either side. A road that runs into the lake or the sea simply ends at the beach. */
export const HW_HALF = 5.25;          // half-width of the paving (same as a city boulevard)
export const HW_SHOULDER = 16;        // ground is graded to the road over this much more on each side
export const MAX_GRADE = .1;          // steepest road: 10 %
const SHOULDER_EXTRA = 40;            // extra grading width on very deep cuttings / high embankments (see terrainH)
export const HW_STEP = 4;             // metres between profile samples (and between ribbon vertices when drawn)
export const DECK_Y = WATER_Y + 4.6;  // bridge deck height: 4.6 m clear over the water (boats pass under)
export type Highway = { id: string; name: string; pts: [number, number][]; cum: number[]; len: number; prof: Float32Array; spans: [number, number][]; box: [number, number, number, number] };

function cumLen(pts: [number, number][]) { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return c; }
function polyAt(pts: [number, number][], cum: number[], s: number) {
  let k = 0; while (k < pts.length - 2 && cum[k + 1] < s) k++;
  const dx = pts[k + 1][0] - pts[k][0], dz = pts[k + 1][1] - pts[k][1], l = cum[k + 1] - cum[k] || 1, t = clamp((s - cum[k]) / l, 0, 1);
  return { x: pts[k][0] + dx * t, z: pts[k][1] + dz * t, tx: dx / l, tz: dz / l };
}

function buildHighway(id: string, name: string, pts0: [number, number][]): Highway | null {
  const cum0 = cumLen(pts0), L0 = cum0[cum0.length - 1], n0 = Math.floor(L0 / HW_STEP) + 1;
  const raw = new Float32Array(n0), wet: boolean[] = [];
  for (let i = 0; i < n0; i++) { const q = polyAt(pts0, cum0, i * HW_STEP); raw[i] = baseH(q.x, q.z); wet.push(raw[i] < WATER_Y + .8); }
  let n = n0;
  if (wet[n0 - 1]) { let k = n0 - 1; while (k > 0 && wet[k - 1]) k--; n = Math.max(0, k - 2); }   // the road runs into the lake / sea: stop 8 m short of the water
  if (n < 6) return null;
  const len = (n - 1) * HW_STEP;
  const pts: [number, number][] = [pts0[0]]; for (let k = 1; k < pts0.length - 1; k++) if (cum0[k] < len - 1) pts.push(pts0[k]);
  { const e = polyAt(pts0, cum0, len); pts.push([e.x, e.z]); }
  const cum = cumLen(pts);
  // bridge spans: every wet run, padded so the ramps start on dry ground, merged when they touch
  const spans: [number, number][] = [];
  for (let i = 0; i < n;) { if (!wet[i]) { i++; continue; } let j = i; while (j + 1 < n && wet[j + 1]) j++; const a = Math.max(0, i * HW_STEP - 36), b = Math.min(len, j * HW_STEP + 36); if (spans.length && a <= spans[spans.length - 1][1] + 20) spans[spans.length - 1][1] = b; else spans.push([a, b]); i = j + 1; }
  const inSpan = (s: number) => spans.some(([a, b]) => s >= a && s <= b);
  // height profile: smoothed natural ground, forced to 0 through the city core and to the deck height on every bridge, and never steeper than MAX_GRADE
  let prof = new Float32Array(n);
  const pin = new Float32Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const q = polyAt(pts, cum, i * HW_STEP);
    if (Math.abs(q.x) <= CORE + 2 && Math.abs(q.z) <= CORE + 2) pin[i] = 0; else if (inSpan(i * HW_STEP)) pin[i] = DECK_Y;
    prof[i] = Number.isNaN(pin[i]) ? Math.max(raw[i], .6) : pin[i];
  }
  for (let pass = 0; pass < 3; pass++) { const nx = new Float32Array(n), R = 8; for (let i = 0; i < n; i++) { let a = 0, c = 0; for (let k = Math.max(0, i - R); k <= Math.min(n - 1, i + R); k++) { a += prof[k]; c++; } nx[i] = a / c; } prof = nx; }
  {
    const g = MAX_GRADE * HW_STEP, hiB = new Float32Array(n), loB = new Float32Array(n);
    for (let i = 0; i < n; i++) { hiB[i] = Number.isNaN(pin[i]) ? 1e6 : pin[i]; loB[i] = Number.isNaN(pin[i]) ? -1e6 : pin[i]; }
    for (let i = 1; i < n; i++) { hiB[i] = Math.min(hiB[i], hiB[i - 1] + g); loB[i] = Math.max(loB[i], loB[i - 1] - g); }
    for (let i = n - 2; i >= 0; i--) { hiB[i] = Math.min(hiB[i], hiB[i + 1] + g); loB[i] = Math.max(loB[i], loB[i + 1] - g); }
    const hi = new Float32Array(n), lo = new Float32Array(n);
    for (let i = 0; i < n; i++) { prof[i] = clamp(prof[i], loB[i], hiB[i]); hi[i] = lo[i] = prof[i]; }   // can always be reached from the pins
    for (let i = 1; i < n; i++) { hi[i] = Math.min(hi[i], hi[i - 1] + g); lo[i] = Math.max(lo[i], lo[i - 1] - g); }
    for (let i = n - 2; i >= 0; i--) { hi[i] = Math.min(hi[i], hi[i + 1] + g); lo[i] = Math.max(lo[i], lo[i + 1] - g); }
    for (let i = 0; i < n; i++) prof[i] = (hi[i] + lo[i]) / 2;   // the mean of the highest and lowest MAX_GRADE-Lipschitz curves hugging the ground: close to the land, never too steep
  }
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const m = HW_HALF + HW_SHOULDER + SHOULDER_EXTRA + 4;
  return { id, name, pts, cum, len, prof, spans, box: [x0 - m, z0 - m, x1 + m, z1 + m] };
}

export const HIGHWAYS: Highway[] = ([
  buildHighway('east', 'Keffi Expressway', [[170, 66], [330, 66], [430, 40], [600, 40], [720, 80], [850, 60]]),
  buildHighway('south', 'Lokoja Expressway', [[0, 170], [0, 330], [34, 450], [10, 600], [0, 760], [0, 850]]),
  buildHighway('north', 'Kaduna Expressway', [[0, -170], [0, -330], [-40, -480], [-20, -650], [0, -850]]),
  buildHighway('west', 'Lake Jabi Road', [[-170, 0], [-330, 0], [-440, -50], [-560, -70]]),
] as (Highway | null)[]).filter((h): h is Highway => !!h);

/** every bridge on the map: where it starts and ends (for the map and the HUD) */
export const BRIDGES: { id: string; name: string; hw: string; s0: number; s1: number; x0: number; z0: number; x1: number; z1: number; x: number; z: number }[] = [];
for (const h of HIGHWAYS) h.spans.forEach(([a, b], k) => { const p = polyAt(h.pts, h.cum, a), q = polyAt(h.pts, h.cum, b), m = polyAt(h.pts, h.cum, (a + b) / 2); BRIDGES.push({ id: h.id + k, name: h.name + ' Bridge', hw: h.id, s0: a, s1: b, x0: p.x, z0: p.z, x1: q.x, z1: q.z, x: m.x, z: m.z }); });

/** the centre line of a highway (or just one stretch of it) as [x, z] points, for drawing on the maps */
export function hwPath(h: Highway, s0 = 0, s1 = h.len, step = 16): [number, number][] {
  const out: [number, number][] = [], n = Math.max(1, Math.ceil((s1 - s0) / step));
  for (let i = 0; i <= n; i++) { const p = polyAt(h.pts, h.cum, s0 + (s1 - s0) * i / n); out.push([p.x, p.z]); }
  return out;
}

/** point, direction and road height at arc length s along a highway */
export function hwPoint(h: Highway, s: number) {
  const q = polyAt(h.pts, h.cum, clamp(s, 0, h.len)), f = clamp(s, 0, h.len) / HW_STEP, i = Math.min(h.prof.length - 2, Math.floor(f)), t = f - i;
  return { x: q.x, z: q.z, tx: q.tx, tz: q.tz, y: h.prof[i] + (h.prof[i + 1] - h.prof[i]) * t };
}
const profAt = (h: Highway, s: number) => { const f = clamp(s, 0, h.len) / HW_STEP, i = Math.min(h.prof.length - 2, Math.floor(f)), t = f - i; return h.prof[i] + (h.prof[i + 1] - h.prof[i]) * t; };
/** how far inside a bridge span (metres from its nearest end), or -1 when s is not on a bridge */
const spanQ = (h: Highway, s: number) => { for (const [a, b] of h.spans) if (s >= a && s <= b) return Math.min(s - a, b - s); return -1; };

const RH = { h: null as Highway | null, d: 1e9, s: 0 };
/** nearest highway centre line within `m` metres of (x, z): distance and arc length. Reuses one object (read it straight away). */
function roadHit(x: number, z: number, m: number) {
  RH.h = null; RH.d = m;
  for (const h of HIGHWAYS) {
    if (x < h.box[0] || x > h.box[2] || z < h.box[1] || z > h.box[3]) continue;
    for (let k = 0; k < h.pts.length - 1; k++) {
      const ax = h.pts[k][0], az = h.pts[k][1], dx = h.pts[k + 1][0] - ax, dz = h.pts[k + 1][1] - az, l2 = dx * dx + dz * dz || 1, t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1), d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
      if (d < RH.d) { RH.d = d; RH.h = h; RH.s = h.cum[k] + t * (h.cum[k + 1] - h.cum[k]); }
    }
  }
  return RH.h ? RH : null;
}
/** true when (x, z) is on or beside a highway (trees, rocks and docks keep clear) */
export const nearRoad = (x: number, z: number, m = HW_HALF + 8) => !!roadHit(x, z, m);

/** ground height in metres: natural land, with the highways graded in. 0 across the whole city core. A bridge deck is NOT ground (see deckH). */
export function terrainH(x: number, z: number): number {
  let h = baseH(x, z);
  if (Math.abs(x) <= CORE && Math.abs(z) <= CORE) return h;
  const r = roadHit(x, z, HW_HALF + HW_SHOULDER + SHOULDER_EXTRA);
  if (r) {
    const py = profAt(r.h!, r.s), q = spanQ(r.h!, r.s), wide = HW_SHOULDER + Math.min(SHOULDER_EXTRA, 1.4 * Math.abs(py - h));   // deeper cut or higher bank = gentler slope out to the land
    let w = sstep(HW_HALF + wide, HW_HALF + 1.2, r.d);
    if (q >= 0) w *= 1 - sstep(0, 18, q);                             // under a bridge the river stays; only the approach ramps are filled
    if (w > 0) h += (py - h) * w;
  }
  return h;
}

/** height of the bridge deck at (x, z), or null when you are not on a bridge */
export function deckH(x: number, z: number): number | null {
  const r = roadHit(x, z, HW_HALF + .5); if (!r) return null;
  return spanQ(r.h!, r.s) >= 0 ? profAt(r.h!, r.s) : null;
}
/** what a car stands on: the bridge deck when over one, otherwise the ground (cars never leave the road onto a river bed, deep water stops them) */
export const driveH = (x: number, z: number) => { const d = deckH(x, z); return d === null ? terrainH(x, z) : d; };
/** what someone on foot stands on. Under a bridge (swimming, or on the river bed) you stay below it: you are only on the deck when you were already up at deck height (you walked onto it from a ramp). */
export const groundFor = (x: number, z: number, prevG: number) => { const d = deckH(x, z); return d !== null && prevG > d - 1 ? d : terrainH(x, z); };

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
    if (nearRoad(x, z, HW_HALF + 9)) continue;
    if (fbm(x * .008 + seed, z * .008, 2) < .42) continue;   // cheap test first: thin out the woods away from the "forest" noise
    const h = terrainH(x, z); if (h < minH || h > maxH || slopeAt(x, z) > maxSlope) continue;
    out.push([x, z, .7 + hash(i * 3, seed + 9) * .9, Math.floor(hash(i, seed + 5) * 3)]);
  }
  return out;
}
