'use client';
import { GAME_LABEL_CSS } from '../lib/gameLabels';
import { openSettings, useSettings } from '../lib/settings';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls, RoundedBox, Stars, Text } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import Human from './Human';
import { CITY } from '../lib/cityData';
import type { Look } from '../lib/characterModels';
import type { CityBuilding } from '../lib/cityTypes';
import { NET, useCityNet } from '../lib/cityNet';
import { JAIL_CELL_POS } from '../lib/profile';
import { useCityVoice } from '../lib/cityVoice';
import CityPeople from './CityPeople';
import { engineSet, engineStart, engineStop, honk, setMuted, thud, unlockAudio } from '../lib/cityAudio';
import { VEHICLE_CATALOG, vehicleById, vehicleByName } from '../lib/vehicles';

import RuntimeStyle from './RuntimeStyle';
/* ───────────── types & helpers ───────────── */
type Ctl = { joy: { x: number; y: number }; look: { x: number; y: number }; keys: Set<string>; run: boolean; jump: boolean; recenter: boolean; interact: boolean; horn: boolean };
type Hud = { x: number; z: number; fx: number; fz: number; r: number; vx: number; vz: number; vp: boolean; spd: number; drv: boolean; prompt: string };
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
const EMT = new Map<string, THREE.CanvasTexture>(); // night-time window glow maps
const MATS = new Map<string, THREE.MeshStandardMaterial>();
const BAY = 2.2, NX = 4, NY = 2;
function facadeTex(kind: Kind, wall: string, balc: boolean) {
  const key = kind + wall + balc;
  const hit = TEX.get(key); if (hit) return hit;
  const BW = 64, FHP = 96;
  const cv = document.createElement('canvas'); cv.width = BW * NX; cv.height = FHP * NY;
  const g = cv.getContext('2d')!;
  const ec = document.createElement('canvas'); ec.width = cv.width; ec.height = cv.height;
  const eg = ec.getContext('2d')!; eg.fillStyle = '#000'; eg.fillRect(0, 0, ec.width, ec.height);
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
    if (lit || hs(key + i + '.' + j) < .3) { eg.fillStyle = kind === 'glass' ? '#ffd9a0' : '#ffcf7a'; if (kind === 'glass') eg.fillRect(x0 + 2, y0 + 2, BW - 4, FHP * .74); else eg.fillRect(x0 + BW * .2, y0 + FHP * .24, BW * .6, FHP * .5); }
    g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x0, y0 + FHP - 3, BW, 3);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const et = new THREE.CanvasTexture(ec); et.wrapS = et.wrapT = THREE.RepeatWrapping; et.colorSpace = THREE.SRGBColorSpace; EMT.set(key, et);
  TEX.set(key, t); return t;
}
function sideMat(kind: Kind, wall: string, balc: boolean) {
  const key = kind + wall + balc;
  const hit = MATS.get(key); if (hit) return hit;
  const m = new THREE.MeshStandardMaterial({ map: facadeTex(kind, wall, balc), emissive: new THREE.Color('#ffffff'), emissiveMap: EMT.get(kind + wall + balc), emissiveIntensity: 0, roughness: kind === 'glass' ? .22 : .88, metalness: kind === 'glass' ? .35 : 0 });
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
const LAMP_PTS = (() => { const a: { x: number; z: number }[] = []; for (let i = -5; i <= 5; i++) for (let j = -5; j <= 4; j++) { const mid = (j + .5) * GRID, o = halfW(i) + 1.1, c = i * GRID; for (const s of [1, -1]) a.push({ x: mid, z: c + s * o }, { x: c + s * o, z: mid }); } return a; })();
function StreetLamps() {
  const poles = useRef<THREE.InstancedMesh>(null!), heads = useRef<THREE.InstancedMesh>(null!);
  const pts = LAMP_PTS;
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

/* ───────────── shared world state (cars, pedestrians and the player talk through these) ───────────── */
const TPOS: { x: number; z: number; r: number }[] = []; // live position of every AI car
const OBS = [{ x: 0, z: 0, on: false, sp: 4.5 }, { x: 0, z: 0, on: false, sp: 7 }]; // things AI cars must stop for: [0] player on foot, [1] player's car
const VEH = { x: 0, z: 0, r: 0, v: 0, placed: false, drv: false, brake: false }; // the player's own car
const NIGHT = { n: 0 }; // 0 = full day, 1 = full night
let PKIT: Kit | null = null;
const pkit = (): Kit => { if (!PKIT) PKIT = carKit(); return PKIT; };

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
function CarModel({ kit, color, kind, model }: { kit: Kit; color: string; kind: number; model?: string }) {
  const spec = model ? (vehicleById(model) || vehicleByName(model)) : VEHICLE_CATALOG[0];
  const suv = spec.type === 'SUV' || /land rover|lx/i.test(spec.model);
  const premium = /mercedes|bmw|lexus/i.test(spec.brand);
  const sc: [number, number, number] = suv ? [1.12, 1.32, 1.14] : kind === 1 ? [1.04, 1.22, 1.06] : kind === 2 ? [.9, 1, .98] : [1, 1, 1];
  const grille = premium ? '#c7ccd1' : '#20252a';
  return <group scale={sc}>
    <mesh geometry={kit.body} material={bodyMat(color)} castShadow />
    <mesh geometry={kit.cabin} material={kit.glass} />
    <mesh position={[-.17, suv ? 1.43 : 1.38, 0]} material={bodyMat(color)}><boxGeometry args={[suv ? 1.48 : 1.32, .07, suv ? 1.56 : 1.5]} /></mesh>
    <mesh position={[2.14, .62, 0]} material={new THREE.MeshStandardMaterial({ color: grille, metalness: .75, roughness: .2 })}><boxGeometry args={[.08, .28, suv ? .95 : .78]} /></mesh>
    <mesh position={[1.8, .55, 0]} material={new THREE.MeshStandardMaterial({ color: '#111820', metalness: .3, roughness: .4 })}><boxGeometry args={[.18, .08, suv ? 1.05 : .9]} /></mesh>
    <mesh geometry={kit.wheels} material={kit.tire} />
    <mesh geometry={kit.head} material={kit.headM} /><mesh geometry={kit.tail} material={kit.tailM} />
    <mesh position={[-1.55, .58, .91]} material={new THREE.MeshStandardMaterial({ color: '#111', metalness: .25, roughness: .55 })}><boxGeometry args={[.5, .05, .05]} /></mesh>
  </group>;
}
type SimCar = { s: number; color: string; kind: number; model: string };
type Lane = { axis: 'x' | 'z'; dir: 1 | -1; fixed: number; speed: number; rot: number; cars: SimCar[] };
const COLORS = ['#c0392b', '#e8e8ea', '#1f2933', '#2c5aa0', '#8e949a', '#b7791f', '#0f766e', '#7c2d12', '#d9d9dc', '#1e9e55'];
function makeLanes(): Lane[] {
  const lanes: Lane[] = []; let n = 0;
  for (let i = -5; i <= 5; i++) {
    const hw = halfW(i), off = hw * .5, major = hw > 3;
    for (const axis of ['x', 'z'] as const) for (const dir of [1, -1] as const) {
      const fixed = axis === 'x' ? i * GRID + (dir === 1 ? off : -off) : i * GRID + (dir === 1 ? -off : off); // drive on the right
      const rot = axis === 'x' ? (dir === 1 ? 0 : Math.PI) : (dir === 1 ? -Math.PI / 2 : Math.PI / 2);
      const cars = Array.from({ length: major ? 2 : 1 }, (_, k) => ({ s: -100 + k * 105 + hs(`${i}${axis}${dir}${k}`) * 40, color: COLORS[n++ % COLORS.length], kind: (n * 7) % 4, model: VEHICLE_CATALOG[(n + k) % VEHICLE_CATALOG.length].id }));
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
      for (const o of OBS) { if (!o.on) continue; const perp = l.axis === 'x' ? Math.abs(o.z - l.fixed) : Math.abs(o.x - l.fixed), along = ((l.axis === 'x' ? o.x : o.z) - c.s) * l.dir; if (perp < 1.7 && along > 0) adv = Math.min(adv, Math.max(0, along - o.sp)); } // stop for the player (on foot or in a car)
      const nx = nextCenter(c.s, l.dir), d = (nx - c.s) * l.dir, ci = Math.round(nx / GRID);
      if (Math.abs(ci) <= 5 && lightState(t, l.axis) !== 'g' && d >= halfW(ci) + 5.2 - .05) adv = Math.min(adv, Math.max(0, d - (halfW(ci) + 5.2))); // stop at the red light
      c.s += adv * l.dir; if (c.s > 118) c.s = -118; else if (c.s < -118) c.s = 118;
      const tp = TPOS[i] || (TPOS[i] = { x: 0, z: 0, r: 0 }); if (l.axis === 'x') { tp.x = c.s; tp.z = l.fixed; } else { tp.x = l.fixed; tp.z = c.s; } tp.r = l.rot;
      const g = refs.current[i]; if (g) { if (l.axis === 'x') g.position.set(c.s, 0, l.fixed); else g.position.set(l.fixed, 0, c.s); g.rotation.y = l.rot; }
    });
  });
  return <>{flat.map(({ l, c }, i) => <group key={i} ref={el => { refs.current[i] = el; }} position={l.axis === 'x' ? [c.s, 0, l.fixed] : [l.fixed, 0, c.s]} rotation={[0, l.rot, 0]}><CarModel kit={kit} color={c.color} kind={c.kind} model={c.model} /></group>)}</>;
}


