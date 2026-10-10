/* Road layout, curb spots and taxi / bike driving for Abuja Real Life.
   Pure functions (no React / three) so they can be tested headlessly.

   World: roads run on a 22 m grid. Road `k` along the x axis is the line z = k*GRID, along the z axis it is x = k*GRID.
   Even roads are 7 m boulevards, odd roads 5 m streets. Traffic drives on the RIGHT, in lanes half a road-half-width off the centre line.
   Vehicle models face +x at rotation 0, so a vehicle heading (dx, dz) has rotation.y = atan2(-dz, dx)  (same as the AI traffic). */
export const GRID = 22;
/** Only the big boulevard × boulevard junctions have signals; everything else is free-flowing, so traffic doesn't stop at every turn. */
export const signalised = (a: number, b: number) => ((a % 2) + 2) % 2 === 0 && ((b % 2) + 2) % 2 === 0;
export const halfW = (i: number) => (((i % 2) + 2) % 2 === 0 ? 3.5 : 2.5);
export type XZ = [number, number];
export type Axis = 'x' | 'z';

const MAXI = 5;             // roads exist for indices -5..5
export const CURB = 1.45;   // distance from the road edge to the middle of a parked vehicle (the sidewalk strip is >= 2.8 m wide)
/** Buses are 2.2 m wide and 6 m long, so they stop with their body mostly IN the road (like a real bus stop) instead of on the pavement, where they clipped trees, lamps and billboards. */
export const CURB_BUS = -.3;
/** Cars (taxis, police) are ~1.9 m wide: with the old 1.45 m offset they sat on the pavement through the lamp posts (1.1 m past the road edge). Now they stop at the road edge, body just inside it. */
export const CURB_CAR = -.15;
const PULL_OUT = 5;         // metres the vehicle drives before it has merged into its lane
const CORNER_R = 4.2;       // turning radius at junctions
const clampI = (i: number) => Math.max(-MAXI, Math.min(MAXI, i));
const roadPos = (axis: Axis, k: number, t: number): XZ => (axis === 'x' ? [t, k * GRID] : [k * GRID, t]);
const rightOf = (d: XZ): XZ => [-d[1], d[0]]; // right-hand side of a travel direction
const unit = (a: XZ, b: XZ): XZ => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** A parking spot on the sidewalk strip beside a road, facing the way traffic on that side of the road flows. */
export type Curb = { x: number; z: number; r: number; axis: Axis; road: number; along: number; side: 1 | -1; h: 1 | -1 };
export function curbSpot(axis: Axis, road: number, along: number, side: 1 | -1): Curb {
  const lat = side * (halfW(road) + CURB_CAR);
  if (axis === 'x') return { x: along, z: road * GRID + lat, r: side === 1 ? 0 : Math.PI, axis, road, along, side, h: side };            // curb on the right of the heading
  return { x: road * GRID + lat, z: along, r: side === -1 ? -Math.PI / 2 : Math.PI / 2, axis, road, along, side, h: (-side) as 1 | -1 };
}
/** A roadside billboard post line: on the sidewalk strip, front face turned towards the road. */
export function billboardSpot(axis: Axis, road: number, along: number, side: 1 | -1) {
  const off = side * (halfW(road) + 1.5);
  if (axis === 'x') return { x: along, z: road * GRID + off, ry: side === 1 ? 0 : Math.PI };
  return { x: road * GRID + off, z: along, ry: side === 1 ? Math.PI / 2 : -Math.PI / 2 };
}

/** `end` is the kerb spot the vehicle finishes in, shaped so it can be passed straight to planRide() as the start of the NEXT leg (multi-stop bus routes). */
export type Route = { pts: XZ[]; cum: number[]; len: number; lights: { s: number; axis: Axis; ci: number }[]; drop: XZ; end: Pick<Curb, 'x' | 'z' | 'axis' | 'road' | 'along' | 'h'> };

