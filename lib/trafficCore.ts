// Shared-world traffic core. Every phone runs this identical, pure simulation (no player, no network, no Math.random) in fixed ticks counted
// from the shared clock, so every phone computes the same "canonical" position for every AI car at the same moment.
// Joining mid-world is cheap: the core restarts from the seeded start layout at the beginning of each ERA and fast-forwards to "now".
// The per-frame code in CityTraffic.tsx is only a LOCAL layer on top: it follows these positions, but may lag them (stopping for you,
// a hailed taxi, a crime reaction) and then catches back up.
import { GRID, WS, halfW, signalised } from './roadRoute';
import { lightState, simToMs, weatherAt, worldCalendar, worldMinute } from './worldClock';

export const TICK = 0.5;                        // seconds per core step (smoothness comes from interpolating between ticks)
export const ERA_S = 2 * 3600;                  // the core restarts from the seeded layout every 2 real hours (bounds the join fast-forward to ~15k ticks)
const ERA_TICKS = ERA_S / TICK;
export const WRAP = 118 * WS, LOOP = 2 * WRAP;

export type CoreLane = { axis: 'x' | 'z'; dir: 1 | -1; road: number; speed: number; cars: { s: number; mul: number }[] };

const nextCenter = (s: number, dir: 1 | -1) => (dir === 1 ? Math.floor(s / GRID + 1e-6) * GRID + GRID : Math.ceil(s / GRID - 1e-6) * GRID - GRID);

/** weather / rush-hour slowdown for a moment: the same maths the per-frame code uses, so core and local layer agree */
export function trafficFactor(ms: number) {
  const wx = weatherAt(ms), wc = worldCalendar(worldMinute(ms));
  return (wx.storm ? .62 : wx.rain > .45 ? .78 : 1) * ((wc.hh >= 7 && wc.hh < 10) || (wc.hh >= 16 && wc.hh < 19) ? 1.18 : 1);
}

export class TrafficCore {
  n = 0; k = -1; era = -1; frac = 0; fresh = true;
  private s0: Float64Array; private cur: Float64Array; private prev: Float64Array; private nxt: Float64Array;
  private lane: Int32Array; private mate: Int32Array[] = []; private spd: Float64Array; private fac = 1;
  constructor(private lanes: CoreLane[]) {
    const flat = lanes.flatMap((l, li) => l.cars.map(c => ({ li, c }))); this.n = flat.length;
    this.s0 = Float64Array.from(flat.map(f => f.c.s)); this.cur = new Float64Array(this.n); this.prev = new Float64Array(this.n); this.nxt = new Float64Array(this.n);
    this.lane = Int32Array.from(flat.map(f => f.li)); this.spd = Float64Array.from(flat.map(f => lanes[f.li].speed * f.c.mul));
    this.mate = flat.map((f, i) => Int32Array.from(flat.flatMap((g, j) => (j !== i && g.li === f.li ? [j] : []))));
  }
  private step(tick: number) {
    const t = tick * TICK, { cur, nxt, lanes } = this;
    if (tick % 10 === 0) this.fac = trafficFactor(simToMs(t));   // weather / rush hour move slowly: refresh every 5 s (10 ticks)
    for (let i = 0; i < this.n; i++) {
      const l = lanes[this.lane[i]], s = cur[i], dir = l.dir;
      let adv = this.spd[i] * this.fac * TICK, gap = Infinity;
      for (const j of this.mate[i]) { const d = (cur[j] - s) * dir; if (d > 0 && d < gap) gap = d; }
      adv = Math.min(adv, Math.max(0, gap - 7));                                   // keep a safe distance
      const nx = nextCenter(s, dir), d = (nx - s) * dir, ci = Math.round(nx / GRID), ls = lightState(t, l.axis);
      if (Math.abs(ci) <= 5 && signalised(ci, l.road) && (ls === 'r' || (ls === 'y' && d - (halfW(ci) + 5.2) > 9)) && d >= halfW(ci) + 5.2 - .05) adv = Math.min(adv, Math.max(0, d - (halfW(ci) + 5.2)));   // stop at the red light
      let ns = s + adv * dir; if (ns > WRAP) ns = -WRAP; else if (ns < -WRAP) ns = WRAP;
      nxt[i] = ns;
    }
    this.prev.set(cur); cur.set(nxt);
  }
  /** bring the core up to shared time `t` (seconds, from simSeconds()). Cheap per frame; the first call after a (re)start fast-forwards. */
  sync(t: number) {
    const k = Math.floor(t / TICK), era = Math.floor(t / ERA_S);
    if (era !== this.era || k < this.k) { this.era = era; this.k = era * ERA_TICKS; this.cur.set(this.s0); this.prev.set(this.s0); this.fresh = true; }
    while (this.k < k) { this.k++; this.step(this.k); }
    this.frac = t / TICK - k;
  }
  /** canonical position of car i along its lane (smoothly interpolated between ticks) */
  pos(i: number) { const a = this.prev[i], b = this.cur[i]; return Math.abs(b - a) > LOOP / 2 ? b : a + (b - a) * this.frac; }
}