/* ───────────── player transport stands: taxis + hire bikes ───────────── */
const TRANSPORT_STOPS = [
  { kind: 'taxi' as const, x: 0, z: 4.5, r: Math.PI, label: 'Taxi Stand' },
  { kind: 'taxi' as const, x: 22, z: 4.5, r: Math.PI, label: 'Taxi Stand' },
  { kind: 'taxi' as const, x: -22, z: -4.5, r: 0, label: 'Taxi Stand' },
  { kind: 'bike' as const, x: 4.5, z: 22, r: -Math.PI / 2, label: 'Bike Hire' },
  { kind: 'bike' as const, x: -4.5, z: -22, r: Math.PI / 2, label: 'Bike Hire' },
  { kind: 'bike' as const, x: 26.5, z: 22, r: -Math.PI / 2, label: 'Bike Hire' },
];
const DESTS = CITY.districts.slice(0, 8).map(d => ({ name: d.name, x: d.x, z: d.z }));
function TransportVehicles() {
  const kit = useMemo(carKit, []), [open, setOpen] = useState<{ kind: 'taxi' | 'bike'; label: string } | null>(null), [near, setNear] = useState<{ kind: 'taxi' | 'bike'; label: string; x: number; z: number } | null>(null);
  useEffect(() => { const id = setInterval(() => { const p = GAME.player; let best: typeof near = null, bd = 4.5; for (const t of TRANSPORT_STOPS) { const d = Math.hypot(p.x - t.x, p.z - t.z); if (d < bd) { bd = d; best = t; } } setNear(best); }, 180); return () => clearInterval(id); }, []);
  const ride = async (kind: 'taxi' | 'bike', d: { name: string; x: number; z: number }) => {
    const r = await fetch('/api/transport', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind }) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { GAME.notice = data.error || 'Transport unavailable.'; return; }
    GAME.notice = `${kind === 'taxi' ? '🚕 Taxi' : '🚲 Bike'} taking you to ${d.name}`;
    setOpen(null);
    setTimeout(() => { GAME.tp = { x: d.x, z: d.z }; GAME.notice = `📍 Arrived in ${d.name}`; }, 850);
  };
  return <>
    {TRANSPORT_STOPS.map((t, i) => <group key={i} position={[t.x, 0, t.z]} rotation-y={t.r} onClick={e => { e.stopPropagation(); setOpen({ kind: t.kind, label: t.label }); }}>
      {t.kind === 'taxi' ? <group><CarModel kit={kit} color="#e5b72f" kind={2} model="toyota-corolla-2024" /><mesh position={[-.05, 1.38, 0]}><boxGeometry args={[.9, .18, .8]} /><meshStandardMaterial color="#111" /></mesh></group> : <group scale={[.65,.65,.65]}><mesh position={[0,.75,0]}><boxGeometry args={[1.25,.22,.42]} /><meshStandardMaterial color="#2d8f62" /></mesh><mesh position={[.52,1.05,0]}><cylinderGeometry args={[.09,.09,.55,10]} /><meshStandardMaterial color="#20252a" /></mesh><mesh position={[-.52,1.05,0]}><cylinderGeometry args={[.09,.09,.55,10]} /><meshStandardMaterial color="#20252a" /></mesh><mesh rotation-z={Math.PI/2} position={[0,.5,.0]}><torusGeometry args={[.48,.07,8,16]} /><meshStandardMaterial color="#111" /></mesh><mesh rotation-z={Math.PI/2} position={[0,.5,.0]}><torusGeometry args={[.48,.07,8,16]} /><meshStandardMaterial color="#111" /></mesh></group>}
      <Html position={[0, 2.2, 0]} center><div className="transportTag">{t.kind === 'taxi' ? '🚕' : '🚲'} {t.label}</div></Html>
    </group>)}
    {open && near && <Html position={[near.x, 2.8, near.z]} center><div className="transportMenu"><b>{open.kind === 'taxi' ? '🚕 Choose destination' : '🚲 Hire bike'}</b>{open.kind === 'bike' && <small>Fast travel · low cost</small>}{DESTS.map(d => <button key={d.name} onClick={() => ride(open.kind, d)}>{d.name}</button>)}<button className="transportClose" onClick={() => setOpen(null)}>Cancel</button></div></Html>}
    {near && !open && <Html position={[near.x, 2.1, near.z]} center><div className="transportPrompt">{near.kind === 'taxi' ? '🚕 Tap to ride' : '🚲 Tap to hire'}</div></Html>}
    <RuntimeStyle css={`.transportTag,.transportPrompt{background:#09130fe8;color:#fff;border:1px solid #ffffff2a;border-radius:999px;padding:5px 9px;font:800 10px Inter,system-ui;white-space:nowrap;box-shadow:0 5px 14px #0006}.transportPrompt{background:#d99a42;color:#111}.transportMenu{width:170px;display:flex;flex-direction:column;gap:5px;padding:9px;background:#09130ff5;border:2px solid #111;border-radius:14px;box-shadow:0 12px 30px #0008}.transportMenu b{font-size:12px}.transportMenu small{color:#9fb5aa;font-size:9px}.transportMenu button{border:0;border-radius:8px;background:#18352a;color:#fff;padding:6px 7px;font-weight:800;font-size:10px;cursor:pointer}.transportMenu button:hover{background:#d99a42;color:#111}.transportMenu .transportClose{background:#4a2525}`} />
  </>;
}

/* ───────────── roadside advertising billboards ───────────── */
const BILLBOARDS = [
  { x: -11, z: 8, r: 0, title: 'ABUJA REAL LIFE', sub: 'Your city. Your story.' },
  { x: 11, z: -8, r: Math.PI, title: 'BIZNEST', sub: 'Build your business.' },
  { x: -33, z: 8, r: 0, title: 'YOUR AD HERE', sub: 'Reach Abuja players' },
  { x: 33, z: -8, r: Math.PI, title: 'ABUJA NIGHTS', sub: 'Work • Meet • Connect' },
  { x: 8, z: 33, r: -Math.PI / 2, title: 'NOW HIRING', sub: 'Find a job near you' },
];
function Billboards() { return <>{BILLBOARDS.map((b, i) => <group key={i} position={[b.x, 0, b.z]} rotation-y={b.r}><mesh position={[0, 2.8, 0]} castShadow><boxGeometry args={[5.2, 2.2, .16]} /><meshStandardMaterial color="#18251f" roughness={.65} /></mesh><mesh position={[0, 2.8, -.1]}><boxGeometry args={[4.85, 1.85, .05]} /><meshStandardMaterial color={i % 2 ? '#d99a42' : '#1d7654'} /></mesh><Text position={[0, 3.15, -.16]} fontSize={.34} color="#fff" anchorX="center" anchorY="middle" maxWidth={4.5}>{b.title}</Text><Text position={[0, 2.62, -.16]} fontSize={.17} color="#fff" anchorX="center" anchorY="middle" maxWidth={4.5}>{b.sub}</Text><mesh position={[-1.7, 1.05, 0]}><boxGeometry args={[.12, 2.3, .12]} /><meshStandardMaterial color="#333" /></mesh><mesh position={[1.7, 1.05, 0]}><boxGeometry args={[.12, 2.3, .12]} /><meshStandardMaterial color="#333" /></mesh></group>)}</>;
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

/* ───────────── night lighting: glow pools under street lamps ───────────── */
function LampGlow() {
  const ref = useRef<THREE.InstancedMesh>(null!), mat = useRef<THREE.MeshBasicMaterial>(null!);
  const tex = useMemo(() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d')!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,196,110,1)'); gr.addColorStop(.45, 'rgba(255,170,80,.35)'); gr.addColorStop(1, 'rgba(255,150,60,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }, []);
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    LAMP_PTS.forEach((p, i) => { o.position.set(p.x, .15, p.z); o.rotation.set(-Math.PI / 2, 0, 0); o.scale.set(9, 9, 1); o.updateMatrix(); ref.current.setMatrixAt(i, o.matrix); });
    ref.current.instanceMatrix.needsUpdate = true;
  }, []);
  useFrame(() => { const n = NIGHT.n; ref.current.visible = n > .03; mat.current.opacity = n * .6; });
  return <instancedMesh ref={ref} args={[undefined, undefined, LAMP_PTS.length]} frustumCulled={false} visible={false}>
    <planeGeometry args={[1, 1]} />
    <meshBasicMaterial ref={mat} map={tex} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
  </instancedMesh>;
}

