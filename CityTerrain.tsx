'use client';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { BOAT_DEPTH, CORE, DOCKS, HIGHWAYS, HW_HALF, HW_STEP, WATER_Y, WORLD_LIM, dockNear, groundColor, hwPoint, scatter, terrainH, type Highway } from '../lib/terrain';
import { GAME } from './cityShared';
import { ROAD_MAT } from './CityLook';

/* The ground outside the city: rolling hills, beaches, a river and a lake, drawn as a grid of chunks (so the GPU only draws the ones in view),
   plus the water surface, trees, rocks, boat docks and the boats that wait at them. The city core is flat (see lib/terrain.ts), so nothing inside it moves. */

const CHUNK = 160, CELL = 5, EXT = 960, SHOW = 560;   // chunk size / grid step (metres), half-size of the world drawn, and how far from you chunks are built (fog hides anything further)
const CITY_GROUND: [number, number, number] = [.365, .498, .333];   // #5d7f55, the colour the city floor always had

/** the heightmap for one chunk, with vertex colours (sand / grass / dry grass / rock). Inside the flat city core it matches the old floor exactly. */
function chunkGeometry(cx: number, cz: number) {
  const n = Math.round(CHUNK / CELL), w = n + 3, H = new Float32Array(w * w), x0 = cx * CHUNK, z0 = cz * CHUNK;
  for (let a = 0; a < w; a++) for (let b = 0; b < w; b++) H[a * w + b] = terrainH(x0 + (b - 1) * CELL, z0 + (a - 1) * CELL);   // one cell of border so slopes need no extra height lookups
  const verts = (n + 1) * (n + 1), pos = new Float32Array(verts * 3), col = new Float32Array(verts * 3), nor = new Float32Array(verts * 3), idx: number[] = [];
  let i = 0;
  for (let a = 0; a <= n; a++) for (let b = 0; b <= n; b++) {
    const x = x0 + b * CELL, z = z0 + a * CELL, k = (a + 1) * w + (b + 1), h = H[k];
    const inCore = Math.abs(x) <= CORE && Math.abs(z) <= CORE;
    const sl = Math.hypot(H[k + 1] - H[k - 1], H[k + w] - H[k - w]) / (2 * CELL);
    const [r, g, bl] = inCore ? CITY_GROUND : groundColor(x, z, h, sl);
    { const nx = inCore ? 0 : -(H[k + 1] - H[k - 1]) / (2 * CELL), nz = inCore ? 0 : -(H[k + w] - H[k - w]) / (2 * CELL), nl = Math.hypot(nx, 1, nz); nor[i * 3] = nx / nl; nor[i * 3 + 1] = 1 / nl; nor[i * 3 + 2] = nz / nl; }   // normals come from the height grid (not per chunk), so chunk edges light seamlessly
    pos[i * 3] = x; pos[i * 3 + 1] = inCore ? -.06 : h; pos[i * 3 + 2] = z; col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = bl; i++;
  }
  // The city floor is a separate plane covering [-CORE-1, CORE+1]. Do not draw
  // terrain triangles underneath it: coplanar meshes at y=-0.06 caused z-fighting,
  // dark flickering patches and seams where chunk boundaries crossed the city core.
  const cityHalf = CORE + 1;
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
    const p = a * (n + 1) + b, q = p + n + 1;
    const x = x0 + (b + .5) * CELL, z = z0 + (a + .5) * CELL;
    if (Math.abs(x) <= cityHalf && Math.abs(z) <= cityHalf) continue;
    idx.push(p, q, p + 1, p + 1, q, q + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** chunks are built when you come within SHOW metres of them (two per frame, nearest first, so a phone never stalls) and kept for the session */
function Ground() {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }), []);
  const cache = useRef(new Map<string, THREE.BufferGeometry>());
  const [keys, setKeys] = useState<string[]>([]);
  const st = useRef({ x: 1e9, z: 1e9, want: [] as string[], shown: '' });
  useEffect(() => () => { cache.current.forEach(g => g.dispose()); cache.current.clear(); mat.dispose(); }, [mat]);
  useFrame(() => {
    const p = GAME.player, S = st.current;
    if (Math.abs(p.x - S.x) >= 40 || Math.abs(p.z - S.z) >= 40) {
      S.x = p.x; S.z = p.z;
      const m = Math.ceil(EXT / CHUNK), list: { k: string; d: number }[] = [];
      for (let cx = -m; cx < m; cx++) for (let cz = -m; cz < m; cz++) {
        const x0 = cx * CHUNK, z0 = cz * CHUNK;
        if (x0 >= -CORE && x0 + CHUNK <= CORE && z0 >= -CORE && z0 + CHUNK <= CORE) continue;   // fully inside the flat core: the city floor covers it
        const dx = Math.max(x0 - p.x, 0, p.x - (x0 + CHUNK)), dz = Math.max(z0 - p.z, 0, p.z - (z0 + CHUNK)), d = dx * dx + dz * dz;
        if (d < SHOW * SHOW) list.push({ k: cx + ',' + cz, d });
      }
      S.want = list.sort((a, b) => a.d - b.d).map(e => e.k);
    }
    let built = 0;
    for (const k of S.want) { if (cache.current.has(k)) continue; if (built >= 2) break; const [cx, cz] = k.split(',').map(Number); cache.current.set(k, chunkGeometry(cx, cz)); built++; }
    const ready = S.want.filter(k => cache.current.has(k)), sig = ready.join('|');
    if (sig !== S.shown) { S.shown = sig; setKeys(ready); }
  });
  return <>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.06, 0]} receiveShadow><planeGeometry args={[CORE * 2 + 2, CORE * 2 + 2]} /><meshStandardMaterial color="#5d7f55" /></mesh>
    {keys.map(k => <mesh key={k} geometry={cache.current.get(k)} material={mat} receiveShadow />)}
  </>;
}

