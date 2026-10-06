'use client';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls, RoundedBox, Text } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import Human from './Human';
import { CITY } from '../lib/cityData';
import type { Look } from '../lib/characterModels';
import type { CityBuilding } from '../lib/cityTypes';

/* ───────────── types & helpers ───────────── */
type Ctl = { joy: { x: number; y: number }; keys: Set<string>; run: boolean; jump: boolean; recenter: boolean };
type Hud = { x: number; z: number; fx: number; fz: number; r: number };
type Kind = 'glass' | 'concrete' | 'brick' | 'plaster';
type Prof = { kind: Kind; f: [number, number]; sign: string; wall?: string; balc?: boolean };
type Box2 = { x: number; z: number; sx: number; sz: number };

const hs = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/* ───────────── city layout: wide boulevards (22 m grid) ───────────── */
const FH = 3; // metres per floor
const GRID = 22; // distance between road centre lines
const halfW = (i: number) => (((i % 2) + 2) % 2 === 0 ? 3.5 : 2.5); // even roads = 7 m boulevards, odd = 5 m streets
const LIM = 135; // walkable limit
const ev = (n: number) => ((n % 2) + 2) % 2 === 0;
const BUILDS: CityBuilding[] = CITY.buildings.map((b: CityBuilding) => {
  const bx = Math.round((b.x - 5.5) / 11), bz = Math.round((b.z - 5.5) / 11);
  return { ...b, x: bx * GRID + 11 + (ev(bx) ? .5 : -.5), z: bz * GRID + 11 + (ev(bz) ? .5 : -.5), w: b.w * 1.15, d: b.d * 1.4 };
});
const INTER: { x: number; z: number; hv: number; hh: number }[] = [];
for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) INTER.push({ x: i * GRID, z: j * GRID, hv: halfW(i), hh: halfW(j) });