/* ───────────── pedestrians: walk the pavements, wait for red traffic, scatter when hit ───────────── */
type Ped = { axis: 'x' | 'z'; line: number; u: number; dir: 1 | -1; sp: number; ph: number; down: number; x: number; z: number; moving: boolean; shirt: string; pants: string; skin: string };
const SHIRTS = ['#c0392b', '#2c5aa0', '#e8e8ea', '#1e9e55', '#f1c40f', '#7c3aed', '#0f766e', '#d97706', '#111827', '#be185d'];
const PANTS = ['#1f2937', '#374151', '#4b5563', '#111827', '#2b3a55', '#5b4636'];
const SKINS = ['#3b2417', '#4a2e1c', '#5a3825', '#6b4429', '#7a4f32', '#8d5f3d'];
const PED_N = 32; // Keep NPCs as light ambient life; real users are the primary population.
const pick = <T,>(a: T[], k: string) => a[Math.floor(hs(k) * a.length) % a.length];
function makePeds(): Ped[] {
  return Array.from({ length: PED_N }, (_, n) => {
    const ri = Math.floor(hs('pi' + n) * 11) - 5, side = hs('ps' + n) < .5 ? 1 : -1, axis: 'x' | 'z' = hs('pa' + n) < .5 ? 'x' : 'z';
    return { axis, line: ri * GRID + side * (halfW(ri) + 2), u: (hs('pu' + n) * 2 - 1) * 118, dir: (hs('pd' + n) < .5 ? 1 : -1) as 1 | -1, sp: 1.1 + hs('pv' + n) * .7, ph: hs('pp' + n) * 6.28, down: 0, x: 0, z: 0, moving: true, shirt: pick(SHIRTS, 'sh' + n), pants: pick(PANTS, 'pn' + n), skin: pick(SKINS, 'sk' + n) };
  });
}
const timeToGreen = (t: number, axis: 'x' | 'z') => { const c = t % 24; return axis === 'x' ? (c < 10 ? 0 : 24 - c) : (c >= 12 && c < 22 ? 0 : c < 12 ? 12 - c : 36 - c); };
const canCross = (t: number, carAxis: 'x' | 'z') => lightState(t, carAxis) === 'r' && timeToGreen(t, carAxis) > 5.5;
function Pedestrians() {
  const peds = useMemo(makePeds, []);
  const torso = useRef<THREE.InstancedMesh>(null!), head = useRef<THREE.InstancedMesh>(null!), legs = useRef<THREE.InstancedMesh>(null!), arms = useRef<THREE.InstancedMesh>(null!);
  const T = useMemo(() => ({ base: new THREE.Matrix4(), m: new THREE.Matrix4(), t: new THREE.Matrix4(), r: new THREE.Matrix4(), pos: new THREE.Vector3(), one: new THREE.Vector3(1, 1, 1), qa: new THREE.Quaternion(), qb: new THREE.Quaternion(), q: new THREE.Quaternion(), Y: new THREE.Vector3(0, 1, 0), Z: new THREE.Vector3(0, 0, 1) }), []);
  useLayoutEffect(() => {
    const c = new THREE.Color();
    peds.forEach((p, i) => {
      torso.current.setColorAt(i, c.set(p.shirt)); head.current.setColorAt(i, c.set(p.skin));
      for (let s = 0; s < 2; s++) { legs.current.setColorAt(i * 2 + s, c.set(p.pants)); arms.current.setColorAt(i * 2 + s, c.set(p.shirt)); }
    });
    for (const m of [torso, head, legs, arms]) if (m.current.instanceColor) m.current.instanceColor.needsUpdate = true;
  }, [peds]);
  useFrame((st, dtRaw) => {
    const dt = Math.min(dtRaw, .05), t = st.clock.elapsedTime;
    const part = (mesh: THREE.InstancedMesh, idx: number, tx: number, ty: number, tz: number, rz = 0, dy = 0) => {
      T.t.makeTranslation(tx, ty, tz); T.m.copy(T.base).multiply(T.t);
      if (rz) { T.r.makeRotationZ(rz); T.m.multiply(T.r); }
      if (dy) { T.t.makeTranslation(0, dy, 0); T.m.multiply(T.t); }
      mesh.setMatrixAt(idx, T.m);
    };
    peds.forEach((p, i) => {
      let fall = 0; p.moving = false;
      if (p.down > 0) { p.down -= dt; fall = Math.min(1, (3.2 - p.down) / .25) * Math.min(1, Math.max(0, p.down) / .35); }
      else {
        let go = true;
        const nx = nextCenter(p.u, p.dir), rj = Math.round(nx / GRID);
        if (Math.abs(rj) <= 5) { const dist = (nx - p.u) * p.dir - (halfW(rj) + .3); if (dist > -.05 && dist < .5 && !canCross(t, p.axis === 'x' ? 'z' : 'x')) go = false; } // wait at the kerb for a red light
        if (go) { p.u += p.dir * p.sp * dt; p.ph += dt * p.sp * 5; p.moving = true; if (p.u > 124) p.dir = -1; else if (p.u < -124) p.dir = 1; }
      }
      if (p.axis === 'x') { p.x = p.u; p.z = p.line; } else { p.x = p.line; p.z = p.u; }
      if (p.down <= 0 && VEH.drv && Math.abs(VEH.v) > 3.5) { const dx = p.x - VEH.x, dz = p.z - VEH.z; if (dx * dx + dz * dz < 3.6) { p.down = 3.2; VEH.v *= .9; thud(.5); } } // clipped by the player's car
      const yaw = p.axis === 'x' ? (p.dir > 0 ? 0 : Math.PI) : -p.dir * Math.PI / 2, sw = p.moving ? Math.sin(p.ph) : 0;
      T.qa.setFromAxisAngle(T.Y, yaw); T.qb.setFromAxisAngle(T.Z, -fall * Math.PI / 2); T.q.copy(T.qa).multiply(T.qb);
      T.pos.set(p.x, .12 * fall + (p.moving ? Math.abs(sw) * .03 : 0), p.z); T.base.compose(T.pos, T.q, T.one);
      part(torso.current, i, 0, 1.05, 0); part(head.current, i, 0, 1.52, 0);
      part(legs.current, i * 2, 0, .78, .1, sw * .7, -.38); part(legs.current, i * 2 + 1, 0, .78, -.1, -sw * .7, -.38);
      part(arms.current, i * 2, 0, 1.3, .27, -sw * .6, -.25); part(arms.current, i * 2 + 1, 0, 1.3, -.27, sw * .6, -.25);
    });
    for (const m of [torso, head, legs, arms]) m.current.instanceMatrix.needsUpdate = true;
  });
  return <>
    <instancedMesh ref={torso} args={[undefined, undefined, PED_N]} frustumCulled={false} castShadow><boxGeometry args={[.26, .56, .46]} /><meshStandardMaterial roughness={.9} /></instancedMesh>
    <instancedMesh ref={head} args={[undefined, undefined, PED_N]} frustumCulled={false}><sphereGeometry args={[.14, 10, 8]} /><meshStandardMaterial roughness={.8} /></instancedMesh>
    <instancedMesh ref={legs} args={[undefined, undefined, PED_N * 2]} frustumCulled={false}><boxGeometry args={[.15, .76, .17]} /><meshStandardMaterial roughness={.9} /></instancedMesh>
    <instancedMesh ref={arms} args={[undefined, undefined, PED_N * 2]} frustumCulled={false}><boxGeometry args={[.11, .52, .11]} /><meshStandardMaterial roughness={.9} /></instancedMesh>
  </>;
}