/* ───── water: one big plane at the water level with a moving ripple texture; swimming and boating read the same level ───── */
function rippleTexture() {
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d')!;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 90; i++) { const x = Math.random() * S, y = Math.random() * S, r = 4 + Math.random() * 9; g.strokeStyle = `rgba(150,190,220,${.14 + Math.random() * .18})`; g.lineWidth = 1 + Math.random() * 1.5; for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) { g.beginPath(); g.ellipse(x + dx, y + dy, r * 1.6, r * .6, Math.random() * 3, 0, Math.PI * 2); g.stroke(); } }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(220, 220); t.anisotropy = 4; return t;
}

export function Water() {
  const mesh = useRef<THREE.Mesh>(null!);
  const tex = useMemo(() => rippleTexture(), []);
  useEffect(() => () => tex.dispose(), [tex]);
  useFrame(({ clock }) => { const t = clock.elapsedTime; tex.offset.set(t * .006, t * .0035); });
  return <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_Y, 0]} renderOrder={2}>
    <planeGeometry args={[EXT * 2, EXT * 2]} />
    <meshStandardMaterial map={tex} color="#2f7fa8" transparent opacity={.74} roughness={.12} metalness={.15} depthWrite={false} side={THREE.DoubleSide} />
  </mesh>;
}

/* ───── trees and rocks (instanced: a handful of draw calls for the whole countryside) ───── */
function Scenery() {
  const [data, setData] = useState<{ trees: [number, number, number, number][]; stones: [number, number, number, number][] } | null>(null);
  useEffect(() => { const id = setTimeout(() => setData({ trees: scatter(1750, 3, WATER_Y + 1.6, 105, .72), stones: scatter(260, 8, WATER_Y + .2, 60, 5) }), 900); return () => clearTimeout(id); }, []);   // planted a moment after the city appears so loading is not held up
  return data ? <SceneryInstances trees={data.trees} stones={data.stones} /> : null;
}

