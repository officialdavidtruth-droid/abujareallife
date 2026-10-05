// Collision + path-finding for the house. Pure functions (no React / three) so they are easy to test.
export type Box = [number, number, number, number]; // [x0, x1, z0, z1] footprint in world metres
export type Blk = { id: string; b: Box };
export type P = [number, number];

export const R = 0.24; // body radius used when planning routes
export const HARD = 0.18; // body radius used for the hard "you cannot enter this" check every frame
export const BOUNDS = { x: 5.85, z: 4.3 }; // walkable area inside the walls
const G = 0.15; // grid cell size for path-finding

export const inside = (p: P, k: Box, r = 0) => p[0] > k[0] - r && p[0] < k[1] + r && p[1] > k[2] - r && p[1] < k[3] + r;
export const blocked = (blks: Blk[], p: P, own?: string, r = R) =>
  Math.abs(p[0]) > BOUNDS.x || Math.abs(p[1]) > BOUNDS.z || blks.some(k => k.id !== own && inside(p, k.b, r));

function clear(blks: Blk[], a: P, b: P, own?: string) { // is the straight line a→b free?
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(d / 0.07));
  for (let i = 1; i <= n; i++) if (blocked(blks, [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n], own)) return false;
  return true;
}

const NX = Math.ceil((BOUNDS.x * 2) / G) + 1, NZ = Math.ceil((BOUNDS.z * 2) / G) + 1;
const cell = (p: P): [number, number] => [Math.round((p[0] + BOUNDS.x) / G), Math.round((p[1] + BOUNDS.z) / G)];
const pos = (i: number, j: number): P => [i * G - BOUNDS.x, j * G - BOUNDS.z];

/** Nearest walkable point to p (p itself if it is already free). */
export function nearestFree(blks: Blk[], p: P, own?: string): P {
  if (!blocked(blks, p, own)) return p;
  const [ci, cj] = cell(p); let best: P | null = null, bd = 1e9;
  for (let r = 1; r < 40 && !best; r++) for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
    if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
    const q = pos(i, j); if (blocked(blks, q, own)) continue;
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = q; }
  }
  return best || p;
}

/** Route from `from` to `to` that never cuts through a footprint. Returns waypoints (excluding `from`). */
export function findPath(blks: Blk[], from: P, to: P, own?: string): P[] {
  const goal = nearestFree(blks, to, own);
  if (clear(blks, from, goal, own)) return [goal];
  const s = cell(nearestFree(blks, from, own)); let e = cell(goal);
  const idx = (i: number, j: number) => j * NX + i, N = NX * NZ;
  const gs = new Float32Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  const walk = new Int8Array(N).fill(-1); const ok = (i: number, j: number) => { if (i < 0 || j < 0 || i >= NX || j >= NZ) return false; const k = idx(i, j); if (walk[k] < 0) walk[k] = blocked(blks, pos(i, j), own) ? 0 : 1; return walk[k] === 1; };
  if (!ok(e[0], e[1])) { let bd = 1e9, be = e; for (let i = e[0] - 3; i <= e[0] + 3; i++) for (let j = e[1] - 3; j <= e[1] + 3; j++) if (ok(i, j) && Math.hypot(i - e[0], j - e[1]) < bd) { bd = Math.hypot(i - e[0], j - e[1]); be = [i, j]; } e = be; }
  const open: number[] = [idx(s[0], s[1])]; gs[open[0]] = 0; let near = open[0], nh = 1e9;
  const h = (i: number, j: number) => Math.hypot(i - e[0], j - e[1]);
  let found = false;
  while (open.length) {
    let bi = 0, bf = Infinity;
    for (let n = 0; n < open.length; n++) { const k = open[n], f = gs[k] + h(k % NX, Math.floor(k / NX)); if (f < bf) { bf = f; bi = n; } }
    const cur = open.splice(bi, 1)[0]; if (done[cur]) continue; done[cur] = 1;
    const ci = cur % NX, cj = Math.floor(cur / NX);
    { const hh = Math.hypot(ci - e[0], cj - e[1]); if (hh < nh) { nh = hh; near = cur; } }
    if (ci === e[0] && cj === e[1]) { found = true; break; }
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue; const ni = ci + di, nj = cj + dj;
      if (!ok(ni, nj) || (di && dj && (!ok(ci + di, cj) || !ok(ci, cj + dj)))) continue; // no corner cutting
      const k = idx(ni, nj), g = gs[cur] + Math.hypot(di, dj);
      if (g < gs[k]) { gs[k] = g; prev[k] = cur; open.push(k); }
    }
  }
  // if the goal sits in a sealed-off pocket, walk to the closest reachable spot instead of through the furniture
  const endK = found ? idx(e[0], e[1]) : near;
  const cells: P[] = []; for (let k = endK; k !== -1; k = prev[k]) cells.push(pos(k % NX, Math.floor(k / NX)));
  cells.reverse(); if (found && !blocked(blks, goal, own) && clear(blks, cells[cells.length - 1], goal, own)) cells.push(goal);
  // string-pull: keep only the corners that matter
  const out: P[] = []; let a: P = from, i = 0;
  while (i < cells.length) {
    let j = cells.length - 1; while (j > i && !clear(blks, a, cells[j], own)) j--;
    out.push(cells[j]); a = cells[j]; i = j + 1;
  }
  return out;
}
