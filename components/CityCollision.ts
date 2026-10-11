'use client';
import * as THREE from 'three';
import { LOOK_SOLIDS, POWER_POLES } from './CityLook';
import { GRID, WS, signalised } from '../lib/roadRoute';
import { AIR, BILLBOARDS, LAMP_PTS, TREE_PTS } from './CityScenery';
import { BUILDS, INTER } from './cityShared';


/* ───────────── collision ───────────── */
/* Thin things on the street that were only decoration for vehicles: lamp posts, signal poles, utility poles, billboard posts and trees.
   Circles (x, z, radius); the player's car is pushed out of them exactly like it is pushed out of a building. */
export const CAR_POSTS: { x: number; z: number; r: number }[] = [
  ...LAMP_PTS.map(q => ({ x: q.x, z: q.z, r: .2 })),
  ...INTER.filter(it => signalised(Math.round(it.x / GRID), Math.round(it.z / GRID))).flatMap(it => [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) => ({ x: it.x + sx * (it.hv + 1.1), z: it.z + sz * (it.hh + 1.1), r: .25 }))),
  ...POWER_POLES.map(q => ({ x: q.x, z: q.z, r: .25 })),
  ...BILLBOARDS.flatMap(b => [-1.7, 1.7].map(o => ({ x: b.x + b.ax * o, z: b.z + b.az * o, r: .3 }))),
  ...TREE_PTS.map(t => ({ x: t.x, z: t.z, r: .35 })),
];

export const BODY = .45;

export const SOLIDS = [
  ...LOOK_SOLIDS,
  ...BUILDS.map(b => ({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 })),
  { x0: AIR.x - 4.5 * AIR.s, x1: AIR.x + 4.5 * AIR.s, z0: AIR.z - 7 * AIR.s - 2.5 * AIR.s, z1: AIR.z - 7 * AIR.s + 2.5 * AIR.s },
];

export function pushOut(p: { x: number; z: number }, rad = BODY) {
  for (const s of SOLIDS) {
    if (p.x < s.x0 - rad || p.x > s.x1 + rad || p.z < s.z0 - rad || p.z > s.z1 + rad) continue;
    const cx = Math.min(Math.max(p.x, s.x0), s.x1), cz = Math.min(Math.max(p.z, s.z0), s.z1);
    const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= rad * rad) continue;
    if (d2 > 1e-6) { const d = Math.sqrt(d2); p.x = cx + dx / d * rad; p.z = cz + dz / d * rad; }
    else { const l = p.x - s.x0, r = s.x1 - p.x, t = p.z - s.z0, b = s.z1 - p.z, m = Math.min(l, r, t, b); if (m === l) p.x = s.x0 - rad; else if (m === r) p.x = s.x1 + rad; else if (m === t) p.z = s.z0 - rad; else p.z = s.z1 + rad; }
  }
}


/* ───────────── city navigation ─────────────
 * The interior collision/pathfinding helper has a small-room coordinate system,
 * so the outdoor city needs its own bounded navigator. It plans on the same
 * world coordinates used by the 3D city and treats building footprints as solid.
 */
export type CityBlk = { id: string; x0: number; x1: number; z0: number; z1: number };

export const BL: CityBlk[] = BUILDS.map(b => ({
  id: b.id,
  x0: b.x - b.w / 2 - .65,
  x1: b.x + b.w / 2 + .65,
  z0: b.z - b.d / 2 - .65,
  z1: b.z + b.d / 2 + .65,
}));

export const NAV_STEP = 2;

export const NAV_MIN = -132 * WS;

export const NAV_MAX = 132 * WS;

export const navBlocked = (blks: CityBlk[], x: number, z: number) =>
  x < NAV_MIN || x > NAV_MAX || z < NAV_MIN || z > NAV_MAX ||
  blks.some(b => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1);

export const navKey = (x: number, z: number) => `${Math.round(x / NAV_STEP)},${Math.round(z / NAV_STEP)}`;

export const navPoint = (x: number, z: number): [number, number] => [
  THREE.MathUtils.clamp(Math.round(x / NAV_STEP) * NAV_STEP, NAV_MIN, NAV_MAX),
  THREE.MathUtils.clamp(Math.round(z / NAV_STEP) * NAV_STEP, NAV_MIN, NAV_MAX),
];

