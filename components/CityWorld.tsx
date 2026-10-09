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
import { DEFAULT_LOOK, type Look } from '../lib/characterModels';
import type { CityBuilding } from '../lib/cityTypes';
import { FIGHT, NET, useCityNet } from '../lib/cityNet';
import { JAIL_CELL_POS } from '../lib/profile';
import { useCityVoice, MIC, type VoiceApi } from '../lib/cityVoice';
import CityPeople from './CityPeople';
import { engineSet, engineStart, engineStop, honk, setMuted, thud, unlockAudio } from '../lib/cityAudio';
import { VEHICLE_CATALOG, vehicleById, vehicleByName } from '../lib/vehicles';

import RuntimeStyle from './RuntimeStyle';
import { worldMinute, worldCalendar, weatherAt, lightningAt } from '../lib/worldClock';
import { createPortal } from 'react-dom';
import { BUILDS_WORLD, BUILDING_DESTS, type Dest } from '../lib/destinations';
import DestPicker, { DEST_PICKER_CSS } from './DestPicker';
import { GRID, CURB, halfW, signalised, sidewalkSpawn, billboardSpot, planRide, newRide, stepRide, type Route, type RideState } from '../lib/roadRoute'; // road grid, curb spots, taxi/bike driving
/* ───────────── types & helpers ───────────── */
type Ctl = { punch: boolean; joy: { x: number; y: number }; look: { x: number; y: number }; keys: Set<string>; run: boolean; jump: boolean; recenter: boolean; interact: boolean; taxi: boolean; horn: boolean };
type Hud = { x: number; z: number; fx: number; fz: number; r: number; vx: number; vz: number; vp: boolean; spd: number; drv: boolean; prompt: string };
type Kind = 'glass' | 'concrete' | 'brick' | 'plaster';
type Prof = { kind: Kind; f: [number, number]; sign: string; wall?: string; balc?: boolean };
type Box2 = { x: number; z: number; sx: number; sz: number };

const hs = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/* ───────────── city layout: wide boulevards (22 m grid) ───────────── */
const FH = 3; // metres per floor
const LIM = 135; // walkable limit
const ev = (n: number) => ((n % 2) + 2) % 2 === 0;
const BUILDS: CityBuilding[] = BUILDS_WORLD; // shared with the ride destinations (lib/destinations.ts)
/** Where a player appears when they walk out of a building: on the frontage sidewalk, straight in front of the door (doors face +z).
 *  Uses the same scaled world layout as BUILDS (the raw CITY coordinates are on a different, smaller grid, so they must never be used for positions). */
export function buildingExitPoint(businessId: string | null | undefined): { x: number; z: number } | null {
  const b = BUILDS.find(x => x.business?.id === businessId); if (!b) return null;
  return { x: b.x, z: b.z + b.d / 2 + 1.8 };
}
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
const OBS = [{ x: 0, z: 0, on: false, sp: 4.5 }, { x: 0, z: 0, on: false, sp: 7 }, { x: 0, z: 0, on: false, sp: 7 }]; // things AI cars must stop for: [0] player on foot, [1] player's car, [2] the taxi/bike carrying the player
const VEH = { x: 0, z: 0, r: 0, v: 0, placed: false, drv: false, brake: false }; // the player's own car
const NIGHT = { n: 0 }; // 0 = full day, 1 = full night
let PKIT: Kit | null = null;
const pkit = (): Kit => { if (!PKIT) PKIT = carKit(); return PKIT; };

