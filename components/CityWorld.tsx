'use client';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls, RoundedBox, Text } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import Human from './Human';
import { CITY } from '../lib/cityData';
import { makeTraffic, tickTraffic, type TrafficCar } from '../lib/citySim';
import type { Look } from '../lib/characterModels';
import type { CityBuilding } from '../lib/cityTypes';

/* ───────────── shared types ───────────── */
type Ctl = { joy: { x: number; y: number }; keys: Set<string>; run: boolean; jump: boolean; recenter: boolean };
type Hud = { x: number; z: number; fx: number; fz: number; r: number };
type Kind = 'glass' | 'concrete' | 'brick' | 'plaster';
type Prof = { kind: Kind; f: [number, number]; sign: string; wall?: string; balc?: boolean };

const FH = 3; // metres per floor
const RAIL_Z = 12.4; // railway sits in the gap behind the lots so it never cuts through buildings
const hs = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/* ───────────── building looks per business type ───────────── */
const DEF: Prof = { kind: 'concrete', f: [3, 5], sign: '#2b3440' };
const PROFILE: Record<string, Prof> = {
  Bank: { kind: 'glass', f: [5, 9], sign: '#12355b' },
  Office: { kind: 'glass', f: [6, 10], sign: '#233044' },
  'Tech Company': { kind: 'glass', f: [6, 10], sign: '#3b2a6b' },
  Hotel: { kind: 'concrete', f: [6, 10], sign: '#6b1f2a', balc: true },
  Hospital: { kind: 'plaster', f: [4, 7], sign: '#0b6b4a', wall: '#e9eef0' },
  Government: { kind: 'plaster', f: [4, 4], sign: '#1c3d2e', wall: '#e8e2d0' },
  Supermarket: { kind: 'plaster', f: [2, 3], sign: '#b3261e' },
  Market: { kind: 'brick', f: [2, 3], sign: '#7a4a12' },
  Restaurant: { kind: 'brick', f: [2, 4], sign: '#8a2b12' },
  Salon: { kind: 'plaster', f: [2, 3], sign: '#8a1f6b' },
  Barber: { kind: 'plaster', f: [2, 3], sign: '#1f3a8a' },
  Gym: { kind: 'concrete', f: [2, 4], sign: '#222a33' },
  Mechanic: { kind: 'brick', f: [2, 2], sign: '#44484d' },
  'Car Dealer': { kind: 'glass', f: [2, 3], sign: '#0d3a6b' },
  School: { kind: 'brick', f: [3, 4], sign: '#1c4e8a' },
  Nightclub: { kind: 'concrete', f: [2, 3], sign: '#3b0b4d' },
  'Petrol Station': { kind: 'plaster', f: [2, 2], sign: '#b8921a' },
  Pharmacy: { kind: 'plaster', f: [2, 4], sign: '#0b7a3b' },
  Cinema: { kind: 'concrete', f: [3, 5], sign: '#6b0f1a' },
  'Estate Agency': { kind: 'concrete', f: [3, 5], sign: '#1f4d3b' },
  Logistics: { kind: 'concrete', f: [2, 4], sign: '#8a5a12' },
  'Rail Station': { kind: 'plaster', f: [3, 3], sign: '#1b3a5a', wall: '#d8d2c2' },
  Airport: { kind: 'glass', f: [3, 3], sign: '#1b3a5a' },
};