/* ───────────── building looks per business type ───────────── */
const DEF: Prof = { kind: 'concrete', f: [3, 5], sign: '#2b3440' };
const PROFILE: Record<string, Prof> = {
  Bank: { kind: 'glass', f: [6, 12], sign: '#12355b' },
  Office: { kind: 'glass', f: [8, 14], sign: '#233044' },
  'Tech Company': { kind: 'glass', f: [8, 14], sign: '#3b2a6b' },
  Hotel: { kind: 'concrete', f: [7, 12], sign: '#6b1f2a', balc: true },
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

/* ───────────── procedural facade textures (tile = 4 bays × 2 floors) ───────────── */
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
  if (kind !== 'glass') for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${rnd() > .5 ? '255,255,255' : '0,0,0'},${.025 + rnd() * .03})`; g.fillRect(rnd() * cv.width, rnd() * cv.height, 2 + rnd() * 5, 2 + rnd() * 5); }
  if (kind === 'brick') {
    g.strokeStyle = 'rgba(0,0,0,.16)'; g.lineWidth = 1;
    for (let y = 0; y < cv.height; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(cv.width, y); g.stroke(); for (let x = (y / 8) % 2 ? 0 : 8; x < cv.width; x += 16) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 8); g.stroke(); } }
  }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const x0 = i * BW, y0 = j * FHP, lit = rnd() < .2, shade = rnd();
    if (kind === 'glass') {
      const gr = g.createLinearGradient(x0, y0, x0 + BW, y0 + FHP);
      gr.addColorStop(0, '#2a4b60'); gr.addColorStop(1, shade > .5 ? '#7aa8c0' : '#4a7790');
      g.fillStyle = gr; g.fillRect(x0 + 2, y0 + 2, BW - 4, FHP * .74);
      if (lit) { g.fillStyle = 'rgba(255,224,150,.5)'; g.fillRect(x0 + 2, y0 + 2, BW - 4, FHP * .74); }
      g.fillStyle = 'rgba(255,255,255,.14)'; g.beginPath(); g.moveTo(x0 + 8, y0 + 2); g.lineTo(x0 + 26, y0 + 2); g.lineTo(x0 + 6, y0 + FHP * .74); g.lineTo(x0 + 2, y0 + FHP * .74); g.closePath(); g.fill();
      g.fillStyle = '#' + dark.getHexString(); g.fillRect(x0, y0 + FHP * .78, BW, FHP * .22);
      g.fillStyle = '#1b262e'; g.fillRect(x0, y0, 2, FHP); g.fillRect(x0 + BW - 2, y0, 2, FHP);
    } else {
      const wx = x0 + BW * .2, wy = y0 + FHP * .24, ww = BW * .6, wh = FHP * .5;
      g.fillStyle = '#' + light.getHexString(); g.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
      const gr = g.createLinearGradient(wx, wy, wx + ww, wy + wh); gr.addColorStop(0, '#223a4c'); gr.addColorStop(1, '#5b87a0');
      g.fillStyle = lit ? '#f3d98a' : gr; g.fillRect(wx, wy, ww, wh);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(wx + ww / 2 - 1, wy, 2, wh); g.fillRect(wx, wy + wh * .45, ww, 2);
      g.fillStyle = '#' + light.getHexString(); g.fillRect(wx - 5, wy + wh + 3, ww + 10, 5);
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(wx - 5, wy + wh + 8, ww + 10, 3);
      if (balc) { g.fillStyle = '#' + light.getHexString(); g.fillRect(x0 + BW * .06, y0 + FHP - 9, BW * .88, 7); g.strokeStyle = 'rgba(30,30,30,.7)'; g.lineWidth = 1.5; for (let k = 0; k < 9; k++) { const rx = x0 + BW * .1 + k * (BW * .8 / 8); g.beginPath(); g.moveTo(rx, y0 + FHP - 9); g.lineTo(rx, y0 + FHP - 28); g.stroke(); } g.beginPath(); g.moveTo(x0 + BW * .1, y0 + FHP - 28); g.lineTo(x0 + BW * .9, y0 + FHP - 28); g.stroke(); }
    }
    g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x0, y0 + FHP - 3, BW, 3);
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
  const spans = [d, d, 0, 0, w, w];
  for (let f = 0; f < 6; f++) {
    const su = spans[f] ? Math.max(2, Math.round(spans[f] / BAY)) / NX : 1, sv = spans[f] ? floors / NY : 1;
    for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); }
  }
  uv.needsUpdate = true; return g;
}

/* ───────────── buildings (towers get a setback upper tier) ───────────── */
function Building({ b }: { b: CityBuilding }) {
  const type = b.business?.type ?? 'Office';
  const P = PROFILE[type] ?? DEF;
  const t = Math.min(1, Math.max(0, (b.h - 3) / 5.6));
  const floors = Math.max(2, Math.round(P.f[0] + (P.f[1] - P.f[0]) * t));
  const tower = floors >= 8, lowF = tower ? Math.round(floors * .5) : floors, upF = floors - lowF;
  const H1 = lowF * FH, bodyTop = tower ? H1 + .24 + upF * FH : H1, top = bodyTop + .24;
  const uw = b.w * .72, ud = b.d * .72, rw = tower ? uw : b.w, rd = tower ? ud : b.d;
  const r = hs(b.id), wall = P.wall ?? b.color, gov = type === 'Government', fz = b.d / 2;
  const geo1 = useMemo(() => boxGeo(b.w, b.d, lowF), [b.w, b.d, lowF]);
  const geo2 = useMemo(() => (upF > 0 ? boxGeo(uw, ud, upF) : null), [uw, ud, upF]);
  const side = useMemo(() => sideMat(P.kind, wall, !!P.balc), [P.kind, wall, P.balc]);
  const mats = useMemo(() => [side, side, ROOF, ROOF, side, side], [side]);
  return (
    <group position={[b.x, 0, b.z]}>
      <mesh geometry={geo1} material={mats} position={[0, H1 / 2, 0]} castShadow receiveShadow />
      <mesh position={[0, .35, 0]} receiveShadow><boxGeometry args={[b.w + .12, .7, b.d + .12]} /><meshStandardMaterial color="#6d6f72" roughness={1} /></mesh>
      <mesh position={[0, H1 + .12, 0]} castShadow><boxGeometry args={[b.w + .25, .24, b.d + .25]} /><meshStandardMaterial color="#c9ccce" roughness={.9} /></mesh>
      {geo2 && <>
        <mesh geometry={geo2} material={mats} position={[0, H1 + .24 + upF * FH / 2, 0]} castShadow receiveShadow />
        <mesh position={[0, bodyTop + .12, 0]} castShadow><boxGeometry args={[uw + .25, .24, ud + .25]} /><meshStandardMaterial color="#c9ccce" roughness={.9} /></mesh>
      </>}
      {/* entrance + shopfront */}
      <mesh position={[0, .95, fz + .1]}><boxGeometry args={[gov ? 1.7 : 1.1, gov ? 2.3 : 1.9, .08]} /><meshStandardMaterial color="#20262c" /></mesh>
      <mesh position={[0, 1.05, fz + .15]}><planeGeometry args={[gov ? 1.4 : .8, gov ? 1.9 : 1.45]} /><meshStandardMaterial color="#9fd0e8" emissive="#7fb6d6" emissiveIntensity={.35} /></mesh>
      {!gov && <>
        <mesh position={[0, 1.5, fz + .07]}><planeGeometry args={[b.w * .78, 1.45]} /><meshStandardMaterial color="#1a2a35" metalness={.6} roughness={.15} emissive="#ffcf80" emissiveIntensity={.22} /></mesh>
        <mesh position={[0, 2.45, fz + .5]} rotation={[.4, 0, 0]}><boxGeometry args={[b.w * .7, .07, .95]} /><meshStandardMaterial color={P.sign} roughness={.9} /></mesh>
      </>}
      <mesh position={[0, 2.95, fz + .07]}><boxGeometry args={[b.w * .8, .55, .1]} /><meshStandardMaterial color={P.sign} roughness={.6} /></mesh>
      {b.business && <Text position={[0, 2.95, fz + .13]} fontSize={.26} maxWidth={b.w * .76} textAlign="center" color="#ffffff" anchorX="center" anchorY="middle">{b.business.name}</Text>}
      {/* roof: Geepee water tank, AC unit, aviation-light antenna on towers */}
      <mesh position={[rw * (r - .5) * .6, top + .4, rd * .2]}><cylinderGeometry args={[.5, .5, .8, 14]} /><meshStandardMaterial color="#14171a" roughness={.6} /></mesh>
      <mesh position={[-rw * .22, top + .28, -rd * .18]}><boxGeometry args={[1, .55, .7]} /><meshStandardMaterial color="#9aa0a6" metalness={.4} roughness={.5} /></mesh>
      {floors >= 6 && <>
        <mesh position={[rw * .3, top + 1.6, -rd * .25]}><cylinderGeometry args={[.04, .05, 3.2, 6]} /><meshStandardMaterial color="#555" /></mesh>
        <mesh position={[rw * .3, top + 3.25, -rd * .25]}><sphereGeometry args={[.1, 8, 8]} /><meshStandardMaterial color="#ff2a2a" emissive="#ff2a2a" emissiveIntensity={2} /></mesh>
      </>}
      {gov && <>
        <mesh position={[0, .15, fz + .5]} castShadow><boxGeometry args={[b.w * .95, .3, 1]} /><meshStandardMaterial color="#cfc9b8" /></mesh>
        {[-3, -1.8, -.6, .6, 1.8, 3].map(x => <mesh key={x} position={[x * (b.w / 7), 1.85, fz + .6]} castShadow><cylinderGeometry args={[.2, .22, 3.1, 12]} /><meshStandardMaterial color="#efeadb" /></mesh>)}
        <mesh position={[0, 3.55, fz + .5]}><boxGeometry args={[b.w * .95, .4, 1]} /><meshStandardMaterial color="#e6e0cf" /></mesh>
        <mesh position={[0, top, 0]} castShadow><sphereGeometry args={[Math.min(b.w, b.d) * .32, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#c8b560" metalness={.5} roughness={.35} /></mesh>
      </>}
      {type === 'Hospital' && <>
        <mesh position={[0, H1 - 1.5, fz + .05]}><boxGeometry args={[1.6, .45, .06]} /><meshStandardMaterial color="#d11a2a" /></mesh>
        <mesh position={[0, H1 - 1.5, fz + .05]}><boxGeometry args={[.45, 1.6, .06]} /><meshStandardMaterial color="#d11a2a" /></mesh>
      </>}
      {(type === 'Nightclub' || type === 'Cinema') && <mesh position={[0, 3.35, fz + .08]}><boxGeometry args={[b.w * .9, .1, .05]} /><meshStandardMaterial color={type === 'Nightclub' ? '#c026d3' : '#ffb300'} emissive={type === 'Nightclub' ? '#c026d3' : '#ffb300'} emissiveIntensity={2.2} /></mesh>}
    </group>
  );
}

/* ───────────── street furniture (all instanced) ───────────── */
function Inst({ items, color, h, y, receive = false, basic = false }: { items: Box2[]; color: string; h: number; y: number; receive?: boolean; basic?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    items.forEach((it, i) => { o.position.set(it.x, y, it.z); o.scale.set(it.sx, h, it.sz); o.updateMatrix(); ref.current.setMatrixAt(i, o.matrix); });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [items, h, y]);
  return <instancedMesh ref={ref} args={[undefined, undefined, items.length]} frustumCulled={false} receiveShadow={receive}><boxGeometry args={[1, 1, 1]} />{basic ? <meshBasicMaterial color={color} /> : <meshStandardMaterial color={color} roughness={1} />}</instancedMesh>;
}
const SLABS: Box2[] = BUILDS.map(b => ({ x: b.x, z: b.z, sx: 16, sz: 16 }));
const MARKS = (() => {
  const yellow: Box2[] = [], white: Box2[] = [], zebra: Box2[] = [];
  for (let i = -5; i <= 5; i++) for (let j = -5; j <= 4; j++) {
    const a = j * GRID + halfW(j) + 3.2, b = (j + 1) * GRID - halfW(j + 1) - 3.2, len = b - a, mid = (a + b) / 2, hw = halfW(i), c = i * GRID;
    if (hw > 3) { yellow.push({ x: mid, z: c - .15, sx: len, sz: .12 }, { x: mid, z: c + .15, sx: len, sz: .12 }, { x: c - .15, z: mid, sx: .12, sz: len }, { x: c + .15, z: mid, sx: .12, sz: len }); }
    else for (let p = a + .5; p + 2 <= b; p += 4) { white.push({ x: p + 1, z: c, sx: 2, sz: .12 }, { x: c, z: p + 1, sx: .12, sz: 2 }); }
  }
  for (const it of INTER) {
    const nz = Math.floor((2 * it.hh - 1) / 1), nx = Math.floor((2 * it.hv - 1) / 1);
    for (const s of [1, -1]) {
      for (let k = 0; k < nz; k++) zebra.push({ x: it.x + s * (it.hv + 1.6), z: it.z - (nz - 1) / 2 + k, sx: 2.6, sz: .5 });
      for (let k = 0; k < nx; k++) zebra.push({ x: it.x - (nx - 1) / 2 + k, z: it.z + s * (it.hh + 1.6), sx: .5, sz: 2.6 });
    }
  }
  return { yellow, white, zebra };
})();
function Roads() {
  const idx = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
  return <>{idx.map(i => <group key={i}>
    <mesh position={[i * GRID, .01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[halfW(i) * 2, 250]} /><meshStandardMaterial color="#2b2f35" roughness={.95} /></mesh>
    <mesh position={[0, .011, i * GRID]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[250, halfW(i) * 2]} /><meshStandardMaterial color="#2b2f35" roughness={.95} /></mesh>
  </group>)}</>;
}
function Trees() {
  const trunks = useRef<THREE.InstancedMesh>(null!), crowns = useRef<THREE.InstancedMesh>(null!);
  const pts = useMemo(() => BUILDS.flatMap(b => [[-4.2, 7], [4.2, 7], [-4.2, -7], [4.2, -7]].map(([dx, dz], k) => ({ x: b.x + dx, z: b.z + dz, s: .9 + hs(b.id + k) * .5 }))), []);
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    pts.forEach((p, i) => {
      o.scale.set(1, 1, 1); o.position.set(p.x, .8, p.z); o.updateMatrix(); trunks.current.setMatrixAt(i, o.matrix);
      o.position.set(p.x, 2.7 * p.s, p.z); o.scale.set(p.s, p.s, p.s); o.updateMatrix(); crowns.current.setMatrixAt(i, o.matrix);
    });
    trunks.current.instanceMatrix.needsUpdate = true; crowns.current.instanceMatrix.needsUpdate = true;
  }, [pts]);
  return <>
    <instancedMesh ref={trunks} args={[undefined, undefined, pts.length]} frustumCulled={false}><cylinderGeometry args={[.1, .14, 1.6, 6]} /><meshStandardMaterial color="#5a3d26" /></instancedMesh>
    <instancedMesh ref={crowns} args={[undefined, undefined, pts.length]} frustumCulled={false} castShadow><sphereGeometry args={[.95, 10, 8]} /><meshStandardMaterial color="#3f7a3a" roughness={.9} /></instancedMesh>
  </>;
}
function StreetLamps() {
  const poles = useRef<THREE.InstancedMesh>(null!), heads = useRef<THREE.InstancedMesh>(null!);
  const pts = useMemo(() => { const a: { x: number; z: number }[] = []; for (let i = -5; i <= 5; i++) for (let j = -5; j <= 4; j++) { const mid = (j + .5) * GRID, o = halfW(i) + 1.1, c = i * GRID; for (const s of [1, -1]) a.push({ x: mid, z: c + s * o }, { x: c + s * o, z: mid }); } return a; }, []);
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    pts.forEach((p, i) => { o.position.set(p.x, 2.6, p.z); o.updateMatrix(); poles.current.setMatrixAt(i, o.matrix); o.position.set(p.x, 5.3, p.z); o.updateMatrix(); heads.current.setMatrixAt(i, o.matrix); });
    poles.current.instanceMatrix.needsUpdate = true; heads.current.instanceMatrix.needsUpdate = true;
  }, [pts]);
  return <>
    <instancedMesh ref={poles} args={[undefined, undefined, pts.length]} frustumCulled={false}><cylinderGeometry args={[.06, .08, 5.2, 6]} /><meshStandardMaterial color="#3a3f45" metalness={.5} roughness={.5} /></instancedMesh>
    <instancedMesh ref={heads} args={[undefined, undefined, pts.length]} frustumCulled={false}><boxGeometry args={[.7, .14, .32]} /><meshBasicMaterial color="#fff1c1" /></instancedMesh>
  </>;
}

/* ───────────── traffic lights + cars that obey them ───────────── */
const lightState = (t: number, axis: 'x' | 'z') => { const c = t % 24; return axis === 'x' ? (c < 10 ? 'g' : c < 12 ? 'y' : 'r') : (c >= 12 && c < 22 ? 'g' : c >= 22 ? 'y' : 'r'); };
const LCOL = { g: new THREE.Color('#2ee66b'), y: new THREE.Color('#ffc400'), r: new THREE.Color('#ff2a2a') };
function Signals() {
  const poles = useRef<THREE.InstancedMesh>(null!), heads = useRef<THREE.InstancedMesh>(null!), last = useRef('');
  const corners = useMemo(() => INTER.flatMap(it => [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) => ({ x: it.x + sx * (it.hv + 1.1), z: it.z + sz * (it.hh + 1.1), axis: (sx * sz > 0 ? 'x' : 'z') as 'x' | 'z' }))), []);
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    corners.forEach((c, i) => { o.position.set(c.x, 2.4, c.z); o.updateMatrix(); poles.current.setMatrixAt(i, o.matrix); o.position.set(c.x, 4.95, c.z); o.updateMatrix(); heads.current.setMatrixAt(i, o.matrix); heads.current.setColorAt(i, LCOL.g); });
    poles.current.instanceMatrix.needsUpdate = true; heads.current.instanceMatrix.needsUpdate = true;
  }, [corners]);
  useFrame(st => {
    const t = st.clock.elapsedTime, xs = lightState(t, 'x') as 'g' | 'y' | 'r', zs = lightState(t, 'z') as 'g' | 'y' | 'r', key = xs + zs;
    if (key === last.current) return; last.current = key;
    corners.forEach((c, i) => heads.current.setColorAt(i, LCOL[c.axis === 'x' ? xs : zs]));
    if (heads.current.instanceColor) heads.current.instanceColor.needsUpdate = true;
  });
  return <>
    <instancedMesh ref={poles} args={[undefined, undefined, corners.length]} frustumCulled={false}><cylinderGeometry args={[.07, .09, 4.8, 6]} /><meshStandardMaterial color="#2f3338" metalness={.5} roughness={.5} /></instancedMesh>
    <instancedMesh ref={heads} args={[undefined, undefined, corners.length]} frustumCulled={false}><boxGeometry args={[.42, .42, .42]} /><meshBasicMaterial color="#ffffff" /></instancedMesh>
  </>;
}

type Kit = { body: THREE.BufferGeometry; cabin: THREE.BufferGeometry; wheels: THREE.BufferGeometry; head: THREE.BufferGeometry; tail: THREE.BufferGeometry; glass: THREE.Material; tire: THREE.Material; headM: THREE.Material; tailM: THREE.Material };
function carKit(): Kit {
  const ext = (pts: [number, number][], depth: number, bevel: number) => {
    const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, steps: 1 }); g.translate(0, 0, -depth / 2); return g;
  };
  const wheels = mergeGeometries([[1.35, .9], [1.35, -.9], [-1.35, .9], [-1.35, -.9]].map(([x, z]) => { const g = new THREE.CylinderGeometry(.37, .37, .3, 16); g.rotateX(Math.PI / 2); g.translate(x, .37, z); return g; }))!;
  const lamp = (x: number, y: number) => [.62, -.62].map(z => { const g = new THREE.BoxGeometry(.08, .16, .36); g.translate(x, y, z); return g; });
  return {
    body: ext([[-2.12, .34], [2.12, .34], [2.16, .6], [1.55, .8], [-1.92, .84], [-2.16, .68]], 1.7, .08),
    cabin: ext([[-1.25, .84], [1.0, .84], [.5, 1.34], [-.85, 1.34]], 1.46, .04),
    wheels, head: mergeGeometries(lamp(2.2, .6))!, tail: mergeGeometries(lamp(-2.2, .68))!,
    glass: new THREE.MeshStandardMaterial({ color: '#16222c', metalness: .8, roughness: .1 }),
    tire: new THREE.MeshStandardMaterial({ color: '#141619', roughness: .9 }),
    headM: new THREE.MeshStandardMaterial({ color: '#fff7d6', emissive: '#fff2b0', emissiveIntensity: 1.4 }),
    tailM: new THREE.MeshStandardMaterial({ color: '#ff3030', emissive: '#ff1a1a', emissiveIntensity: 1.2 }),
  };
}
const BODYMATS = new Map<string, THREE.MeshStandardMaterial>();
const bodyMat = (c: string) => { let m = BODYMATS.get(c); if (!m) { m = new THREE.MeshStandardMaterial({ color: c, metalness: .55, roughness: .32 }); BODYMATS.set(c, m); } return m; };
function CarModel({ kit, color, kind }: { kit: Kit; color: string; kind: number }) {
  const mat = bodyMat(color), sc: [number, number, number] = kind === 1 ? [1.04, 1.22, 1.06] : kind === 2 ? [.88, 1, .97] : [1, 1, 1];
  return <group scale={sc}>
    <mesh geometry={kit.body} material={mat} castShadow />
    <mesh geometry={kit.cabin} material={kit.glass} />
    <mesh position={[-.17, 1.38, 0]} material={mat}><boxGeometry args={[1.32, .07, 1.5]} /></mesh>
    <mesh geometry={kit.wheels} material={kit.tire} />
    <mesh geometry={kit.head} material={kit.headM} /><mesh geometry={kit.tail} material={kit.tailM} />
  </group>;
}
type SimCar = { s: number; color: string; kind: number };
type Lane = { axis: 'x' | 'z'; dir: 1 | -1; fixed: number; speed: number; rot: number; cars: SimCar[] };
const COLORS = ['#c0392b', '#e8e8ea', '#1f2933', '#2c5aa0', '#8e949a', '#b7791f', '#0f766e', '#7c2d12', '#d9d9dc', '#1e9e55'];
function makeLanes(): Lane[] {
  const lanes: Lane[] = []; let n = 0;
  for (let i = -5; i <= 5; i++) {
    const hw = halfW(i), off = hw * .5, major = hw > 3;
    for (const axis of ['x', 'z'] as const) for (const dir of [1, -1] as const) {
      const fixed = axis === 'x' ? i * GRID + (dir === 1 ? off : -off) : i * GRID + (dir === 1 ? -off : off); // drive on the right
      const rot = axis === 'x' ? (dir === 1 ? 0 : Math.PI) : (dir === 1 ? -Math.PI / 2 : Math.PI / 2);
      const cars = Array.from({ length: major ? 2 : 1 }, (_, k) => ({ s: -100 + k * 105 + hs(`${i}${axis}${dir}${k}`) * 40, color: COLORS[n++ % COLORS.length], kind: (n * 7) % 4 }));
      lanes.push({ axis, dir, fixed, speed: major ? 9 : 6.5, rot, cars });
    }
  }
  return lanes;
}
const nextCenter = (s: number, dir: 1 | -1) => (dir === 1 ? Math.floor(s / GRID + 1e-6) * GRID + GRID : Math.ceil(s / GRID - 1e-6) * GRID - GRID);
function Traffic() {
  const lanes = useMemo(makeLanes, []), kit = useMemo(carKit, []);
  const flat = useMemo(() => lanes.flatMap(l => l.cars.map(c => ({ l, c }))), [lanes]);
  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame((st, dtRaw) => {
    const dt = Math.min(dtRaw, .05), t = st.clock.elapsedTime;
    flat.forEach(({ l, c }, i) => {
      let adv = l.speed * dt, gap = Infinity;
      for (const o of l.cars) if (o !== c) { const d = (o.s - c.s) * l.dir; if (d > 0 && d < gap) gap = d; }
      adv = Math.min(adv, Math.max(0, gap - 7)); // keep a safe distance
      const nx = nextCenter(c.s, l.dir), d = (nx - c.s) * l.dir, ci = Math.round(nx / GRID);
      if (Math.abs(ci) <= 5 && lightState(t, l.axis) !== 'g' && d >= halfW(ci) + 5.2 - .05) adv = Math.min(adv, Math.max(0, d - (halfW(ci) + 5.2))); // stop at the red light
      c.s += adv * l.dir; if (c.s > 118) c.s = -118; else if (c.s < -118) c.s = 118;
      const g = refs.current[i]; if (g) { if (l.axis === 'x') g.position.set(c.s, 0, l.fixed); else g.position.set(l.fixed, 0, c.s); g.rotation.y = l.rot; }
    });
  });
  return <>{flat.map(({ l, c }, i) => <group key={i} ref={el => { refs.current[i] = el; }} position={l.axis === 'x' ? [c.s, 0, l.fixed] : [l.fixed, 0, c.s]} rotation={[0, l.rot, 0]}><CarModel kit={kit} color={c.color} kind={c.kind} /></group>)}</>;
}

/* ───────────── railway + airport on the city edge ───────────── */
const RAIL_Z = 126;
function TrainLine() {
  const g = useRef<THREE.Group>(null!);
  useFrame((st) => { const x = ((st.clock.elapsedTime * 14 + 150) % 300) - 150; g.current.position.x = x; });
  return <>
    <mesh position={[0, .05, RAIL_Z]}><boxGeometry args={[300, .1, 3]} /><meshStandardMaterial color="#6b6a66" roughness={1} /></mesh>
    {[-.7, .7].map(o => <mesh key={o} position={[0, .16, RAIL_Z + o]}><boxGeometry args={[300, .1, .12]} /><meshStandardMaterial color="#9aa0a6" metalness={.7} roughness={.3} /></mesh>)}
    <group ref={g} position={[0, 1.5, RAIL_Z]}>
      {[0, -9.6].map(x => <group key={x} position={[x, 0, 0]}>
        <RoundedBox args={[9, 2.4, 2.6]} radius={.2} smoothness={2} castShadow><meshStandardMaterial color="#d99a42" metalness={.3} roughness={.5} /></RoundedBox>
        <mesh position={[0, .35, 0]}><boxGeometry args={[8.6, .8, 2.64]} /><meshStandardMaterial color="#1b2a35" metalness={.7} roughness={.15} /></mesh>
      </group>)}
    </group>
  </>;
}
const AIR = { x: 122, z: -12, s: 1.8 };
function Airport() {
  return <group position={[AIR.x, 0, AIR.z]} scale={AIR.s}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .02, 0]}><planeGeometry args={[22, 7]} /><meshStandardMaterial color="#33383e" /></mesh>
    <Text position={[0, .1, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={.6} color="#fff" anchorX="center">RUNWAY</Text>
    <RoundedBox args={[9, 1.5, 5]} position={[0, .75, -7]} radius={.15}><meshStandardMaterial color="#7b8791" /></RoundedBox>
    <Text position={[0, 1.65, -4.4]} fontSize={.45} color="#fff" anchorX="center">Nnamdi Azikiwe Airport</Text>
  </group>;
}

/* ───────────── collision ───────────── */
const BODY = .45;
const SOLIDS = [
  ...BUILDS.map(b => ({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 })),
  { x0: AIR.x - 4.5 * AIR.s, x1: AIR.x + 4.5 * AIR.s, z0: AIR.z - 7 * AIR.s - 2.5 * AIR.s, z1: AIR.z - 7 * AIR.s + 2.5 * AIR.s },
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
const START = { x: 0, z: 16 };
function Scene({ look, ctl, hud, setNear }: { look: Look; ctl: React.MutableRefObject<Ctl>; hud: React.MutableRefObject<Hud>; setNear: (b: any) => void }) {
  const P = useRef({ x: START.x, z: START.z, y: 0, vy: 0, r: Math.PI });
  const group = useRef<THREE.Group>(null!), controls = useRef<any>(null), sun = useRef<THREE.DirectionalLight>(null!);
  const sunTarget = useMemo(() => new THREE.Object3D(), []);
  const moving = useRef(false), running = useRef(false), nearId = useRef<string | null>(null);
  const [near, setN] = useState<any>(null);
  const nearBuilding = near ? BUILDS.find(x => x.business?.id === near.id) : null;
  useEffect(() => { sun.current.target = sunTarget; }, [sunTarget]);

  useFrame((st, dtRaw) => {
    const dt = Math.min(dtRaw, .05), c = ctl.current, k = c.keys, p = P.current, oc = controls.current;
    if (!oc) return;
    let ix = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0) + c.joy.x;
    let iy = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0) - c.joy.y;
    let wantJump = c.jump || k.has(' '), wantRun = c.run || k.has('shift');
    const gp = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads()[0] : null;
    if (gp) {
      const dz = (v: number) => (Math.abs(v) > .15 ? v : 0), cx = dz(gp.axes[2] || 0), cy = dz(gp.axes[3] || 0);
      ix += dz(gp.axes[0] || 0); iy -= dz(gp.axes[1] || 0);
      if (cx || cy) { oc.setAzimuthalAngle?.(oc.getAzimuthalAngle() - cx * dt * 2.6); oc.setPolarAngle?.(THREE.MathUtils.clamp(oc.getPolarAngle() + cy * dt * 1.6, .25, Math.PI / 2.15)); }
      if (gp.buttons[0]?.pressed) wantJump = true;
      if (gp.buttons[7]?.pressed || gp.buttons[10]?.pressed || gp.buttons[1]?.pressed) wantRun = true;
    }
    const m = Math.hypot(ix, iy); if (m > 1) { ix /= m; iy /= m; }
    const mag = Math.min(m, 1);
    const cam = st.camera, t = oc.target as THREE.Vector3;
    let fx = t.x - cam.position.x, fz = t.z - cam.position.z; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    const wx = ix * -fz + iy * fx, wz = ix * fx + iy * fz;
    moving.current = mag > .08; running.current = wantRun;
    if (moving.current) {
      const sp = wantRun ? 9 : 4.6;
      p.x += wx * sp * dt; p.z += wz * sp * dt;
      p.r += wrap(Math.atan2(wx, wz) - p.r) * Math.min(1, dt * 12);
    }
    pushOut(p);
    p.x = THREE.MathUtils.clamp(p.x, -LIM, LIM); p.z = THREE.MathUtils.clamp(p.z, -LIM, LIM);
    if (wantJump && p.y <= .001) p.vy = 6.2;
    c.jump = false;
    p.vy -= 18 * dt; p.y += p.vy * dt; if (p.y < 0) { p.y = 0; p.vy = 0; }
    group.current.position.set(p.x, p.y, p.z); group.current.rotation.y = p.r;
    const ox = t.x, oy = t.y, oz = t.z, ty = 1.5 + p.y * .5;
    t.set(p.x, ty, p.z); cam.position.add(new THREE.Vector3(p.x - ox, ty - oy, p.z - oz));
    if (c.recenter) { c.recenter = false; const d = Math.hypot(cam.position.x - p.x, cam.position.z - p.z); cam.position.set(p.x - Math.sin(p.r) * d, cam.position.y, p.z - Math.cos(p.r) * d); }
    sunTarget.position.set(p.x, 0, p.z); sun.current.position.set(p.x + 40, 60, p.z + 25);
    hud.current = { x: p.x, z: p.z, fx, fz, r: p.r };
    let best: CityBuilding | null = null, bd = 2.6;
    for (const b of BUILDS) { const d = distTo({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 }, p.x, p.z); if (d < bd && b.business) { bd = d; best = b; } }
    const id = best?.business?.id ?? null;
    if (id !== nearId.current) { nearId.current = id; setN(best?.business ?? null); setNear(best?.business ?? null); }
  });

  return (
    <>
      <color attach="background" args={['#8fc3ea']} />
      <fog attach="fog" args={['#c9dff0', 90, 270]} />
      <hemisphereLight args={['#dff0ff', '#6b7a5a', 1.25]} />
      <directionalLight ref={sun} position={[40, 60, 25]} color="#fff3e0" intensity={2.8} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-46} shadow-camera-right={46} shadow-camera-top={46} shadow-camera-bottom={-46} shadow-camera-near={1} shadow-camera-far={190} shadow-bias={-0.0004} />
      <primitive object={sunTarget} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[700, 700]} /><meshStandardMaterial color="#5d7f55" /></mesh>
      <Roads />
      <Inst items={SLABS} color="#b4b6b2" h={.12} y={.06} receive />
      <Inst items={MARKS.yellow} color="#f2b705" h={.02} y={.025} />
      <Inst items={MARKS.white} color="#f4f1e4" h={.02} y={.025} />
      <Inst items={MARKS.zebra} color="#f4f1e4" h={.02} y={.025} />
      <Trees />
      <StreetLamps />
      <Signals />
      {BUILDS.map(b => <Building key={b.id} b={b} />)}
      <Traffic />
      <TrainLine />
      <Airport />
      <group ref={group}>
        <Human look={look} getState={() => (moving.current ? 'walk' : 'idle')} getSpeed={() => (running.current ? 2.4 : 1.1)} />
        <Html position={[0, 2.8, 0]} center><div className="cityNameTag">{look.name}</div></Html>
      </group>
      {near && nearBuilding && <Html position={[nearBuilding.x, 3.9, nearBuilding.z + nearBuilding.d / 2 + .8]} center><div className="cityBizTag">{near.name}<br /><small>{near.type}</small></div></Html>}
      <OrbitControls ref={controls} makeDefault enablePan={false} enableDamping dampingFactor={.12} rotateSpeed={.7} minDistance={3.5} maxDistance={24} minPolarAngle={.25} maxPolarAngle={Math.PI / 2.15} target={[START.x, 1.5, START.z]} />
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
      const h = hud.current, sc = S / 100;
      g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#35553f'; g.fillRect(0, 0, S, S);
      g.translate(S / 2, S / 2); g.rotate(-Math.atan2(h.fx, -h.fz)); g.scale(sc, sc); g.translate(-h.x, -h.z);
      g.fillStyle = '#6a6f77'; for (let i = -5; i <= 5; i++) { g.fillRect(i * GRID - halfW(i), -125, halfW(i) * 2, 250); g.fillRect(-125, i * GRID - halfW(i), 250, halfW(i) * 2); }
      for (const b of BUILDS) { g.fillStyle = b.color; g.fillRect(b.x - b.w / 2, b.z - b.d / 2, b.w, b.d); }
      g.save(); g.translate(h.x, h.z); g.rotate(Math.PI - h.r); g.fillStyle = '#ffd23f'; g.strokeStyle = '#000'; g.lineWidth = .3;
      g.beginPath(); g.moveTo(0, -3); g.lineTo(2.1, 2.1); g.lineTo(0, 1); g.lineTo(-2.1, 2.1); g.closePath(); g.fill(); g.stroke(); g.restore();
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
.cwMap{position:absolute;left:12px;top:72px;width:140px;height:140px;border-radius:50%;border:3px solid #ffffffcc;box-shadow:0 4px 18px #0008;z-index:6;background:#35553f;pointer-events:none}
.cwHint{position:absolute;right:18px;bottom:110px;z-index:6;color:#fff;font-size:11px;line-height:1.55;background:#0b1511b0;border:1px solid #ffffff22;border-radius:10px;padding:8px 11px;pointer-events:none}
.cwHint b{color:#d99a42}
@media (pointer:coarse),(max-width:700px){.cwStick{display:block}.cwHint{display:none}.cwMap{width:96px;height:96px;top:96px;left:10px}.cwBtns{bottom:26px}}
`;

export default function CityWorld({ look, onNear }: { look: Look; onNear: (b: any) => void }) {
  const ctl = useRef<Ctl>({ joy: { x: 0, y: 0 }, keys: new Set(), run: false, jump: false, recenter: false });
  const hud = useRef<Hud>({ x: START.x, z: START.z, fx: 0, fz: -1, r: Math.PI });
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
      <Canvas shadows dpr={[1, 1.5]} camera={{ position: [START.x, 4.2, START.z + 8], fov: 52, far: 600 }}>
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