/* ───────────── traffic lights + cars that obey them ───────────── */
// 32 s cycle with long greens: x green 0–14, amber 14–16, z green 16–30, amber 30–32. Cars only obey it at boulevard × boulevard junctions (see signalised).
const lightState = (t: number, axis: 'x' | 'z') => { const c = t % 32; return axis === 'x' ? (c < 14 ? 'g' : c < 16 ? 'y' : 'r') : (c >= 16 && c < 30 ? 'g' : c >= 30 ? 'y' : 'r'); };
const LCOL = { g: new THREE.Color('#2ee66b'), y: new THREE.Color('#ffc400'), r: new THREE.Color('#ff2a2a') };
function Signals() {
  const poles = useRef<THREE.InstancedMesh>(null!), heads = useRef<THREE.InstancedMesh>(null!), last = useRef('');
  const corners = useMemo(() => INTER.filter(it => signalised(Math.round(it.x / GRID), Math.round(it.z / GRID))).flatMap(it => [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) => ({ x: it.x + sx * (it.hv + 1.1), z: it.z + sz * (it.hh + 1.1), axis: (sx * sz > 0 ? 'x' : 'z') as 'x' | 'z' }))), []);
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
function CarModel({ kit, color, kind, model, style }: { kit: Kit; color: string; kind: number; model?: string; style?: { paint?: string; rims?: string; tint?: number } }) {
  const spec = model ? (vehicleById(model) || vehicleByName(model)) : VEHICLE_CATALOG[0];
  const suv = spec.type === 'SUV' || /land rover|lx/i.test(spec.model);
  const premium = /mercedes|bmw|lexus/i.test(spec.brand);
  const sc: [number, number, number] = suv ? [1.12, 1.32, 1.14] : kind === 1 ? [1.04, 1.22, 1.06] : kind === 2 ? [.9, 1, .98] : [1, 1, 1];
  const grille = premium ? '#c7ccd1' : '#20252a'; const bodyColor = style?.paint && style.paint !== 'factory' ? style.paint : color; const rimColor = style?.rims==='sport' ? '#d8dde3' : style?.rims==='black' ? '#111' : '#141619'; const glassColor = style?.tint ? '#0b1117' : '#16222c';
  return <group scale={sc}>
    <mesh geometry={kit.body} material={bodyMat(bodyColor)} castShadow />
    <mesh geometry={kit.cabin} material={style?.tint ? new THREE.MeshStandardMaterial({color:glassColor,metalness:.8,roughness:.08}) : kit.glass} />
    <mesh position={[-.17, suv ? 1.43 : 1.38, 0]} material={bodyMat(color)}><boxGeometry args={[suv ? 1.48 : 1.32, .07, suv ? 1.56 : 1.5]} /></mesh>
    <mesh position={[2.14, .62, 0]} material={new THREE.MeshStandardMaterial({ color: grille, metalness: .75, roughness: .2 })}><boxGeometry args={[.08, .28, suv ? .95 : .78]} /></mesh>
    <mesh position={[1.8, .55, 0]} material={new THREE.MeshStandardMaterial({ color: '#111820', metalness: .3, roughness: .4 })}><boxGeometry args={[.18, .08, suv ? 1.05 : .9]} /></mesh>
    <mesh geometry={kit.wheels} material={style?.rims ? new THREE.MeshStandardMaterial({color:rimColor,metalness:.75,roughness:.25}) : kit.tire} />
    <mesh geometry={kit.head} material={kit.headM} /><mesh geometry={kit.tail} material={kit.tailM} />
    <mesh position={[-1.55, .58, .91]} material={new THREE.MeshStandardMaterial({ color: '#111', metalness: .25, roughness: .55 })}><boxGeometry args={[.5, .05, .05]} /></mesh>
  </group>;
}
type Role = 'car' | 'taxi' | 'bike' | 'police' | 'bus';
// Every road user lives in the same lane simulation, so taxis, bikes and police keep gaps / obey lights exactly like normal traffic.
// hail: 0 = driving, 1 = pulling over for a player, 2 = stopped at the kerb waiting.   busy = carrying a player right now.
type SimCar = { s: number; color: string; kind: number; model: string; role: Role; mul: number; v?: number; off: number; laneShift: number; hail: 0 | 1 | 2; stopping?: boolean; readyAt?: number; busy?: boolean };
type Lane = { axis: 'x' | 'z'; dir: 1 | -1; fixed: number; speed: number; rot: number; road: number; cars: SimCar[] };
/* A ride another player ordered for you (and you accepted): the taxi comes to you and sets off by itself, already paid. */
const DISPATCH = { idx: -1, ride: null as null | { id: string; name: string; x: number; z: number } };
/* The passengers already on a bus: they each get off at their own stop. n = how many people get off there. */
type BusStop = { name: string; x: number; z: number; n: number; mine?: boolean };
const MANIFEST = new Map<number, BusStop[]>();
function busManifest(): BusStop[] {
  const pool = [...BUILDING_DESTS].sort(() => Math.random() - .5), k = 2 + Math.floor(Math.random() * 3);
  return pool.slice(0, k).map(d => ({ name: d.name, x: d.x, z: d.z, n: 1 + Math.floor(Math.random() * 3) }));
}
const ROAM = { autoGo: (_i: number) => {}, lanes: [] as Lane[], cars: [] as { l: Lane; c: SimCar }[], sel: -1, rideIdx: -1, openSheet: (_i: number) => {}, tap: (_i: number) => {} };
const isHail = (r: Role) => r === 'taxi' || r === 'bike' || r === 'bus'; // vehicles a player can flag down
const roleOf = (n: number): Role => (n % 17 === 7 ? 'bus' : n % 4 === 1 ? 'taxi' : n % 9 === 3 ? 'bike' : n % 12 === 5 ? 'police' : 'car');
const ROLE_MUL: Record<Role, number> = { car: 1, taxi: 1, bike: .8, police: 1.15, bus: .72 };
const COLORS = ['#c0392b', '#e8e8ea', '#1f2933', '#2c5aa0', '#8e949a', '#b7791f', '#0f766e', '#7c2d12', '#d9d9dc', '#1e9e55'];
function makeLanes(): Lane[] {
  const lanes: Lane[] = []; let n = 0;
  for (let i = -5; i <= 5; i++) {
    const hw = halfW(i), off = hw * .5, major = hw > 3;
    for (const axis of ['x', 'z'] as const) for (const dir of [1, -1] as const) {
      const fixed = axis === 'x' ? i * GRID + (dir === 1 ? off : -off) : i * GRID + (dir === 1 ? -off : off); // drive on the right
      const rot = axis === 'x' ? (dir === 1 ? 0 : Math.PI) : (dir === 1 ? -Math.PI / 2 : Math.PI / 2);
      const cars = Array.from({ length: major ? 2 : 1 }, (_, k): SimCar => { const role = roleOf(n); return { s: -100 + k * 105 + hs(`${i}${axis}${dir}${k}`) * 40, color: COLORS[n++ % COLORS.length], kind: (n * 7) % 4, model: VEHICLE_CATALOG[(n + k) % VEHICLE_CATALOG.length].id, role, mul: ROLE_MUL[role], off: 0, laneShift: 0, hail: 0 }; });
      lanes.push({ axis, dir, fixed, speed: major ? 9 : 6.5, rot, road: i, cars });
    }
  }
  return lanes;
}
const nextCenter = (s: number, dir: 1 | -1) => (dir === 1 ? Math.floor(s / GRID + 1e-6) * GRID + GRID : Math.ceil(s / GRID - 1e-6) * GRID - GRID);
/* Roaming taxis & bike taxis: they drive the city like normal traffic. Tap one to hail it; it pulls over to the kerb, then tap again to choose a destination. */
function Traffic() {
  const lanes = useMemo(makeLanes, []), kit = useMemo(carKit, []);
  const flat = useMemo(() => lanes.flatMap(l => l.cars.map(c => ({ l, c }))), [lanes]);
  const refs = useRef<(THREE.Group | null)[]>([]);
  const lbl = useRef<THREE.Group>(null!), lblEl = useRef<HTMLDivElement | null>(null), lblKey = useRef('');
  useEffect(() => {
    ROAM.cars = flat; ROAM.lanes = lanes;
    ROAM.tap = (i: number) => {
      const e = ROAM.cars[i]; if (!e || e.c.busy || GAME.ride || VEH.drv || GAME.jailed) return;
      const t = TPOS[i], d = t ? Math.hypot(GAME.player.x - t.x, GAME.player.z - t.z) : 999, role = e.c.role;
      const nm = role === 'taxi' ? 'taxi' : role === 'bus' ? 'bus' : 'bike';
      if (e.c.hail === 2) { if (d < 18) ROAM.openSheet(i); else GAME.notice = `Walk up to the ${nm} first.`; return; }
      if (e.c.hail === 1) return;
      if (d > 90) { GAME.notice = 'Too far away: wait for it to come closer.'; return; }
      const old = ROAM.cars[ROAM.sel]; if (old && old.c.hail && old.c !== e.c) releaseRoamer(old.c);
      e.c.hail = 1; e.c.stopping = false; e.c.v = e.l.speed * e.c.mul; ROAM.sel = i;
      if (role === 'bus') MANIFEST.set(i, busManifest());
      GAME.notice = role === 'taxi' ? '🚕 Taxi is pulling over for you...' : role === 'bus' ? '🚌 Bus is pulling over at the stop...' : '🚲 Bike taxi is pulling over for you...';
    };
    return () => { ROAM.cars = []; ROAM.sel = -1; ROAM.rideIdx = -1; DISPATCH.idx = -1; MANIFEST.clear(); };
  }, [flat]);
  useFrame((st, dtRaw) => {
    const dt = Math.min(dtRaw, .05), t = st.clock.elapsedTime;
    const wc = worldCalendar(); const wx = weatherAt(); const rainFactor = wx.storm ? .62 : wx.rain > .45 ? .78 : 1; const rush = (wc.hh >= 7 && wc.hh < 10) || (wc.hh >= 16 && wc.hh < 19) ? 1.18 : 1;
    let nearI = -1, nearD = 90;
    flat.forEach(({ l, c }, i) => {
      const tp = TPOS[i] || (TPOS[i] = { x: 0, z: 0, r: 0 }), g = refs.current[i];
      if (c.busy) { tp.x = 1e5; tp.z = 1e5; if (g) g.visible = false; return; } // it is carrying a player (the ride has its own model)
      if (g) g.visible = true;
      const base = l.speed * c.mul * rainFactor * rush, EX = halfW(l.road) * .5 + CURB; // EX: how far the vehicle slides sideways to reach the kerb
      let v = c.v ?? base;
      if (c.hail === 1) {
        const prev = l.dir === 1 ? c.s - Math.floor(c.s / GRID) * GRID : Math.ceil(c.s / GRID) * GRID - c.s; // metres past the last junction
        if (prev >= 3 && prev <= 14) c.stopping = true; // brake only mid-block, never inside a junction
        if (c.stopping) v = Math.max(0, v - 16 * dt);
        c.off = Math.min(EX, c.off + 3.5 * dt);
        if (c.stopping && v === 0 && c.off >= EX - .02) { c.hail = 2; c.readyAt = t; if (DISPATCH.idx === i) ROAM.autoGo(i); else { if (Math.hypot(GAME.player.x - tp.x, GAME.player.z - tp.z) < 18) ROAM.openSheet(i); GAME.notice = c.role === 'taxi' ? '🚕 Taxi stopped: walk up and tap it.' : c.role === 'bus' ? '🚌 Bus stopped: walk up and tap it.' : '🚲 Bike taxi stopped: walk up and tap it.'; } }
        c.v = v;
      } else if (c.hail === 2) {
        v = 0; c.v = 0; c.off = EX;
        const d = Math.hypot(GAME.player.x - tp.x, GAME.player.z - tp.z);
        if (DISPATCH.idx !== i && (!CINE.on && (t - (c.readyAt || t) > 120 || d > 140) || (GAME.ride && !CINE.on) || VEH.drv)) releaseRoamer(c); // you changed your mind: it drives off
      } else {
        if (c.off > 0) c.off = Math.max(0, c.off - 2.2 * dt);
        if (c.v !== undefined) { v = Math.min(base, c.v + 5 * dt); c.v = v >= base && c.off === 0 ? undefined : v; }
      }
      let adv = v * dt, gap = Infinity;
      for (const o of l.cars) if (o !== c && !o.busy) { const d = (o.s - c.s) * l.dir; if (d > 0 && d < gap) gap = d; }
      adv = Math.min(adv, Math.max(0, gap - 7)); // keep a safe distance
      if(c.role==='car' && c.hail===0 && gap<12 && gap>5 && Math.abs(l.fixed)<100){ const sign=hs('ov'+i)>0.5?1:-1; c.laneShift += (sign*1.15-c.laneShift)*Math.min(1,dt*2.5); v=Math.min(base*1.08,Math.max(v,base*.92)); } else c.laneShift += (0-c.laneShift)*Math.min(1,dt*3);
      for (const o of OBS) { if (!o.on) continue; const perp = l.axis === 'x' ? Math.abs(o.z - l.fixed) : Math.abs(o.x - l.fixed), along = ((l.axis === 'x' ? o.x : o.z) - c.s) * l.dir; if (perp < 1.7 && along > 0) adv = Math.min(adv, Math.max(0, along - o.sp)); } // stop for the player (on foot or in a car)
      const nx = nextCenter(c.s, l.dir), d = (nx - c.s) * l.dir, ci = Math.round(nx / GRID);
      const ls = lightState(t, l.axis); if (Math.abs(ci) <= 5 && signalised(ci, l.road) && (ls === 'r' || (ls === 'y' && d - (halfW(ci) + 5.2) > 9)) && d >= halfW(ci) + 5.2 - .05) adv = Math.min(adv, Math.max(0, d - (halfW(ci) + 5.2))); // stop at the red light
      c.s += adv * l.dir; if (c.s > 118) c.s = -118; else if (c.s < -118) c.s = 118;
      const px = l.axis === 'x' ? c.s : l.fixed - l.dir * c.off + c.laneShift, pz = l.axis === 'x' ? l.fixed + l.dir * c.off + c.laneShift : c.s;
      tp.x = px; tp.z = pz; tp.r = l.rot;
      if (g) { g.position.set(px, 0, pz); g.rotation.y = l.rot; }
      if (isHail(c.role) && !GAME.ride && !VEH.drv && !GAME.jailed) {
        const dd = Math.hypot(GAME.player.x - px, GAME.player.z - pz);
        if (ROAM.sel === i && c.hail) { nearI = i; nearD = -1; } else if (!c.hail && dd < nearD) { nearI = i; nearD = dd; }
      }
    });
    // one floating "hail" tag that follows the closest hailable taxi / bike
    const el = lblEl.current, grp = lbl.current;
    if (el && grp) {
      let key = '';
      if (nearI >= 0) {
        const e = flat[nearI], tp = TPOS[nearI], d = Math.hypot(GAME.player.x - tp.x, GAME.player.z - tp.z), ic = e.c.role === 'taxi' ? '🚕' : e.c.role === 'bus' ? '🚌' : '🚲';
        grp.position.set(tp.x, e.c.role === 'taxi' ? 2.5 : e.c.role === 'bus' ? 3.4 : 2.1, tp.z);
        key = e.c.hail === 1 ? `${ic} Pulling over...` : e.c.hail === 2 ? (d < 18 ? `${ic} Tap to ride` : `${ic} Waiting: walk up`) : `${ic} Tap to hail`;
        if (e.c.hail === 2 && d < 18) key += '|go'; else if (e.c.hail === 0) key += '|go';
      }
      if (key !== lblKey.current) { lblKey.current = key; el.style.display = key ? '' : 'none'; el.className = 'hailTag' + (key.endsWith('|go') ? ' go' : ''); el.textContent = key.replace('|go', ''); el.dataset.i = String(nearI); }
    }
  });
  return <>
    {flat.map(({ l, c }, i) => <group key={i} ref={el => { refs.current[i] = el; }} position={l.axis === 'x' ? [c.s, 0, l.fixed] : [l.fixed, 0, c.s]} rotation={[0, l.rot, 0]}
      onClick={isHail(c.role) ? (e => { if (e.delta > 6) return; e.stopPropagation(); ROAM.tap(i); }) : undefined}>
      {isHail(c.role) && <mesh position={[0, 1.1, 0]}><boxGeometry args={c.role === 'bus' ? [7, 3, 3.4] : [3.4, 2.6, 5.6]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>}
      {c.role === 'taxi' ? <TaxiBody kit={kit} /> : c.role === 'bike' ? <BikeBody scale={.95} rider /> : c.role === 'police' ? <PoliceBody kit={kit} /> : c.role === 'bus' ? <BusBody /> : <CarModel kit={kit} color={c.color} kind={c.kind} model={c.model} />}
    </group>)}
    <group ref={lbl}><Html center zIndexRange={[4, 0]}><div ref={lblEl} className="hailTag" style={{ display: 'none' }} onClick={() => { const i = Number(lblEl.current?.dataset.i); if (i >= 0) ROAM.tap(i); }} /></Html></group>
  </>;
}
/* a roamer is finished with its passenger / hail: back on the road */
function releaseRoamer(c: SimCar) { c.hail = 0; c.stopping = false; c.readyAt = undefined; if (ROAM.cars[ROAM.sel]?.c === c) ROAM.sel = -1; }
function respawnRoamer(idx: number) {
  const e = ROAM.cars[idx]; if (!e) return; const { l, c } = e;
  let best = c.s, bd = -1;
  for (let k = 0; k < 14; k++) { const s = -110 + Math.random() * 220, near = Math.min(...l.cars.filter(o => o !== c).map(o => Math.abs(o.s - s)), 999), far = Math.hypot((l.axis === 'x' ? s : l.fixed) - GAME.player.x, (l.axis === 'x' ? l.fixed : s) - GAME.player.z); const score = Math.min(near, 30) + Math.min(far, 60); if (score > bd) { bd = score; best = s; } }
  c.s = best; c.off = 0; c.hail = 0; c.stopping = false; c.v = undefined; c.busy = false; c.readyAt = undefined;
}

/* ───────────── transport: roaming taxis + bike taxis (hail them in the street) ───────────── */

/* ───────────── roadside advertising billboards ───────────── */
// On the sidewalk strip, front face towards the road, up on tall posts so they read above the traffic. (They used to sit mid-block, inside the buildings.)
const BILLBOARD_COLORS = ['#1d7654', '#c9831f', '#2c5aa0', '#7a2fb0', '#b3261e', '#0f766e'];
const BILLBOARDS = ([
  ['x', 0, -11, 1, 'ABUJA REAL LIFE', 'Your city. Your story.'],
  ['x', 0, 11, -1, 'BIZNEST', 'Build your business.'],
  ['z', 0, 11, 1, 'NOW HIRING', 'Find a job near you'],
  ['z', 0, -11, -1, 'ABUJA NIGHTS', 'Work · Meet · Connect'],
  ['x', 0, 33, 1, 'YOUR AD HERE', 'Reach Abuja players'],
  ['z', 0, 33, -1, 'DRIVE & EXPLORE', 'Taxis · Bikes · Cars'],
] as const).map(([axis, road, along, side, title, sub], i) => ({ ...billboardSpot(axis, road, along, side), ax: axis === 'x' ? 1 : 0, az: axis === 'x' ? 0 : 1, title, sub, i }));

// Solid footprints so players cannot walk through billboard posts.
const TRANSPORT_SOLIDS = [
  ...BILLBOARDS.flatMap(b => [-1.7, 1.7].map(o => ({ x: b.x + b.ax * o, z: b.z + b.az * o, r: .1 }))),
];

/** Can this player take a dispatched ride right now? (null = yes, otherwise the reason why not.) */
export function canDispatchRide(): string | null {
  if (GAME.ride || CINE.on) return 'You are already on a ride.';
  if (VEH.drv) return 'Get out of your car first.';
  if (GAME.jailed) return 'You cannot take a ride from jail.';
  if (DISPATCH.idx >= 0) return 'A ride is already on its way to you.';
  if (!ROAM.cars.length) return 'The city streets are still loading: try again in a moment.';
  return null;
}
/** A taxi / bike taxi drives to this player and takes them to the destination another player picked. The fare was already paid by that player. */
export function dispatchRide(r: { id: string; name: string; x: number; z: number; kind: string }): string | null {
  const bad = canDispatchRide(); if (bad) return bad;
  const want: Role = r.kind === 'bike' ? 'bike' : 'taxi', P = GAME.player;
  let bi = -1, bd = Infinity;
  ROAM.cars.forEach((e, i) => { if (e.c.role !== want || e.c.busy || e.c.hail) return; const tp = TPOS[i]; if (!tp) return; const d = Math.hypot(P.x - tp.x, P.z - tp.z); if (d < bd) { bd = d; bi = i; } });
  if (bi < 0) return `No free ${want === 'bike' ? 'bike taxi' : 'taxi'} right now: try again in a moment.`;
  const e = ROAM.cars[bi];
  if (bd > 70) { // too far to drive over in reasonable time: it joins the road beside the player, a short way back
    let best: Lane | null = null, bp = Infinity;
    for (const l of ROAM.lanes) { const perp = Math.abs((l.axis === 'x' ? P.z : P.x) - l.fixed); if (perp < bp) { bp = perp; best = l; } }
    if (best) {
      const L: Lane = best, pa = L.axis === 'x' ? P.x : P.z;
      e.l.cars = e.l.cars.filter(o => o !== e.c); L.cars.push(e.c); e.l = L;
      e.c.s = Math.max(-110, Math.min(110, pa - L.dir * 30)); e.c.off = 0; e.c.laneShift = 0;
    }
  }
  const { l, c } = e;
  c.hail = 1; c.stopping = false; c.v = l.speed * c.mul; ROAM.sel = bi;
  DISPATCH.idx = bi; DISPATCH.ride = { id: r.id, name: r.name, x: r.x, z: r.z };
  GAME.notice = want === 'bike' ? '🚲 Your bike taxi is on its way to you...' : '🚕 Your taxi is on its way to you...';
  return null;
}
function BusBody() { // faces +x like every vehicle: a yellow city bus with a window band, pillars, doors, lights and a destination sign
  const Y = '#e8a923', D = '#14202a';
  return <group>
    <mesh position={[0, .95, 0]} castShadow><boxGeometry args={[6, 1.1, 2.2]} /><meshStandardMaterial color={Y} roughness={.5} /></mesh>
    <mesh position={[0, .52, 0]}><boxGeometry args={[5.9, .26, 2.12]} /><meshStandardMaterial color="#1c1c1f" /></mesh>
    <mesh position={[0, .98, 0]}><boxGeometry args={[6.02, .14, 2.22]} /><meshStandardMaterial color="#b3261e" /></mesh>
    <mesh position={[0, 1.88, 0]}><boxGeometry args={[5.9, .76, 2.1]} /><meshStandardMaterial color={D} metalness={.55} roughness={.2} /></mesh>
    {[-2.8, -1.8, -.8, .2, 1.2, 2.2, 2.85].map(x => <mesh key={x} position={[x, 1.88, 0]}><boxGeometry args={[.12, .78, 2.2]} /><meshStandardMaterial color={Y} roughness={.5} /></mesh>)}
    <mesh position={[0, 2.33, 0]} castShadow><boxGeometry args={[6, .14, 2.2]} /><meshStandardMaterial color="#f1ead7" roughness={.6} /></mesh>
    <mesh position={[-1.4, 2.43, 0]}><boxGeometry args={[.9, .1, .7]} /><meshStandardMaterial color="#cfd3d6" /></mesh>
    <mesh position={[3.02, 1.85, 0]}><boxGeometry args={[.05, .8, 2.0]} /><meshStandardMaterial color={D} metalness={.5} roughness={.15} /></mesh>
    <mesh position={[3.04, 2.2, 0]}><boxGeometry args={[.05, .22, 1.3]} /><meshStandardMaterial color="#0b0b0b" /></mesh>
    <Text position={[3.075, 2.2, 0]} rotation-y={Math.PI / 2} fontSize={.15} color="#ffb020" anchorX="center" anchorY="middle">CITY BUS</Text>
    <mesh position={[3.06, .4, 0]}><boxGeometry args={[.22, .26, 2.3]} /><meshStandardMaterial color="#26262a" metalness={.4} /></mesh>
    {[1, -1].map(sd => <group key={sd}>
      <mesh position={[3.04, .85, sd * .8]}><boxGeometry args={[.06, .2, .34]} /><meshStandardMaterial color="#fff6c8" emissive="#ffe9a0" emissiveIntensity={.6} /></mesh>
      <mesh position={[-3.02, .85, sd * .85]}><boxGeometry args={[.06, .22, .3]} /><meshStandardMaterial color="#d62b2b" emissive="#ff1a1a" emissiveIntensity={.5} /></mesh>
      <mesh position={[1.7, 1.15, sd * 1.12]}><boxGeometry args={[.95, 1.7, .05]} /><meshStandardMaterial color={Y} roughness={.5} /></mesh>
      <mesh position={[1.7, 1.3, sd * 1.15]}><boxGeometry args={[.8, 1.25, .03]} /><meshStandardMaterial color={D} metalness={.5} roughness={.2} /></mesh>
      <mesh position={[1.7, 1.3, sd * 1.17]}><boxGeometry args={[.03, 1.25, .03]} /><meshStandardMaterial color="#26262a" /></mesh>
      <mesh position={[3.0, 1.55, sd * 1.2]}><boxGeometry args={[.1, .26, .08]} /><meshStandardMaterial color="#1c1c1f" /></mesh>
      {[-1.95, 1.95].map(x => <group key={x} position={[x, .5, sd * 1.03]} rotation-x={Math.PI / 2}>
        <mesh><cylinderGeometry args={[.5, .5, .3, 20]} /><meshStandardMaterial color="#121214" roughness={.9} /></mesh>
        <mesh position={[0, sd * .16, 0]}><cylinderGeometry args={[.27, .27, .04, 16]} /><meshStandardMaterial color="#aeb4b9" metalness={.7} roughness={.35} /></mesh>
      </group>)}
    </group>)}
  </group>;
}
function TaxiBody({ kit, driver }: { kit: Kit; driver?: boolean }) {
  return <group>
    <CarModel kit={kit} color="#e5b72f" kind={2} model="toyota-corolla-2024" />
    <group position={[-.05, 1.56, 0]}> {/* roof sign: real 3D text on both sides, so no floating label to clutter the view */}
      <mesh><boxGeometry args={[.9, .2, .5]} /><meshStandardMaterial color="#111" /></mesh>
      {[1, -1].map(sd => <Text key={sd} position={[0, .01, sd * .26]} rotation-y={sd === 1 ? 0 : Math.PI} fontSize={.15} color="#ffd23f" anchorX="center" anchorY="middle">TAXI</Text>)}
    </group>
    {driver && <group position={[.12, .3, -.4]} rotation-y={Math.PI / 2} scale={.6}><Human look={{ ...DEFAULT_LOOK, name: 'Taxi Driver', outfit: '#d99a42' }} getState={() => 'idle'} getAnim={() => undefined} getSpeed={() => 1} /></group>}
  </group>;
}
function BikeBody({ scale = 1, rider }: { scale?: number; rider?: boolean }) { // faces +x like every vehicle: a motorcycle (okada) with fat tyres, fork, tank, seat, engine and exhaust
  const body = '#2d8f62', dark = '#1a1d21', steel = '#aeb4b9';
  return <group scale={[scale, scale, scale]}>
    {[-.62, .62].map(x => <group key={x} position={[x, .4, 0]}>
      <mesh><torusGeometry args={[.31, .09, 10, 22]} /><meshStandardMaterial color="#101113" roughness={.9} /></mesh>
      <mesh rotation-x={Math.PI / 2}><cylinderGeometry args={[.21, .21, .07, 16]} /><meshStandardMaterial color={steel} metalness={.7} roughness={.35} /></mesh>
      <mesh rotation-x={Math.PI / 2}><cylinderGeometry args={[.06, .06, .12, 10]} /><meshStandardMaterial color="#555b61" metalness={.6} /></mesh>
    </group>)}
    <mesh position={[0, .47, 0]}><boxGeometry args={[.5, .34, .3]} /><meshStandardMaterial color="#2a2e33" metalness={.5} roughness={.45} /></mesh>
    <mesh position={[.05, .62, 0]}><boxGeometry args={[.3, .14, .26]} /><meshStandardMaterial color="#3a4046" metalness={.5} /></mesh>
    <mesh position={[.2, .8, 0]} rotation-z={-.08}><boxGeometry args={[.52, .24, .32]} /><meshStandardMaterial color={body} roughness={.35} metalness={.3} /></mesh>
    <mesh position={[-.22, .79, 0]}><boxGeometry args={[.6, .1, .27]} /><meshStandardMaterial color={dark} roughness={.8} /></mesh>
    <mesh position={[-.65, .84, 0]} rotation-z={.12}><boxGeometry args={[.42, .06, .24]} /><meshStandardMaterial color={dark} roughness={.8} /></mesh>
    <mesh position={[-.72, .68, 0]} rotation-z={.2}><boxGeometry args={[.5, .04, .2]} /><meshStandardMaterial color={body} /></mesh>
    <mesh position={[-.86, .75, 0]}><boxGeometry args={[.05, .07, .12]} /><meshStandardMaterial color="#d62b2b" emissive="#ff1a1a" emissiveIntensity={.5} /></mesh>
    {[1, -1].map(sd => <group key={sd}>
      <mesh position={[.51, .69, sd * .09]} rotation-z={.36}><cylinderGeometry args={[.028, .028, .78, 8]} /><meshStandardMaterial color={steel} metalness={.8} roughness={.25} /></mesh>
      <mesh position={[-.3, .4, sd * .12]}><boxGeometry args={[.74, .05, .06]} /><meshStandardMaterial color="#2a2e33" metalness={.5} /></mesh>
      <mesh position={[-.5, .62, sd * .14]} rotation-z={.25}><cylinderGeometry args={[.025, .025, .42, 8]} /><meshStandardMaterial color="#c9a227" metalness={.7} /></mesh>
    </group>)}
    <mesh position={[.62, .62, 0]}><boxGeometry args={[.4, .03, .15]} /><meshStandardMaterial color={body} /></mesh>
    <mesh position={[.4, 1.0, 0]} rotation-x={Math.PI / 2}><cylinderGeometry args={[.02, .02, .72, 8]} /><meshStandardMaterial color={dark} metalness={.6} /></mesh>
    {[1, -1].map(sd => <mesh key={sd} position={[.4, 1.0, sd * .36]} rotation-x={Math.PI / 2}><cylinderGeometry args={[.03, .03, .12, 8]} /><meshStandardMaterial color="#0c0d0f" roughness={.9} /></mesh>)}
    <mesh position={[.42, .98, 0]}><boxGeometry args={[.12, .1, .18]} /><meshStandardMaterial color={dark} /></mesh>
    <mesh position={[.7, .88, 0]}><sphereGeometry args={[.11, 14, 10]} /><meshStandardMaterial color="#fff6c8" emissive="#ffe9a0" emissiveIntensity={.7} /></mesh>
    <mesh position={[-.3, .27, .2]} rotation-z={Math.PI / 2 - .06}><cylinderGeometry args={[.05, .045, .85, 10]} /><meshStandardMaterial color={steel} metalness={.85} roughness={.25} /></mesh>
    <mesh position={[-.72, .3, .2]}><cylinderGeometry args={[.07, .07, .3, 10]} /><meshStandardMaterial color="#8d9399" metalness={.8} roughness={.3} /></mesh>
    {rider && <group position={[-.2, .66, 0]} rotation-y={Math.PI / 2} scale={.5}><Human look={{ ...DEFAULT_LOOK, name: 'Bike Driver', outfit: '#2d8f62' }} getState={() => 'idle'} getAnim={() => undefined} getSpeed={() => 1} /></group>}
  </group>;
}
function PoliceBody({ kit }: { kit: Kit }) {
  const red = useRef<THREE.MeshStandardMaterial>(null!), blue = useRef<THREE.MeshStandardMaterial>(null!);
  useFrame(st => { const f = Math.floor(st.clock.elapsedTime * 5) % 2, k = NIGHT.n * 3 + 1.2; if (red.current) red.current.emissiveIntensity = f ? .1 : k; if (blue.current) blue.current.emissiveIntensity = f ? k : .1; });
  return <group>
    <CarModel kit={kit} color="#eef1f6" kind={0} model="toyota-corolla-2024" />
    <mesh position={[-.17, 1.47, 0]}><boxGeometry args={[.5, .05, 1.2]} /><meshStandardMaterial color="#111" /></mesh>
    <mesh position={[-.17, 1.55, .3]}><boxGeometry args={[.3, .11, .5]} /><meshStandardMaterial ref={red} color="#ff2b2b" emissive="#ff1010" emissiveIntensity={1} /></mesh>
    <mesh position={[-.17, 1.55, -.3]}><boxGeometry args={[.3, .11, .5]} /><meshStandardMaterial ref={blue} color="#2b6bff" emissive="#1050ff" emissiveIntensity={1} /></mesh>
    {[1, -1].map(sd => <Text key={sd} position={[-.2, .78, sd * .94]} rotation-y={sd === 1 ? 0 : Math.PI} fontSize={.2} color="#1d3f8f" anchorX="center" anchorY="middle">POLICE</Text>)}
  </group>;
}
function TransportSheet({ kind, manifest, onPick, onClose }: { kind: 'taxi' | 'bike' | 'bus'; manifest?: BusStop[]; onPick: (d: Dest) => Promise<string | void> | void; onClose: () => void }) {
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [fare, setFare] = useState<number | null>(null);
  const riders = kind === 'bus' ? 1 + (manifest || []).reduce((a, m) => a + m.n, 0) : 1;
  useEffect(() => { fetch(`/api/transport?riders=${riders}`).then(r => r.json()).then(d => { const f = d?.fares?.[kind]; if (typeof f === 'number') setFare(f); }).catch(() => {}); }, [kind, riders]);
  const pick = async (d: Dest) => {
    if (busy) return; setBusy(true); setMsg('');
    try { const m = await onPick(d); if (m) { setMsg(m); setBusy(false); } } catch { setMsg('Something went wrong. Try again.'); setBusy(false); }
  };
  return createPortal(<div className="trSheet">
    <button className="trX" aria-label="Close" onClick={onClose}>✕</button>
    <h3><span>{kind === 'taxi' ? '🚕 Taxi' : kind === 'bus' ? '🚌 City bus' : '🚲 Bike taxi'}</span></h3>
    <div className="trBody">
      {kind === 'bus'
        ? <p>Cheap shared ride{fare !== null ? `: ₦${fare.toLocaleString()}` : ''}. {riders - 1} other passenger{riders - 1 === 1 ? ' is' : 's are'} aboard and the bus drops each one at their own stop before yours.</p>
        : <p>Where to? An NPC driver takes you there along the road.{fare !== null ? ` Fare: ₦${fare.toLocaleString()}` : ''}</p>}
      {kind === 'bus' && manifest && manifest.length > 0 && <p>🧍 Stops on this bus: {manifest.map(m => m.name).join(' · ')}</p>}
      {msg && <p style={{ background: '#ffd9d4', color: '#7a1608', fontWeight: 800 }}>{msg}</p>}
      <DestPicker disabled={busy} onPick={pick} />
    </div>
  </div>, document.body);
}
/* ── passenger cinematic: the door swings open, the character walks up and gets in; at the destination the door opens and they step out ── */
const CINE = { on: false };
type CarPose = { x: number; z: number; r: number };
const smooth = (u: number) => { const c = Math.max(0, Math.min(1, u)); return c * c * (3 - 2 * c); };
// car faces local +x; local +z is its side. door sits on the rear-door spot of the chosen side.
function doorPts(c: CarPose, side: 1 | -1, bike: boolean, bus = false) {
  const fx = Math.cos(c.r), fz = -Math.sin(c.r), sx = Math.sin(c.r), sz = Math.cos(c.r);
  const at = (lx: number, ls: number): [number, number] => [c.x + fx * lx + sx * ls * side, c.z + fz * lx + sz * ls * side];
  if (bus) return { door: at(1.7, 1.15), out: at(1.7, 2.35), seat: at(1.2, .3) }; // the bus's real door is the one drawn at x = 1.7
  return bike ? { door: at(0, .55), out: at(0, 1.5), seat: at(0, 0) } : { door: at(-.6, 1.0), out: at(-.6, 2.05), seat: at(-.4, .3) };
}
type Cine = { ph: 'walk' | 'enter' | 'close' | 'open' | 'exit' | 'off'; t: number; side: 1 | -1; bike: boolean; bus?: boolean; ang: number; car: CarPose; ax: number; az: number; yaw: number; walk: boolean; fin: () => void; drop?: [number, number]; from?: [number, number] };
function TransportVehicles({ look }: { look: Look }) {
  const actor = useRef<THREE.Group>(null!), doorG = useRef<THREE.Group>(null!), hinge = useRef<THREE.Group>(null!), cine = useRef<Cine | null>(null), walking = useRef(false);
  const kit = useMemo(carKit, []);
  const [open, setOpen] = useState<number | null>(null), [, setTick] = useState(0);
  const activeRef = useRef<THREE.Group>(null!), rs = useRef<RideState | null>(null), route = useRef<Route | null>(null);
  const busTrip = useRef<{ stops: BusStop[]; k: number; dwell: number } | null>(null), rideId = useRef<string | null>(null); // bus stops still to serve / the id of a ride another player ordered for you
  useEffect(() => { ROAM.openSheet = (i: number) => { if (!GAME.ride) setOpen(i); }; return () => { ROAM.openSheet = () => {}; }; }, []);
  useEffect(() => { // walk away (or the vehicle drives off) and the destination menu closes
    const id = setInterval(() => {
      if (open === null) return; const e = ROAM.cars[open], tp = TPOS[open];
      if (!e || e.c.hail !== 2 || !tp || Math.hypot(GAME.player.x - tp.x, GAME.player.z - tp.z) > 24) setOpen(null);
    }, 250);
    return () => clearInterval(id);
  }, [open]);

  useFrame((st, dtRaw) => {
    const ride = GAME.ride, g = activeRef.current;
    OBS[2].on = !!ride && !!rs.current;
    const cn = cine.current;
    if (cn && ride && g) { // ── door + walk-in / walk-out animation ──
      const dt = Math.min(dtRaw, .05), A = actor.current, D = doorG.current, H = hinge.current, P = doorPts(cn.car, cn.side, cn.bike, cn.bus);
      cn.t += dt;
      const goTo = (tx: number, tz: number, sp: number) => { const dx = tx - cn.ax, dz = tz - cn.az, d = Math.hypot(dx, dz); if (d > .02) cn.yaw = Math.atan2(dx, dz); const s = Math.min(d, sp * dt); if (d > 1e-4) { cn.ax += dx / d * s; cn.az += dz / d * s; } return d - s; };
      const door = (want: number) => { cn.ang += (want - cn.ang) * Math.min(1, dt * 16); };
      const OPEN = 1.1;
      if (cn.ph === 'walk') { const left = goTo(P.out[0], P.out[1], 8); cn.walk = true; door(Math.hypot(P.out[0] - cn.ax, P.out[1] - cn.az) < 2.6 ? OPEN : 0); if (left < .05) { cn.ph = 'enter'; cn.t = 0; } }
      else if (cn.ph === 'enter') {
        const u = Math.min(1, cn.t / .45); cn.walk = true; door(OPEN);
        const a = u < .5 ? P.out : P.door, b = u < .5 ? P.door : P.seat, k = smooth(u < .5 ? u * 2 : (u - .5) * 2);
        cn.ax = a[0] + (b[0] - a[0]) * k; cn.az = a[1] + (b[1] - a[1]) * k; cn.yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
        if (u >= 1) { cn.ph = 'close'; cn.t = 0; A.visible = false; cn.walk = false; }
      } else if (cn.ph === 'close') { door(0); if (cn.t > .2) { cn.ang = 0; cn.fin(); return; } }
      else if (cn.ph === 'open') { cn.walk = false; door(OPEN); A.visible = false; if (cn.t > .3) { cn.ph = 'exit'; cn.t = 0; A.visible = true; } }
      else if (cn.ph === 'exit') {
        const u = Math.min(1, cn.t / .55); cn.walk = true; door(OPEN);
        const a = u < .5 ? P.seat : P.door, b = u < .5 ? P.door : P.out, k = smooth(u < .5 ? u * 2 : (u - .5) * 2);
        cn.ax = a[0] + (b[0] - a[0]) * k; cn.az = a[1] + (b[1] - a[1]) * k; cn.yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
        if (u >= 1) { cn.ph = 'off'; cn.t = 0; }
      } else { // off: walk away to the kerb while the door swings shut
        const dr = cn.drop || P.out; const left = goTo(dr[0], dr[1], 3.2); cn.walk = left > .05; door(cn.t > .35 ? 0 : OPEN);
        if (left < .05 && cn.t > .8) { cn.ang = 0; cn.fin(); return; }
      }
      walking.current = cn.walk;
      A.position.set(cn.ax, 0, cn.az); A.rotation.y = cn.yaw; if (cn.ph !== 'close' && cn.ph !== 'open') A.visible = true;
      D.visible = !cn.bike && !cn.bus && cn.ang > .01; D.position.set(cn.car.x, 0, cn.car.z); D.rotation.y = cn.car.r; H.position.set(.15, 0, cn.side * .93); H.rotation.y = cn.side * cn.ang;
      ride.x = cn.ax; ride.z = cn.az; ride.r = cn.car.r; GAME.player.x = cn.ax; GAME.player.z = cn.az;
      if (cn.ph === 'walk' || cn.ph === 'enter' || cn.ph === 'close') g.visible = false; else { g.visible = true; g.position.set(cn.car.x, 0, cn.car.z); g.rotation.y = cn.car.r; }
      return;
    }
    if (!ride || !g || !rs.current || !route.current) { if (g) g.visible = false; return; }
    const r = rs.current, rt = route.current;
    stepRide(r, rt, Math.min(dtRaw, .05), { vmax: ride.kind === 'taxi' ? 11 : ride.kind === 'bus' ? 8.5 : 7.5, t: st.clock.elapsedTime, light: lightState, cars: TPOS });
    ride.x = r.x; ride.z = r.z; ride.r = r.r;
    g.visible = true; g.position.set(r.x, 0, r.z); g.rotation.y = r.r;
    OBS[2].x = r.x; OBS[2].z = r.z; GAME.player.x = r.x; GAME.player.z = r.z;
    if (r.done) { // arrived: the door opens, the rider steps out onto the sidewalk, the door shuts and the taxi / bike goes back to roaming the city
      const bt = busTrip.current;
      if (bt && !bt.stops[bt.k]?.mine) { // a bus stop that is not yours: the other passengers get off, then the bus drives on to the next stop
        const stop = bt.stops[bt.k];
        if (bt.dwell < 0) { bt.dwell = 2.6; GAME.notice = `🚌 ${stop.name}: ${stop.n} passenger${stop.n === 1 ? '' : 's'} got off`; }
        bt.dwell -= Math.min(dtRaw, .05);
        if (bt.dwell > 0) return;
        let leg: Route | null = null;
        while (bt.k + 1 < bt.stops.length) { bt.k++; const nx = bt.stops[bt.k]; leg = planRide(rt.end, [nx.x, nx.z]); if (leg || nx.mine) break; }
        bt.dwell = -1;
        if (leg) { route.current = leg; rs.current = newRide(leg, r.r); ride.path = leg.pts; ride.i = 0; GAME.notice = `🚌 Next stop: ${bt.stops[bt.k].name}`; return; }
        busTrip.current = null; GAME.notice = '🚌 The bus cannot reach your stop from here: you get off at the last stop.'; // fall through: let the player off now
      }
      const car: CarPose = { x: r.x, z: r.z, r: r.r }, bike = ride.kind === 'bike', bus = ride.kind === 'bus', name = ride.name, drop: [number, number] = [rt.drop[0], rt.drop[1]];
      const side: 1 | -1 = ((drop[0] - car.x) * Math.sin(car.r) + (drop[1] - car.z) * Math.cos(car.r)) >= 0 ? 1 : -1, seat = doorPts(car, side, bike, bus).seat;
      CINE.on = true;
      cine.current = { ph: bike ? 'exit' : 'open', t: 0, side, bike, bus, ang: 0, car, ax: seat[0], az: seat[1], yaw: car.r, walk: false, drop, fin: () => {
        cine.current = null; CINE.on = false; walking.current = false; actor.current.visible = false; doorG.current.visible = false;
        GAME.ride = null; rs.current = null; route.current = null; OBS[2].on = false; busTrip.current = null;
        if (rideId.current) { const id = rideId.current; rideId.current = null; fetch('/api/rides', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'complete', id }) }).catch(() => {}); }
        GAME.player.x = drop[0]; GAME.player.z = drop[1]; GAME.tp = { x: drop[0], z: drop[1] };
        GAME.notice = `📍 Arrived at ${name}`; g.visible = false;
        if (ROAM.rideIdx >= 0) { respawnRoamer(ROAM.rideIdx); ROAM.rideIdx = -1; }
        setTick(v => v + 1);
      } };
    }
  });

  const refundRide = (id: string) => { fetch('/api/rides', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'refund', id }) }).catch(() => {}); };
  /** `pre` = the id of a ride another player already paid for: nothing is charged and the destination was chosen by them. */
  const go = async (idx: number, d: Dest, pre?: string): Promise<string | void> => {
    const e = ROAM.cars[idx], tp = TPOS[idx]; if (!e || !tp || e.c.hail !== 2 || e.c.busy) { setOpen(null); if (pre) refundRide(pre); return; }
    const { l, c } = e, kind: 'taxi' | 'bike' | 'bus' = c.role === 'bus' ? 'bus' : c.role === 'bike' ? 'bike' : 'taxi';
    const start = { x: tp.x, z: tp.z, axis: l.axis, road: l.road, along: c.s, h: l.dir };
    const direct = planRide(start, [d.x, d.z]);
    if (!direct) { GAME.notice = 'It cannot set off from here: hail one nearer the middle of the map.'; releaseRoamer(c); DISPATCH.idx = -1; if (pre) refundRide(pre); setOpen(null); return; }
    let rt = direct, stops: BusStop[] | null = null, firstK = 0, riders = 1;
    if (kind === 'bus') { // the bus visits every passenger's stop (nearest first) and ends at yours
      const all: BusStop[] = [...(MANIFEST.get(idx) || []), { name: d.name, x: d.x, z: d.z, n: 0, mine: true }];
      riders = all.reduce((a, m) => a + m.n, 1);
      const order: BusStop[] = []; let cx = tp.x, cz = tp.z;
      while (all.length) { let bi = 0, bd = Infinity; all.forEach((s2, i) => { const dd = Math.hypot(s2.x - cx, s2.z - cz); if (dd < bd) { bd = dd; bi = i; } }); const [s2] = all.splice(bi, 1); order.push(s2); cx = s2.x; cz = s2.z; if (s2.mine) break; } // passengers whose stop is after yours stay on board
      let leg: Route | null = null; for (; firstK < order.length; firstK++) { leg = planRide(start, [order[firstK].x, order[firstK].z]); if (leg || order[firstK].mine) break; }
      if (!leg) { leg = direct; firstK = order.length - 1; }
      rt = leg; stops = order;
    }
    let res: Response, data: any;
    try { res = await fetch('/api/transport', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(pre ? { rideId: pre } : { kind, riders }) }); data = await res.json().catch(() => ({})); } catch { return 'Network error. Try again.'; }
    if (!res.ok) { const m = data.error || 'Transport unavailable.'; GAME.notice = m; if (pre) { releaseRoamer(c); DISPATCH.idx = -1; } return m; }
    if (c.hail !== 2 || c.busy) { GAME.notice = 'That ride left without you.'; setOpen(null); return; }
    MANIFEST.delete(idx);
    const p0 = GAME.player, bike = kind === 'bike', bus = kind === 'bus', car: CarPose = { x: tp.x, z: tp.z, r: l.rot };
    const side: 1 | -1 = ((p0.x - tp.x) * Math.sin(l.rot) + (p0.z - tp.z) * Math.cos(l.rot)) >= 0 ? 1 : -1;
    CINE.on = true; ROAM.sel = -1; DISPATCH.idx = -1; DISPATCH.ride = null;
    GAME.ride = { kind, x: p0.x, z: p0.z, r: l.rot, name: d.name, path: rt.pts, i: 0, speed: kind === 'taxi' ? 11 : kind === 'bus' ? 8.5 : 7.5, stand: -1 };
    cine.current = { ph: 'walk', t: 0, side, bike, bus, ang: 0, car, ax: p0.x, az: p0.z, yaw: Math.atan2(tp.x - p0.x, tp.z - p0.z), walk: true, fin: () => { // door shut, passenger inside: off we go
      cine.current = null; CINE.on = false; walking.current = false; actor.current.visible = false; doorG.current.visible = false;
      route.current = rt; rs.current = newRide(rt, l.rot); c.busy = true; c.hail = 0; c.stopping = false; ROAM.rideIdx = idx;
      busTrip.current = stops ? { stops, k: firstK, dwell: -1 } : null; rideId.current = pre || null;
      GAME.notice = kind === 'bus' ? `🚌 Bus to ${d.name}: ${stops && stops.length > 1 ? `${stops.length - 1} stop${stops.length === 2 ? '' : 's'} on the way` : 'no stops on the way'}` : `${kind === 'taxi' ? '🚕 Your driver' : '🚲 Your rider'} is taking you to ${d.name}`; setTick(v => v + 1);
    } };
    GAME.notice = kind === 'bus' ? '🚌 Getting on...' : kind === 'taxi' ? '🚕 Getting in...' : '🚲 Hopping on...';
    setOpen(null); setTick(v => v + 1);
  };
  // a ride another player ordered for you has pulled up: climb in and go, no menu, no payment
  useEffect(() => { ROAM.autoGo = (i: number) => { const r = DISPATCH.ride; if (!r || DISPATCH.idx !== i) return; if (VEH.drv || GAME.ride || GAME.jailed) { refundRide(r.id); const rc = ROAM.cars[i]; if (rc) releaseRoamer(rc.c); DISPATCH.idx = -1; DISPATCH.ride = null; GAME.notice = 'Ride cancelled: you were busy. The fare was returned.'; return; } go(i, { id: 'dispatch', name: r.name, type: 'Meeting point', district: '', x: r.x, z: r.z }, r.id); }; return () => { ROAM.autoGo = () => {}; }; });
  const openKind: 'taxi' | 'bike' | 'bus' = open !== null ? (ROAM.cars[open]?.c.role === 'bike' ? 'bike' : ROAM.cars[open]?.c.role === 'bus' ? 'bus' : 'taxi') : 'taxi';
  return <>
    <group ref={actor} visible={false}><Human look={look} getState={() => (walking.current ? 'walk' : 'idle')} getSpeed={() => 1.9} /></group>
    <group ref={doorG} visible={false}><group ref={hinge} position={[.15, 0, .93]}>
      <mesh position={[-.45, .72, 0]}><boxGeometry args={[.9, .56, .05]} /><meshStandardMaterial color="#e5b72f" metalness={.35} roughness={.45} /></mesh>
      <mesh position={[-.45, 1.17, 0]}><boxGeometry args={[.8, .3, .04]} /><meshStandardMaterial color="#1b2a38" metalness={.6} roughness={.15} /></mesh>
      <mesh position={[-.82, .92, .05]}><boxGeometry args={[.14, .03, .05]} /><meshStandardMaterial color="#222" /></mesh>
    </group></group>
    <group ref={activeRef} visible={false}>{GAME.ride?.kind === 'bike' ? <BikeBody scale={1} rider /> : GAME.ride?.kind === 'bus' ? <BusBody /> : <TaxiBody kit={kit} driver />}</group>
    {open !== null && <Html position={[0, 0, 0]}><TransportSheet kind={openKind} manifest={MANIFEST.get(open)} onPick={d => go(open, d)} onClose={() => setOpen(null)} /></Html>}
    <RuntimeStyle css={`${DEST_PICKER_CSS}.hailTag{font:400 15px/1 var(--gf,system-ui);color:#fff;background:var(--plum,#261a36);border:3px solid var(--ink,#1a1410);border-radius:999px;padding:5px 12px 4px;white-space:nowrap;box-shadow:0 3px 0 var(--ink,#1a1410);-webkit-text-stroke:3px var(--ink,#1a1410);paint-order:stroke fill;letter-spacing:.03em;pointer-events:auto;cursor:pointer}.hailTag.go{background:var(--gold,#ffb81c)}\n.trTag{font:400 15px/1 var(--gf,system-ui);color:#fff;background:var(--plum,#261a36);border:3px solid var(--ink,#1a1410);border-radius:999px;padding:4px 11px 3px;white-space:nowrap;box-shadow:0 3px 0 var(--ink,#1a1410);-webkit-text-stroke:3px var(--ink,#1a1410);paint-order:stroke fill;letter-spacing:.03em;transition:opacity .18s;pointer-events:none}.trTag.off{opacity:0}.trTag.near{background:var(--gold,#ffb81c)}
.trSheet{position:fixed;z-index:60;right:calc(12px + env(safe-area-inset-right,0px));top:calc(54px + env(safe-area-inset-top,0px));bottom:calc(12px + env(safe-area-inset-bottom,0px));width:min(320px,40vw);display:flex;flex-direction:column;overflow:hidden;background:var(--plum,#261a36);color:var(--cream,#fff3d6);border:4px solid var(--ink,#1a1410);border-radius:22px;box-shadow:0 6px 0 var(--ink,#1a1410),0 18px 34px #000a;font-family:var(--gf,system-ui);animation:trIn .24s cubic-bezier(.3,1.4,.5,1)}
.trSheet h3{flex:none;margin:0;padding:10px 54px 8px 16px;background:var(--gold,#ffb81c);border-bottom:4px solid var(--ink,#1a1410);font-weight:400;font-size:22px;line-height:1.1;letter-spacing:.04em;color:#fff;background-image:repeating-linear-gradient(135deg,#ffffff1c 0 10px,#0000 10px 20px)}.trSheet h3 span{display:block;-webkit-text-stroke:6px var(--ink,#1a1410);paint-order:stroke fill}
.trX{all:unset;box-sizing:border-box;position:absolute;z-index:2;right:10px;top:8px;width:34px;height:34px;display:grid;place-items:center;border-radius:50%;cursor:pointer;background:var(--red,#ff5147);border:3px solid var(--ink,#1a1410);box-shadow:0 3px 0 var(--ink,#1a1410);color:#fff;font-size:15px}.trX:active{transform:translateY(3px);box-shadow:none}
.trBody{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:12px;display:flex;flex-direction:column;gap:9px;scrollbar-width:thin;scrollbar-color:var(--gold,#ffb81c) transparent}
.trBody p{margin:0;padding:7px 12px;background:var(--cream,#fff3d6);color:var(--ink,#1a1410);border:3px solid var(--ink,#1a1410);border-radius:14px;box-shadow:0 3px 0 var(--ink,#1a1410);font-size:13px;line-height:1.28}
.trBody button{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:10px;cursor:pointer;width:100%;padding:8px 9px 8px 12px;background:var(--plum2,#34244a);color:var(--cream,#fff3d6);border:3px solid var(--ink,#1a1410);border-radius:16px;box-shadow:0 4px 0 var(--ink,#1a1410);font-family:var(--gf,system-ui);transition:transform .1s,filter .1s}.trBody button:hover{filter:brightness(1.12)}.trBody button:active{transform:translateY(4px);box-shadow:none}
.trBody .tx{flex:1;min-width:0}.trBody b{font-weight:400;font-size:16px;letter-spacing:.03em;color:#fff}.trBody em{flex:none;font-style:normal;padding:5px 14px 4px;background:var(--green,#2fc66b);color:#fff;border:3px solid var(--ink,#1a1410);border-radius:12px;box-shadow:0 3px 0 var(--ink,#1a1410),inset 0 3px 0 #ffffff55;font-size:15px;-webkit-text-stroke:4px var(--ink,#1a1410);paint-order:stroke fill}
@keyframes trIn{from{transform:translateX(40px);opacity:0}to{transform:none;opacity:1}}@media (max-width:620px) and (orientation:portrait){.trSheet{left:10px;right:10px;top:auto;width:auto;max-height:46vh}}`} />
  </>;
}
function Billboards() {
  return <>{BILLBOARDS.map(b => <group key={b.i} position={[b.x, 0, b.z]} rotation-y={b.ry}>
    {[-1.7, 1.7].map(o => <mesh key={o} position={[o, 1.8, 0]} castShadow><boxGeometry args={[.16, 3.6, .16]} /><meshStandardMaterial color="#2f343a" metalness={.3} roughness={.6} /></mesh>)}
    <mesh position={[0, 4.5, 0]} castShadow><boxGeometry args={[5.6, 2.7, .22]} /><meshStandardMaterial color="#14201b" roughness={.6} /></mesh>
    <mesh position={[0, 4.5, -.12]}><boxGeometry args={[5.2, 2.3, .04]} /><meshStandardMaterial color={BILLBOARD_COLORS[b.i % BILLBOARD_COLORS.length]} emissive={BILLBOARD_COLORS[b.i % BILLBOARD_COLORS.length]} emissiveIntensity={.45} roughness={.5} /></mesh>
    {/* the front of the board faces -z (towards the road); drei Text faces +z, so it is turned round */}
    <Text position={[0, 4.85, -.16]} rotation-y={Math.PI} fontSize={.46} color="#fff" outlineWidth={.02} outlineColor="#0b0b0b" anchorX="center" anchorY="middle" maxWidth={4.9}>{b.title}</Text>
    <Text position={[0, 4.12, -.16]} rotation-y={Math.PI} fontSize={.22} color="#fff7e0" anchorX="center" anchorY="middle" maxWidth={4.9}>{b.sub}</Text>
    {[-1.8, 0, 1.8].map(x => <mesh key={x} position={[x, 6.0, -.35]}><boxGeometry args={[.5, .1, .3]} /><meshStandardMaterial color="#fff2c4" emissive="#ffe29a" emissiveIntensity={.9} /></mesh>)}
  </group>)}</>;
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
type Ped = { axis: 'x' | 'z'; line: number; u: number; dir: 1 | -1; sp: number; ph: number; down: number; x: number; z: number; moving: boolean; shirt: string; pants: string; skin: string; home:string; work:string; mode:'home'|'commute'|'work'|'social'|'flee'; hidden:boolean; target:[number,number]; vis:number; yaw:number; off:number; vf:number; tc:number; rest:number; ox:number; oz:number };
const SHIRTS = ['#c0392b', '#2c5aa0', '#e8e8ea', '#1e9e55', '#f1c40f', '#7c3aed', '#0f766e', '#d97706', '#111827', '#be185d'];
const PANTS = ['#1f2937', '#374151', '#4b5563', '#111827', '#2b3a55', '#5b4636'];
const SKINS = ['#3b2417', '#4a2e1c', '#5a3825', '#6b4429', '#7a4f32', '#8d5f3d'];
const PED_N = 32; // Keep NPCs as light ambient life; real users are the primary population.
const pick = <T,>(a: T[], k: string) => a[Math.floor(hs(k) * a.length) % a.length];
function makePeds(): Ped[] {
  return Array.from({ length: PED_N }, (_, n) => {
    const ri = Math.floor(hs('pi' + n) * 11) - 5, side = hs('ps' + n) < .5 ? 1 : -1, axis: 'x' | 'z' = hs('pa' + n) < .5 ? 'x' : 'z';
    const homes=['Gwarinpa','Kubwa','Maitama','Jabi','Asokoro','Utako'], works=['Central Area','Wuse','Garki','Maitama','Jabi','Airport Corridor']; const home=homes[n%homes.length], work=works[(n*3)%works.length]; return { axis, line: ri * GRID + side * (halfW(ri) + 2 + (hs('po' + n) - .5)), u: (hs('pu' + n) * 2 - 1) * 118, dir: (hs('pd' + n) < .5 ? 1 : -1) as 1 | -1, sp: 1.1 + hs('pv' + n) * .7, ph: hs('pp' + n) * 6.28, down: 0, x: 0, z: 0, moving: true, shirt: pick(SHIRTS, 'sh' + n), pants: pick(PANTS, 'pn' + n), skin: pick(SKINS, 'sk' + n), home, work, mode:'work', hidden:false, target:[0,0], vis:1, yaw:NaN, off:hs('po' + n) - .5, vf:.88 + hs('pf' + n) * .24, tc:0, rest:0, ox:0, oz:0 };
  });
}
const timeToGreen = (t: number, axis: 'x' | 'z') => { const c = t % 32; return axis === 'x' ? (c < 14 ? 0 : 32 - c) : (c >= 16 && c < 30 ? 0 : c < 16 ? 16 - c : 48 - c); };
const canCross = (t: number, carAxis: 'x' | 'z') => lightState(t, carAxis) === 'r' && timeToGreen(t, carAxis) > 5.5;
function Pedestrians() {
  const peds = useMemo(makePeds, []);
  const torso = useRef<THREE.InstancedMesh>(null!), head = useRef<THREE.InstancedMesh>(null!), legs = useRef<THREE.InstancedMesh>(null!), arms = useRef<THREE.InstancedMesh>(null!);
  const T = useMemo(() => ({ base: new THREE.Matrix4(), m: new THREE.Matrix4(), t: new THREE.Matrix4(), r: new THREE.Matrix4(), pos: new THREE.Vector3(), one: new THREE.Vector3(1, 1, 1), sc: new THREE.Vector3(1, 1, 1), qa: new THREE.Quaternion(), qb: new THREE.Quaternion(), q: new THREE.Quaternion(), Y: new THREE.Vector3(0, 1, 0), Z: new THREE.Vector3(0, 0, 1) }), []);
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
    const wc = worldCalendar(); const wx = weatherAt(); const night = wc.hh >= 20 || wc.hh < 6; const rain = wx.rain > .45;
    const part = (mesh: THREE.InstancedMesh, idx: number, tx: number, ty: number, tz: number, rz = 0, dy = 0) => {
      T.t.makeTranslation(tx, ty, tz); T.m.copy(T.base).multiply(T.t);
      if (rz) { T.r.makeRotationZ(rz); T.m.multiply(T.r); }
      if (dy) { T.t.makeTranslation(0, dy, 0); T.m.multiply(T.t); }
      mesh.setMatrixAt(idx, T.m);
    };
    const eventActive = (wc.hh >= 0 && wc.hh % 6 === 0) || wx.storm;
    peds.forEach((p, i) => {
      let fall = 0; p.moving = false; p.hidden = false;
      const hour=wc.hh + wc.mm/60;
      p.mode = (hour < 6 || hour >= 22) ? 'home' : (hour < 10 || (hour >= 16 && hour < 19)) ? 'commute' : hour >= 19 ? 'social' : 'work';
      if (eventActive && i % 11 === 0) p.mode='flee';
      const prof = CITY.districts.find(d=>d.name===((p.mode==='home'||p.mode==='social')?p.home:p.work));
      if(prof) p.target=[prof.x+p.ox,prof.z+p.oz];
      if(p.mode==='flee'){ const dx=p.x-(p.target[0]||0),dz=p.z-(p.target[1]||0),len=Math.hypot(dx,dz)||1;p.target=[p.x+dx/len*18,p.z+dz/len*18]; if(i%11===0 && Math.random()<.002) window.dispatchEvent(new CustomEvent('arl-npc-alert',{detail:`🚨 NPC ${i+1} reported an incident to police.`})); }
      const td=Math.hypot(p.x-p.target[0],p.z-p.target[1]);
      p.tc=Math.max(0,p.tc-dt);
      const wander=()=>(Math.random()<.5?-1:1)*(20+Math.random()*25);
      if(p.hidden){ p.rest-=dt; if(p.rest<=0){ p.ox=wander(); p.oz=wander(); p.hidden=false; p.tc=0; } else if(td>16){ p.hidden=false; p.tc=0; } } // inside a shop/home for a while, then comes back out and walks somewhere else
      else if(td<12 && p.mode!=='flee'){ p.hidden=true; p.rest=12+Math.random()*30; }
      if(p.hidden) p.moving=false;
      if (p.down > 0) { p.down -= dt; fall = Math.min(1, (3.2 - p.down) / .25) * Math.min(1, Math.max(0, p.down) / .35); }
      else {
        let go = !p.hidden;
        if(p.mode==='flee'){ p.dir = p.axis==='x' ? (p.target[0]>=p.x?1:-1) : (p.target[1]>=p.z?1:-1); p.sp=2.8*p.vf; }
        else if(!p.hidden && td>4){
          const tx=p.target[0],tz=p.target[1],ox=p.x,oz=p.z;
          if(p.tc<=0){ // walk the pavements: go along the road to the junction nearest the target, turn there, never cut across blocks
            if(p.axis==='x'){
              if(Math.abs(tz-oz)>6){ const kt=Math.max(-5,Math.min(5,Math.round(tx/GRID))); if(Math.abs(ox-kt*GRID)<halfW(kt)+2.5){ p.axis='z'; p.line=kt*GRID+(ox>=kt*GRID?1:-1)*(halfW(kt)+2+p.off); p.u=oz; p.dir=tz>oz?1:-1; p.tc=2.5; } else p.dir=kt*GRID>ox?1:-1; }
              else p.dir=tx>ox?1:-1;
            } else {
              if(Math.abs(tx-ox)>6){ const kr=Math.max(-5,Math.min(5,Math.round(tz/GRID))); if(Math.abs(oz-kr*GRID)<halfW(kr)+2.5){ p.axis='x'; p.line=kr*GRID+(oz>=kr*GRID?1:-1)*(halfW(kr)+2+p.off); p.u=ox; p.dir=tx>ox?1:-1; p.tc=2.5; } else p.dir=kr*GRID>oz?1:-1; }
              else p.dir=tz>oz?1:-1;
            }
          }
          p.sp = (p.mode==='commute'?1.8:p.mode==='social'?1.35:1.1)*p.vf;
        }
        const nx = nextCenter(p.u, p.dir), rj = Math.round(nx / GRID);
        if (Math.abs(rj) <= 5) { const dist = (nx - p.u) * p.dir - (halfW(rj) + .3); if (dist > -.05 && dist < .5 && signalised(rj, Math.round(p.line / GRID)) && !canCross(t, p.axis === 'x' ? 'z' : 'x')) go = false; } // wait at the kerb for a red light
        if (go) { const activityFactor = night ? .55 : rain ? .72 : (wc.hh >= 7 && wc.hh < 10 ? 1.15 : 1); p.u += p.dir * p.sp * activityFactor * dt; p.ph += dt * p.sp * 5; p.moving = true; if (p.u > 124) p.dir = -1; else if (p.u < -124) p.dir = 1; }
      }
      if (p.axis === 'x') { p.x = p.u; p.z = p.line; } else { p.x = p.line; p.z = p.u; }
      if (p.down <= 0 && VEH.drv && Math.abs(VEH.v) > 3.5) { const dx = p.x - VEH.x, dz = p.z - VEH.z; if (dx * dx + dz * dz < 3.6) { p.down = 3.2; VEH.v *= .9; thud(.5); } } // clipped by the player's car
      const yawT = p.axis === 'x' ? (p.dir > 0 ? 0 : Math.PI) : -p.dir * Math.PI / 2, sw = p.moving ? Math.sin(p.ph) : 0;
      if (Number.isNaN(p.yaw)) p.yaw = yawT; let dyw = yawT - p.yaw; dyw = Math.atan2(Math.sin(dyw), Math.cos(dyw)); p.yaw += dyw * Math.min(1, dt * 9); // turn smoothly instead of snapping 180°
      p.vis += ((p.hidden ? 0 : 1) - p.vis) * Math.min(1, dt * 5); const sc = Math.max(.001, p.vis); T.sc.set(sc, sc, sc);
      T.qa.setFromAxisAngle(T.Y, p.yaw); T.qb.setFromAxisAngle(T.Z, -fall * Math.PI / 2); T.q.copy(T.qa).multiply(T.qb);
      T.pos.set(p.x, .12 * fall + (p.moving ? Math.abs(sw) * .03 : 0), p.z); T.base.compose(T.pos, T.q, T.sc);
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
  const kit = pkit(), tgt = useMemo(() => new THREE.Object3D(), []); const [style,setStyle]=useState<any>(null); useEffect(()=>{fetch('/api/vehicles').then(r=>r.ok?r.json():null).then(d=>setStyle(d?.vehicles?.[0]||null)).catch(()=>{});},[model]);
  useLayoutEffect(() => { spotRef.current.target = tgt; }, [tgt, spotRef]);
  return <group ref={carRef} visible={false}>
    <CarModel kit={kit} color={vehicleByName(model).color || CAR_COLOR} kind={0} model={model} style={style||undefined} />
    <spotLight ref={spotRef} position={[2.2, .9, 0]} angle={.5} penumbra={.7} intensity={0} distance={42} decay={2} color="#fff4d6" />
    <primitive object={tgt} position={[16, .2, 0]} />
    <Html position={[0, 2.4, 0]} center zIndexRange={[5, 0]}><div ref={el => { tagRef.current = el; }} className="cityBizTag" style={{ display: 'none' }}>Your car<br /><small>Press E</small></div></Html>
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
const START = { x: 0, z: 16, r: Math.PI }; // overwritten with a random sidewalk spot each time a player steps outside (see CityWorld)
export const GAME = { jailed: false, hasCar: false, vehicleModel: 'Toyota Camry', notice: '', tp: null as { x: number; z: number } | null, nav: null as { x: number; z: number; name: string } | null, player: { x: START.x, z: START.z, r: 0 }, ride: null as null | { kind: 'taxi' | 'bike' | 'bus'; x: number; z: number; r: number; name: string; path: [number, number][]; i: number; speed: number; stand?: number } }; // set by the game layer
const CELL = { x: JAIL_CELL_POS.x, z: JAIL_CELL_POS.z, h: 2.6 };
const sm = THREE.MathUtils.smoothstep;
const WX = { over: new THREE.Color('#7d8791'), dust: new THREE.Color('#d6bf9b'), flash: new THREE.Color('#e8f0ff'), tmp: new THREE.Color() };
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
function WeatherEffects(){
 const puddles=useMemo(()=>Array.from({length:36},(_,i)=>({x:(hs('px'+i)*2-1)*125,z:(hs('pz'+i)*2-1)*125,s:.7+hs('ps'+i)*1.8})),[]);
 const umb=useRef<THREE.Group>(null!);
 useFrame(()=>{const w=weatherAt(); if(umb.current) umb.current.visible=w.rain>.45;});
 return <><group>{puddles.map((p,i)=><mesh key={i} position={[p.x,.025,p.z]} rotation-x={-Math.PI/2} scale={[p.s,p.s,1]}><circleGeometry args={[1,20]}/><meshBasicMaterial color="#5b7180" transparent opacity={.18} depthWrite={false}/></mesh>)}</group><group ref={umb}>{Array.from({length:12},(_,i)=><group key={i} position={[(hs('ux'+i)*2-1)*45,1.6,(hs('uz'+i)*2-1)*45]}><mesh rotation-x={-Math.PI/2}><cylinderGeometry args={[.45,.45,.03,16]}/><meshStandardMaterial color={['#d99a42','#2c5aa0','#c0392b','#1e9e55'][i%4]} /></mesh><mesh position={[0,-.45,0]}><cylinderGeometry args={[.025,.025,.9,6]}/><meshStandardMaterial color="#222"/></mesh></group>)}</group></>;
}
function WorldEventVisuals(){
 const [events,setEvents]=useState<any[]>([]); useEffect(()=>{let dead=false;const load=()=>fetch('/api/city-life').then(r=>r.ok?r.json():null).then(d=>{if(!dead)setEvents(d?.events||[])}).catch(()=>{});load();const i=setInterval(load,12000);return()=>{dead=true;clearInterval(i)}},[]);
 const [,nearTick]=useState(0); useEffect(()=>{const t=setInterval(()=>nearTick(n=>n+1),1500);return()=>clearInterval(t)},[]); // re-check which events are close to you
 return <>{events.map(e=>{const d=CITY.districts.find(x=>x.name===e.district)||CITY.districts[0], close=Math.hypot(d.x-NET.me.x,d.z-NET.me.z)<45, icon=e.kind==='fire'?'🔥':e.kind==='accident'?'🚨':e.kind==='robbery'?'🚔':e.kind==='flood'?'🌊':e.kind==='celebration'||e.kind==='concert'?'🎉':'⚠️';return <group key={e.id} position={[d.x,0,d.z]}>{e.kind==='fire'&&<pointLight color="#ff6a22" intensity={5} distance={22}/>}{close&&<Html center zIndexRange={[4,0]} style={{pointerEvents:'none'}}><div className="worldEventTag">{icon} {e.title}<small>{e.district}</small></div></Html>}{e.kind==='fire'&&<mesh position={[0,2.3,0]}><sphereGeometry args={[1.2,10,10]}/><meshBasicMaterial color="#ff4b20" transparent opacity={.45}/></mesh>}{e.kind==='accident'&&<group rotation-y={.4}><mesh position={[0,.5,0]}><boxGeometry args={[3.2,.7,1.7]}/><meshStandardMaterial color="#7b2d2d"/></mesh><mesh position={[0,1.3,0]}><boxGeometry args={[2,.15,1.1]}/><meshStandardMaterial color="#ffb000" emissive="#ff5a00" emissiveIntensity={2}/></mesh></group>}{(e.kind==='celebration'||e.kind==='concert')&&Array.from({length:8},(_,i)=><mesh key={i} position={[(hs(e.id+i)*2-1)*5,.5,(hs(e.id+'z'+i)*2-1)*5]}><sphereGeometry args={[.18,8,8]}/><meshStandardMaterial color="#d99a42"/></mesh>)}</group>})}</>;
}
function Rain() {
  const N = 520, g = useRef<THREE.Group>(null!), ls = useRef<THREE.LineSegments>(null!), seed = useMemo(() => Float32Array.from({ length: N * 3 }, (_, i) => (i % 3 === 1 ? Math.random() * 22 : (Math.random() - .5) * 38)), []), pos = useMemo(() => new Float32Array(N * 6), []);
  useFrame((st, dtRaw) => {
    const W = weatherAt(), dt = Math.min(dtRaw, .05); if (!ls.current) return;
    ls.current.visible = W.rain > .03; if (!ls.current.visible) return;
    g.current.position.copy(st.camera.position);
    const n = Math.floor(N * Math.min(1, W.rain * 1.15)), wind = 2 + W.storm * 5; (ls.current.material as THREE.LineBasicMaterial).opacity = .18 + W.rain * .32;
    for (let i = 0; i < n; i++) { let y = seed[i * 3 + 1] - (26 + W.storm * 10) * dt; if (y < -6) y += 28; seed[i * 3 + 1] = y; const x = seed[i * 3], z = seed[i * 3 + 2], o = i * 6; pos[o] = x; pos[o + 1] = y; pos[o + 2] = z; pos[o + 3] = x + wind * .035; pos[o + 4] = y - .9; pos[o + 5] = z; }
    const geo = ls.current.geometry; geo.setDrawRange(0, n * 2); (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  });
  return <group ref={g}><lineSegments ref={ls} frustumCulled={false} visible={false}><bufferGeometry><bufferAttribute attach="attributes-position" args={[pos, 3]} /></bufferGeometry><lineBasicMaterial color="#c4d4e2" transparent opacity={.4} depthWrite={false} fog={false} /></lineSegments></group>;
}
function Scene({ look, ctl, hud, setNear, getMinute, roster, ver, bub, onPick, fight }: { fight: (to: string) => boolean; look: Look; ctl: React.MutableRefObject<Ctl>; hud: React.MutableRefObject<Hud>; setNear: (b: any) => void; getMinute?: () => number; roster: string[]; ver: number; bub: Record<string, string>; onPick: (n: string) => void }) {
  const P = useRef({ x: START.x, z: START.z, y: 0, vy: 0, r: START.r });
  const group = useRef<THREE.Group>(null!), controls = useRef<any>(null), sun = useRef<THREE.DirectionalLight>(null!), hemi = useRef<THREE.HemisphereLight>(null!), stars = useRef<THREE.Group>(null!);
  const carG = useRef<THREE.Group>(null!), carTag = useRef<HTMLDivElement | null>(null), spot = useRef<THREE.SpotLight>(null!), nameTag = useRef<HTMLDivElement | null>(null);
  const sunTarget = useMemo(() => new THREE.Object3D(), []);
  const moving = useRef(false), running = useRef(false), nearId = useRef<string | null>(null);
  const drag = useRef({ on: false, end: 0 }), lastN = useRef(-1), fov = useRef(52), hitCool = useRef(0), shown = useRef({ drv: false, placed: false });
  const firstCam = useRef(true); const driveKm=useRef(0); const lastDrivePost=useRef(0);
  const nav = useRef<{ key: string; points: [number, number][]; i: number } | null>(null);
  const [near, setN] = useState<any>(null);
  const [touchDevice, setTouchDevice] = useState(false);
  const [vehicleModel, setVehicleModel] = useState(GAME.vehicleModel);
  useEffect(() => { let dead = false; const load = async () => { try { const r = await fetch('/api/vehicles'); if (!r.ok) return; const d = await r.json(); const m = d.active || GAME.vehicleModel; if (d.vehicles?.[0]) (window as any).__arlVehicleId=d.vehicles[0].id; if (!dead) { GAME.vehicleModel = m; setVehicleModel(m); } } catch {} }; load(); const id = setInterval(load, 8000); return () => { dead = true; clearInterval(id); }; }, []);
  useEffect(() => { let dead=false; const push=()=>{ if(dead)return; const p=GAME.player; const district=CITY.districts.reduce((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)<Math.hypot(b.x-p.x,b.z-p.z)?a:b); fetch('/api/position',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({x:p.x,z:p.z,r:p.r,district:district.name,driving:VEH.drv})}).catch(()=>{}); }; push(); const id=setInterval(push,5000); return()=>{dead=true;clearInterval(id)}; }, []);
  useEffect(() => { const m = window.matchMedia('(pointer: coarse), (max-width: 700px)'); const sync = () => setTouchDevice(m.matches); sync(); m.addEventListener?.('change', sync); return () => m.removeEventListener?.('change', sync); }, []);
  const nearBuilding = near ? BUILDS.find(x => x.business?.id === near.id) : null;
  useEffect(() => { sun.current.target = sunTarget; }, [sunTarget]);
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    document.addEventListener('gesturestart', stop as any, { passive: false });
    document.addEventListener('gesturechange', stop as any, { passive: false });
    return () => { document.removeEventListener('gesturestart', stop as any); document.removeEventListener('gesturechange', stop as any); };
  }, []);
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

    /* ── time of day (follows the in-game clock) ── */
    const hrs = ((((getMinute ? getMinute() : worldMinute()) / 60) % 24) + 24) % 24, ang = (hrs - 6) / 12 * Math.PI, el = Math.sin(ang);
    const day = sm(el, -.08, .3), n = 1 - day, dusk = Math.min(1, Math.max(0, 1 - Math.abs(el) / .28)) * .75;
    NIGHT.n = n;
    const bg = st.scene.background as THREE.Color | null; if (bg) bg.copy(SKY.night).lerp(SKY.day, day).lerp(SKY.dusk, dusk);
    const fg = st.scene.fog as THREE.Fog | null; if (fg) fg.color.copy(SKY.fogNight).lerp(SKY.fogDay, day).lerp(SKY.fogDusk, dusk);
    hemi.current.intensity = .22 + 1.03 * day;
    sun.current.intensity = .5 + 2.3 * day; sun.current.color.copy(SKY.moon).lerp(SKY.sun, day).lerp(SKY.sunLow, dusk * day);
    { // shared weather (same for every player): overcast sky, harmattan dust, rain-thinned fog, dimmer sun, lightning
      const W = weatherAt(), gray = Math.max(W.cloud * .55, W.rain * .75, W.storm * .9), lit = .14 + .86 * day;
      WX.tmp.copy(WX.over).multiplyScalar(lit); if (bg) bg.lerp(WX.tmp, gray * .9); if (fg) fg.color.lerp(WX.tmp, gray * .85);
      WX.tmp.copy(WX.dust).multiplyScalar(lit); if (bg) bg.lerp(WX.tmp, W.haze * .7); if (fg) { fg.color.lerp(WX.tmp, W.haze * .85); fg.near = 90 - W.haze * 55 - W.rain * 35; fg.far = 270 - W.haze * 130 - W.rain * 115; }
      hemi.current.intensity *= 1 - gray * .3; sun.current.intensity *= 1 - gray * .8 - W.haze * .25;
      const fl = lightningAt(Date.now(), W.storm); if (fl) { hemi.current.intensity += fl * 2.4; if (bg) bg.lerp(WX.flash, fl * .55); }
    }
    const sy = Math.max(.32, Math.abs(Math.sin(ang))), sx = Math.cos(ang);
    if (Math.abs(n - lastN.current) > .01) { lastN.current = n; MATS.forEach(m => { m.emissiveIntensity = n * 1.2; }); if (stars.current) stars.current.visible = n > .4; }

    /* ── camera basis / input ── */
    const cam = st.camera, t = oc.target as THREE.Vector3;
    // Player-follow camera: the local player's head is the camera anchor.
    // The view is intentionally first-person so every real user experiences Abuja from their own character's perspective.
    const headY = VEH.drv ? 1.55 : 1.62 + p.y * .5;
    const viewFx = Math.sin(p.r), viewFz = Math.cos(p.r);
    if (c.look.x || c.look.y) {
      const lx = THREE.MathUtils.clamp(c.look.x, -80, 80), ly = THREE.MathUtils.clamp(c.look.y, -80, 80);
      oc.setAzimuthalAngle?.(oc.getAzimuthalAngle() - lx * 0.006);
      oc.setPolarAngle?.(THREE.MathUtils.clamp(oc.getPolarAngle() + ly * 0.004, .35, 1.45));
      c.look = { x: 0, y: 0 };
    }
    let fx = t.x - cam.position.x, fz = t.z - cam.position.z; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    if (GAME.ride) {
      const ride = GAME.ride;
      p.x = ride.x; p.z = ride.z; p.y = 0; p.vy = 0; moving.current = false; running.current = false;
      group.current.visible = false;
      const lookDist = 8, rx = Math.cos(ride.r), rz = -Math.sin(ride.r);
      oc.target.set(ride.x, 1.2, ride.z);
      cam.position.set(ride.x - rx * lookDist, 4.6, ride.z - rz * lookDist);
      GAME.player.x = ride.x; GAME.player.z = ride.z;
      if (c.interact) c.interact = false;
      c.taxi = false;
      return;
    } else { group.current.visible = true; }
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
    /* ── fighting: punch the nearest real player, get knocked out at 0 HP ── */
    const nowMs = Date.now(), me = NET.me;
    if (me.ko && nowMs >= me.ko) { me.ko = 0; me.hp = 35; me.safe = nowMs + 4000; GAME.notice = '💪 You got back up.'; }
    const down = me.ko > nowMs;
    if (!down && me.hp < 100 && nowMs > me.hurt + 6000) me.hp = Math.min(100, me.hp + 5 * dt); // slow regeneration
    if (NET.msg) { GAME.notice = NET.msg; NET.msg = ''; }
    if (c.punch) {
      c.punch = false;
      if (!down && !VEH.drv && !GAME.jailed) {
        let tgt = '', bd = FIGHT.range, tx = 0, tz = 0;
        for (const [pn, q] of Object.entries(NET.peers)) { if (q.drv || q.ko) continue; const dd = Math.hypot(q.x - p.x, q.z - p.z); if (dd < bd) { bd = dd; tgt = pn; tx = q.x; tz = q.z; } }
        if (tgt) p.r = Math.atan2(tx - p.x, tz - p.z);
        fight(tgt);
      }
    }
    if (down) { ix = 0; iy = 0; wantJump = false; wantRun = false; c.interact = false; c.jump = false; }
    const m = Math.hypot(ix, iy); if (m > 1) { ix /= m; iy /= m; }
    const mag = Math.min(m, 1);
    let snapCam = false;

    /* ── T / Taxi button: stopped taxi nearby → destination menu; otherwise hail the closest taxi or bike taxi ── */
    if (c.taxi) {
      c.taxi = false;
      if (!VEH.drv && !GAME.ride && !GAME.jailed && !CINE.on) {
        let bi = -1, bd = 1e9;
        ROAM.cars.forEach((e, i) => { const tp = TPOS[i]; if (!tp || e.c.busy || !isHail(e.c.role)) return; const d = Math.hypot(p.x - tp.x, p.z - tp.z); if (e.c.hail === 2 && d < 18) { if (bd > -1) { bd = -1; bi = i; } } else if (e.c.hail !== 1 && bd >= 0 && d < bd) { bd = d; bi = i; } });
        if (bi < 0) GAME.notice = ROAM.cars.some(e => e.c.hail === 1) ? '🚕 Your taxi is still pulling over...' : '🚕 No taxi, bike or bus nearby: wait for one to drive past.';
        else if (ROAM.cars[bi].c.hail === 2) ROAM.openSheet(bi);
        else ROAM.tap(bi);
      }
    }

    /* ── E: get in / get out / call car, H: horn ── */
    if (c.interact) {
      c.interact = false;
      const taxiI = (!VEH.drv && !GAME.ride) ? ROAM.cars.findIndex((e, i) => isHail(e.c.role) && !e.c.busy && e.c.hail === 2 && TPOS[i] && Math.hypot(p.x - TPOS[i].x, p.z - TPOS[i].z) < 18) : -1;
      if (taxiI >= 0) ROAM.openSheet(taxiI);
      else if (VEH.drv) {
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
      driveKm.current += Math.abs(V.v*dt)/1000; if(VEH.drv && driveKm.current >= .5 && performance.now()-lastDrivePost.current>5000){ const km=driveKm.current; driveKm.current=0; lastDrivePost.current=performance.now(); fetch('/api/vehicles',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'drive',vehicleId:(window as any).__arlVehicleId||'',km})}).catch(()=>{}); }
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
      // Parked taxi/bike stands are solid too; prevent the player from walking through them.
      for (const t of TRANSPORT_SOLIDS) {
        const dx = p.x - t.x, dz = p.z - t.z, d = Math.hypot(dx, dz), min = t.r + BODY;
        if (d < min && d > 1e-4) { p.x = t.x + dx / d * min; p.z = t.z + dz / d * min; }
        else if (d <= 1e-4) p.z += min;
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
    GAME.player.x = p.x; GAME.player.z = p.z; GAME.player.r = p.r;
    group.current.rotation.order = 'YXZ'; group.current.position.set(p.x, p.y + (me.ko > nowMs ? .28 : 0), p.z); group.current.rotation.y = p.r; group.current.rotation.x = me.ko > nowMs ? -Math.PI / 2 : 0; // knocked out: lying on the ground
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

    /* ── third-person follow camera (player is visible, orbit with mouse/touch) ── */
    const dist = VEH.drv ? 8.5 : 4.8, targetY = (VEH.drv ? 1.6 : 1.5) + p.y * .6;
    const dx0 = p.x - t.x, dy0 = targetY - t.y, dz0 = p.z - t.z;
    cam.position.x += dx0; cam.position.y += dy0; cam.position.z += dz0; // carry the camera along with the player
    t.set(p.x, targetY, p.z);
    oc.minDistance = dist; oc.maxDistance = dist;
    if (c.recenter || snapCam || firstCam.current) {
      firstCam.current = false; c.recenter = false;
      const yaw = VEH.drv ? VEH.r : p.r;
      const hx = VEH.drv ? Math.cos(yaw) : Math.sin(yaw), hz = VEH.drv ? -Math.sin(yaw) : Math.cos(yaw);
      oc.setAzimuthalAngle?.(Math.atan2(-hx, -hz));
      oc.setPolarAngle?.(1.2);
    }
    oc.update();
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
      <TransportVehicles look={look} />
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
      <WeatherEffects />
      <WorldEventVisuals />
      <Rain />
      <Airport />
      <JailCell />
      <group ref={group}>
        <Human look={look} getState={() => (moving.current ? 'walk' : 'idle')} getAnim={() => { const m = NET.me; if (moving.current) return undefined; return m.anim && Date.now() < m.animUntil ? m.anim : m.call ? 'phone' : undefined; }} getSpeed={() => (running.current ? 2.4 : 1.1)} />
        <Html position={[0, 2.8, 0]} center zIndexRange={[5, 0]}><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>{bub[look.name] && <div className="cwSay">{bub[look.name]}</div>}<div ref={el => { nameTag.current = el; }} className="cityNameTag" style={{ display: 'none' }}>{look.name}</div></div></Html>
      </group>
      <RemotePlayers roster={roster} ver={ver} bub={bub} onPick={onPick} />
      <OrbitControls ref={controls} makeDefault enableRotate={true} enableZoom={false} enablePan={false} enableDamping={false} touches={{ ONE: -1 as any, TWO: -1 as any }} rotateSpeed={.38} minDistance={4.8} maxDistance={4.8} minPolarAngle={.35} maxPolarAngle={1.45} target={[START.x, 1.62, START.z + 6]} />
    </>
  );
}

/* ───────────── other real players ───────────── */
const rWalk = (n: string) => { const q = NET.peers[n]; return !!q && q.mv > 0 && Math.hypot(q.tx - q.x, q.tz - q.z) > .08; };
/* Crowd-friendly name tags: only the nearest few players get the full tag; the rest shrink to a small faded label, then disappear.
   Anyone who is talking or has a chat bubble always keeps a full tag, so you can still tell who is speaking. */
const TAGS: { at: number; rank: Record<string, number> } = { at: 0, rank: {} };
const tagRanks = () => { const now = performance.now(); if (now - TAGS.at < 250) return; TAGS.at = now; const r: Record<string, number> = {}; Object.entries(NET.peers).map(([n, q]) => [n, Math.hypot(NET.me.x - q.x, NET.me.z - q.z)] as const).sort((a, b) => a[1] - b[1]).forEach(([n], i) => { r[n] = i; }); TAGS.rank = r; };
function Remote({ name, bub, onPick }: { name: string; bub?: string; onPick: (n: string) => void }) {
  const body = useRef<THREE.Group>(null!), car = useRef<THREE.Group>(null!), hum = useRef<THREE.Group>(null!), tag = useRef<HTMLDivElement | null>(null), nameEl = useRef<HTMLDivElement | null>(null);
  const kit = pkit(), remoteModel = VEHICLE_CATALOG[Math.floor(hs(name) * VEHICLE_CATALOG.length)].id, colour = useMemo(() => vehicleById(remoteModel).color, [remoteModel]);
  useFrame((_, dtRaw) => {
    const q = NET.peers[name]; if (!q || !body.current) return;
    const dt = Math.min(dtRaw, .1), k = 1 - Math.exp(-dt * 9);
    q.x += (q.tx - q.x) * k; q.z += (q.tz - q.z) * k; q.r += wrap(q.tr - q.r) * k;
    q.cx += (q.tcx - q.cx) * k; q.cz += (q.tcz - q.cz) * k; q.cr += wrap(q.tcr - q.cr) * k;
    const d = Math.hypot(NET.me.x - q.x, NET.me.z - q.z), near = d < 150;
    body.current.visible = near && !q.drv; body.current.rotation.order = 'YXZ'; body.current.position.set(q.x, q.ko ? .28 : 0, q.z); body.current.rotation.y = q.r; body.current.rotation.x = q.ko ? -Math.PI / 2 : 0;
    car.current.visible = near && (q.cp || q.drv); car.current.position.set(q.cx, 0, q.cz); car.current.rotation.y = q.cr;
    tagRanks();
    const talking = (NET.talk[name] || 0) > Date.now(), rk = TAGS.rank[name] ?? 99, full = rk < 5 || talking || !!bub;
    if (tag.current) {
      const show = full ? d < 60 : rk < 14 && d < 28, sc = full ? THREE.MathUtils.clamp(1.1 - d / 70, .62, 1) : .6, op = full ? THREE.MathUtils.clamp(1.25 - d / 60, .5, 1) : THREE.MathUtils.clamp(1 - d / 28, .35, .85);
      const key = `${show}|${full}|${Math.round(sc * 20)}|${Math.round(op * 20)}`;
      if (tag.current.dataset.k !== key) { tag.current.dataset.k = key; tag.current.style.display = show ? '' : 'none'; tag.current.style.transform = `scale(${sc.toFixed(2)})`; tag.current.style.opacity = String(op.toFixed(2)); nameEl.current?.classList.toggle('mini', !full); }
    }
    nameEl.current?.classList.toggle('talking', talking);
  });
  const p = NET.peers[name]; if (!p) return null;
  return <>
    <group ref={body} onClick={e => { if (e.delta > 6) return; e.stopPropagation(); onPick(name); }}>
      <Human look={p.look} getState={() => (rWalk(name) ? 'walk' : 'idle')} getAnim={() => { const q = NET.peers[name]; if (!q || rWalk(name)) return undefined; return q.anim && Date.now() < q.animUntil ? q.anim : q.call ? 'phone' : undefined; }} getSpeed={() => ((NET.peers[name]?.mv || 0) === 2 ? 2.4 : 1.1)} />
      <Html position={[0, 2.8, 0]} center zIndexRange={[5, 0]}><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, transformOrigin: '50% 100%' }} ref={el => { tag.current = el; }}>{bub && <div className="cwSay">{bub}</div>}<div ref={nameEl} className="cityNameTag cwTapTag" onClick={() => onPick(name)}>{name}</div></div></Html>
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
  const end = (e: React.PointerEvent) => { if (active.current === e.pointerId) active.current = null; };
  return <div className="cwLookPad" aria-label="Camera look area"
    onPointerDown={e => { if (active.current !== null) return; active.current = e.pointerId; last.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); }}
    onPointerMove={e => { if (active.current !== e.pointerId) return; const l = ctl.current.look; ctl.current.look = { x: l.x + (e.clientX - last.current.x), y: l.y + (e.clientY - last.current.y) }; last.current = { x: e.clientX, y: e.clientY }; }}
    onPointerUp={end}
    onPointerCancel={end}
    onLostPointerCapture={end}
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
function FightHud() {
  const box = useRef<HTMLDivElement>(null), bar = useRef<HTMLDivElement>(null), fx = useRef<HTMLDivElement>(null), txt = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const id = setInterval(() => {
      const m = NET.me, now = Date.now(), ko = m.ko > now, hurtRecent = now - m.hurt < 7000;
      if (box.current) box.current.style.display = ko || m.hp < 100 || hurtRecent ? 'flex' : 'none';
      if (bar.current) { bar.current.style.width = `${Math.max(0, m.hp)}%`; bar.current.style.background = m.hp > 50 ? '#35c46b' : m.hp > 25 ? '#f2b705' : '#ff5147'; }
      if (txt.current) txt.current.textContent = ko ? `😵 Knocked out: ${Math.ceil((m.ko - now) / 1000)}s` : `❤️ ${Math.ceil(m.hp)}`;
      if (fx.current) fx.current.style.opacity = ko ? '.55' : String(Math.max(0, 1 - (now - m.hurt) / 350) * .5);
    }, 80);
    return () => clearInterval(id);
  }, []);
  return <><div ref={fx} className="cwHurt" /><div ref={box} className="cwHp" style={{ display: 'none' }}><span ref={txt} /><i><b ref={bar} /></i></div></>;
}
/* Voice: 🎤 toggles your mic (hold V for push-to-talk). The pill lists who nearby is speaking right now. */
function MicBtn({ voice, me }: { voice: VoiceApi; me: string }) {
  const ref = useRef<HTMLButtonElement>(null), bar = useRef<HTMLElement>(null);
  useEffect(() => { // glows while you speak: driven by the real microphone level on this device
    const id = setInterval(() => {
      const hot = MIC.level > .06 || (NET.talk[me] || 0) > Date.now();
      const b = ref.current; if (b) { b.classList.toggle('live', hot); b.style.boxShadow = hot ? '0 0 0 3px #35e07acc, 0 0 20px #35e07a' : ''; }
      if (bar.current) bar.current.style.width = Math.round(Math.min(1, MIC.level * 1.5) * 100) + '%';
    }, 80);
    return () => clearInterval(id);
  }, [me]);
  const starting = voice.micOn && voice.micLive === false; // asked for, but not sending yet
  return <button ref={ref} className={'cwBtn mic' + (voice.micOn ? ' on' : '')} aria-label="Toggle microphone" onClick={() => { voice.toggleMic(); try { unlockAudio(); } catch { /* audio unlock must never block the mic */ } }} onContextMenu={e => e.preventDefault()}><span>{voice.micOn ? '🎤' : '🔇'}</span><small>{voice.micOn ? (starting ? 'Starting…' : voice.live ? `Mic · ${voice.live}` : 'Mic on') : voice.mic.err ? '⚠ Mic error' : 'Mic off'}</small><i style={{ display: voice.micOn ? 'block' : 'none', height: 3, width: '70%', margin: '2px auto 0', background: '#ffffff30', borderRadius: 2, overflow: 'hidden' }}><b ref={bar} style={{ display: 'block', height: '100%', width: 0, background: '#35e07a' }} /></i></button>;
}
function Talkers({ me }: { me: string }) {
  const ref = useRef<HTMLDivElement>(null), last = useRef('');
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now(), who = Object.keys(NET.talk).filter(n => n !== me && NET.talk[n] > now && NET.peers[n]);
      const t = who.length ? '🔊 ' + who.slice(0, 3).join(' · ') : '';
      if (t !== last.current && ref.current) { last.current = t; ref.current.textContent = t; ref.current.style.display = t ? '' : 'none'; }
    }, 150);
    return () => clearInterval(id);
  }, [me]);
  return <div ref={ref} className="cwTalkers" style={{ display: 'none' }} />;
}
function HoldBtn({ cls, label, icon, down, up }: { cls: string; label: string; icon: string; down: () => void; up?: () => void }) {
  return <button className={'cwBtn ' + cls} aria-label={label} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); down(); }} onPointerUp={() => up?.()} onPointerCancel={() => up?.()} onContextMenu={e => e.preventDefault()}><span>{icon}</span><small>{label}</small></button>;
}