function snapRoad(p: XZ): { axis: Axis; road: number; t: number } {
  const ix = clampI(Math.round(p[0] / GRID)), iz = clampI(Math.round(p[1] / GRID));
  const dx = Math.abs(p[0] - ix * GRID), dz = Math.abs(p[1] - iz * GRID), lim = MAXI * GRID;
  return dx <= dz ? { axis: 'z', road: ix, t: Math.max(-lim, Math.min(lim, p[1])) } : { axis: 'x', road: iz, t: Math.max(-lim, Math.min(lim, p[0])) };
}

/** Plan a ride from a parked spot to (roughly) `dest`: pull out, follow the right-hand lane along the roads, turn at junctions with a radius,
    pull in to the kerb well clear of the crossing. Returns null if the spot is too close to the edge of the road network. */
export function planRide(st: Pick<Curb, 'x' | 'z' | 'axis' | 'road' | 'along' | 'h'>, dest: XZ, curb: number = CURB_CAR): Route | null {
  const t0 = st.along + PULL_OUT * st.h;
  const nodeAhead = st.h === 1 ? Math.floor(t0 / GRID + 1e-9) + 1 : Math.ceil(t0 / GRID - 1e-9) - 1;
  if (Math.abs(nodeAhead) > MAXI) return null;
  const nodeOf = (axis: Axis, road: number, idx: number) => (axis === 'x' ? { i: idx, j: road } : { i: road, j: idx });
  const src = nodeOf(st.axis, st.road, nodeAhead);

  // Destination: the kerb stop sits 13 m into the block, measured from the junction the taxi arrives through (room for the turn, the pull-in and a stop before the next crossing)
  const E = snapRoad(dest), a = Math.max(-MAXI, Math.min(MAXI - 1, Math.floor(E.t / GRID))), STOP = 13;
  const ends = [a, a + 1].map(k => ({ k, te: k === a ? a * GRID + STOP : (a + 1) * GRID - STOP, out: E.axis === 'x' ? (k === a ? 0 : 1) : (k === a ? 2 : 3) }));
  type Stop = { p: XZ; node?: { i: number; j: number } };

  // Dijkstra over (junction, direction of travel) states so a route can turn left/right or go straight, but never U-turns
  const DIRS: XZ[] = [[1, 0], [-1, 0], [0, 1], [0, -1]], opp = (d: number) => d ^ 1, NV = 121 * 4;
  const nid = (n: { i: number; j: number }) => (n.i + MAXI) * 11 + (n.j + MAXI), sid = (n: { i: number; j: number }, d: number) => nid(n) * 4 + d;
  const startDir = st.axis === 'x' ? (st.h === 1 ? 0 : 1) : (st.h === 1 ? 2 : 3);
  const dist = new Array<number>(NV).fill(Infinity), prev = new Array<number>(NV).fill(-1), seen = new Array<boolean>(NV).fill(false);
  dist[sid(src, startDir)] = Math.abs(nodeAhead * GRID - t0);
  for (;;) {
    let u = -1, bd = Infinity; for (let k = 0; k < NV; k++) if (!seen[k] && dist[k] < bd) { bd = dist[k]; u = k; }
    if (u < 0) break; seen[u] = true; const d = u & 3, nn = u >> 2, ui = ((nn / 11) | 0) - MAXI, uj = (nn % 11) - MAXI;
    for (let d2 = 0; d2 < 4; d2++) { if (d2 === opp(d)) continue; const ni = ui + DIRS[d2][0], nj = uj + DIRS[d2][1]; if (Math.abs(ni) > MAXI || Math.abs(nj) > MAXI) continue; const v = sid({ i: ni, j: nj }, d2); if (dist[u] + GRID < dist[v]) { dist[v] = dist[u] + GRID; prev[v] = u; } }
  }
  let best = -1, bc = Infinity, bend = ends[0];
  for (const e of ends) {
    const n = nodeOf(E.axis, E.road, e.k);
    for (let d = 0; d < 4; d++) { if (d === opp(e.out)) continue; const c2 = dist[sid(n, d)] + STOP + .6 * Math.abs(e.te - E.t); if (c2 < bc) { bc = c2; best = sid(n, d); bend = e; } }
  }
  if (best < 0 || !isFinite(bc)) return null;
  const chain: { i: number; j: number }[] = []; for (let u = best; u !== -1; u = prev[u]) { const nn = u >> 2; chain.push({ i: ((nn / 11) | 0) - MAXI, j: (nn % 11) - MAXI }); }
  chain.reverse();
  const q0 = roadPos(st.axis, st.road, t0), qe = roadPos(E.axis, E.road, bend.te);
  let stops: Stop[] = [{ p: q0 }, ...chain.map(n => ({ p: [n.i * GRID, n.j * GRID] as XZ, node: n })), { p: qe }];
  stops = stops.filter((s, k) => k === 0 || Math.hypot(s.p[0] - stops[k - 1].p[0], s.p[1] - stops[k - 1].p[1]) > .01);
  if (stops.length < 2) return null;

  const dirs: XZ[] = [], lane: number[] = [], segLen: number[] = [];
  for (let m = 0; m < stops.length - 1; m++) {
    const d = unit(stops[m].p, stops[m + 1].p); dirs.push(d); segLen.push(Math.hypot(stops[m + 1].p[0] - stops[m].p[0], stops[m + 1].p[1] - stops[m].p[1]));
    const road = Math.abs(d[0]) > .5 ? Math.round(stops[m].p[1] / GRID) : Math.round(stops[m].p[0] / GRID); lane.push(halfW(road) * .5);
  }
  const pts: XZ[] = [[st.x, st.z]], marks: { idx: number; axis: Axis; ci: number; cj: number }[] = [];
  for (let m = 0; m < stops.length; m++) {
    const a = m > 0 ? dirs[m - 1] : null, b = m < dirs.length ? dirs[m] : null, p = stops[m].p;
    let ox = 0, oz = 0; if (a) { const r = rightOf(a); ox += r[0] * lane[m - 1]; oz += r[1] * lane[m - 1]; }
    const turn = !!a && !!b && (Math.abs(a[0] - b[0]) > .1 || Math.abs(a[1] - b[1]) > .1);
    if (b && (!a || turn)) { const r = rightOf(b); ox += r[0] * lane[m]; oz += r[1] * lane[m]; }
    const P: XZ = [p[0] + ox, p[1] + oz];
    if (turn && a && b) { // rounded corner: quadratic curve from before the corner to after it
      const R = Math.min(CORNER_R, .45 * segLen[m - 1], .45 * segLen[m]), pin: XZ = [P[0] - a[0] * R, P[1] - a[1] * R], pout: XZ = [P[0] + b[0] * R, P[1] + b[1] * R], first = pts.length;
      for (let k = 0; k <= 8; k++) { const t = k / 8, u = 1 - t; pts.push([u * u * pin[0] + 2 * u * t * P[0] + t * t * pout[0], u * u * pin[1] + 2 * u * t * P[1] + t * t * pout[1]]); }
      const n = stops[m].node; if (n) { const ax: Axis = Math.abs(a[0]) > .5 ? 'x' : 'z'; marks.push({ idx: first + 4, axis: ax, ci: ax === 'x' ? n.i : n.j, cj: ax === 'x' ? n.j : n.i }); }
    } else {
      pts.push(P); const n = stops[m].node;
      if (n && a) { const ax: Axis = Math.abs(a[0]) > .5 ? 'x' : 'z'; marks.push({ idx: pts.length - 1, axis: ax, ci: ax === 'x' ? n.i : n.j, cj: ax === 'x' ? n.j : n.i }); }
    }
  }
  // pull in to the kerb before the destination
  const dl = dirs[dirs.length - 1], rl = rightOf(dl), endRoad = Math.abs(dl[0]) > .5 ? Math.round(qe[1] / GRID) : Math.round(qe[0] / GRID), Ll = lane[lane.length - 1];
  const back = Math.max(3, Math.min(8, segLen[segLen.length - 1] - CORNER_R - 1.5));
  pts.pop();
  pts.push([qe[0] - dl[0] * back + rl[0] * Ll, qe[1] - dl[1] * back + rl[1] * Ll]);
  const kerb = halfW(endRoad) + curb; pts.push([qe[0] + rl[0] * kerb, qe[1] + rl[1] * kerb]);
  const walk = halfW(endRoad) + CURB + .65; // the passenger always lands on the pavement, whatever the vehicle's width
  const drop: XZ = [qe[0] + rl[0] * walk, qe[1] + rl[1] * walk];

  const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  const endAxis: Axis = Math.abs(dl[0]) > .5 ? 'x' : 'z', last = pts[pts.length - 1];
  const end = { x: last[0], z: last[1], axis: endAxis, road: endRoad, along: endAxis === 'x' ? qe[0] : qe[1], h: ((endAxis === 'x' ? dl[0] : dl[1]) >= 0 ? 1 : -1) as 1 | -1 };
  return { pts, cum, len: cum[cum.length - 1], end, lights: marks.filter(m => m.idx < pts.length - 2 && Math.abs(m.ci) <= MAXI).filter(m => signalised(m.ci, m.cj)).map(m => ({ s: cum[m.idx], axis: m.axis, ci: m.ci })), drop };
}

