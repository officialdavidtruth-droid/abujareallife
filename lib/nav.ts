import type { Interior } from './interiors';

/* Tap-to-walk for building interiors: A* over a 0.4 m grid, then string-pulling so the path has few corners.
   Pure functions (no React / three) so they can be tested. */
const CELL = .4, R = .42; // grid size, and the avatar radius we keep clear of furniture
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export type XZ = [number, number];

export function makeNav(room: Pick<Interior, 'w' | 'd' | 'items'>) {
  const hx = room.w / 2, hz = room.d / 2, nx = Math.ceil(room.w / CELL), nz = Math.ceil(room.d / CELL);
  const solids = room.items.filter(i => i.solid).map(i => ({ x0: i.x - i.w / 2, x1: i.x + i.w / 2, z0: i.z - i.d / 2, z1: i.z + i.d / 2 }));
  const free = (x: number, z: number) => { if (Math.abs(x) > hx - .45 || z < -hz + .4 || z > hz - .5) return false; for (const s of solids) if (Math.hypot(x - clamp(x, s.x0, s.x1), z - clamp(z, s.z0, s.z1)) < R) return false; return true; };
  const cellX = (i: number) => -hx + (i + .5) * CELL, cellZ = (j: number) => -hz + (j + .5) * CELL, ci = (x: number) => clamp(Math.floor((x + hx) / CELL), 0, nx - 1), cj = (z: number) => clamp(Math.floor((z + hz) / CELL), 0, nz - 1);
  const grid = new Uint8Array(nx * nz); for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) grid[j * nx + i] = free(cellX(i), cellZ(j)) ? 1 : 0;
  const snap = (x: number, z: number): [number, number] | null => { // nearest walkable cell to (x, z)
    const i0 = ci(x), j0 = cj(z); let best: [number, number] | null = null, bd = 1e9;
    for (let r = 0; r <= 12 && !best; r++) for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) { if (i < 0 || j < 0 || i >= nx || j >= nz || !grid[j * nx + i]) continue; const d = Math.hypot(cellX(i) - x, cellZ(j) - z); if (d < bd) { bd = d; best = [i, j]; } }
    return best;
  };
  const clear = (a: XZ, b: XZ) => { const d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(d / .15)); for (let k = 0; k <= n; k++) if (!free(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n)) return false; return true; };
  function path(from: XZ, to: XZ): XZ[] | null {
    const s = snap(from[0], from[1]), g = snap(to[0], to[1]); if (!s || !g) return null;
    const idx = (i: number, j: number) => j * nx + i, gs = new Float32Array(nx * nz).fill(1e9), prev = new Int32Array(nx * nz).fill(-1), done = new Uint8Array(nx * nz), open: number[] = [];
    const h = (i: number, j: number) => Math.hypot(i - g[0], j - g[1]); gs[idx(s[0], s[1])] = 0; open.push(idx(s[0], s[1]));
    while (open.length) {
      let bi = 0, bf = 1e9; for (let k = 0; k < open.length; k++) { const c = open[k], f = gs[c] + h(c % nx, (c / nx) | 0); if (f < bf) { bf = f; bi = k; } }
      const cur = open.splice(bi, 1)[0]; if (done[cur]) continue; done[cur] = 1; const ci0 = cur % nx, cj0 = (cur / nx) | 0; if (ci0 === g[0] && cj0 === g[1]) break;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { if (!di && !dj) continue; const ni = ci0 + di, nj = cj0 + dj; if (ni < 0 || nj < 0 || ni >= nx || nj >= nz || !grid[idx(ni, nj)] || done[idx(ni, nj)]) continue;
        if (di && dj && (!grid[idx(ci0 + di, cj0)] || !grid[idx(ci0, cj0 + dj)])) continue; // no cutting corners
        const ng = gs[cur] + (di && dj ? 1.414 : 1); if (ng < gs[idx(ni, nj)]) { gs[idx(ni, nj)] = ng; prev[idx(ni, nj)] = cur; open.push(idx(ni, nj)); } }
    }
    if (!done[idx(g[0], g[1])]) return null;
    const cells: XZ[] = []; for (let c = idx(g[0], g[1]); c !== -1; c = prev[c]) cells.push([cellX(c % nx), cellZ((c / nx) | 0)]); cells.reverse();
    const pts: XZ[] = [from, ...cells.slice(1)]; if (free(to[0], to[1])) pts.push(to); // finish exactly on the target when it is open floor
    const out: XZ[] = []; let a = 0; while (a < pts.length - 1) { let b = pts.length - 1; while (b > a + 1 && !clear(pts[a], pts[b])) b--; out.push(pts[b]); a = b; }
    return out;
  }
  return { path, free, snap: (x: number, z: number): XZ | null => { const c = snap(x, z); return c && [cellX(c[0]), cellZ(c[1])]; } };
}