function SceneryInstances({ trees, stones }: { trees: [number, number, number, number][]; stones: [number, number, number, number][] }) {
  const trunk = useRef<THREE.InstancedMesh>(null!), crown = useRef<THREE.InstancedMesh>(null!), crown2 = useRef<THREE.InstancedMesh>(null!), rocks = useRef<THREE.InstancedMesh>(null!);
  useEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    trees.forEach(([x, z, k, kind], i) => {
      const y = terrainH(x, z), h = (4.2 + kind * .55) * k, rot = (x * 13 + z * 7) % 6.28;
      q.setFromAxisAngle(up, rot);
      p.set(x, y + h * .25, z); s.set(.28 * k, h * .5, .28 * k); m.compose(p, q, s); trunk.current.setMatrixAt(i, m);
      // Vary canopy proportions and offsets by deterministic tree kind so groves don't repeat one silhouette.
      const broad = kind === 0, narrow = kind === 1;
      p.set(x + (kind - 1) * .16 * k, y + h * (broad ? .59 : .63), z + (1 - kind) * .12 * k);
      s.set((broad ? 2.05 : narrow ? 1.35 : 1.72) * k, h * (broad ? .47 : narrow ? .62 : .53), (broad ? 1.85 : narrow ? 1.3 : 1.58) * k);
      m.compose(p, q, s); crown.current.setMatrixAt(i, m);
      // Richer, less uniform greens with subtle seasonal variation.
      c.setHSL(.255 + kind * .027 + ((i * 37) % 13) * .003, .43 + ((i * 7) % 5) * .025, .19 + ((i * 11) % 11) * .009); crown.current.setColorAt(i, c);
      p.set(x + (kind === 2 ? .2 : -.12) * k, y + h * (broad ? .88 : .94), z + (kind === 1 ? .16 : -.08) * k);
      s.set((broad ? 1.4 : narrow ? 1.02 : 1.25) * k, h * (broad ? .32 : narrow ? .36 : .34), (broad ? 1.35 : narrow ? 1.0 : 1.2) * k);
      m.compose(p, q, s); crown2.current.setMatrixAt(i, m); crown2.current.setColorAt(i, c);
    });
    trunk.current.instanceMatrix.needsUpdate = crown.current.instanceMatrix.needsUpdate = crown2.current.instanceMatrix.needsUpdate = true;
    if (crown.current.instanceColor) crown.current.instanceColor.needsUpdate = true; if (crown2.current.instanceColor) crown2.current.instanceColor.needsUpdate = true;
    stones.forEach(([x, z, k], i) => { q.setFromAxisAngle(up, x * .3); p.set(x, terrainH(x, z) + .3 * k, z); s.set(1.4 * k, .9 * k, 1.1 * k); m.compose(p, q, s); rocks.current.setMatrixAt(i, m); });
    rocks.current.instanceMatrix.needsUpdate = true;
  }, [trees, stones]);
  return <>
    <instancedMesh ref={trunk} args={[undefined, undefined, trees.length]} frustumCulled={false}><cylinderGeometry args={[.6, 1, 1, 6]} /><meshStandardMaterial color="#5a3d26" roughness={1} /></instancedMesh>
    <instancedMesh ref={crown} args={[undefined, undefined, trees.length]} frustumCulled={false} castShadow><icosahedronGeometry args={[1, 2]} /><meshStandardMaterial roughness={0.96} flatShading /></instancedMesh>
    <instancedMesh ref={crown2} args={[undefined, undefined, trees.length]} frustumCulled={false}><dodecahedronGeometry args={[1, 1]} /><meshStandardMaterial roughness={0.98} flatShading /></instancedMesh>
    <instancedMesh ref={rocks} args={[undefined, undefined, stones.length]} frustumCulled={false}><dodecahedronGeometry args={[1, 0]} /><meshStandardMaterial color="#7a7870" roughness={1} flatShading /></instancedMesh>
  </>;
}

/* ───── boats ───── */
export type BoatKit = { hull: THREE.Material; trim: THREE.Material; seat: THREE.Material; glass: THREE.Material };
let KIT: BoatKit | null = null;
const kit = (): BoatKit => KIT || (KIT = {
  hull: new THREE.MeshStandardMaterial({ color: '#f2f2ee', roughness: .35, metalness: .1 }),
  trim: new THREE.MeshStandardMaterial({ color: '#c8352f', roughness: .5 }),
  seat: new THREE.MeshStandardMaterial({ color: '#2b2f36', roughness: .8 }),
  glass: new THREE.MeshStandardMaterial({ color: '#9fd4f0', roughness: .1, metalness: .3, transparent: true, opacity: .55 }),
});

/** a small speedboat, about 6 m long, bow towards +x (same convention as the cars: rotation.y = atan2(-dz, dx)) */
export function BoatModel() {
  const k = kit();
  return <group>
    <mesh material={k.hull} position={[0, .45, 0]} castShadow><boxGeometry args={[4.4, .9, 1.9]} /></mesh>
    <mesh material={k.hull} position={[2.95, .45, 0]} rotation={[0, 0, -Math.PI / 2]} scale={[.48, 1, 1]} castShadow><coneGeometry args={[.95, 1.5, 4]} /></mesh>
    <mesh material={k.trim} position={[0, .93, 0]}><boxGeometry args={[4.5, .08, 2]} /></mesh>
    <mesh material={k.trim} position={[0, .3, 0]}><boxGeometry args={[4.45, .12, 1.95]} /></mesh>
    <mesh material={k.seat} position={[-.6, 1.15, .45]}><boxGeometry args={[.9, .45, .55]} /></mesh>
    <mesh material={k.seat} position={[-.6, 1.15, -.45]}><boxGeometry args={[.9, .45, .55]} /></mesh>
    <mesh material={k.seat} position={[-1.7, 1.15, 0]}><boxGeometry args={[.7, .45, 1.6]} /></mesh>
    <mesh material={k.glass} position={[.5, 1.45, 0]} rotation={[0, 0, -.35]}><boxGeometry args={[.08, .75, 1.7]} /></mesh>
    <mesh material={k.seat} position={[-2.3, .55, 0]}><boxGeometry args={[.5, .8, .5]} /></mesh>
  </group>;
}

