/* Wuse Market Tail: all the rules of the stealth tail, with no React and no three.js so it can be tested on its own.
   - prepareTail(): a dealer's car is parked at the start spot (visible, not moving)
   - goTail():      he sets off after a short delay and visits every stop (parked for `dwell` seconds at each)
   - stepTail():    called every frame by <TailTarget/>: moves the car, then judges the player's distance
   The outcome lands in TAIL.result ('win' | 'spotted' | 'lost'); <TailTarget/> turns it into an event for the mission. */
import { BUILDING_DESTS, type Dest } from './destinations';
import { GRID, curbSpot, newRide, planRide, stepRide, type Axis, type Curb, type RideState, type Route } from './roadRoute';
import { TAIL_RULES as R, type Goto, type TailSpec } from './missions';

export type TailLeg = { rt: Route; name: string; dwell: number };
export type TailPhase = 'idle' | 'parked' | 'depart' | 'drive' | 'dwell' | 'handover' | 'done';
export type TailBand = 'close' | 'mid' | 'view' | 'watch' | 'ok' | 'far';
export type TailState = {
  on: boolean; follow: boolean; phase: TailPhase; spec: TailSpec | null; legs: TailLeg[]; leg: number; ride: RideState | null;
  x: number; z: number; r: number; v: number; timer: number; stopName: string;
  susp: number; dist: number; band: TailBand; lostFor: number; witness: number; handoverAge: number; result: '' | 'win' | 'spotted' | 'lost';
};
const fresh = (): TailState => ({ on: false, follow: false, phase: 'idle', spec: null, legs: [], leg: 0, ride: null, x: 1e5, z: 1e5, r: 0, v: 0, timer: 0, stopName: '', susp: 0, dist: 999, band: 'ok', lostFor: 0, witness: 0, handoverAge: 0, result: '' });
export const TAIL: TailState = fresh();

const MAXI = 5;
const lc = (s: string) => s.toLowerCase();
const nearest = (l: Dest[], from?: { x: number; z: number }) => from ? [...l].sort((a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z))[0] : l[0];

/** Find a building for a Goto. Name, type and district must all match when given; if nothing does, fall back to type, then district. */
export function resolveGoto(g: Goto, from?: { x: number; z: number }): Dest | undefined {
  const all = (d: Dest) => (!g.name || lc(d.name).includes(lc(g.name))) && (!g.type || d.type === g.type) && (!g.district || lc(d.district) === lc(g.district));
  let l = BUILDING_DESTS.filter(all); if (l.length) return nearest(l, from);
  if (g.type) { l = BUILDING_DESTS.filter(d => d.type === g.type); if (l.length) return nearest(l, from); }
  if (g.district) { l = BUILDING_DESTS.filter(d => lc(d.district) === lc(g.district!)); if (l.length) return nearest(l, from); }
  return undefined;
}

/** A kerbside parking spot next to (x, z): on the nearest road, mid-block (never in a junction) and well inside the road network. */
export function curbNear(x: number, z: number): Curb {
  const cl = (i: number) => Math.max(-MAXI, Math.min(MAXI, i));
  const ix = cl(Math.round(x / GRID)), iz = cl(Math.round(z / GRID)), dx = x - ix * GRID, dz = z - iz * GRID, lim = (MAXI - 1) * GRID;
  const mid = (a: number) => { const k = a / GRID, f0 = Math.floor(k), f = Math.min(.72, Math.max(.28, k - f0)); return Math.max(-lim, Math.min(lim, (f0 + f) * GRID)); };
  if (Math.abs(dx) <= Math.abs(dz)) return curbSpot('z' as Axis, ix, mid(z), dx >= 0 ? 1 : -1);
  return curbSpot('x' as Axis, iz, mid(x), dz >= 0 ? 1 : -1);
}

/** Plan the dealer's whole trip: start kerb, then one driven leg per stop. Returns null when the map has nothing to plan on. */
export function buildTail(spec: TailSpec, playerPos?: { x: number; z: number }): { start: Curb; legs: TailLeg[] } | null {
  const origin = resolveGoto(spec.from, playerPos); if (!origin) return null;
  const start = curbNear(origin.x, origin.z); let st: Pick<Curb, 'x' | 'z' | 'axis' | 'road' | 'along' | 'h'> = start, prev = { x: start.x, z: start.z };
  const legs: TailLeg[] = [];
  for (const s of spec.stops) {
    const d = resolveGoto(s, prev); if (!d) continue;
    if (Math.hypot(d.x - prev.x, d.z - prev.z) < GRID * .8) continue;      // already there
    const rt = planRide(st, [d.x, d.z]); if (!rt) continue;
    legs.push({ rt, name: d.name, dwell: s.dwell ?? spec.dwell }); st = rt.end; prev = { x: rt.end.x, z: rt.end.z };
  }
  return legs.length ? { start, legs } : null;
}

export function clearTail() { Object.assign(TAIL, fresh()); }