/* ───────────── the player's car ───────────── */
const CAR_COLOR = '#ff6a00';
function PlayerCar({ carRef, tagRef, spotRef, model }: { carRef: React.MutableRefObject<THREE.Group>; tagRef: React.MutableRefObject<HTMLDivElement | null>; spotRef: React.MutableRefObject<THREE.SpotLight>; model: string }) {
  const kit = pkit(), tgt = useMemo(() => new THREE.Object3D(), []);
  useLayoutEffect(() => { spotRef.current.target = tgt; }, [tgt, spotRef]);
  return <group ref={carRef} visible={false}>
    <CarModel kit={kit} color={vehicleByName(model).color || CAR_COLOR} kind={0} model={model} />
    <spotLight ref={spotRef} position={[2.2, .9, 0]} angle={.5} penumbra={.7} intensity={0} distance={42} decay={2} color="#fff4d6" />
    <primitive object={tgt} position={[16, .2, 0]} />
    <Html position={[0, 2.4, 0]} center><div ref={el => { tagRef.current = el; }} className="cityBizTag" style={{ display: 'none' }}>Your car<br /><small>Press E</small></div></Html>
  </group>;
}
// put the car in the nearest lane (right-hand traffic), a few metres ahead of the player, clear of other cars
function placeCar(px: number, pz: number, pr: number) {
  const ix = Math.round(px / GRID), iz = Math.round(pz / GRID), alongZ = Math.abs(px - ix * GRID) <= Math.abs(pz - iz * GRID);
  const idx = alongZ ? ix : iz, off = halfW(idx) * .5, face = alongZ ? Math.cos(pr) : Math.sin(pr), sgn: 1 | -1 = face >= 0 ? 1 : -1;
  let a = (alongZ ? pz : px) + sgn * 3;
  const lane = idx * GRID + (alongZ ? (sgn === 1 ? -off : off) : (sgn === 1 ? off : -off));
  for (let tries = 0; tries < 8; tries++) {
    const cx = alongZ ? lane : a, cz = alongZ ? a : lane;
    if (!TPOS.some(c => Math.hypot(c.x - cx, c.z - cz) < 3.6)) break;
    a += sgn * 6;
  }
  a = THREE.MathUtils.clamp(a, -120, 120);
  VEH.x = alongZ ? lane : a; VEH.z = alongZ ? a : lane;
  VEH.r = alongZ ? -sgn * Math.PI / 2 : (sgn === 1 ? 0 : Math.PI);
  VEH.v = 0; VEH.placed = true; VEH.drv = false;
}

/* ───────────── collision ───────────── */
const BODY = .45;
const SOLIDS = [
  ...BUILDS.map(b => ({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 })),
  { x0: AIR.x - 4.5 * AIR.s, x1: AIR.x + 4.5 * AIR.s, z0: AIR.z - 7 * AIR.s - 2.5 * AIR.s, z1: AIR.z - 7 * AIR.s + 2.5 * AIR.s },
];
function pushOut(p: { x: number; z: number }, rad = BODY) {
  for (const s of SOLIDS) {
    if (p.x < s.x0 - rad || p.x > s.x1 + rad || p.z < s.z0 - rad || p.z > s.z1 + rad) continue;
    const cx = Math.min(Math.max(p.x, s.x0), s.x1), cz = Math.min(Math.max(p.z, s.z0), s.z1);
    const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= rad * rad) continue;
    if (d2 > 1e-6) { const d = Math.sqrt(d2); p.x = cx + dx / d * rad; p.z = cz + dz / d * rad; }
    else { const l = p.x - s.x0, r = s.x1 - p.x, t = p.z - s.z0, b = s.z1 - p.z, m = Math.min(l, r, t, b); if (m === l) p.x = s.x0 - rad; else if (m === r) p.x = s.x1 + rad; else if (m === t) p.z = s.z0 - rad; else p.z = s.z1 + rad; }
  }
}
const distTo = (s: { x0: number; x1: number; z0: number; z1: number }, x: number, z: number) => Math.hypot(Math.max(s.x0 - x, 0, x - s.x1), Math.max(s.z0 - z, 0, z - s.z1));

/* ───────────── city navigation ─────────────
 * The interior collision/pathfinding helper has a small-room coordinate system,
 * so the outdoor city needs its own bounded navigator. It plans on the same
 * world coordinates used by the 3D city and treats building footprints as solid.
 */
type CityBlk = { id: string; x0: number; x1: number; z0: number; z1: number };
const BL: CityBlk[] = BUILDS.map(b => ({
  id: b.id,
  x0: b.x - b.w / 2 - .65,
  x1: b.x + b.w / 2 + .65,
  z0: b.z - b.d / 2 - .65,
  z1: b.z + b.d / 2 + .65,
}));
const NAV_STEP = 2;
const NAV_MIN = -132;
const NAV_MAX = 132;
const navBlocked = (blks: CityBlk[], x: number, z: number) =>
  x < NAV_MIN || x > NAV_MAX || z < NAV_MIN || z > NAV_MAX ||
  blks.some(b => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1);