/** position along the route at arc length s */
export function routeAt(rt: Route, s: number): XZ {
  s = Math.max(0, Math.min(rt.len, s)); let lo = 0, hi = rt.cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (rt.cum[m] <= s) lo = m; else hi = m; }
  const seg = rt.cum[hi] - rt.cum[lo] || 1, f = (s - rt.cum[lo]) / seg;
  return [rt.pts[lo][0] + (rt.pts[hi][0] - rt.pts[lo][0]) * f, rt.pts[lo][1] + (rt.pts[hi][1] - rt.pts[lo][1]) * f];
}
const headingOf = (a: XZ, b: XZ) => Math.atan2(-(b[1] - a[1]), b[0] - a[0]); // vehicle rotation.y for travelling a -> b

export type RideState = { s: number; v: number; r: number; x: number; z: number; wait: number; done: boolean; pushCars?: number; pushLights?: number };
export const newRide = (rt: Route, r0: number): RideState => ({ s: 0, v: 0, r: r0, x: rt.pts[0][0], z: rt.pts[0][1], wait: 0, done: false, pushCars: 0, pushLights: 0 });

/** Advance a ride by dt seconds: follows the route exactly, slows for bends, stops at red lights, keeps a gap to cars ahead, eases to a stop at the kerb. */
export function stepRide(rs: RideState, rt: Route, dt: number, env: { vmax: number; t: number; light: (t: number, axis: Axis) => string; cars: { x: number; z: number; r: number }[] }) {
  if (rs.done) return rs;
  const here = routeAt(rt, rs.s), ahead = routeAt(rt, rs.s + 2.2), h1 = routeAt(rt, rs.s + 1), h2 = routeAt(rt, rs.s + 9);
  const target = Math.hypot(ahead[0] - here[0], ahead[1] - here[1]) > .05 ? headingOf(here, ahead) : rs.r;
  const bend = Math.abs(wrapA(headingOf(h1, h2) - headingOf(here, h1)));
  let vt = env.vmax * (1 - .6 * Math.min(1, bend / 1.1));
  const rem = rt.len - rs.s; vt = Math.min(vt, Math.max(2.2, rem * .75));
  // Give-way timers. After being stopped a while the ride may edge past what is holding it, and it keeps that licence for several seconds:
  // without this the licence ended the moment the ride moved a centimetre, so it re-stopped behind the same car and never got past it.
  if (rs.wait >= 14) rs.pushCars = 7; else if ((rs.pushCars || 0) > 0) rs.pushCars! -= dt;
  if (rs.wait >= 30) rs.pushLights = 6; else if ((rs.pushLights || 0) > 0) rs.pushLights! -= dt;
  if (!((rs.pushLights || 0) > 0)) for (const L of rt.lights) { // same stop line rule as the AI traffic (a ride that has been stuck for 30 s ignores the light)
    const d = L.s - rs.s, stop = halfW(L.ci) + 5.2;
    const ls = env.light(env.t, L.axis); if (d > -.5 && d < 60 && (ls === 'r' || (ls === 'y' && d - stop > 9)) && d >= stop - .05) vt = Math.min(vt, Math.sqrt(2 * 9 * Math.max(0, d - stop)));
  }
  if (!((rs.pushCars || 0) > 0)) { const f: XZ = [Math.cos(rs.r), -Math.sin(rs.r)]; // do not drive into the car in front
    for (const c of env.cars) { const rx = c.x - rs.x, rz = c.z - rs.z, along = rx * f[0] + rz * f[1], lat = Math.abs(-rx * f[1] + rz * f[0]); if (along > 0 && along < 16 && lat < 1.8) vt = Math.min(vt, Math.sqrt(2 * 9 * Math.max(0, along - 6.5))); } }
  rs.v += Math.max(-14 * dt, Math.min(7 * dt, vt - rs.v));
  rs.wait = rs.v < .3 ? rs.wait + dt : 0;
  rs.s += rs.v * dt;
  if (rs.s >= rt.len - .05) { rs.s = rt.len; rs.done = true; rs.v = 0; }
  rs.r += wrapA(target - rs.r) * Math.min(1, dt * 9);
  const p = routeAt(rt, rs.s); rs.x = p[0]; rs.z = p[1];
  return rs;
}

