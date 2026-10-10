'use client';
// Step 8: city look. Everything here is purely visual (no netcode, no server) and built from shared geometry + instancing so it stays cheap on phones.
// Exports: BuildingDress (per-building signs / roof props / wall details), awningMat, StreetClutter, Graffiti, PowerLines, ShopGlow, Puddles, LookDriver, ROAD_MAT, LOOK_SOLIDS.
import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { BUILDS_WORLD, destIcon } from '../lib/destinations';
import { GRID, halfW } from '../lib/roadRoute';
import { weatherAt } from '../lib/worldClock';
import type { CityBuilding } from '../lib/cityTypes';

const BUILDS: CityBuilding[] = BUILDS_WORLD;
const FH = 3;
const hs = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };

/* Every building sits in the middle of a 16 x 16 m block, and the strip between the walls and the kerb is where pedestrians and kerbside taxis go.
 * So the props below hug the walls (or sit right at the kerb) instead of filling that strip. */

/* ───────────── shared geometry / material caches ───────────── */
const GB = new THREE.BoxGeometry(1, 1, 1);
const GC = new THREE.CylinderGeometry(.5, .5, 1, 10);
const GS = new THREE.SphereGeometry(.5, 8, 6);
const GK = new THREE.ConeGeometry(.5, 1, 10);
const MC = new Map<string, THREE.MeshStandardMaterial>();
const mat = (c: string, rough = .85, metal = 0) => { const k = c + rough + metal; let m = MC.get(k); if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal }); MC.set(k, m); } return m; };

/* ───────────── live look state, driven by LookDriver ───────────── */
export const WET = { v: 0 }; // 0 = dry, 1 = soaked; rises quickly in rain and dries slowly afterwards
export const ROAD_MAT = new THREE.MeshStandardMaterial({ color: '#2b2f35', roughness: .95 });
const ROAD_DRY = new THREE.Color('#2b2f35'), ROAD_WET = new THREE.Color('#171b21');
const SIGN_MATS: THREE.MeshStandardMaterial[] = []; // every shop sign / blade sign: glows at night

const NEON: Record<string, string> = {
  Nightclub: '#ff2bd6', Cinema: '#ffb300', Restaurant: '#ff7a2a', Pharmacy: '#27e07a', Hotel: '#ff4d6d', Barber: '#4f8cff', Salon: '#ff5fb0', Gym: '#22d3ee',
  Bank: '#60a5fa', 'Petrol Station': '#ffd23f', Market: '#ffa726', Supermarket: '#ff5252', 'Car Dealer': '#7cc4ff', 'Tech Company': '#a78bfa', 'Gun Shop': '#ff3b3b',
};
const neonOf = (type: string) => NEON[type] ?? '#ffd9a0';
const BLADE = new Set(['Nightclub', 'Cinema', 'Restaurant', 'Pharmacy', 'Hotel', 'Barber', 'Salon', 'Gym', 'Bank', 'Market', 'Petrol Station', 'Gun Shop']);
const STRIPED = new Set(['Restaurant', 'Supermarket', 'Market', 'Salon', 'Pharmacy', 'Barber', 'Cinema']);