const navKey = (x: number, z: number) => `${Math.round(x / NAV_STEP)},${Math.round(z / NAV_STEP)}`;
const navPoint = (x: number, z: number): [number, number] => [
  THREE.MathUtils.clamp(Math.round(x / NAV_STEP) * NAV_STEP, NAV_MIN, NAV_MAX),
  THREE.MathUtils.clamp(Math.round(z / NAV_STEP) * NAV_STEP, NAV_MIN, NAV_MAX),
];
function nearestNavFree(blks: CityBlk[], target: [number, number]): [number, number] {
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
function findPath(blks: CityBlk[], from: [number, number], to: [number, number]): [number, number][] {
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
  while (open.length && closed.size < 18000) {
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

/* ───────────── the 3D scene ───────────── */
const START = { x: 0, z: 16 };
export const GAME = { jailed: false, hasCar: false, vehicleModel: 'Toyota Camry', notice: '', tp: null as { x: number; z: number } | null, nav: null as { x: number; z: number; name: string } | null, player: { x: START.x, z: START.z } }; // set by the game layer; while true the player is locked inside the cell
const CELL = { x: JAIL_CELL_POS.x, z: JAIL_CELL_POS.z, h: 2.6 };
const sm = THREE.MathUtils.smoothstep;
const SKY = { day: new THREE.Color('#8fc3ea'), dusk: new THREE.Color('#ee9a68'), night: new THREE.Color('#060b19'), fogDay: new THREE.Color('#c9dff0'), fogDusk: new THREE.Color('#e3a888'), fogNight: new THREE.Color('#0a1226'), sun: new THREE.Color('#fff3e0'), sunLow: new THREE.Color('#ffb070'), moon: new THREE.Color('#8fa6e8') };
function JailCell() {
  const bars = Array.from({ length: 13 }, (_, i) => -3 + i * .5);
  return <group position={[CELL.x, 0, CELL.z]}>
    <mesh rotation-x={-Math.PI / 2} position={[0, .02, 0]}><planeGeometry args={[6, 6]} /><meshStandardMaterial color="#4a4a4a" /></mesh>
    {[-3, 3].map(o => bars.map(b => <group key={o + '_' + b}><mesh position={[b, CELL.h / 2, o]}><cylinderGeometry args={[.04, .04, CELL.h, 6]} /><meshStandardMaterial color="#222" /></mesh><mesh position={[o, CELL.h / 2, b]}><cylinderGeometry args={[.04, .04, CELL.h, 6]} /><meshStandardMaterial color="#222" /></mesh></group>))}
    <mesh position={[0, CELL.h, 0]}><boxGeometry args={[6.2, .12, 6.2]} /><meshStandardMaterial color="#333" /></mesh>
    <mesh position={[-2, .35, -2]}><boxGeometry args={[1.8, .5, .8]} /><meshStandardMaterial color="#6b5a48" /></mesh>
    <Text position={[0, CELL.h + .6, 3]} fontSize={.4} color="#fff" anchorX="center">JAIL CELL</Text>
  </group>;
}
const CAR_R = 1, CAR_OFFS = [-1.35, 0, 1.35];
function Scene({ look, ctl, hud, setNear, getMinute, roster, ver, bub, onPick }: { look: Look; ctl: React.MutableRefObject<Ctl>; hud: React.MutableRefObject<Hud>; setNear: (b: any) => void; getMinute?: () => number; roster: string[]; ver: number; bub: Record<string, string>; onPick: (n: string) => void }) {
  const P = useRef({ x: START.x, z: START.z, y: 0, vy: 0, r: Math.PI });
  const group = useRef<THREE.Group>(null!), controls = useRef<any>(null), sun = useRef<THREE.DirectionalLight>(null!), hemi = useRef<THREE.HemisphereLight>(null!), stars = useRef<THREE.Group>(null!);
  const carG = useRef<THREE.Group>(null!), carTag = useRef<HTMLDivElement | null>(null), spot = useRef<THREE.SpotLight>(null!), nameTag = useRef<HTMLDivElement | null>(null);
  const sunTarget = useMemo(() => new THREE.Object3D(), []);
  const moving = useRef(false), running = useRef(false), nearId = useRef<string | null>(null);
  const drag = useRef({ on: false, end: 0 }), lastN = useRef(-1), fov = useRef(52), hitCool = useRef(0), shown = useRef({ drv: false, placed: false });
  const nav = useRef<{ key: string; points: [number, number][]; i: number } | null>(null);
  const [near, setN] = useState<any>(null);
  const [touchDevice, setTouchDevice] = useState(false);
  const [vehicleModel, setVehicleModel] = useState(GAME.vehicleModel);
  useEffect(() => { let dead = false; const load = async () => { try { const r = await fetch('/api/vehicles'); if (!r.ok) return; const d = await r.json(); const m = d.active || GAME.vehicleModel; if (!dead) { GAME.vehicleModel = m; setVehicleModel(m); } } catch {} }; load(); const id = setInterval(load, 8000); return () => { dead = true; clearInterval(id); }; }, []);
  useEffect(() => { const m = window.matchMedia('(pointer: coarse), (max-width: 700px)'); const sync = () => setTouchDevice(m.matches); sync(); m.addEventListener?.('change', sync); return () => m.removeEventListener?.('change', sync); }, []);
  const nearBuilding = near ? BUILDS.find(x => x.business?.id === near.id) : null;
  useEffect(() => { sun.current.target = sunTarget; }, [sunTarget]);
  useEffect(() => {
    VEH.drv = false;
    const oc = controls.current; if (!oc) return;
    const s = () => { drag.current.on = true; }, e = () => { drag.current.on = false; drag.current.end = performance.now(); };
    oc.addEventListener('start', s); oc.addEventListener('end', e);
    return () => { oc.removeEventListener('start', s); oc.removeEventListener('end', e); engineStop(); VEH.drv = false; OBS[0].on = false; OBS[1].on = false; };
  }, []);

  useFrame((st, dtRaw) => {
    const dt = Math.min(dtRaw, .05), c = ctl.current, k = c.keys, p = P.current, oc = controls.current;
    if (!oc) return;

    // Camera look is driven by the dedicated right-side look pad on touch devices.
    // This keeps movement and camera input completely separate, so walking never
    // accidentally spins the camera.
    if (c.look.x || c.look.y) {
      oc.setAzimuthalAngle?.(oc.getAzimuthalAngle() - c.look.x * 0.006);
      oc.setPolarAngle?.(THREE.MathUtils.clamp(oc.getPolarAngle() + c.look.y * 0.004, .34, Math.PI / 2.05));
      c.look = { x: 0, y: 0 };
    }

    /* ── time of day (follows the in-game clock) ── */
    const hrs = ((((getMinute ? getMinute() : 12 * 60) / 60) % 24) + 24) % 24, ang = (hrs - 6) / 12 * Math.PI, el = Math.sin(ang);
    const day = sm(el, -.08, .3), n = 1 - day, dusk = Math.min(1, Math.max(0, 1 - Math.abs(el) / .28)) * .75;
    NIGHT.n = n;
    const bg = st.scene.background as THREE.Color | null; if (bg) bg.copy(SKY.night).lerp(SKY.day, day).lerp(SKY.dusk, dusk);
    const fg = st.scene.fog as THREE.Fog | null; if (fg) fg.color.copy(SKY.fogNight).lerp(SKY.fogDay, day).lerp(SKY.fogDusk, dusk);
    hemi.current.intensity = .22 + 1.03 * day;
    sun.current.intensity = .5 + 2.3 * day; sun.current.color.copy(SKY.moon).lerp(SKY.sun, day).lerp(SKY.sunLow, dusk * day);
    const sy = Math.max(.32, Math.abs(Math.sin(ang))), sx = Math.cos(ang);
    if (Math.abs(n - lastN.current) > .01) { lastN.current = n; MATS.forEach(m => { m.emissiveIntensity = n * 1.2; }); if (stars.current) stars.current.visible = n > .4; }

    /* ── camera basis / input ── */
    const cam = st.camera, t = oc.target as THREE.Vector3;
    let fx = t.x - cam.position.x, fz = t.z - cam.position.z; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    if (GAME.nav && (!nav.current || nav.current.key !== `${GAME.nav.x}:${GAME.nav.z}`)) {
      const pts = findPath(BL, [p.x, p.z], [GAME.nav.x, GAME.nav.z]);
      nav.current = { key: `${GAME.nav.x}:${GAME.nav.z}`, points: pts.length ? pts : [[GAME.nav.x, GAME.nav.z]], i: 0 };
    } else if (!GAME.nav) nav.current = null;
    let ix = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0) + c.joy.x;
    let iy = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0) - c.joy.y;
    if (nav.current && !VEH.drv && !ix && !iy && GAME.nav) {
      while (nav.current.i < nav.current.points.length - 1 && Math.hypot(p.x - nav.current.points[nav.current.i][0], p.z - nav.current.points[nav.current.i][1]) < 1.25) nav.current.i++;
      const [nx, nz] = nav.current.points[nav.current.i] || [GAME.nav.x, GAME.nav.z];
      const dx = nx - p.x, dz = nz - p.z, len = Math.hypot(dx, dz) || 1;
      const wx = dx / len, wz = dz / len;
      ix = wx * fx + wz * fz;
      iy = wx * -fz + wz * fx;
      if (Math.hypot(p.x - GAME.nav.x, p.z - GAME.nav.z) < 1.6 || nav.current.i >= nav.current.points.length - 1 && Math.hypot(p.x - nx, p.z - nz) < 1.2) {
        const arrived = GAME.nav.name; GAME.nav = null; nav.current = null; GAME.notice = `📍 Arrived at ${arrived}`; ix = 0; iy = 0;
      }
    }
    let wantJump = c.jump || k.has(' '), wantRun = c.run || k.has('shift');
    const gp = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads()[0] : null;
    if (gp) {
      const dz = (v: number) => (Math.abs(v) > .15 ? v : 0), cx = dz(gp.axes[2] || 0), cy = dz(gp.axes[3] || 0);
      ix += dz(gp.axes[0] || 0); iy -= dz(gp.axes[1] || 0);
      if (cx || cy) { oc.setAzimuthalAngle?.(oc.getAzimuthalAngle() - cx * dt * 1.8); oc.setPolarAngle?.(THREE.MathUtils.clamp(oc.getPolarAngle() + cy * dt * 1.15, .34, Math.PI / 2.05)); }
      if (gp.buttons[0]?.pressed) wantJump = true;
      if (gp.buttons[7]?.pressed || gp.buttons[10]?.pressed || gp.buttons[1]?.pressed) wantRun = true;
    }
    const m = Math.hypot(ix, iy); if (m > 1) { ix /= m; iy /= m; }
    const mag = Math.min(m, 1);
    let snapCam = false;

    /* ── E: get in / get out / call car, H: horn ── */
    if (c.interact) {
      c.interact = false;
      if (VEH.drv) {
        VEH.drv = false; VEH.v = 0; engineStop();
        const lx = -Math.sin(VEH.r), lz = -Math.cos(VEH.r);
        p.x = VEH.x + lx * 2.4; p.z = VEH.z + lz * 2.4; pushOut(p); p.r = Math.atan2(lx, lz); p.y = 0; p.vy = 0;
      } else if (VEH.placed && Math.hypot(p.x - VEH.x, p.z - VEH.z) < 9) {
        VEH.drv = true; VEH.v = 0; engineStart(); snapCam = true;
        nearId.current = null; setN(null); setNear(null);
      } else if (GAME.hasCar) placeCar(p.x, p.z, p.r);
      else GAME.notice = '🚗 You do not own a car yet. Buy one at a Car Dealer.';
    }
    if (c.horn) { c.horn = false; if (VEH.drv) honk(); }

    if (VEH.drv) {
      /* ── driving: arcade physics ── */
      const V = VEH, vmax = wantRun ? 34 : 25;
      if (iy > .05) V.v += iy * (V.v < 0 ? 28 : wantRun ? 16 : 12) * dt;
      else if (iy < -.05) V.v += iy * (V.v > 0 ? 26 : 9) * dt;
      else V.v -= Math.sign(V.v) * Math.min(Math.abs(V.v), 3.5 * dt);
      if (wantJump) V.v -= Math.sign(V.v) * Math.min(Math.abs(V.v), 34 * dt);
      V.v = THREE.MathUtils.clamp(V.v, -8, vmax);
      V.brake = (iy < -.05 && V.v > .5) || (wantJump && Math.abs(V.v) > .5);
      const auth = THREE.MathUtils.clamp(V.v / 4, -1, 1) * (1 - Math.min(.55, Math.abs(V.v) / 55));
      V.r -= ix * 2.1 * auth * (wantJump ? 1.5 : 1) * dt;
      V.x += Math.cos(V.r) * V.v * dt; V.z -= Math.sin(V.r) * V.v * dt;
      hitCool.current -= dt;
      let hit = 0; const fxw = Math.cos(V.r), fzw = -Math.sin(V.r);
      for (const o of CAR_OFFS) { // buildings
        const cp = { x: V.x + fxw * o, z: V.z + fzw * o }, ox = cp.x, oz = cp.z; pushOut(cp, CAR_R);
        const dx = cp.x - ox, dz = cp.z - oz; if (dx || dz) { V.x += dx; V.z += dz; hit = Math.max(hit, Math.hypot(dx, dz)); }
      }
      for (const tc of TPOS) { // other cars
        const tx = Math.cos(tc.r), tz = -Math.sin(tc.r);
        for (const to of [-1.1, 1.1]) for (const o of CAR_OFFS) {
          const ax = tc.x + tx * to, az = tc.z + tz * to, bx = V.x + fxw * o, bz = V.z + fzw * o, dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz);
          if (d < CAR_R * 2 && d > 1e-4) { const push = CAR_R * 2 - d; V.x += dx / d * push; V.z += dz / d * push; hit = Math.max(hit, push); }
        }
      }
      if (hit > .01) { if (hitCool.current <= 0 && Math.abs(V.v) > 4) { thud(Math.abs(V.v) / 20); hitCool.current = .35; } V.v *= hit > .15 ? .55 : .93; }
      const lim = LIM - 2; if (Math.abs(V.x) > lim || Math.abs(V.z) > lim) { V.x = THREE.MathUtils.clamp(V.x, -lim, lim); V.z = THREE.MathUtils.clamp(V.z, -lim, lim); V.v *= .6; }
      p.x = V.x; p.z = V.z; p.y = 0; p.vy = 0;
      engineSet(Math.abs(V.v) / 30, Math.max(0, iy));
    } else {
      /* ── on foot ── */
      moving.current = mag > .08; running.current = wantRun;
      const wx = ix * -fz + iy * fx, wz = ix * fx + iy * fz;
      if (moving.current) {
        const sp = wantRun ? 9 : 4.6;
        p.x += wx * sp * dt; p.z += wz * sp * dt;
        p.r += wrap(Math.atan2(wx, wz) - p.r) * Math.min(1, dt * 12);
      }
      pushOut(p);
      for (const tc of TPOS) { // cars are solid
        const tx = Math.cos(tc.r), tz = -Math.sin(tc.r);
        for (const to of [-1.1, 1.1]) { const ax = tc.x + tx * to, az = tc.z + tz * to, dx = p.x - ax, dz = p.z - az, d = Math.hypot(dx, dz); if (d < 1.45 && d > 1e-4) { p.x = ax + dx / d * 1.45; p.z = az + dz / d * 1.45; } }
      }
      if (VEH.placed) { const fxw = Math.cos(VEH.r), fzw = -Math.sin(VEH.r); for (const o of CAR_OFFS) { const ax = VEH.x + fxw * o, az = VEH.z + fzw * o, ex = p.x - ax, ez = p.z - az, d = Math.hypot(ex, ez); if (d < 1.4 && d > 1e-4) { p.x = ax + ex / d * 1.4; p.z = az + ez / d * 1.4; } } } // your parked car is solid too
      p.x = THREE.MathUtils.clamp(p.x, -LIM, LIM); p.z = THREE.MathUtils.clamp(p.z, -LIM, LIM);
      if (GAME.tp) { p.x = GAME.tp.x; p.z = GAME.tp.z; GAME.tp = null; }
      if (GAME.jailed) { VEH.drv = false; p.x = THREE.MathUtils.clamp(Math.abs(p.x - CELL.x) > 3 ? CELL.x : p.x, CELL.x - 2.6, CELL.x + 2.6); p.z = THREE.MathUtils.clamp(Math.abs(p.z - CELL.z) > 3 ? CELL.z : p.z, CELL.z - 2.6, CELL.z + 2.6); }
      if (wantJump && p.y <= .001) p.vy = 6.2;
      c.jump = false;
      p.vy -= 18 * dt; p.y += p.vy * dt; if (p.y < 0) { p.y = 0; p.vy = 0; }
      if (VEH.placed && Math.hypot(p.x - VEH.x, p.z - VEH.z) > 70) VEH.placed = false; // car you walked away from goes back to the garage
    }
    c.jump = false;
    GAME.player.x = p.x; GAME.player.z = p.z;
    group.current.position.set(p.x, p.y, p.z); group.current.rotation.y = p.r;
    group.current.visible = !VEH.drv;
    if (nameTag.current && shown.current.drv !== VEH.drv) nameTag.current.style.visibility = VEH.drv ? 'hidden' : 'visible';

    /* ── car mesh, brake lights, headlights, floating label ── */
    if (carG.current) {
      carG.current.visible = VEH.placed; carG.current.position.set(VEH.x, 0, VEH.z); carG.current.rotation.y = VEH.r;
      (pkit().tailM as THREE.MeshStandardMaterial).emissiveIntensity = VEH.drv && VEH.brake ? 3.2 : 1.2;
      spot.current.intensity = VEH.drv || VEH.placed ? NIGHT.n * 220 : 0;
    }
    if (carTag.current) { const want = VEH.placed && !VEH.drv ? 'block' : 'none'; if (carTag.current.style.display !== want) carTag.current.style.display = want; }
    shown.current = { drv: VEH.drv, placed: VEH.placed };
    OBS[0].x = p.x; OBS[0].z = p.z; OBS[0].on = !VEH.drv;
    OBS[1].x = VEH.x; OBS[1].z = VEH.z; OBS[1].on = VEH.placed;

    /* ── camera ── */
    const ox = t.x, oy = t.y, oz = t.z, ty = VEH.drv ? 1.3 : 1.5 + p.y * .5;
    t.set(p.x, ty, p.z); cam.position.add(new THREE.Vector3(p.x - ox, ty - oy, p.z - oz));
    if (VEH.drv) {
      const bx = Math.cos(VEH.r), bz = -Math.sin(VEH.r);
      if (snapCam) cam.position.set(VEH.x - bx * 10, 4.8, VEH.z - bz * 10);
      else if (!drag.current.on && performance.now() - drag.current.end > 1800 && Math.abs(VEH.v) > 1.5) {
        const d = THREE.MathUtils.clamp(Math.hypot(cam.position.x - VEH.x, cam.position.z - VEH.z), 6, 16), kk = 1 - Math.exp(-dt * 2.6);
        cam.position.x += (VEH.x - bx * d - cam.position.x) * kk; cam.position.z += (VEH.z - bz * d - cam.position.z) * kk; cam.position.y += (4.8 - cam.position.y) * kk * .5;
      }
    }
    const pc = cam as THREE.PerspectiveCamera, wantFov = VEH.drv ? 52 + Math.min(14, Math.abs(VEH.v) * .5) : 52;
    if (Math.abs(fov.current - wantFov) > .05) { fov.current += (wantFov - fov.current) * Math.min(1, dt * 4); pc.fov = fov.current; pc.updateProjectionMatrix(); }
    if (c.recenter) { c.recenter = false; const d = Math.hypot(cam.position.x - p.x, cam.position.z - p.z), r = VEH.drv ? VEH.r : p.r, bx = VEH.drv ? Math.cos(r) : Math.sin(r), bz = VEH.drv ? -Math.sin(r) : Math.cos(r); cam.position.set(p.x - bx * d, cam.position.y, p.z - bz * d); }
    sunTarget.position.set(p.x, 0, p.z); sun.current.position.set(p.x + sx * 70, sy * 70 + 8, p.z + 25);

    { const M = NET.me; M.x = p.x; M.z = p.z; M.r = p.r; M.mv = moving.current ? (running.current ? 2 : 1) : 0; M.drv = VEH.drv; M.cp = VEH.placed; M.cx = VEH.x; M.cz = VEH.z; M.cr = VEH.r; }
    /* ── HUD + nearest business ── */
    const dCar = Math.hypot(p.x - VEH.x, p.z - VEH.z);
    hud.current = { x: p.x, z: p.z, fx, fz, r: p.r, vx: VEH.x, vz: VEH.z, vp: VEH.placed, spd: Math.abs(VEH.v) * 3.6, drv: VEH.drv, prompt: VEH.drv ? 'E exit · Space handbrake · Shift boost · H horn' : VEH.placed && dCar < 9 ? 'E — Get in your car' : GAME.hasCar ? 'E — Call your car' : '' };
    if (!VEH.drv) {
      let best: CityBuilding | null = null, bd = 2.6;
      for (const b of BUILDS) { const d = distTo({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 }, p.x, p.z); if (d < bd && b.business) { bd = d; best = b; } }
      const id = best?.business?.id ?? null;
      if (id !== nearId.current) { nearId.current = id; setN(best?.business ?? null); setNear(best?.business ?? null); }
    }
  });

  return (
    <>
      <color attach="background" args={['#8fc3ea']} />
      <fog attach="fog" args={['#c9dff0', 90, 270]} />
      <hemisphereLight ref={hemi} args={['#dff0ff', '#6b7a5a', 1.25]} />
      <directionalLight ref={sun} position={[40, 60, 25]} color="#fff3e0" intensity={2.8} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-46} shadow-camera-right={46} shadow-camera-top={46} shadow-camera-bottom={-46} shadow-camera-near={1} shadow-camera-far={190} shadow-bias={-0.0004} />
      <primitive object={sunTarget} />
      <group ref={stars} visible={false}><Stars radius={250} depth={40} count={1500} factor={5} fade /></group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[700, 700]} /><meshStandardMaterial color="#5d7f55" /></mesh>
      <Roads />
      <Billboards />
      <TransportVehicles />
      <Inst items={SLABS} color="#b4b6b2" h={.12} y={.06} receive />
      <Inst items={MARKS.yellow} color="#f2b705" h={.02} y={.025} />
      <Inst items={MARKS.white} color="#f4f1e4" h={.02} y={.025} />
      <Inst items={MARKS.zebra} color="#f4f1e4" h={.02} y={.025} />
      <Trees />
      <StreetLamps />
      <LampGlow />
      <Signals />
      {BUILDS.map(b => <Building key={b.id} b={b} />)}
      <Traffic />
      <Pedestrians />
      <PlayerCar carRef={carG} tagRef={carTag} spotRef={spot} model={vehicleModel} />
      <TrainLine />
      <Airport />
      <JailCell />
      <group ref={group}>
        <Human look={look} getState={() => (moving.current ? 'walk' : 'idle')} getAnim={() => { const m = NET.me; if (moving.current) return undefined; return m.anim && Date.now() < m.animUntil ? m.anim : m.call ? 'phone' : undefined; }} getSpeed={() => (running.current ? 2.4 : 1.1)} />
        <Html position={[0, 2.8, 0]} center><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>{bub[look.name] && <div className="cwSay">{bub[look.name]}</div>}<div ref={el => { nameTag.current = el; }} className="cityNameTag" style={{ display: 'none' }}>{look.name}</div></div></Html>
      </group>
      <RemotePlayers roster={roster} ver={ver} bub={bub} onPick={onPick} />
      <OrbitControls ref={controls} makeDefault enableRotate={!touchDevice} enablePan={false} enableDamping dampingFactor={.12} rotateSpeed={.38} minDistance={4.5} maxDistance={18} minPolarAngle={.34} maxPolarAngle={Math.PI / 2.05} target={[START.x, 1.5, START.z]} />
    </>
  );
}