/* ───── docks: a short wooden pier, a sign post and a rental boat waiting at each one ───── */
export const DOCK_BOATS: { id: string; x: number; z: number; r: number }[] = DOCKS.map(d => ({ id: d.id, x: d.x, z: d.z, r: d.r }));

/** the boat YOU are driving (or left floating): pose, speed and which dock it came from. Steering lives in CityWorld; this is just the shared state. */
export const BOAT = { on: false, parked: false, dock: -1, x: 0, z: 0, r: 0, v: 0, roll: 0 };

function Docks() {
  return <>{DOCKS.map(d => {
    const dx = d.x - d.px, dz = d.z - d.pz, len = Math.hypot(dx, dz) || 1, ang = Math.atan2(-dz, dx), midx = (d.px + d.x) / 2, midz = (d.pz + d.z) / 2;
    const top = Math.max(WATER_Y + .5, terrainH(d.px, d.pz) + .25);
    return <group key={d.id}>
      <group position={[midx, top, midz]} rotation={[0, ang, 0]}>
        <mesh receiveShadow castShadow><boxGeometry args={[len + 6, .22, 3]} /><meshStandardMaterial color="#8a6a45" roughness={1} /></mesh>
        {[-1, 1].map(s => [-.5, -.25, 0, .25, .5].map(t => <mesh key={s + '_' + t} position={[t * (len + 4), -1.6, s * 1.3]}><cylinderGeometry args={[.16, .16, 3.2, 6]} /><meshStandardMaterial color="#4a3622" roughness={1} /></mesh>))}
      </group>
      <group position={[d.px - Math.cos(ang) * 1.5, top, d.pz + Math.sin(ang) * 1.5]}>
        <mesh position={[0, 1.2, 0]}><cylinderGeometry args={[.07, .07, 2.4, 6]} /><meshStandardMaterial color="#3b2c1c" /></mesh>
        <mesh position={[0, 2.35, 0]}><boxGeometry args={[.9, .45, .08]} /><meshStandardMaterial color="#1f6f8b" emissive="#0a2a36" /></mesh>
      </group>
    </group>;
  })}</>;
}

/** the rental boats tied up at every dock (a boat you are driving, or that another player is driving, is hidden here) */
export function DockBoats() {
  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    DOCK_BOATS.forEach((b, i) => { const g = refs.current[i]; if (!g) return; g.visible = !(BOAT.dock === i && (BOAT.on || BOAT.parked)); g.position.set(b.x, WATER_Y + .02 + Math.sin(t * 1.3 + i) * .04, b.z); g.rotation.set(Math.sin(t * .9 + i) * .02, b.r, Math.sin(t * 1.1 + i) * .025); });
  });
  return <>{DOCK_BOATS.map((b, i) => <group key={b.id} ref={el => { refs.current[i] = el; }}><BoatModel /></group>)}</>;
}

/** the boat you can climb into from where you stand: the one you left floating, or the one waiting at a nearby dock */
export function boatTarget(px: number, pz: number): { x: number; z: number; r: number; dock: number } | null {
  if (BOAT.on) return null;
  if (BOAT.parked && Math.hypot(px - BOAT.x, pz - BOAT.z) < 10) return { x: BOAT.x, z: BOAT.z, r: BOAT.r, dock: BOAT.dock };
  const d = dockNear(px, pz, 16); if (!d) return null;
  const i = DOCKS.indexOf(d); if (BOAT.parked && BOAT.dock === i) return null;   // that dock's boat is the one you left out on the water
  return { x: d.x, z: d.z, r: d.r, dock: i };
}