const CSS = `
.cityNameTag.mini{font-size:10px!important;padding:1px 6px 0!important;border-width:2px!important;border-radius:8px!important;max-width:84px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;box-shadow:none!important}.cwTapTag{pointer-events:auto;cursor:pointer;padding:6px 10px;font-size:12px}
.cwSay{background:#fff;color:#111;border-radius:12px;padding:5px 10px;font-size:12px;max-width:190px;text-align:center;box-shadow:0 2px 8px #0006;white-space:normal;line-height:1.25}
.worldEventTag{background:#111d;color:#fff;border:1px solid #ffffff33;border-radius:999px;padding:6px 10px;font:800 11px system-ui;white-space:nowrap;box-shadow:0 3px 10px #0007}.worldEventTag small{display:block;color:#f3c56f;font-size:8px;text-align:center;margin-top:2px}.cityWorld{touch-action:none}.cwLookPad{display:none;position:absolute;right:0;top:18%;width:52%;height:64%;z-index:8;touch-action:none;border-radius:24px;background:linear-gradient(180deg,#07100d08,#07100d18);pointer-events:auto}.cwLookPad span{position:absolute;right:12px;top:12px;color:#ffffff55;font-size:9px;letter-spacing:.12em;font-weight:800}.cwStick{position:absolute;left:22px;bottom:22px;width:128px;height:128px;border-radius:50%;background:#0b1511aa;border:2px solid #ffffff3a;touch-action:none;z-index:10;display:none}
.cwKnob{position:absolute;left:50%;top:50%;width:58px;height:58px;border-radius:50%;background:#ffffffcc;transform:translate(-50%,-50%);box-shadow:0 2px 8px #0006;pointer-events:none}
.cwBtns{position:absolute;right:18px;bottom:22px;z-index:12;display:grid;grid-template-columns:64px 64px 80px;gap:10px;align-items:center;justify-items:center}.cwBtns .big{grid-column:3;grid-row:1 / span 2}
.cwBtn{width:64px;height:64px;border-radius:50%;border:2px solid #ffffff44;background:#0b1511cc;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;touch-action:none;user-select:none;-webkit-user-select:none;cursor:pointer}
.cwHurt{position:absolute;inset:0;z-index:9;pointer-events:none;opacity:0;background:radial-gradient(ellipse at center,#0000 40%,#ff1010cc 100%)}.cwHp{position:absolute;left:50%;bottom:26px;transform:translateX(-50%);z-index:12;flex-direction:column;align-items:center;gap:4px;color:#fff;font-weight:800;font-size:13px;pointer-events:none;text-shadow:0 2px 0 #000}.cwHp i{display:block;width:180px;height:12px;border:3px solid #1a1410;border-radius:99px;background:#0009;overflow:hidden}.cwHp b{display:block;height:100%;width:100%;transition:width .15s}\n.cwBtn.mic.on{background:#1d7654;border-color:#3fb98a}.cwBtn.mic.live{box-shadow:0 0 0 4px #35c46b88,0 0 18px #35c46b}.cwTalkers{position:absolute;z-index:11;left:50%;transform:translateX(-50%);top:calc(58px + env(safe-area-inset-top,0px));background:#0b1511e6;border:2px solid #35c46b;color:#fff;font-size:12px;font-weight:800;padding:5px 14px;border-radius:999px;pointer-events:none;white-space:nowrap}.cityNameTag.talking{background:#35c46b!important;color:#06210f!important}.cityNameTag.talking::before{content:'🔊 '}\n.cwBtn span{font-size:22px;line-height:1}.cwBtn small{font-size:9px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}
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
@media (pointer:coarse),(max-width:700px){.cwLookPad{display:block}.cwStick{display:block}.cwHint{display:none}.cwMap{width:96px;height:96px;top:96px;left:10px}.cwBtns{bottom:20px;right:14px;grid-template-columns:58px 58px 72px;gap:8px}.cwBtn{width:58px;height:58px}.cwBtn.big{width:70px;height:70px}.cwBtn.cam{width:48px;height:48px}.cwTouch{display:flex}.cwSpeed{right:auto;left:14px;bottom:166px}.cwTip{bottom:170px;font-size:11px}.cwMute{left:10px;top:200px}.cwGear{top:246px!important}}
`;