export function nearestNavFree(blks: CityBlk[], target: [number, number]): [number, number] {
  if (!navBlocked(blks, target[0], target[1])) return target;
  for (let r = 1; r <= 10; r++) {
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const x = target[0] + dx * NAV_STEP, z = target[1] + dz * NAV_STEP;
      if (!navBlocked(blks, x, z)) return [x, z];
    }
  }
  return target;
}

export function findPath(blks: CityBlk[], from: [number, number], to: [number, number]): [number, number][] {
  const start = navPoint(from[0], from[1]);
  const goal = nearestNavFree(blks, navPoint(to[0], to[1]));
  if (!navBlocked(blks, start[0], start[1]) && !navBlocked(blks, goal[0], goal[1])) {
    const clear = (a: [number, number], b: [number, number]) => {
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.ceil(d / .8));
      for (let i = 1; i <= n; i++) {
        const x = a[0] + (b[0] - a[0]) * i / n, z = a[1] + (b[1] - a[1]) * i / n;
        if (navBlocked(blks, x, z)) return false;
      }
      return true;
    };
    if (clear(start, goal)) return [goal];
  }

  const toCell = (p: [number, number]) => [Math.round((p[0] - NAV_MIN) / NAV_STEP), Math.round((p[1] - NAV_MIN) / NAV_STEP)] as [number, number];
  const toWorld = (c: [number, number]) => [NAV_MIN + c[0] * NAV_STEP, NAV_MIN + c[1] * NAV_STEP] as [number, number];
  const s = toCell(start), g = toCell(goal);
  const key = (c: [number, number]) => `${c[0]},${c[1]}`;
  const open: [number, number][] = [s], came = new Map<string, string>(), score = new Map<string, number>([[key(s), 0]]), closed = new Set<string>();
  const heuristic = (a: [number, number]) => Math.abs(a[0] - g[0]) + Math.abs(a[1] - g[1]);
  let best = s;
  while (open.length && closed.size < 18000 * WS * WS) {
    let bi = 0, bf = Infinity;
    for (let i = 0; i < open.length; i++) {
      const f = (score.get(key(open[i])) ?? Infinity) + heuristic(open[i]);
      if (f < bf) { bf = f; bi = i; }
    }
    const cur = open.splice(bi, 1)[0], ck = key(cur);
    if (closed.has(ck)) continue;
    closed.add(ck);
    if (heuristic(cur) < heuristic(best)) best = cur;
    if (cur[0] === g[0] && cur[1] === g[1]) { best = cur; break; }
    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
      const n: [number, number] = [cur[0] + dx, cur[1] + dz];
      if (n[0] < 0 || n[1] < 0 || n[0] > Math.round((NAV_MAX-NAV_MIN)/NAV_STEP) || n[1] > Math.round((NAV_MAX-NAV_MIN)/NAV_STEP)) continue;
      const w = toWorld(n);
      if (navBlocked(blks, w[0], w[1])) continue;
      const nk = key(n), ng = (score.get(ck) ?? Infinity) + 1;
      if (ng < (score.get(nk) ?? Infinity)) { score.set(nk, ng); came.set(nk, ck); open.push(n); }
    }
  }
  const cells: [number, number][] = [];
  let curKey = key(best);
  const startKey = key(s);
  cells.push(best);
  while (curKey !== startKey) {
    const prev = came.get(curKey); if (!prev) break;
    const [x, z] = prev.split(',').map(Number); cells.push([x, z]); curKey = prev;
  }
  cells.reverse();
  const points = cells.map(toWorld);
  if (!points.length || key(points[points.length - 1] as [number, number]) === key(start)) return [goal];
  // String-pull the grid path so the character follows a small number of natural corners.
  const out: [number, number][] = [];
  let anchor = start;
  for (let i = 0; i < points.length; i++) {
    const candidate = points[i];
    let clear = true;
    const d = Math.hypot(candidate[0] - anchor[0], candidate[1] - anchor[1]);
    for (let j = 1; j <= Math.ceil(d / .8); j++) {
      const t = j / Math.ceil(d / .8), x = anchor[0] + (candidate[0] - anchor[0]) * t, z = anchor[1] + (candidate[1] - anchor[1]) * t;
      if (navBlocked(blks, x, z)) { clear = false; break; }
    }
    if (!clear) { const prev = points[Math.max(0, i - 1)]; out.push(prev); anchor = prev; }
  }
  out.push(goal);
  return out.filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i-1][0], p[1] - a[i-1][1]) > .5);
}