/** swimmer ripples: a soft ring on the surface round you while you swim (other players' rings are not drawn) */
export const SWIM = { on: false, x: 0, z: 0, moving: false, dive: 0 };
function SwimRipple() {
  const g = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (!g.current) return; g.current.visible = SWIM.on; if (!SWIM.on) return;
    const t = (clock.elapsedTime * (SWIM.moving ? 1.6 : .8)) % 1;
    g.current.position.set(SWIM.x, WATER_Y + .03, SWIM.z); const k = .8 + t * 1.8; g.current.scale.set(k, k, k);
    (g.current.material as THREE.MeshBasicMaterial).opacity = (1 - t) * (SWIM.dive > .45 ? .12 : .5);
  });
  return <mesh ref={g} rotation={[-Math.PI / 2, 0, 0]} visible={false}><ringGeometry args={[.9, 1.1, 28]} /><meshBasicMaterial color="#ffffff" transparent opacity={.4} depthWrite={false} /></mesh>;
}

/** your own boat: follows BOAT every frame, bobs on the water, leans into turns and trails a foam wake */
export function PlayerBoat() {
  const g = useRef<THREE.Group>(null!), wake = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    const on = BOAT.on || BOAT.parked; if (!g.current) return; g.current.visible = on; if (!on) return;
    const t = clock.elapsedTime, sp = Math.abs(BOAT.v);
    g.current.position.set(BOAT.x, WATER_Y + .02 + Math.sin(t * 1.6) * .05 + Math.min(.25, sp * .012), BOAT.z);
    g.current.rotation.set(BOAT.roll, BOAT.r, Math.sin(t * 1.2) * .02 - Math.min(.1, sp * .004));
    if (wake.current) { const w = THREE.MathUtils.clamp(sp / 14, 0, 1); wake.current.visible = w > .05; wake.current.scale.set(1 + w * 3.5, 1, .5 + w * 2.2); (wake.current.material as THREE.MeshBasicMaterial).opacity = .55 * w; }
  });
  return <group ref={g} visible={false}>
    <BoatModel />
    <mesh ref={wake} position={[-4.2, .0, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}><coneGeometry args={[2.2, 6, 3]} /><meshBasicMaterial color="#ffffff" transparent opacity={.4} depthWrite={false} /></mesh>
  </group>;
}

/* ───── highways and bridges (see lib/terrain.ts for the road height and the bridge spans) ─────
   Each highway is drawn as ribbons that follow the graded ground: asphalt, a dashed centre line, edge lines and, over water, a bridge deck with
   parapets, a fascia and concrete piers standing on the river bed. Built once per highway, a handful of meshes in total. */