export default function CityWorld({ look, onNear, getMinute, onSocial, onOpenMap }: { look: Look; onNear: (b: any) => void; getMinute?: () => number; onSocial?: (a?: number) => void; onOpenMap?: () => void }) {
  useState(() => { // stepping out of the house: appear on a sidewalk, somewhere different each time and not on top of another player (building exits set GAME.tp instead)
    if (GAME.tp) { START.x = GAME.tp.x; START.z = GAME.tp.z; START.r = 0; GAME.player.x = GAME.tp.x; GAME.player.z = GAME.tp.z; } // arriving from a building / jail / ride: start the camera right there, not at the old default
    else { const s = sidewalkSpawn(Math.random, (x, z) => Object.values(NET.peers).some(q => Math.hypot(q.x - x, q.z - z) < 3)); START.x = s.x; START.z = s.z; START.r = s.r; GAME.player.x = s.x; GAME.player.z = s.z; }
    return 0;
  });
  const net = useCityNet(look, onSocial);
  const voice = useCityVoice({ me: look.name, roster: net.roster, signal: net.signal, subscribe: net.subscribeRtc, isMuted: n => net.muted.includes(n), onSocial });
  const [sel, setSel] = useState<string | null>(null);
  const ctl = useRef<Ctl>({ joy: { x: 0, y: 0 }, look: { x: 0, y: 0 }, keys: new Set(), run: false, jump: false, recenter: false, interact: false, taxi: false, horn: false, punch: false });
  const hud = useRef<Hud>({ x: START.x, z: START.z, fx: Math.sin(START.r), fz: Math.cos(START.r), r: START.r, vx: 0, vz: 0, vp: false, spd: 0, drv: false, prompt: 'E — Call your car' });
  const cfg = useSettings(), [hasCar, setHasCar] = useState(GAME.hasCar);
  useEffect(() => { const i = setInterval(() => { setHasCar(GAME.hasCar); if (!GAME.hasCar) { VEH.placed = false; VEH.drv = false; } }, 600); return () => clearInterval(i); }, []);
  useEffect(() => {
    const typing = (e: Event) => { const t = e.target as HTMLElement | null; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
    const dn = (e: KeyboardEvent) => {
      if (typing(e)) return; const k = e.key.toLowerCase();
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if (k === 'c') ctl.current.recenter = true;
      if (k === 'f' && !e.repeat) ctl.current.punch = true;
      if (k === 'e' && !e.repeat) { ctl.current.interact = true; unlockAudio(); }
      if (k === 't' && !e.repeat) { ctl.current.taxi = true; unlockAudio(); }
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
      <Canvas shadows dpr={[1, 1.5]} camera={{ position: [START.x - Math.sin(START.r) * 8, 4.2, START.z - Math.cos(START.r) * 8], fov: 52, far: 600 }}>
        <Scene fight={net.punch} look={look} ctl={ctl} hud={hud} setNear={onNear} getMinute={getMinute} roster={net.roster} ver={net.ver} bub={net.bub} onPick={setSel} />
      </Canvas>
      <Minimap hud={hud} onOpen={onOpenMap} />
      <CityPeople net={net} voice={voice} sel={sel} setSel={setSel} />
      <LookPad ctl={ctl} />
      <Stick ctl={ctl} />
      <DriveHud hud={hud} />
      <FightHud />
      <Talkers me={look.name} />
      <button className="cwMute" aria-label="Toggle sound" onClick={() => { unlockAudio(); setMuted(!cfg.muteAll); }}>{cfg.muteAll ? '🔇' : '🔊'}</button>
      <button className="cwMute cwGear" aria-label="Settings" onClick={openSettings}>⚙️</button>
      <div className="cwBtns">
        {hasCar && <HoldBtn cls="cam cwTouch" label="Horn" icon="📣" down={() => { unlockAudio(); ctl.current.horn = true; }} />}
        {hasCar && <HoldBtn cls="cwTouch" label="Car" icon="🚗" down={() => { unlockAudio(); ctl.current.interact = true; }} />}
        <HoldBtn cls="cwTouch" label="Taxi" icon="🚕" down={() => { unlockAudio(); ctl.current.taxi = true; }} />
        <MicBtn voice={voice} me={look.name} />
        <HoldBtn cls="" label="Fight" icon="👊" down={() => { ctl.current.punch = true; }} />
        <HoldBtn cls="cam" label="Camera" icon="🎥" down={() => { ctl.current.recenter = true; }} />
        <HoldBtn cls="" label="Sprint" icon="🏃" down={() => { ctl.current.run = true; }} up={() => { ctl.current.run = false; }} />
        <HoldBtn cls="big" label="Jump" icon="⬆️" down={() => { ctl.current.jump = true; }} />
      </div>
      <div className="cwHint"><b>WASD</b> move · <b>Shift</b> sprint · <b>Space</b> jump<br /><b>Drag mouse</b> look · <b>C</b> recenter view · <b>F</b> punch · <b>V</b> hold to talk (or tap 🎤)<br />{hasCar ? <><b>E</b> call / enter / exit car · <b>H</b> horn · <b>Space</b> handbrake · </> : null}Gamepad works too</div>
    </div>
  );
}