/* ───────────── other real players ───────────── */
const rWalk = (n: string) => { const q = NET.peers[n]; return !!q && q.mv > 0 && Math.hypot(q.tx - q.x, q.tz - q.z) > .08; };
function Remote({ name, bub, onPick }: { name: string; bub?: string; onPick: (n: string) => void }) {
  const body = useRef<THREE.Group>(null!), car = useRef<THREE.Group>(null!), hum = useRef<THREE.Group>(null!), tag = useRef<HTMLDivElement | null>(null);
  const kit = pkit(), remoteModel = VEHICLE_CATALOG[Math.floor(hs(name) * VEHICLE_CATALOG.length)].id, colour = useMemo(() => vehicleById(remoteModel).color, [remoteModel]);
  useFrame((_, dtRaw) => {
    const q = NET.peers[name]; if (!q || !body.current) return;
    const dt = Math.min(dtRaw, .1), k = 1 - Math.exp(-dt * 9);
    q.x += (q.tx - q.x) * k; q.z += (q.tz - q.z) * k; q.r += wrap(q.tr - q.r) * k;
    q.cx += (q.tcx - q.cx) * k; q.cz += (q.tcz - q.cz) * k; q.cr += wrap(q.tcr - q.cr) * k;
    const d = Math.hypot(NET.me.x - q.x, NET.me.z - q.z), near = d < 150;
    body.current.visible = near && !q.drv; body.current.position.set(q.x, 0, q.z); body.current.rotation.y = q.r;
    car.current.visible = near && (q.cp || q.drv); car.current.position.set(q.cx, 0, q.cz); car.current.rotation.y = q.cr;
    if (tag.current) tag.current.style.display = d < 45 ? '' : 'none';
  });
  const p = NET.peers[name]; if (!p) return null;
  return <>
    <group ref={body} onClick={e => { if (e.delta > 6) return; e.stopPropagation(); onPick(name); }}>
      <Human look={p.look} getState={() => (rWalk(name) ? 'walk' : 'idle')} getAnim={() => { const q = NET.peers[name]; if (!q || rWalk(name)) return undefined; return q.anim && Date.now() < q.animUntil ? q.anim : q.call ? 'phone' : undefined; }} getSpeed={() => ((NET.peers[name]?.mv || 0) === 2 ? 2.4 : 1.1)} />
      <Html position={[0, 2.8, 0]} center zIndexRange={[5, 0]}><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }} ref={el => { tag.current = el; }}>{bub && <div className="cwSay">{bub}</div>}<div className="cityNameTag cwTapTag" onClick={() => onPick(name)}>{name}</div></div></Html>
    </group>
    <group ref={car} visible={false}><CarModel kit={kit} color={colour} kind={0} model={remoteModel} /></group>
  </>;
}
function RemotePlayers({ roster, ver, bub, onPick }: { roster: string[]; ver: number; bub: Record<string, string>; onPick: (n: string) => void }) {
  void ver;
  return <>{roster.map(n => <Remote key={n} name={n} bub={bub[n]} onPick={onPick} />)}</>;
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
function LookPad({ ctl }: { ctl: React.MutableRefObject<Ctl> }) {
  const active = useRef<number | null>(null);
  const last = useRef({ x: 0, y: 0 });
  return <div className="cwLookPad" aria-label="Camera look area"
    onPointerDown={e => { active.current = e.pointerId; last.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); }}
    onPointerMove={e => { if (active.current !== e.pointerId) return; ctl.current.look = { x: e.clientX - last.current.x, y: e.clientY - last.current.y }; last.current = { x: e.clientX, y: e.clientY }; }}
    onPointerUp={() => { active.current = null; ctl.current.look = { x: 0, y: 0 }; }}
    onPointerCancel={() => { active.current = null; ctl.current.look = { x: 0, y: 0 }; }}
  ><span>↔ LOOK</span></div>;
}
function Minimap({ hud, onOpen }: { hud: React.MutableRefObject<Hud>; onOpen?: () => void }) {
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
      if (h.vp) { g.fillStyle = '#ff6a00'; g.strokeStyle = '#000'; g.lineWidth = .3; g.fillRect(h.vx - 1.6, h.vz - 1.6, 3.2, 3.2); g.strokeRect(h.vx - 1.6, h.vz - 1.6, 3.2, 3.2); }
      g.save(); g.translate(h.x, h.z); g.rotate(Math.PI - h.r); g.fillStyle = '#ffd23f'; g.strokeStyle = '#000'; g.lineWidth = .3;
      g.beginPath(); g.moveTo(0, -3); g.lineTo(2.1, 2.1); g.lineTo(0, 1); g.lineTo(-2.1, 2.1); g.closePath(); g.fill(); g.stroke(); g.restore();
    };
    raf = requestAnimationFrame(draw); return () => cancelAnimationFrame(raf);
  }, [hud]);
  return <button type="button" className="cwMapBtn" aria-label="Open game map" onClick={onOpen}><canvas ref={ref} className="cwMap" width={280} height={280} /></button>;
}
function DriveHud({ hud }: { hud: React.MutableRefObject<Hud> }) {
  const spd = useRef<HTMLDivElement>(null), num = useRef<HTMLElement>(null), tip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const id = setInterval(() => {
      const h = hud.current;
      if (spd.current) spd.current.style.display = h.drv ? 'flex' : 'none';
      if (num.current) num.current.textContent = String(Math.round(h.spd));
      if (tip.current && tip.current.textContent !== h.prompt) tip.current.textContent = h.prompt;
    }, 100);
    return () => clearInterval(id);
  }, [hud]);
  return <><div ref={spd} className="cwSpeed"><b ref={num}>0</b><small>km/h</small></div><div ref={tip} className="cwTip" /></>;
}
function HoldBtn({ cls, label, icon, down, up }: { cls: string; label: string; icon: string; down: () => void; up?: () => void }) {
  return <button className={'cwBtn ' + cls} aria-label={label} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); down(); }} onPointerUp={() => up?.()} onPointerCancel={() => up?.()} onContextMenu={e => e.preventDefault()}><span>{icon}</span><small>{label}</small></button>;
}