/** Park the dealer's car at the start spot. Safe to call more than once (a reload re-sends it). */
export function prepareTail(spec: TailSpec, playerPos?: { x: number; z: number }): boolean {
  if (TAIL.on && TAIL.spec === spec) return true;
  const plan = buildTail(spec, playerPos); if (!plan) { clearTail(); return false; }
  Object.assign(TAIL, fresh(), { on: true, phase: 'parked' as TailPhase, spec, legs: plan.legs, x: plan.start.x, z: plan.start.z, r: plan.start.r, stopName: 'parked' });
  return true;
}

/** The player has reached the market: after a short delay the dealer gets in and drives off. */
export function goTail() {
  if (!TAIL.on || TAIL.phase !== 'parked') return;
  TAIL.follow = true; TAIL.phase = 'depart'; TAIL.timer = R.departSecs; TAIL.susp = 0; TAIL.lostFor = 0; TAIL.witness = 0; TAIL.handoverAge = 0;
}

/** A gunshot near the dealer blows the tail at once. */
export function tailShot(px: number, pz: number) {
  if (!TAIL.on || !TAIL.follow || TAIL.result) return;
  if (Math.hypot(px - TAIL.x, pz - TAIL.z) < R.shotDist) { TAIL.susp = 100; TAIL.result = 'spotted'; }
}

type Env = { t: number; light: (t: number, axis: Axis) => string; cars: { x: number; z: number; r: number }[]; player?: { x: number; z: number } };

function startLeg(i: number) {
  const L = TAIL.legs[i]; if (!L) return;
  TAIL.leg = i; TAIL.ride = newRide(L.rt, TAIL.r); TAIL.phase = 'drive'; TAIL.stopName = '';
}

/** Move the dealer. */
function move(dt: number, env: Env) {
  if (TAIL.phase === 'depart') { TAIL.timer -= dt; if (TAIL.timer <= 0) startLeg(0); return; }
  if (TAIL.phase === 'dwell') { TAIL.timer -= dt; if (TAIL.timer <= 0) startLeg(TAIL.leg + 1); return; }
  if (TAIL.phase !== 'drive' || !TAIL.ride || !TAIL.spec) return;
  const L = TAIL.legs[TAIL.leg], rs = TAIL.ride;
  stepRide(rs, L.rt, dt, { vmax: TAIL.spec.vmax, t: env.t, light: env.light, cars: env.cars });
  TAIL.x = rs.x; TAIL.z = rs.z; TAIL.r = rs.r; TAIL.v = rs.v;
  if (rs.done) {
    TAIL.v = 0; TAIL.stopName = L.name;
    if (TAIL.leg >= TAIL.legs.length - 1) { TAIL.phase = 'handover'; TAIL.handoverAge = 0; TAIL.witness = 0; }
    else { TAIL.phase = 'dwell'; TAIL.timer = L.dwell; }
  }
}

/** Judge the player: alertness goes up when you are too close / ahead of him / loitering while he is parked, and cools down at a safe distance. */
function judge(dt: number, env: Env) {
  const pl = env.player; if (!pl) return;
  const dx = pl.x - TAIL.x, dz = pl.z - TAIL.z, d = Math.hypot(dx, dz); TAIL.dist = d;
  const fx = Math.cos(TAIL.r), fz = -Math.sin(TAIL.r), ahead = d > .1 ? (dx * fx + dz * fz) / d : 0, still = TAIL.v < .5;
  let rate: number, band: TailBand;
  if (d < R.closeDist) { rate = R.closeRate; band = 'close'; }
  else if (ahead > R.coneCos && d < R.coneDist) { rate = R.coneRate; band = 'view'; }
  else if (still && d < R.watchDist) { rate = R.watchRate; band = 'watch'; }
  else if (d < R.midDist) { rate = R.midRate; band = 'mid'; }
  else if (d > R.loseDist * .7) { rate = -R.cool; band = 'far'; }
  else { rate = -R.cool; band = 'ok'; }
  TAIL.band = band; TAIL.susp = Math.max(0, Math.min(100, TAIL.susp + rate * dt));
  if (TAIL.susp >= 100) { TAIL.result = 'spotted'; return; }
  if (d > R.loseDist) TAIL.lostFor += dt; else TAIL.lostFor = Math.max(0, TAIL.lostFor - dt * 2);
  if (TAIL.lostFor > R.loseSecs) { TAIL.result = 'lost'; return; }
  if (TAIL.phase === 'handover') {
    TAIL.handoverAge += dt;
    if (d <= R.witnessDist && d >= R.closeDist) TAIL.witness += dt;
    if (TAIL.witness >= R.witnessSecs) TAIL.result = 'win';
    else if (TAIL.handoverAge > R.handoverMaxSecs) TAIL.result = 'lost';
  }
}

export function stepTail(dt: number, env: Env) {
  if (!TAIL.on || TAIL.phase === 'idle' || TAIL.phase === 'done') return;
  if (TAIL.result) return;
  if (!TAIL.follow) return;                       // still parked and waiting for you to arrive
  move(dt, env); judge(dt, env);
}