type RP = { x: number; z: number; nx: number; nz: number; y: number; s: number };
class Geo {
  pos: number[] = []; idx: number[] = [];
  /** a strip between two curves along the road: lateral offsets (oa, ob) and heights above the road surface (ya, yb); `flat` strips are lit as level ground */
  strip(pts: RP[], oa: number, ya: number, ob: number, yb: number) {
    const base = this.pos.length / 3;
    for (const p of pts) this.pos.push(p.x + p.nx * oa, p.y + ya, p.z + p.nz * oa, p.x + p.nx * ob, p.y + yb, p.z + p.nz * ob);
    for (let i = 0; i < pts.length - 1; i++) { const a = base + i * 2; this.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  build(flat: boolean) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setIndex(this.idx);
    if (flat) { const n = new Float32Array(this.pos.length); for (let i = 1; i < n.length; i += 3) n[i] = 1; g.setAttribute('normal', new THREE.BufferAttribute(n, 3)); } else g.computeVertexNormals();
    g.computeBoundingSphere(); return g;
  }
}
const samples = (h: Highway, s0: number, s1: number): RP[] => {
  const out: RP[] = [], n = Math.max(1, Math.round((s1 - s0) / HW_STEP));
  for (let i = 0; i <= n; i++) { const s = s0 + (s1 - s0) * i / n, p = hwPoint(h, s); out.push({ x: p.x, z: p.z, nx: -p.tz, nz: p.tx, y: p.y, s }); }   // (nx, nz): lateral direction, to the left of travel
  return out;
};
const ASPHALT_Y = .13;

function HighwayMeshes({ h }: { h: Highway }) {
  const built = useMemo(() => {
    const all = samples(h, 0, h.len), top = new Geo(), lines = new Geo(), edges = new Geo(), conc = new Geo();
    top.strip(all, -HW_HALF, ASPHALT_Y, HW_HALF, ASPHALT_Y);
    // dashed centre line (8 m on, 8 m off) and continuous edge lines
    for (let i = 0; i + 1 < all.length; i += 4) lines.strip(all.slice(i, i + 3), -.11, ASPHALT_Y + .02, .11, ASPHALT_Y + .02);
    edges.strip(all, -HW_HALF + .45, ASPHALT_Y + .02, -HW_HALF + .62, ASPHALT_Y + .02); edges.strip(all, HW_HALF - .62, ASPHALT_Y + .02, HW_HALF - .45, ASPHALT_Y + .02);
    const piers: { x: number; z: number; y0: number; y1: number }[] = [];
    for (const [a, b] of h.spans) {
      const sp = samples(h, a, b), o = HW_HALF + .55;
      conc.strip(sp, -o, -.95, o, -.95);                                      // underside of the deck
      conc.strip(sp, -o, -.95, -o, ASPHALT_Y + .05); conc.strip(sp, o, -.95, o, ASPHALT_Y + .05);   // fascia beams along both edges
      conc.strip(sp, -o, ASPHALT_Y + .05, -HW_HALF, ASPHALT_Y + .05); conc.strip(sp, HW_HALF, ASPHALT_Y + .05, o, ASPHALT_Y + .05);   // kerbs
      for (const side of [-1, 1]) { const po = side * (o - .08); conc.strip(sp, po, ASPHALT_Y + .05, po, 1.15); conc.strip(sp, po - .2, 1.15, po + .2, 1.15); }   // parapet walls with a cap
      for (let s = a + 24; s <= b - 24; s += 28) { const p = hwPoint(h, s); for (const side of [-1, 1]) { const x = p.x - p.tz * side * 3.4, z = p.z + p.tx * side * 3.4; piers.push({ x, z, y0: terrainH(x, z) - .8, y1: p.y - .9 }); } }
    }
    return { top: top.build(true), lines: lines.build(true), edges: edges.build(true), conc: conc.build(false), piers };
  }, [h]);
  const pier = useRef<THREE.InstancedMesh>(null!);
  useEffect(() => {
    if (!pier.current) return; const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    built.piers.forEach((e, i) => { const hh = Math.max(.5, e.y1 - e.y0); p.set(e.x, e.y0 + hh / 2, e.z); sc.set(1, hh, 1); m.compose(p, q, sc); pier.current.setMatrixAt(i, m); });
    pier.current.instanceMatrix.needsUpdate = true;
  }, [built]);
  useEffect(() => () => { built.top.dispose(); built.lines.dispose(); built.edges.dispose(); built.conc.dispose(); }, [built]);
  const mLine = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e8e4d0', roughness: .8, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), []);
  const mEdge = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f1f1f1', roughness: .8, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), []);
  const mConc = useMemo(() => new THREE.MeshStandardMaterial({ color: '#a9a8a2', roughness: .9, side: THREE.DoubleSide }), []);
  const mTop = useMemo(() => { const m = ROAD_MAT.clone(); m.side = THREE.DoubleSide; m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -1; return m; }, []);
  useFrame(() => { mTop.color.copy(ROAD_MAT.color); mTop.roughness = ROAD_MAT.roughness; mTop.metalness = ROAD_MAT.metalness; });   // follows the city roads when it rains
  useEffect(() => () => { mLine.dispose(); mEdge.dispose(); mConc.dispose(); mTop.dispose(); }, [mLine, mEdge, mConc, mTop]);
  return <group>
    <mesh geometry={built.top} material={mTop} receiveShadow frustumCulled={false} />
    <mesh geometry={built.lines} material={mLine} frustumCulled={false} />
    <mesh geometry={built.edges} material={mEdge} frustumCulled={false} />
    {built.conc.attributes.position.count > 0 && <mesh geometry={built.conc} material={mConc} castShadow receiveShadow frustumCulled={false} />}
    {built.piers.length > 0 && <instancedMesh ref={pier} args={[undefined, undefined, built.piers.length]} frustumCulled={false} castShadow><cylinderGeometry args={[.8, .95, 1, 10]} /><meshStandardMaterial color="#9d9c96" roughness={.95} /></instancedMesh>}
  </group>;
}
function Highways() { return <>{HIGHWAYS.map(h => <HighwayMeshes key={h.id} h={h} />)}</>; }

export default function CityTerrain() {
  return <>
    <Ground />
    <Highways />
    <Water />
    <Scenery />
    <Docks />
    <DockBoats />
    <PlayerBoat />
    <SwimRipple />
  </>;
}

export { BOAT_DEPTH, WORLD_LIM };