/* ───────────── canvas textures ───────────── */
const TX = new Map<string, THREE.CanvasTexture>();
function canvasTex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const hit = TX.get(key); if (hit) return hit;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; TX.set(key, t); return t;
}
const signMats = new Map<string, THREE.MeshStandardMaterial>();
function glowMat(key: string, map: THREE.CanvasTexture, side: THREE.Side = THREE.FrontSide) {
  let m = signMats.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ map, emissive: new THREE.Color('#ffffff'), emissiveMap: map, emissiveIntensity: .1, roughness: .6, side }); signMats.set(key, m); SIGN_MATS.push(m); }
  return m;
}
function signMat(text: string, bg: string, neon: string) {
  const key = 'sg' + text + bg + neon;
  const tex = canvasTex(key, 512, 64, g => {
    g.fillStyle = bg; g.fillRect(0, 0, 512, 64);
    g.strokeStyle = neon; g.lineWidth = 4; g.strokeRect(5, 5, 502, 54);
    let size = 36; g.font = `700 ${size}px system-ui, "Segoe UI", Arial, sans-serif`;
    while (g.measureText(text).width > 468 && size > 14) { size -= 2; g.font = `700 ${size}px system-ui, "Segoe UI", Arial, sans-serif`; }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffffff'; g.shadowColor = neon; g.shadowBlur = 8; g.fillText(text, 256, 34);
  });
  return glowMat(key, tex);
}
function bladeMat(icon: string, bg: string, neon: string) {
  const key = 'bl' + icon + bg + neon;
  const tex = canvasTex(key, 128, 128, g => {
    g.fillStyle = bg; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = neon; g.lineWidth = 6; g.strokeRect(5, 5, 118, 118);
    g.font = '66px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(icon, 64, 70);
  });
  return glowMat(key, tex, THREE.DoubleSide);
}
const awnMats = new Map<string, THREE.MeshStandardMaterial>();
/** Shop awning: striped for food / retail types, plain otherwise. */
export function awningMat(color: string, type: string) {
  const striped = STRIPED.has(type), key = color + striped;
  let m = awnMats.get(key); if (m) return m;
  if (!striped) m = new THREE.MeshStandardMaterial({ color, roughness: .9 });
  else {
    const c = new THREE.Color(color), alt = c.clone().lerp(new THREE.Color('#ffffff'), .82);
    const tex = canvasTex('aw' + color, 128, 16, g => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#' + alt.getHexString() : '#' + c.getHexString(); g.fillRect(i * 16, 0, 16, 16); } });
    m = new THREE.MeshStandardMaterial({ map: tex, roughness: .9 });
  }
  awnMats.set(key, m); return m;
}
const GRAF_TEXT = ['9JA', 'NO RULES', 'WUSE', 'ABUJA 4 LIFE'], GRAF_COL = ['#ff2d95', '#2dd4ff', '#ffe14d', '#7cff4d'];
const grafMats: THREE.MeshStandardMaterial[] = [];
function grafMat(k: number) {
  if (grafMats[k]) return grafMats[k];
  const tex = canvasTex('gf' + k, 256, 128, g => {
    const text = GRAF_TEXT[k], col = GRAF_COL[k];
    let size = 70; g.font = `italic 900 ${size}px Impact, "Arial Black", sans-serif`;
    while (g.measureText(text).width > 232 && size > 20) { size -= 4; g.font = `italic 900 ${size}px Impact, "Arial Black", sans-serif`; }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = 9; g.strokeStyle = '#101214'; g.strokeText(text, 128, 56); g.fillStyle = col; g.fillText(text, 128, 56);
    g.strokeStyle = col; g.lineWidth = 2.5; for (let i = 0; i < 7; i++) { const x = 28 + i * 33 + ((k * 7 + i * 13) % 9), y0 = 76 + ((i * 11 + k * 5) % 10), len = 8 + ((i * 17 + k * 3) % 26); g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 + len); g.stroke(); }
  });
  const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: .05, roughness: .95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  grafMats[k] = m; return m;
}
function radialTex() {
  return canvasTex('radial', 64, 64, g => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.45, 'rgba(255,255,255,.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
}

/* ───────────── per-building dressing (inside the Building group, so coordinates are relative to the building) ───────────── */
export function BuildingDress({ b, type, signColor, top, floors, rw, rd }: { b: CityBuilding; type: string; signColor: string; top: number; floors: number; rw: number; rd: number }) {
  const r = hs(b.id + 'dress'), r2 = hs(b.id + 'v2'), fz = b.d / 2, neon = neonOf(type);
  const sm = useMemo(() => signMat(b.business?.name ?? type, signColor, neon), [b.business?.name, type, signColor, neon]);
  const blade = useMemo(() => (BLADE.has(type) && r > .2 ? bladeMat(destIcon(type), signColor, neon) : null), [type, signColor, neon, r]);
  const v = Math.floor(r * 5), side = r2 > .5 ? 1 : -1;
  const panel = mat('#1d3557', .3, .6), white = mat('#e8eaec', .6), grey = mat('#9aa0a6', .5, .4), dark = mat('#20252a', .8), pipe = mat('#5b6168', .6, .4);
  return <group>
    {/* shop name, lit at night */}
    <mesh position={[0, 2.95, fz + .13]} material={sm}><planeGeometry args={[b.w * .76, b.w * .76 / 8]} /></mesh>
    {/* accent band under the first floor */}
    {floors >= 3 && <mesh geometry={GB} material={mat(signColor, .7)} position={[0, 3.45, 0]} scale={[b.w + .16, .26, b.d + .16]} />}
    {/* blade sign sticking out over the pavement */}
    {blade && <group position={[-b.w / 2 + .35, 3.75, fz + .6]}>
      <mesh rotation={[0, Math.PI / 2, 0]} material={blade}><planeGeometry args={[.95, .95]} /></mesh>
      <mesh geometry={GB} material={dark} position={[0, .52, 0]} scale={[.05, .05, 1.1]} />
    </group>}
    {/* roof variety: one of solar panels, dish, lit roof sign, generator, stair-head with parapet */}
    {v === 0 && [0, 1, 2].map(k => <mesh key={k} geometry={GB} material={panel} position={[side * rw * .12 + (k - 1) * 1.5, top + .38, rd * .3]} rotation={[-.45, 0, 0]} scale={[1.3, .06, .9]} />)}
    {v === 1 && <group position={[side * rw * .3, top, rd * .28]}>
      <mesh geometry={GC} material={grey} position={[0, .5, 0]} scale={[.08, 1, .08]} />
      <mesh position={[0, 1.1, .12]} rotation={[-.9, 0, 0]} material={white}><sphereGeometry args={[.55, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.4]} /></mesh>
    </group>}
    {v === 2 && floors <= 7 && <group position={[0, top, rd * .32]}>
      {[-1.4, 1.4].map(x => <mesh key={x} geometry={GC} material={dark} position={[x, .7, 0]} scale={[.1, 1.4, .1]} />)}
      <mesh geometry={GB} material={dark} position={[0, 1.7, 0]} scale={[3.4, .6, .12]} />
      <mesh position={[0, 1.7, .07]} material={sm}><planeGeometry args={[3.2, .4]} /></mesh>
    </group>}
    {v === 3 && <group position={[side * rw * .28, top, rd * .3]}>
      <mesh geometry={GB} material={mat('#b83a2b', .6, .2)} position={[0, .4, 0]} scale={[1.2, .8, .7]} />
      <mesh geometry={GC} material={pipe} position={[.35, 1.1, 0]} scale={[.12, .8, .12]} />
    </group>}
    {v === 4 && <>
      <mesh geometry={GB} material={mat('#c9ccce', .9)} position={[side * rw * .25, top + .45, rd * .25]} scale={[1.4, .9, 1.4]} />
      {[[0, rd / 2, rw, .12], [0, -rd / 2, rw, .12], [rw / 2, 0, .12, rd], [-rw / 2, 0, .12, rd]].map(([x, z, sx, sz], k) => <mesh key={k} geometry={GB} material={mat('#c9ccce', .9)} position={[x, top + .17, z]} scale={[sx, .34, sz]} />)}
    </>}
    {/* side wall: split AC units and a drain pipe */}
    {floors >= 3 && r2 > .35 && <>
      <mesh geometry={GB} material={white} position={[b.w / 2 + .18, 4.6, -b.d * .2]} scale={[.35, .3, .7]} />
      {floors >= 4 && <mesh geometry={GB} material={white} position={[b.w / 2 + .18, 7.6, b.d * .12]} scale={[.35, .3, .7]} />}
    </>}
    {floors >= 3 && <mesh geometry={GC} material={pipe} position={[b.w / 2 + .06, (top - .5) / 2, -b.d / 2 + .4]} scale={[.12, top - .5, .12]} />}
  </group>;
}

/* ───────────── instanced clutter (bins, dumpsters, crates, benches, bollards, hydrants, cones, hawker stands) ───────────── */
type Part = { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry?: number; c?: string };
type Solid = { x0: number; x1: number; z0: number; z1: number };
function Parts({ items, geo, rough = .85, metal = 0, cast = false }: { items: Part[]; geo: THREE.BufferGeometry; rough?: number; metal?: number; cast?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const o = new THREE.Object3D(), col = new THREE.Color();
    items.forEach((p, i) => { o.position.set(p.x, p.y, p.z); o.rotation.set(0, p.ry || 0, 0); o.scale.set(p.sx, p.sy, p.sz); o.updateMatrix(); ref.current.setMatrixAt(i, o.matrix); ref.current.setColorAt(i, col.set(p.c || '#ffffff')); });
    ref.current.instanceMatrix.needsUpdate = true; if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [items]);
  if (!items.length) return null;
  return <instancedMesh ref={ref} args={[geo, undefined, items.length]} frustumCulled={false} castShadow={cast} receiveShadow><meshStandardMaterial color="#ffffff" roughness={rough} metalness={metal} /></instancedMesh>;
}
const BOX: Part[] = [], CYL: Part[] = [], SPH: Part[] = [], CONE: Part[] = [];
export const LOOK_SOLIDS: Solid[] = []; // dumpsters and crate stacks: the player cannot walk through them
(() => {
  const FORMAL = new Set(['Bank', 'Government', 'Hotel', 'Hospital', 'Police Station']), YARD = new Set(['Mechanic', 'Petrol Station', 'Logistics']), STALL = new Set(['Restaurant', 'Market', 'Supermarket']);
  const CRATE = ['#b7863b', '#9c6b2a', '#3f6fa8'];
  for (const b of BUILDS) {
    const type = b.business?.type ?? 'Office', R = (k: string) => hs(b.id + k), fz = b.z + b.d / 2, bz = b.z - b.d / 2, lx = b.x - b.w / 2, rx = b.x + b.w / 2;
    if (R('dm') > .35 && type !== 'Government') { // dumpster + bin bags against the back wall
      const sx = R('ds') > .5 ? 1 : -1, x = b.x + sx * b.w * .22, z = bz - .55;
      BOX.push({ x, y: .5, z, sx: 1.8, sy: 1, sz: .9, c: R('dc') > .5 ? '#2f6b4a' : '#2d4f7c' }, { x, y: 1.03, z, sx: 1.9, sy: .08, sz: 1, c: '#20252a' });
      LOOK_SOLIDS.push({ x0: x - .95, x1: x + .95, z0: z - .5, z1: z + .5 });
      SPH.push({ x: x + sx * 1.35, y: .3, z: z + .1, sx: .7, sy: .6, sz: .6, c: '#15171a' }, { x: x + sx * 1.8, y: .22, z: z - .1, sx: .5, sy: .44, sz: .5, c: '#2a2d31' });
    }
    if (R('bn') > .5) { CYL.push({ x: lx + .6, y: .45, z: fz + .35, sx: .5, sy: .9, sz: .5, c: '#2a3a2f' }); CYL.push({ x: lx + 1.2, y: .45, z: fz + .35, sx: .5, sy: .9, sz: .5, c: '#2a3a2f' }); }
    if (R('hy') > .72) { const sx = R('hx') > .5 ? 1 : -1; CYL.push({ x: b.x + sx * 7.2, y: .35, z: fz + 7.2, sx: .3, sy: .7, sz: .3, c: '#c62828' }); }
    if (FORMAL.has(type) || R('bh') > .75) { // bench against the front wall, right of the door
      const x = b.x + b.w * .28;
      BOX.push({ x, y: .45, z: fz + .45, sx: 1.5, sy: .08, sz: .45, c: '#6b4a2b' }, { x, y: .8, z: fz + .22, sx: 1.5, sy: .45, sz: .07, c: '#6b4a2b' }, { x: x - .6, y: .22, z: fz + .45, sx: .08, sy: .44, sz: .4, c: '#2a2d31' }, { x: x + .6, y: .22, z: fz + .45, sx: .08, sy: .44, sz: .4, c: '#2a2d31' });
    }
    if (FORMAL.has(type)) for (let k = 0; k < 5; k++) if (k !== 2) CYL.push({ x: b.x + (k - 2) * 1.4, y: .4, z: fz + 2.3, sx: .2, sy: .8, sz: .2, c: '#c9a227' });
    if (type === 'Market' || type === 'Supermarket') { // crate stack
      const x = rx - 1.1, z = fz + .55;
      BOX.push({ x, y: .35, z, sx: .8, sy: .7, sz: .8, c: CRATE[Math.floor(R('c1') * 3)] }, { x: x + .85, y: .35, z, sx: .8, sy: .7, sz: .8, c: CRATE[Math.floor(R('c2') * 3)] }, { x: x + .4, y: 1.05, z, sx: .8, sy: .7, sz: .8, c: CRATE[Math.floor(R('c3') * 3)] });
      LOOK_SOLIDS.push({ x0: x - .4, x1: x + 1.25, z0: z - .4, z1: z + .4 });
    }
    if (YARD.has(type)) { for (let k = 0; k < 3; k++) CONE.push({ x: b.x + 2 + k * .9, y: .3, z: fz + 2.2, sx: .35, sy: .6, sz: .35, c: '#ff6a00' }); CYL.push({ x: lx + .7, y: .45, z: fz + .6, sx: .55, sy: .9, sz: .55, c: '#2c4f8f' }); }
    if (STALL.has(type) && R('um') > .55) { // hawker stand: table + umbrella leaning on the front wall
      const x = b.x - b.w * .3, z = fz + .6;
      BOX.push({ x, y: .4, z, sx: 1.1, sy: .8, sz: .6, c: '#7a5a3a' });
      CYL.push({ x, y: 1.15, z, sx: .06, sy: 2.3, sz: .06, c: '#d8d8d8' });
      CONE.push({ x, y: 2.35, z, sx: 2, sy: .55, sz: 2, c: R('uc') > .5 ? '#e53935' : '#fbc02d' });
    }
  }
})();
export function StreetClutter() {
  return <>
    <Parts items={BOX} geo={GB} cast />
    <Parts items={CYL} geo={GC} />
    <Parts items={SPH} geo={GS} />
    <Parts items={CONE} geo={GK} />
  </>;
}

/* ───────────── graffiti on side and back walls ───────────── */
const GRAF = BUILDS.flatMap(b => {
  const r = hs(b.id + 'gf'), r2 = hs(b.id + 'gw'); if (r > .42 || (b.business?.type === 'Government')) return [];
  const wall = Math.floor(r2 * 3), k = Math.floor(hs(b.id + 'gk') * 4), t = (hs(b.id + 'go') - .5) * .5;
  if (wall === 0) return [{ id: b.id, k, x: b.x - b.w / 2 - .03, z: b.z + t * b.d, ry: -Math.PI / 2 }];
  if (wall === 1) return [{ id: b.id, k, x: b.x + b.w / 2 + .03, z: b.z + t * b.d, ry: Math.PI / 2 }];
  return [{ id: b.id, k, x: b.x + t * b.w, z: b.z - b.d / 2 - .03, ry: Math.PI }];
});
export function Graffiti() {
  return <>{GRAF.map(g => <mesh key={g.id} position={[g.x, 1.75, g.z]} rotation={[0, g.ry, 0]} material={grafMat(g.k)}><planeGeometry args={[2.8, 1.4]} /></mesh>)}</>;
}

/* ───────────── utility poles + sagging wires along the roads ───────────── */
const POLE_H = 7, POLES: { x: number; z: number; axis: 'x' | 'z' }[] = [];
const POLE_ROADS: { axis: 'x' | 'z'; i: number; pts: [number, number][] }[] = [];
for (let i = -5; i <= 5; i++) {
  const sgn = ((i % 2) + 2) % 2 === 0 ? 1 : -1, off = sgn * (halfW(i) + .5);
  const px: [number, number][] = [], pz: [number, number][] = [];
  for (let j = -5; j <= 4; j++) { const a = (j + .25) * GRID; px.push([a, i * GRID + off]); pz.push([i * GRID + off, a]); POLES.push({ x: a, z: i * GRID + off, axis: 'x' }, { x: i * GRID + off, z: a, axis: 'z' }); }
  POLE_ROADS.push({ axis: 'x', i, pts: px }, { axis: 'z', i, pts: pz });
}
function PowerLines() {
  const poles = useMemo<Part[]>(() => POLES.map(p => ({ x: p.x, y: POLE_H / 2, z: p.z, sx: .22, sy: POLE_H, sz: .22, c: '#5a4632' })), []);
  const arms = useMemo<Part[]>(() => POLES.map(p => ({ x: p.x, y: POLE_H - .15, z: p.z, sx: p.axis === 'x' ? .1 : 1.6, sy: .1, sz: p.axis === 'x' ? 1.6 : .1, c: '#3a2e22' })), []);
  const geo = useMemo(() => {
    const v: number[] = [], SUB = 8;
    for (const road of POLE_ROADS) for (let k = 0; k < road.pts.length - 1; k++) for (const lat of [-.65, 0, .65]) {
      const h = lat === 0 ? POLE_H : POLE_H - .3;
      for (let s = 0; s < SUB; s++) {
        const pt = (u: number): [number, number, number] => {
          const [x0, z0] = road.pts[k], [x1, z1] = road.pts[k + 1], ox = road.axis === 'x' ? 0 : lat, oz = road.axis === 'x' ? lat : 0;
          return [x0 + (x1 - x0) * u + ox, h - .75 * 4 * u * (1 - u), z0 + (z1 - z0) * u + oz];
        };
        v.push(...pt(s / SUB), ...pt((s + 1) / SUB));
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); return g;
  }, []);
  return <>
    <Parts items={poles} geo={GC} />
    <Parts items={arms} geo={GB} />
    <lineSegments geometry={geo} frustumCulled={false}><lineBasicMaterial color="#14171b" /></lineSegments>
  </>;
}
export { PowerLines };

/* ───────────── night: coloured light spilling onto the pavement in front of each shop ───────────── */
export function ShopGlow({ night }: { night: { n: number } }) {
  const ref = useRef<THREE.InstancedMesh>(null!), m = useRef<THREE.MeshBasicMaterial>(null!);
  const tex = useMemo(() => radialTex(), []);
  useLayoutEffect(() => {
    const o = new THREE.Object3D(), c = new THREE.Color();
    BUILDS.forEach((b, i) => { o.position.set(b.x, .16, b.z + b.d / 2 + 1.5); o.rotation.set(-Math.PI / 2, 0, 0); o.scale.set(b.w * 1.25, 4.2, 1); o.updateMatrix(); ref.current.setMatrixAt(i, o.matrix); ref.current.setColorAt(i, c.set(neonOf(b.business?.type ?? 'Office'))); });
    ref.current.instanceMatrix.needsUpdate = true; if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, []);
  useFrame(() => { const n = night.n; ref.current.visible = n > .03; m.current.opacity = n * .5; });
  return <instancedMesh ref={ref} args={[undefined, undefined, BUILDS.length]} frustumCulled={false} visible={false}>
    <planeGeometry args={[1, 1]} />
    <meshBasicMaterial ref={m} map={tex} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
  </instancedMesh>;
}

/* ───────────── wet roads: puddles that appear in the rain and dry out slowly ───────────── */
const PUDDLES = (() => {
  const a: { x: number; z: number; sx: number; sz: number; ry: number }[] = [];
  for (let i = -5; i <= 5; i++) for (let k = 0; k < 7; k++) {
    const lat = (hs('pl' + i + k) * 2 - 1) * (halfW(i) - .9), along = (hs('pa' + i + k) * 2 - 1) * 115, w = 1.2 + hs('pw' + i + k) * 2.2, d = .8 + hs('pd' + i + k) * 1.2;
    a.push({ x: along, z: i * GRID + lat, sx: w, sz: d, ry: 0 }, { x: i * GRID + lat, z: along, sx: d, sz: w, ry: 0 });
  }
  return a;
})();
export function Puddles() {
  const ref = useRef<THREE.InstancedMesh>(null!), m = useRef<THREE.MeshStandardMaterial>(null!);
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    PUDDLES.forEach((p, i) => { o.position.set(p.x, .02, p.z); o.rotation.set(-Math.PI / 2, 0, 0); o.scale.set(p.sx, p.sz, 1); o.updateMatrix(); ref.current.setMatrixAt(i, o.matrix); });
    ref.current.instanceMatrix.needsUpdate = true;
  }, []);
  useFrame(() => { ref.current.visible = WET.v > .05; m.current.opacity = Math.min(.8, WET.v * .9); });
  return <instancedMesh ref={ref} args={[undefined, undefined, PUDDLES.length]} frustumCulled={false} visible={false}>
    <circleGeometry args={[.5, 20]} />
    <meshStandardMaterial ref={m} color="#0b0f14" emissive="#6f93b8" emissiveIntensity={.12} roughness={.05} metalness={.8} transparent opacity={0} depthWrite={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
  </instancedMesh>;
}

/* ───────────── one driver for everything that changes with time of day and weather ───────────── */
export function LookDriver({ night }: { night: { n: number } }) {
  const last = useRef({ g: -1, w: -1 });
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, .1), w = weatherAt(), target = w.storm ? 1 : Math.min(1, w.rain * 1.6);
    WET.v += (target - WET.v) * Math.min(1, dt * (target > WET.v ? .6 : .03));
    const glow = .1 + night.n * 1.15;
    if (Math.abs(glow - last.current.g) > .005) { last.current.g = glow; SIGN_MATS.forEach(s => { s.emissiveIntensity = glow; }); }
    if (Math.abs(WET.v - last.current.w) > .004) { last.current.w = WET.v; ROAD_MAT.color.copy(ROAD_DRY).lerp(ROAD_WET, WET.v); ROAD_MAT.roughness = .95 - .7 * WET.v; ROAD_MAT.metalness = .25 * WET.v; }
  });
  return null;
}