const CSS = `
.cwTapTag{pointer-events:auto;cursor:pointer;padding:6px 10px;font-size:12px}
.cwSay{background:#fff;color:#111;border-radius:12px;padding:5px 10px;font-size:12px;max-width:190px;text-align:center;box-shadow:0 2px 8px #0006;white-space:normal;line-height:1.25}
.cwLookPad{display:none;position:absolute;right:12px;top:30%;width:38%;height:38%;z-index:8;touch-action:none;border-radius:24px;background:linear-gradient(180deg,#07100d08,#07100d18);pointer-events:auto}.cwLookPad span{position:absolute;right:12px;top:12px;color:#ffffff55;font-size:9px;letter-spacing:.12em;font-weight:800}.cwStick{position:absolute;left:22px;bottom:22px;width:128px;height:128px;border-radius:50%;background:#0b1511aa;border:2px solid #ffffff3a;touch-action:none;z-index:10;display:none}
.cwKnob{position:absolute;left:50%;top:50%;width:58px;height:58px;border-radius:50%;background:#ffffffcc;transform:translate(-50%,-50%);box-shadow:0 2px 8px #0006;pointer-events:none}
.cwBtns{position:absolute;right:18px;bottom:22px;z-index:12;display:grid;grid-template-columns:repeat(3,64px);gap:10px;align-items:end;justify-items:end}.cwBtns .big{grid-column:3;grid-row:1 / span 2}.cwBtns>.cam:not(.cwTouch){grid-column:1;grid-row:1}.cwBtns>.cam.cwTouch{grid-column:2;grid-row:1}.cwBtns>.cwTouch:not(.cam){grid-column:1;grid-row:2}.cwBtns>.cwBtn:not(.cam):not(.cwTouch):not(.big){grid-column:2;grid-row:2}
.cwBtn{width:64px;height:64px;border-radius:50%;border:2px solid #ffffff44;background:#0b1511cc;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;touch-action:none;user-select:none;-webkit-user-select:none;cursor:pointer}
.cwBtn span{font-size:22px;line-height:1}.cwBtn small{font-size:9px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}
.cwBtn:active{background:#d99a42;color:#111}.cwBtn.big{width:78px;height:78px}.cwBtn.cam{width:50px;height:50px}.cwBtn.cam small{display:none}
.cwMap{position:absolute;left:12px;top:72px;width:140px;height:140px;border-radius:50%;border:3px solid #ffffffcc;box-shadow:0 4px 18px #0008;z-index:6;background:#35553f;pointer-events:none}
.cwHint{position:absolute;right:18px;bottom:110px;z-index:6;color:#fff;font-size:11px;line-height:1.55;background:#0b1511b0;border:1px solid #ffffff22;border-radius:10px;padding:8px 11px;pointer-events:none}
.cwHint b{color:#d99a42}
.cwSpeed{position:absolute;right:270px;bottom:30px;z-index:7;display:none;align-items:baseline;gap:4px;color:#fff;background:#0b1511d0;border:1px solid #ffffff2a;border-radius:14px;padding:8px 14px;pointer-events:none}
.cwSpeed b{font-size:28px;font-weight:800;color:#ffd23f;min-width:46px;text-align:right}.cwSpeed small{font-size:10px;font-weight:700;opacity:.8}
.cwTip{position:absolute;left:50%;bottom:104px;transform:translateX(-50%);z-index:7;color:#fff;font-size:12px;font-weight:700;background:#0b1511c0;border:1px solid #ffffff22;border-radius:999px;padding:6px 14px;pointer-events:none;white-space:nowrap}
.cwTip:empty{display:none}
.cwGear{top:268px}
.cwMute{position:absolute;left:12px;top:222px;z-index:7;width:38px;height:38px;border-radius:50%;border:2px solid #ffffff44;background:#0b1511cc;color:#fff;font-size:17px;cursor:pointer}
.cwTouch{display:none}
@media (pointer:coarse),(max-width:700px){.cwLookPad{display:block}.cwStick{display:block}.cwHint{display:none}.cwMap{width:96px;height:96px;top:96px;left:10px}.cwBtns{bottom:20px;right:14px;grid-template-columns:repeat(3,56px);gap:8px}.cwBtn{width:58px;height:58px}.cwBtn.big{width:70px;height:70px}.cwBtn.cam{width:48px;height:48px}.cwTouch{display:flex}.cwSpeed{right:auto;left:14px;bottom:166px}.cwTip{bottom:170px;font-size:11px}.cwMute{left:10px;top:200px}.cwGear{top:246px!important}}
`;