/* ───────────── procedural facade textures (one tile = 4 bays × 2 floors) ───────────── */
const TEX = new Map<string, THREE.CanvasTexture>();
const MATS = new Map<string, THREE.MeshStandardMaterial>();
const BAY = 2.2, NX = 4, NY = 2;
function facadeTex(kind: Kind, wall: string, balc: boolean) {
  const key = kind + wall + balc;
  const hit = TEX.get(key); if (hit) return hit;
  const BW = 64, FHP = 96;
  const cv = document.createElement('canvas'); cv.width = BW * NX; cv.height = FHP * NY;
  const g = cv.getContext('2d')!;
  let seed = Math.floor(hs(key) * 1e9) || 1;
  const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const base = new THREE.Color(wall), dark = base.clone().multiplyScalar(.72), light = base.clone().lerp(new THREE.Color('#ffffff'), .25);
  g.fillStyle = '#' + base.getHexString(); g.fillRect(0, 0, cv.width, cv.height);
  if (kind !== 'glass') { // plaster / concrete grain
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${rnd() > .5 ? '255,255,255' : '0,0,0'},${.025 + rnd() * .03})`; g.fillRect(rnd() * cv.width, rnd() * cv.height, 2 + rnd() * 5, 2 + rnd() * 5); }
  }
  if (kind === 'brick') {
    g.strokeStyle = 'rgba(0,0,0,.16)'; g.lineWidth = 1;
    for (let y = 0; y < cv.height; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(cv.width, y); g.stroke(); for (let x = (y / 8) % 2 ? 0 : 8; x < cv.width; x += 16) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 8); g.stroke(); } }
  }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const x0 = i * BW, y0 = j * FHP, lit = rnd() < .22, shade = rnd();
    if (kind === 'glass') {
      const gr = g.createLinearGradient(x0, y0, x0 + BW, y0 + FHP);
      gr.addColorStop(0, '#2a4b60'); gr.addColorStop(1, shade > .5 ? '#6d9bb3' : '#4a7790');
      g.fillStyle = gr; g.fillRect(x0 + 2, y0 + 2, BW - 4, FHP * .74);
      if (lit) { g.fillStyle = 'rgba(255,224,150,.55)'; g.fillRect(x0 + 2, y0 + 2, BW - 4, FHP * .74); }
      g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.moveTo(x0 + 8, y0 + 2); g.lineTo(x0 + 26, y0 + 2); g.lineTo(x0 + 6, y0 + FHP * .74); g.lineTo(x0 + 2, y0 + FHP * .74); g.closePath(); g.fill();
      g.fillStyle = '#' + dark.getHexString(); g.fillRect(x0, y0 + FHP * .78, BW, FHP * .22); // spandrel
      g.fillStyle = '#1b262e'; g.fillRect(x0, y0, 2, FHP); g.fillRect(x0 + BW - 2, y0, 2, FHP);
    } else {
      const wx = x0 + BW * .2, wy = y0 + FHP * .24, ww = BW * .6, wh = FHP * .5;
      g.fillStyle = '#' + light.getHexString(); g.fillRect(wx - 3, wy - 3, ww + 6, wh + 6); // frame
      const gr = g.createLinearGradient(wx, wy, wx + ww, wy + wh); gr.addColorStop(0, '#223a4c'); gr.addColorStop(1, '#5b87a0');
      g.fillStyle = lit ? '#f3d98a' : gr; g.fillRect(wx, wy, ww, wh);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(wx + ww / 2 - 1, wy, 2, wh); g.fillRect(wx, wy + wh * .45, ww, 2); // mullions
      g.fillStyle = '#' + light.getHexString(); g.fillRect(wx - 5, wy + wh + 3, ww + 10, 5); // sill
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(wx - 5, wy + wh + 8, ww + 10, 3);
      if (balc) { g.fillStyle = '#' + light.getHexString(); g.fillRect(x0 + BW * .06, y0 + FHP - 9, BW * .88, 7); g.strokeStyle = 'rgba(30,30,30,.7)'; g.lineWidth = 1.5; for (let k = 0; k < 9; k++) { const rx = x0 + BW * .1 + k * (BW * .8 / 8); g.beginPath(); g.moveTo(rx, y0 + FHP - 9); g.lineTo(rx, y0 + FHP - 28); g.stroke(); } g.beginPath(); g.moveTo(x0 + BW * .1, y0 + FHP - 28); g.lineTo(x0 + BW * .9, y0 + FHP - 28); g.stroke(); }
    }
    g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x0, y0 + FHP - 3, BW, 3); // floor slab line
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  TEX.set(key, t); return t;
}
function sideMat(kind: Kind, wall: string, balc: boolean) {
  const key = kind + wall + balc;
  const hit = MATS.get(key); if (hit) return hit;
  const m = new THREE.MeshStandardMaterial({ map: facadeTex(kind, wall, balc), roughness: kind === 'glass' ? .22 : .88, metalness: kind === 'glass' ? .35 : 0 });
  MATS.set(key, m); return m;
}
const ROOF = new THREE.MeshStandardMaterial({ color: '#4b5056', roughness: .95 });
function boxGeo(w: number, d: number, floors: number) {
  const g = new THREE.BoxGeometry(w, floors * FH, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const spans = [d, d, 0, 0, w, w]; // +x -x +y -y +z -z
  for (let f = 0; f < 6; f++) {
    const su = spans[f] ? Math.max(2, Math.round(spans[f] / BAY)) / NX : 1, sv = spans[f] ? floors / NY : 1;
    for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); }
  }
  uv.needsUpdate = true; return g;
}

/* ───────────── scenery ───────────── */
function Building({ b }: { b: CityBuilding }) {
  const type = b.business?.type ?? 'Office';
  const P = PROFILE[type] ?? DEF;
  const t = Math.min(1, Math.max(0, (b.h - 3) / 5.6));
  const floors = Math.max(2, Math.round(P.f[0] + (P.f[1] - P.f[0]) * t));
  const H = floors * FH, top = H + .24, r = hs(b.id), wall = P.wall ?? b.color, gov = type === 'Government';
  const geo = useMemo(() => boxGeo(b.w, b.d, floors), [b.w, b.d, floors]);
  const side = useMemo(() => sideMat(P.kind, wall, !!P.balc), [P.kind, wall, P.balc]);
  const mats = useMemo(() => [side, side, ROOF, ROOF, side, side], [side]);
  const fz = b.d / 2;
  return (
    <group position={[b.x, 0, b.z]}>
      <mesh geometry={geo} material={mats} position={[0, H / 2, 0]} castShadow receiveShadow />
      <mesh position={[0, .35, 0]} receiveShadow><boxGeometry args={[b.w + .12, .7, b.d + .12]} /><meshStandardMaterial color="#6d6f72" roughness={1} /></mesh>
      <mesh position={[0, H + .12, 0]} castShadow><boxGeometry args={[b.w + .25, .24, b.d + .25]} /><meshStandardMaterial color="#c9ccce" roughness={.9} /></mesh>
      {/* entrance */}
      <mesh position={[0, .95, fz + .1]}><boxGeometry args={[gov ? 1.7 : 1.1, gov ? 2.3 : 1.9, .08]} /><meshStandardMaterial color="#20262c" /></mesh>
      <mesh position={[0, 1.05, fz + .15]}><planeGeometry args={[gov ? 1.4 : .8, gov ? 1.9 : 1.45]} /><meshStandardMaterial color="#9fd0e8" emissive="#7fb6d6" emissiveIntensity={.35} /></mesh>
      {!gov && <>
        <mesh position={[0, 1.5, fz + .07]}><planeGeometry args={[b.w * .78, 1.45]} /><meshStandardMaterial color="#1a2a35" metalness={.6} roughness={.15} emissive="#ffcf80" emissiveIntensity={.22} /></mesh>
        <mesh position={[0, 2.45, fz + .5]} rotation={[.4, 0, 0]}><boxGeometry args={[b.w * .7, .07, .95]} /><meshStandardMaterial color={P.sign} roughness={.9} /></mesh>
      </>}
      {/* shop sign */}
      <mesh position={[0, 2.95, fz + .07]}><boxGeometry args={[b.w * .8, .55, .1]} /><meshStandardMaterial color={P.sign} roughness={.6} /></mesh>
      {b.business && <Text position={[0, 2.95, fz + .13]} fontSize={.24} maxWidth={b.w * .76} textAlign="center" color="#ffffff" anchorX="center" anchorY="middle">{b.business.name}</Text>}
      {/* roof: Geepee water tank, AC unit, antenna on towers */}
      <mesh position={[b.w * (r - .5) * .6, top + .4, b.d * .2]}><cylinderGeometry args={[.5, .5, .8, 14]} /><meshStandardMaterial color="#14171a" roughness={.6} /></mesh>
      <mesh position={[-b.w * .22, top + .28, -b.d * .18]}><boxGeometry args={[1, .55, .7]} /><meshStandardMaterial color="#9aa0a6" metalness={.4} roughness={.5} /></mesh>
      {floors >= 6 && <>
        <mesh position={[b.w * .3, top + 1.6, -b.d * .25]}><cylinderGeometry args={[.04, .05, 3.2, 6]} /><meshStandardMaterial color="#555" /></mesh>
        <mesh position={[b.w * .3, top + 3.25, -b.d * .25]}><sphereGeometry args={[.1, 8, 8]} /><meshStandardMaterial color="#ff2a2a" emissive="#ff2a2a" emissiveIntensity={2} /></mesh>
      </>}
      {/* type details */}
      {gov && <>
        <mesh position={[0, .15, fz + .5]} castShadow><boxGeometry args={[b.w * .95, .3, 1]} /><meshStandardMaterial color="#cfc9b8" /></mesh>
        {[-3, -1.8, -.6, .6, 1.8, 3].map(x => <mesh key={x} position={[x * (b.w / 7), 1.85, fz + .6]} castShadow><cylinderGeometry args={[.2, .22, 3.1, 12]} /><meshStandardMaterial color="#efeadb" /></mesh>)}
        <mesh position={[0, 3.55, fz + .5]}><boxGeometry args={[b.w * .95, .4, 1]} /><meshStandardMaterial color="#e6e0cf" /></mesh>
        <mesh position={[0, top, 0]} castShadow><sphereGeometry args={[Math.min(b.w, b.d) * .32, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#c8b560" metalness={.5} roughness={.35} /></mesh>
      </>}
      {type === 'Hospital' && <>
        <mesh position={[0, H - 1.5, fz + .05]}><boxGeometry args={[1.6, .45, .06]} /><meshStandardMaterial color="#d11a2a" /></mesh>
        <mesh position={[0, H - 1.5, fz + .05]}><boxGeometry args={[.45, 1.6, .06]} /><meshStandardMaterial color="#d11a2a" /></mesh>
      </>}
      {(type === 'Nightclub' || type === 'Cinema') && <mesh position={[0, 3.35, fz + .08]}><boxGeometry args={[b.w * .9, .1, .05]} /><meshStandardMaterial color={type === 'Nightclub' ? '#c026d3' : '#ffb300'} emissive={type === 'Nightclub' ? '#c026d3' : '#ffb300'} emissiveIntensity={2.2} /></mesh>}
    </group>
  );
}
function Road({ r }: { r: any }) { return <mesh position={[r.x, .015, r.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[r.w, r.d]} /><meshStandardMaterial color={r.major ? '#292d33' : '#363b42'} /></mesh>; }
function dashTex(vertical: boolean, len: number) {
  const c = document.createElement('canvas'); c.width = vertical ? 8 : 32; c.height = vertical ? 32 : 8;
  const g = c.getContext('2d')!; g.fillStyle = '#f4f1e4'; if (vertical) g.fillRect(2, 0, 4, 16); else g.fillRect(0, 2, 16, 4);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  if (vertical) t.repeat.set(1, len / 3); else t.repeat.set(len / 3, 1); return t;
}
function RoadMarks() {
  const items = useMemo(() => CITY.roads.filter((r: any) => r.major).map((r: any) => { const v = r.d > r.w; const len = v ? r.d : r.w; return { r, v, tex: dashTex(v, len) }; }), []);
  return <>{items.map(({ r, v, tex }) => <mesh key={r.id} position={[r.x, .022, r.z]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[v ? .14 : r.w, v ? r.d : .14]} /><meshBasicMaterial map={tex} transparent depthWrite={false} /></mesh>)}</>;
}
function Lots() { // pavements + street trees, instanced
  const slabs = useRef<THREE.InstancedMesh>(null!), trunks = useRef<THREE.InstancedMesh>(null!), crowns = useRef<THREE.InstancedMesh>(null!);
  const n = CITY.buildings.length;
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    CITY.buildings.forEach((b: CityBuilding, i: number) => {
      o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); o.position.set(b.x, .03, b.z); o.updateMatrix(); slabs.current.setMatrixAt(i, o.matrix);
      for (let k = 0; k < 2; k++) {
        const x = b.x + (k ? -4.1 : 4.1), z = b.z + 4.1, s = .8 + hs(b.id + k) * .5;
        o.position.set(x, .6, z); o.scale.set(1, 1, 1); o.updateMatrix(); trunks.current.setMatrixAt(i * 2 + k, o.matrix);
        o.position.set(x, 1.9 * s, z); o.scale.set(s, s, s); o.updateMatrix(); crowns.current.setMatrixAt(i * 2 + k, o.matrix);
      }
    });
    [slabs, trunks, crowns].forEach(m => { m.current.instanceMatrix.needsUpdate = true; });
  }, []);
  return <>
    <instancedMesh ref={slabs} args={[undefined, undefined, n]} frustumCulled={false} receiveShadow><boxGeometry args={[9.2, .06, 9.2]} /><meshStandardMaterial color="#a3a6a3" roughness={1} /></instancedMesh>
    <instancedMesh ref={trunks} args={[undefined, undefined, n * 2]} frustumCulled={false}><cylinderGeometry args={[.08, .11, 1.2, 6]} /><meshStandardMaterial color="#5a3d26" /></instancedMesh>
    <instancedMesh ref={crowns} args={[undefined, undefined, n * 2]} frustumCulled={false} castShadow><sphereGeometry args={[.7, 10, 8]} /><meshStandardMaterial color="#3f7a3a" roughness={.9} /></instancedMesh>
  </>;
}
function Car({ c }: { c: TrafficCar }) { return <group position={[c.x, .25, c.z]} rotation={[0, c.rot, 0]}><RoundedBox args={[1.45, .35, .72]} radius={.1} smoothness={2}><meshStandardMaterial color={c.color} /></RoundedBox><mesh position={[0, .22, 0]}><boxGeometry args={[.7, .25, .58]} /><meshStandardMaterial color="#9fc3d4" /></mesh></group>; }
function Train({ x, z }: { x: number; z: number }) { return <group position={[x, .75, z]}><RoundedBox args={[5, .8, 1.2]} radius={.12} smoothness={2}><meshStandardMaterial color="#d99a42" /></RoundedBox>{[-1.6, 0, 1.6].map(v => <mesh key={v} position={[v, .12, .62]}><boxGeometry args={[1.05, .38, .03]} /><meshStandardMaterial color="#bfe1f0" /></mesh>)}</group>; }
function Airport({ x, z }: { x: number; z: number }) { return <group position={[x, 0, z]}><mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .02, 0]}><planeGeometry args={[22, 7]} /><meshStandardMaterial color="#33383e" /></mesh><Text position={[0, .1, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={.6} color="#fff" anchorX="center">RUNWAY</Text><RoundedBox args={[9, 1.5, 5]} position={[0, .75, -7]} radius={.15}><meshStandardMaterial color="#7b8791" /></RoundedBox><Text position={[0, 1.65, -4.4]} fontSize={.45} color="#fff" anchorX="center">Nnamdi Azikiwe Airport</Text></group>; }

/* ───────────── collision ───────────── */
const BODY = .45;
const SOLIDS = [
  ...CITY.buildings.map((b: CityBuilding) => ({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 })),
  { x0: 49.5, x1: 58.5, z0: -14.5, z1: -9.5 }, // airport terminal
];
function pushOut(p: { x: number; z: number }) {
  for (const s of SOLIDS) {
    if (p.x < s.x0 - BODY || p.x > s.x1 + BODY || p.z < s.z0 - BODY || p.z > s.z1 + BODY) continue;
    const cx = Math.min(Math.max(p.x, s.x0), s.x1), cz = Math.min(Math.max(p.z, s.z0), s.z1);
    const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= BODY * BODY) continue;
    if (d2 > 1e-6) { const d = Math.sqrt(d2); p.x = cx + dx / d * BODY; p.z = cz + dz / d * BODY; }
    else { const l = p.x - s.x0, r = s.x1 - p.x, t = p.z - s.z0, b = s.z1 - p.z, m = Math.min(l, r, t, b); if (m === l) p.x = s.x0 - BODY; else if (m === r) p.x = s.x1 + BODY; else if (m === t) p.z = s.z0 - BODY; else p.z = s.z1 + BODY; }
  }
}
const distTo = (s: { x0: number; x1: number; z0: number; z1: number }, x: number, z: number) => Math.hypot(Math.max(s.x0 - x, 0, x - s.x1), Math.max(s.z0 - z, 0, z - s.z1));

/* ───────────── the 3D scene ───────────── */
function Scene({ look, ctl, hud, setNear }: { look: Look; ctl: React.MutableRefObject<Ctl>; hud: React.MutableRefObject<Hud>; setNear: (b: any) => void }) {
  const P = useRef({ x: 0, z: 8, y: 0, vy: 0, r: Math.PI });
  const group = useRef<THREE.Group>(null!), controls = useRef<any>(null), sun = useRef<THREE.DirectionalLight>(null!);
  const sunTarget = useMemo(() => new THREE.Object3D(), []);
  const moving = useRef(false), running = useRef(false), nearId = useRef<string | null>(null);
  const cars = useMemo(() => makeTraffic().map(c => (c.axis === 'x' ? { ...c, z: Math.round(c.z / 11) * 11 + .4 } : { ...c, x: Math.round(c.x / 11) * 11 + .4 })), []); // keep traffic on the roads
  const train = useRef(-55);
  const [near, setN] = useState<any>(null);
  const nearBuilding = near ? CITY.buildings.find((x: CityBuilding) => x.business?.id === near.id) : null;
  useEffect(() => { sun.current.target = sunTarget; }, [sunTarget]);

  useFrame((st, dtRaw) => {
    const dt = Math.min(dtRaw, .05), c = ctl.current, k = c.keys, p = P.current, oc = controls.current;
    if (!oc) return;
    let ix = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0) + c.joy.x;
    let iy = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0) - c.joy.y;
    let wantJump = c.jump || k.has(' '), wantRun = c.run || k.has('shift');
    const gp = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads()[0] : null;
    if (gp) { // controller: left stick move, right stick camera, A jump, RT/B/L3 sprint
      const dz = (v: number) => (Math.abs(v) > .15 ? v : 0), cx = dz(gp.axes[2] || 0), cy = dz(gp.axes[3] || 0);
      ix += dz(gp.axes[0] || 0); iy -= dz(gp.axes[1] || 0);
      if (cx || cy) { oc.setAzimuthalAngle?.(oc.getAzimuthalAngle() - cx * dt * 2.6); oc.setPolarAngle?.(THREE.MathUtils.clamp(oc.getPolarAngle() + cy * dt * 1.6, .25, Math.PI / 2.15)); }
      if (gp.buttons[0]?.pressed) wantJump = true;
      if (gp.buttons[7]?.pressed || gp.buttons[10]?.pressed || gp.buttons[1]?.pressed) wantRun = true;
    }
    const m = Math.hypot(ix, iy); if (m > 1) { ix /= m; iy /= m; }
    const mag = Math.min(m, 1);
    // movement is relative to where the camera looks (like GTA)
    const cam = st.camera, t = oc.target as THREE.Vector3;
    let fx = t.x - cam.position.x, fz = t.z - cam.position.z; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    const wx = ix * -fz + iy * fx, wz = ix * fx + iy * fz;
    moving.current = mag > .08; running.current = wantRun;
    if (moving.current) {
      const sp = wantRun ? 8.2 : 4.2;
      p.x += wx * sp * dt; p.z += wz * sp * dt;
      p.r += wrap(Math.atan2(wx, wz) - p.r) * Math.min(1, dt * 12);
    }
    pushOut(p);
    p.x = THREE.MathUtils.clamp(p.x, -58, 58); p.z = THREE.MathUtils.clamp(p.z, -58, 58);
    if (wantJump && p.y <= .001) p.vy = 6.2;
    c.jump = false;
    p.vy -= 18 * dt; p.y += p.vy * dt; if (p.y < 0) { p.y = 0; p.vy = 0; }
    group.current.position.set(p.x, p.y, p.z); group.current.rotation.y = p.r;
    // world animation
    tickTraffic(cars, dt); train.current += dt * 4; if (train.current > 65) train.current = -55;
    // camera follows the player
    const ox = t.x, oy = t.y, oz = t.z, ty = 1.5 + p.y * .5;
    t.set(p.x, ty, p.z); cam.position.add(new THREE.Vector3(p.x - ox, ty - oy, p.z - oz));
    if (c.recenter) { c.recenter = false; const d = Math.hypot(cam.position.x - p.x, cam.position.z - p.z); cam.position.set(p.x - Math.sin(p.r) * d, cam.position.y, p.z - Math.cos(p.r) * d); }
    sunTarget.position.set(p.x, 0, p.z); sun.current.position.set(p.x + 30, 45, p.z + 20);
    hud.current = { x: p.x, z: p.z, fx, fz, r: p.r };
    // nearest business door
    let best: CityBuilding | null = null, bd = 2.4;
    for (const b of CITY.buildings as CityBuilding[]) { const d = distTo({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 }, p.x, p.z); if (d < bd && b.business) { bd = d; best = b; } }
    const id = best?.business?.id ?? null;
    if (id !== nearId.current) { nearId.current = id; setN(best?.business ?? null); setNear(best?.business ?? null); }
  });

  return (
    <>
      <color attach="background" args={['#a7cfee']} />
      <fog attach="fog" args={['#bcd8ea', 55, 150]} />
      <hemisphereLight args={['#dff0ff', '#536b4d', 1.5]} />
      <directionalLight ref={sun} position={[30, 45, 20]} intensity={2.6} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-34} shadow-camera-right={34} shadow-camera-top={34} shadow-camera-bottom={-34} shadow-camera-near={1} shadow-camera-far={140} shadow-bias={-0.0004} />
      <primitive object={sunTarget} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[320, 320]} /><meshStandardMaterial color="#587a50" /></mesh>
      {CITY.roads.map((r: any) => <Road key={r.id} r={r} />)}
      <RoadMarks />
      <Lots />
      {CITY.buildings.map((b: CityBuilding) => <Building key={b.id} b={b} />)}
      {cars.map((c, i) => <Car key={i} c={c} />)}
      {CITY.rail.map((p: any, i: number) => <mesh key={i} position={[p.x, .15, RAIL_Z]}><boxGeometry args={[7, .12, .16]} /><meshStandardMaterial color="#555" /></mesh>)}
      <Train x={train.current} z={RAIL_Z} />
      <Airport x={54} z={-5} />
      <group ref={group}>
        <Human look={look} getState={() => (moving.current ? 'walk' : 'idle')} getSpeed={() => (running.current ? 2.4 : 1.1)} />
        <Html position={[0, 2.8, 0]} center><div className="cityNameTag">{look.name}</div></Html>
      </group>
      {near && nearBuilding && <Html position={[nearBuilding.x, 3.9, nearBuilding.z + nearBuilding.d / 2 + .8]} center><div className="cityBizTag">{near.name}<br /><small>{near.type}</small></div></Html>}
      <OrbitControls ref={controls} makeDefault enablePan={false} enableDamping dampingFactor={.12} rotateSpeed={.7} minDistance={4} maxDistance={26} minPolarAngle={.25} maxPolarAngle={Math.PI / 2.15} target={[0, 1.5, 8]} />
    </>
  );
}

/* ───────────── on-screen controls ───────────── */
function Stick({ ctl }: { ctl: React.MutableRefObject<Ctl> }) {
  const base = useRef<HTMLDivElement>(null), knob = useRef<HTMLDivElement>(null), pid = useRef<number | null>(null);
  const set = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect(), R = r.width / 2;
    let dx = (e.clientX - (r.left + R)) / R, dy = (e.clientY - (r.top + R)) / R; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
    ctl.current.joy = { x: dx, y: dy }; knob.current!.style.transform = `translate(calc(-50% + ${dx * R * .6}px), calc(-50% + ${dy * R * .6}px))`;
  };
  const end = () => { pid.current = null; ctl.current.joy = { x: 0, y: 0 }; if (knob.current) knob.current.style.transform = 'translate(-50%,-50%)'; };
  return <div className="cwStick" ref={base} onPointerDown={e => { pid.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); set(e); }} onPointerMove={e => { if (pid.current === e.pointerId) set(e); }} onPointerUp={end} onPointerCancel={end}><div ref={knob} className="cwKnob" /></div>;
}
function Minimap({ hud }: { hud: React.MutableRefObject<Hud> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!, g = cv.getContext('2d')!, S = cv.width; let raf = 0, last = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw); if (now - last < 50) return; last = now;
      const h = hud.current, sc = S / 64;
      g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#2f4d3a'; g.fillRect(0, 0, S, S);
      g.translate(S / 2, S / 2); g.rotate(-Math.atan2(h.fx, -h.fz)); g.scale(sc, sc); g.translate(-h.x, -h.z);
      g.fillStyle = '#5a5f67'; for (const r of CITY.roads as any[]) g.fillRect(r.x - r.w / 2, r.z - r.d / 2, r.w, r.d);
      for (const b of CITY.buildings as CityBuilding[]) { g.fillStyle = b.color; g.fillRect(b.x - b.w / 2, b.z - b.d / 2, b.w, b.d); }
      g.save(); g.translate(h.x, h.z); g.rotate(Math.PI - h.r); g.fillStyle = '#ffd23f'; g.strokeStyle = '#000'; g.lineWidth = .18;
      g.beginPath(); g.moveTo(0, -2); g.lineTo(1.4, 1.4); g.lineTo(0, .7); g.lineTo(-1.4, 1.4); g.closePath(); g.fill(); g.stroke(); g.restore();
    };
    raf = requestAnimationFrame(draw); return () => cancelAnimationFrame(raf);
  }, [hud]);
  return <canvas ref={ref} className="cwMap" width={280} height={280} />;
}
function HoldBtn({ cls, label, icon, down, up }: { cls: string; label: string; icon: string; down: () => void; up?: () => void }) {
  return <button className={'cwBtn ' + cls} aria-label={label} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); down(); }} onPointerUp={() => up?.()} onPointerCancel={() => up?.()} onContextMenu={e => e.preventDefault()}><span>{icon}</span><small>{label}</small></button>;
}

const CSS = `
.cwStick{position:absolute;left:22px;bottom:22px;width:128px;height:128px;border-radius:50%;background:#0b1511aa;border:2px solid #ffffff3a;touch-action:none;z-index:10;display:none}
.cwKnob{position:absolute;left:50%;top:50%;width:58px;height:58px;border-radius:50%;background:#ffffffcc;transform:translate(-50%,-50%);box-shadow:0 2px 8px #0006;pointer-events:none}
.cwBtns{position:absolute;right:18px;bottom:22px;z-index:10;display:flex;gap:12px;align-items:flex-end}
.cwBtn{width:64px;height:64px;border-radius:50%;border:2px solid #ffffff44;background:#0b1511cc;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;touch-action:none;user-select:none;-webkit-user-select:none;cursor:pointer}
.cwBtn span{font-size:22px;line-height:1}.cwBtn small{font-size:9px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}
.cwBtn:active{background:#d99a42;color:#111}.cwBtn.big{width:78px;height:78px}.cwBtn.cam{width:50px;height:50px}.cwBtn.cam small{display:none}
.cwMap{position:absolute;left:12px;top:72px;width:140px;height:140px;border-radius:50%;border:3px solid #ffffffcc;box-shadow:0 4px 18px #0008;z-index:6;background:#2f4d3a;pointer-events:none}
.cwHint{position:absolute;right:18px;bottom:110px;z-index:6;color:#fff;font-size:11px;line-height:1.55;background:#0b1511b0;border:1px solid #ffffff22;border-radius:10px;padding:8px 11px;pointer-events:none}
.cwHint b{color:#d99a42}
@media (pointer:coarse),(max-width:700px){.cwStick{display:block}.cwHint{display:none}.cwMap{width:96px;height:96px;top:96px;left:10px}.cwBtns{bottom:26px}}
`;

export default function CityWorld({ look, onNear }: { look: Look; onNear: (b: any) => void }) {
  const ctl = useRef<Ctl>({ joy: { x: 0, y: 0 }, keys: new Set(), run: false, jump: false, recenter: false });
  const hud = useRef<Hud>({ x: 0, z: 8, fx: 0, fz: -1, r: Math.PI });
  useEffect(() => {
    const typing = (e: Event) => { const t = e.target as HTMLElement | null; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
    const dn = (e: KeyboardEvent) => {
      if (typing(e)) return; const k = e.key.toLowerCase();
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if (k === 'c') ctl.current.recenter = true;
      ctl.current.keys.add(k);
    };
    const up = (e: KeyboardEvent) => { ctl.current.keys.delete(e.key.toLowerCase()); };
    const clear = () => ctl.current.keys.clear();
    window.addEventListener('keydown', dn); window.addEventListener('keyup', up); window.addEventListener('blur', clear);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear); };
  }, []);
  return (
    <div className="cityWorld">
      <style>{CSS}</style>
      <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0, 4.5, 15], fov: 50 }}>
        <Scene look={look} ctl={ctl} hud={hud} setNear={onNear} />
      </Canvas>
      <Minimap hud={hud} />
      <Stick ctl={ctl} />
      <div className="cwBtns">
        <HoldBtn cls="cam" label="Camera" icon="🎥" down={() => { ctl.current.recenter = true; }} />
        <HoldBtn cls="" label="Sprint" icon="🏃" down={() => { ctl.current.run = true; }} up={() => { ctl.current.run = false; }} />
        <HoldBtn cls="big" label="Jump" icon="⬆️" down={() => { ctl.current.jump = true; }} />
      </div>
      <div className="cwHint"><b>WASD</b> move · <b>Shift</b> sprint · <b>Space</b> jump<br /><b>Drag mouse</b> look · <b>Scroll</b> zoom · <b>C</b> camera behind you<br />Gamepad works too</div>
    </div>
  );
}