/** A random spot on a sidewalk strip (never on the carriageway), mid-block so it is clear of junctions, facing along the walkway.
 *  Used when a player steps out of their house, so everyone appears somewhere different. `taken` lets the caller reject crowded spots. */
export function sidewalkSpawn(rand: () => number = Math.random, taken?: (x: number, z: number) => boolean): { x: number; z: number; r: number } {
  let out = { x: 0, z: 0, r: 0 };
  for (let tries = 0; tries < 10; tries++) {
    const ri = Math.floor(rand() * 5) - 2, side = rand() < .5 ? 1 : -1, axis: Axis = rand() < .5 ? 'x' : 'z', dir = rand() < .5 ? 1 : -1;
    const along = (Math.floor(rand() * 6) - 3) * GRID + GRID / 2 + (rand() * 2 - 1) * 5; // middle of a block, +/- 5 m
    const lat = ri * GRID + side * (halfW(ri) + 2);                                       // 2 m past the kerb: the same line the pedestrians walk
    out = axis === 'x' ? { x: along, z: lat, r: dir * Math.PI / 2 } : { x: lat, z: along, r: dir > 0 ? 0 : Math.PI };
    if (!taken || !taken(out.x, out.z)) break;
  }
  return out;
}

/** True while (x, z) is inside, or right at the stop lines of, a junction. */
export function inJunction(x: number, z: number, margin = 4.5): boolean {
  const ix = Math.round(x / GRID), iz = Math.round(z / GRID);
  if (Math.abs(ix) > MAXI || Math.abs(iz) > MAXI) return false;
  return Math.abs(x - ix * GRID) < halfW(ix) + margin && Math.abs(z - iz * GRID) < halfW(iz) + margin;
}

/** Where a passenger lands when they get off a vehicle that has stopped at (x, z) heading r (rotation.y): on the pavement on the side of the road the vehicle is driving on.
 *  Also returns the road it is on, for the pull-away. */
export function exitSpot(x: number, z: number, r: number): { drop: XZ; axis: Axis; road: number } {
  const axis: Axis = Math.abs(Math.cos(r)) >= Math.abs(Math.sin(r)) ? 'x' : 'z';
  const road = clampI(Math.round((axis === 'x' ? z : x) / GRID)), dev = (axis === 'x' ? z : x) - road * GRID;
  const rx = Math.sin(r), rz = Math.cos(r), right = axis === 'x' ? rz : rx;               // which way is the right-hand side along the cross axis
  const sg = Math.abs(dev) > .3 ? Math.sign(dev) : (right >= 0 ? 1 : -1), lat = road * GRID + sg * (halfW(road) + CURB + .85);
  return { drop: axis === 'x' ? [x, lat] : [lat, z], axis, road };
}