export default function CityWorld({ look, onNear, getMinute, onSocial, onOpenMap }: { look: Look; onNear: (b: any) => void; getMinute?: () => number; onSocial?: (a?: number) => void; onOpenMap?: () => void }) {
  const net = useCityNet(look, onSocial);
  const voice = useCityVoice({ me: look.name, roster: net.roster, signal: net.signal, subscribe: net.subscribeRtc, isMuted: n => net.muted.includes(n), onSocial });
  const [sel, setSel] = useState<string | null>(null);
  const ctl = useRef<Ctl>({ joy: { x: 0, y: 0 }, look: { x: 0, y: 0 }, keys: new Set(), run: false, jump: false, recenter: false, interact: false, horn: false });
  const hud = useRef<Hud>({ x: START.x, z: START.z, fx: 0, fz: -1, r: Math.PI, vx: 0, vz: 0, vp: false, spd: 0, drv: false, prompt: 'E — Call your car' });
  const cfg = useSettings(), [hasCar, setHasCar] = useState(GAME.hasCar);
  useEffect(() => { const i = setInterval(() => { setHasCar(GAME.hasCar); if (!GAME.hasCar) { VEH.placed = false; VEH.drv = false; } }, 600); return () => clearInterval(i); }, []);
  useEffect(() => {
    const typing = (e: Event) => { const t = e.target as HTMLElement | null; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
    const dn = (e: KeyboardEvent) => {
      if (typing(e)) return; const k = e.key.toLowerCase();
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if (k === 'c') ctl.current.recenter = true;
      if (k === 'e' && !e.repeat) { ctl.current.interact = true; unlockAudio(); }
      if (k === 'h' && !e.repeat) { ctl.current.horn = true; unlockAudio(); }
      ctl.current.keys.add(k);
    };
    const up = (e: KeyboardEvent) => { ctl.current.keys.delete(e.key.toLowerCase()); };
    const clear = () => ctl.current.keys.clear();
    window.addEventListener('keydown', dn); window.addEventListener('keyup', up); window.addEventListener('blur', clear);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear); };
  }, []);
  return (
    <div className="cityWorld">
      <RuntimeStyle css={CSS} />
      <RuntimeStyle css={GAME_LABEL_CSS} />
      <Canvas shadows dpr={[1, 1.5]} camera={{ position: [START.x, 4.2, START.z + 8], fov: 52, far: 600 }}>
        <Scene look={look} ctl={ctl} hud={hud} setNear={onNear} getMinute={getMinute} roster={net.roster} ver={net.ver} bub={net.bub} onPick={setSel} />
      </Canvas>
      <Minimap hud={hud} onOpen={onOpenMap} />
      <CityPeople net={net} voice={voice} sel={sel} setSel={setSel} />
      <LookPad ctl={ctl} />
      <Stick ctl={ctl} />
      <DriveHud hud={hud} />
      <button className="cwMute" aria-label="Toggle sound" onClick={() => { unlockAudio(); setMuted(!cfg.muteAll); }}>{cfg.muteAll ? '🔇' : '🔊'}</button>
      <button className="cwMute cwGear" aria-label="Settings" onClick={openSettings}>⚙️</button>
      <div className="cwBtns">
        {hasCar && <HoldBtn cls="cam cwTouch" label="Horn" icon="📣" down={() => { unlockAudio(); ctl.current.horn = true; }} />}
        {hasCar && <HoldBtn cls="cwTouch" label="Car" icon="🚗" down={() => { unlockAudio(); ctl.current.interact = true; }} />}
        <HoldBtn cls="cam" label="Camera" icon="🎥" down={() => { ctl.current.recenter = true; }} />
        <HoldBtn cls="" label="Sprint" icon="🏃" down={() => { ctl.current.run = true; }} up={() => { ctl.current.run = false; }} />
        <HoldBtn cls="big" label="Jump" icon="⬆️" down={() => { ctl.current.jump = true; }} />
      </div>
      <div className="cwHint"><b>WASD</b> move · <b>Shift</b> sprint · <b>Space</b> jump<br /><b>Drag mouse</b> look · <b>Scroll</b> zoom · <b>C</b> camera behind you<br />{hasCar ? <><b>E</b> call / enter / exit car · <b>H</b> horn · <b>Space</b> handbrake · </> : null}Gamepad works too</div>
    </div>
  );
}