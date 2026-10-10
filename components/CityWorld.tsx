'use client';
import { GAME_LABEL_CSS } from '../lib/gameLabels';
import { openSettings, useSettings } from '../lib/settings';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls, RoundedBox, Stars, Text } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import Human from './Human';
import { handGeometry, pedFootGeometry, pedSoleGeometry } from '../lib/humanRig';
import { CITY } from '../lib/cityData';
import { DEFAULT_LOOK, type Look } from '../lib/characterModels';
import type { CityBuilding } from '../lib/cityTypes';
import { FIGHT, NET, useCityNet } from '../lib/cityNet';
import { SAFE_AFTER_WAKE_MS } from '../lib/downed';
import { JAIL_CELL_POS, OWNER_CHASE_SECS, OWNER_REPORT_SECS, WANTED_AT } from '../lib/profile';
import { PATROL, carsFor, copsFor, lineBlocked, type Rect } from '../lib/police';
import CityPeople from './CityPeople';
import MissionsCombat from './MissionsCombat';
import { WEAPON_RULES } from '../lib/weapons';
import { engineSet, engineStart, engineStop, honk, setMuted, sirenSet, sirenStop, thud, unlockAudio } from '../lib/cityAudio';
import { VEHICLE_CATALOG, vehicleById, vehicleByName } from '../lib/vehicles';

import RuntimeStyle from './RuntimeStyle';
import { worldMinute, worldCalendar, weatherAt, lightningAt } from '../lib/worldClock';
import { createPortal } from 'react-dom';
import { BUILDS_WORLD, BUILDING_DESTS, type Dest } from '../lib/destinations';
import DestPicker, { DEST_PICKER_CSS } from './DestPicker';
import ChopYards from './ChopYards';
import { BuildingDress, Graffiti, LOOK_SOLIDS, LookDriver, PowerLines, Puddles, ROAD_MAT, ShopGlow, StreetClutter, awningMat } from './CityLook';
import { BOLT_LINES, DRVVIEW, DRV_PRI, DRV_SHOUT, OWNER, OWNER_LINES, PEDSTATE, PEDVIEW, PRI, RESIST_LINES, SHOUTS, assaultQuiet, decide, drainCrimes, drainDriverCrimes, driverDecide, driverLine, duration, lineFor, ownerSay, perceive, perceiveDriver, personaOf, pushCrime, reportCrime, shout, wnow, type DriverReaction, type Reaction } from '../lib/witness';
import { GRID, CURB, CURB_BUS, CURB_CAR, inJunction, exitSpot, curbSpot, halfW, signalised, sidewalkSpawn, billboardSpot, planRide, newRide, stepRide, type Route, type RideState } from '../lib/roadRoute'; // road grid, curb spots, taxi/bike driving
/* ───────────── types & helpers ───────────── */
type Ctl = { punch: boolean; shoot: boolean; joy: { x: number; y: number }; look: { x: number; y: number }; keys: Set<string>; run: boolean; jump: boolean; recenter: boolean; interact: boolean; taxi: boolean; horn: boolean };
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
  const fixedH = type === 'Government' || type === 'Hospital' || type === 'Airport' || type === 'Rail Station' || type === 'Police Station' || type === 'Jail', jr = hs(b.id + 'j'); // step 8: +/- 1 storey so neighbours differ
  const floors = Math.max(2, Math.round(P.f[0] + (P.f[1] - P.f[0]) * t) + (fixedH ? 0 : jr < .3 ? -1 : jr > .78 ? 1 : 0));
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
        <mesh position={[0, 2.45, fz + .5]} rotation={[.4, 0, 0]} material={awningMat(P.sign, type)}><boxGeometry args={[b.w * .7, .07, .95]} /></mesh>
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
      <BuildingDress b={b} type={type} signColor={P.sign} top={top} floors={floors} rw={rw} rd={rd} />
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
    <mesh position={[i * GRID, .01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[halfW(i) * 2, 250]} /><primitive object={ROAD_MAT} attach="material" /></mesh>
    <mesh position={[0, .011, i * GRID]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[250, halfW(i) * 2]} /><primitive object={ROAD_MAT} attach="material" /></mesh>
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
export const TPOS: { x: number; z: number; r: number }[] = [];
export const PEDPOS: { x: number; z: number; d?: boolean }[] = []; // live position of every pedestrian (1e5 when hidden), read by the crime buttons // live position of every AI car
const OBS = [{ x: 0, z: 0, on: false, sp: 4.5 }, { x: 0, z: 0, on: false, sp: 7 }, { x: 0, z: 0, on: false, sp: 7 }, { x: 0, z: 0, on: false, sp: 7 }, { x: 0, z: 0, on: false, sp: 7 }]; // things AI cars must stop for: [0] player on foot, [1] player's car, [2] the taxi/bike carrying the player
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
    glass: new THREE.MeshStandardMaterial({ color: '#cfe6f2', metalness: .05, roughness: .04, transparent: true, opacity: .16, depthWrite: false }), // clear glass: you can see the driver through the windshield
    tire: new THREE.MeshStandardMaterial({ color: '#141619', roughness: .9 }),
    headM: new THREE.MeshStandardMaterial({ color: '#fff7d6', emissive: '#fff2b0', emissiveIntensity: 1.4 }),
    tailM: new THREE.MeshStandardMaterial({ color: '#ff3030', emissive: '#ff1a1a', emissiveIntensity: 1.2 }),
  };
}
const BODYMATS = new Map<string, THREE.MeshStandardMaterial>();
const bodyMat = (c: string) => { let m = BODYMATS.get(c); if (!m) { m = new THREE.MeshStandardMaterial({ color: c, metalness: .55, roughness: .32 }); BODYMATS.set(c, m); } return m; };
/* ───────── clear-glass interior: seats, dash, steering wheel and a driver you can see through the windshield ───────── */
const DRV_SKINS = ['#f1c9a5', '#d9a577', '#c68642', '#8d5524', '#5c3a21', '#3b2417'], DRV_SHIRTS = ['#e8e8e8', '#2a4a7a', '#7a2a2a', '#2f6b4a', '#d99a42', '#444b55', '#6b3a7a'], DRV_HAIRS = ['#111', '#1b1410', '#2b1d12', '#555'];
const drvHash = (str: string) => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0; };
const DRV_MATS = new Map<string, THREE.MeshStandardMaterial>();
const drvMat = (c: string, rough = .8, metal = .05) => { const k = c + rough + metal; let m = DRV_MATS.get(k); if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal }); DRV_MATS.set(k, m); } return m; };
const driverStyle = (seed: string, shirt?: string) => { const h = drvHash(seed); return { skin: DRV_SKINS[h % DRV_SKINS.length], top: shirt || DRV_SHIRTS[(h >> 3) % DRV_SHIRTS.length], hair: DRV_HAIRS[(h >> 6) % DRV_HAIRS.length] }; };
type DrvLook = { skin?: string; outfit?: string; hairColor?: string };
function CarInterior({ seed, shirt, suv, driverRef, look }: { seed: string; shirt?: string; suv?: boolean; driverRef?: (g: THREE.Object3D | null) => void; look?: DrvLook }) {
  const st = driverStyle(seed, shirt), skin = look?.skin || st.skin, top = look?.outfit || st.top, hair = look?.hairColor || st.hair, seatC = '#2a2d31', dash = '#15181b';
  const w = suv ? 1.34 : 1.26;
  return <group>
    {/* seats: driver (left-hand drive, -z), passenger and rear bench */}
    {[-.4, .4].map(z => <group key={z}><mesh position={[-.3, .92, z]} material={drvMat(seatC)}><boxGeometry args={[.5, .1, .42]} /></mesh><mesh position={[-.58, 1.1, z]} material={drvMat(seatC)}><boxGeometry args={[.1, .42, .42]} /></mesh></group>)}
    <mesh position={[-.95, .92, 0]} material={drvMat(seatC)}><boxGeometry args={[.45, .1, w]} /></mesh>
    <mesh position={[-1.17, 1.06, 0]} material={drvMat(seatC)}><boxGeometry args={[.1, .32, w]} /></mesh>
    <mesh position={[.66, .94, 0]} material={drvMat(dash, .6, .2)}><boxGeometry args={[.34, .14, w]} /></mesh>
    {/* driver (a ref lets a carjack pull them out of the seat) */}
    <group position={[0, 0, -.4]} ref={driverRef}>
      <mesh position={[-.3, 1.06, 0]} material={drvMat(top)}><boxGeometry args={[.24, .32, .36]} /></mesh>
      <mesh position={[-.27, 1.27, 0]} material={drvMat(skin, .6)}><sphereGeometry args={[.095, 14, 12]} /></mesh>
      <mesh position={[-.28, 1.29, 0]} material={drvMat(hair, .9)}><sphereGeometry args={[.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.9]} /></mesh>
      {[-.15, .15].map(z => <mesh key={z} position={[0, 1.04, z]} rotation-z={.12} material={drvMat(top)}><boxGeometry args={[.56, .07, .07]} /></mesh>)}
      <group position={[.3, 1.02, 0]} rotation-z={.65}><mesh rotation-y={Math.PI / 2} material={drvMat('#0e0f11', .5, .3)}><torusGeometry args={[.13, .014, 8, 18]} /></mesh></group>
    </group>
  </group>;
}
function CarModel({ kit, color, kind, model, style, shirt, driver = true, doorRef, driverRef, glassRef, look }: { kit: Kit; color: string; kind: number; model?: string; style?: { paint?: string; rims?: string; tint?: number }; shirt?: string; driver?: boolean; look?: DrvLook; doorRef?: (g: THREE.Object3D | null) => void; driverRef?: (g: THREE.Object3D | null) => void; glassRef?: (g: THREE.Object3D | null) => void }) {
  const spec = model ? (vehicleById(model) || vehicleByName(model)) : VEHICLE_CATALOG[0];
  const suv = spec.type === 'SUV' || /land rover|lx/i.test(spec.model);
  const premium = /mercedes|bmw|lexus/i.test(spec.brand);
  const sc: [number, number, number] = suv ? [1.12, 1.32, 1.14] : kind === 1 ? [1.04, 1.22, 1.06] : kind === 2 ? [.9, 1, .98] : [1, 1, 1];
  const grille = premium ? '#c7ccd1' : '#20252a'; const bodyColor = style?.paint && style.paint !== 'factory' ? style.paint : color; const rimColor = style?.rims==='sport' ? '#d8dde3' : style?.rims==='black' ? '#111' : '#141619';
  return <group scale={sc}>
    <mesh geometry={kit.body} material={bodyMat(bodyColor)} castShadow />
    {driver && <CarInterior seed={bodyColor + spec.model} shirt={shirt} suv={suv} driverRef={driverRef} look={look} />}
    {/* driver-side door: hinged at the front edge, swings outward. Closed it is a normal door; open it shows a recessed door well, an inner trim panel and an empty window frame */}
    <mesh position={[.05, .58, -.936]} material={drvMat('#17191c', .9)}><boxGeometry args={[1.0, .4, .02]} /></mesh>
    <group ref={doorRef} position={[.55, 0, -.95]}>
      <mesh position={[-.5, .58, 0]} material={bodyMat(bodyColor)}><boxGeometry args={[.98, .4, .045]} /></mesh>
      <mesh position={[-.5, .58, .03]} material={drvMat('#2a2d31', .8)}><boxGeometry args={[.9, .32, .02]} /></mesh>
      <mesh position={[-.78, .72, -.03]} material={new THREE.MeshStandardMaterial({ color: '#c7ccd1', metalness: .8, roughness: .25 })}><boxGeometry args={[.16, .035, .03]} /></mesh>
      <mesh position={[-.5, 1.04, 0]} material={kit.glass}><boxGeometry args={[.93, .46, .015]} /></mesh>
      {[[-.02, 1.04, .05, .5], [-.98, 1.04, .05, .5]].map(([x, y, bw, bh]) => <mesh key={x} position={[x, y, 0]} material={bodyMat(bodyColor)}><boxGeometry args={[bw, bh, .05]} /></mesh>)}
      <mesh position={[-.5, 1.3, 0]} material={bodyMat(bodyColor)}><boxGeometry args={[1.0, .05, .05]} /></mesh>
    </group>
    <mesh ref={glassRef} geometry={kit.cabin} material={kit.glass} renderOrder={2} />
    {[1, -1].map(sd => <group key={sd}>
      <mesh position={[.75, 1.09, sd * .73]} rotation-z={Math.PI / 4} material={bodyMat(color)}><boxGeometry args={[.06, .72, .05]} /></mesh>
      <mesh position={[-1.05, 1.09, sd * .73]} rotation-z={-.675} material={bodyMat(color)}><boxGeometry args={[.07, .64, .05]} /></mesh>
    </group>)}
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
type SimCar = { s: number; color: string; kind: number; model: string; role: Role; mul: number; v?: number; off: number; laneShift: number; hail: 0 | 1 | 2; hold?: boolean; stopping?: boolean; readyAt?: number; busy?: boolean };
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
/* ───────────── GTA-style carjack: the avatar walks to the driver door, yanks it open, throws the driver out and takes the wheel ─────────────
   Works on traffic cars, taxis, police cars, buses and okadas (bikes), and on a real player's car (a frozen "ghost" copy of it is used,
   because the server has already moved the car to you by the time the scene plays). Every duration lives in JT: tweak it live from the
   browser console, e.g.  __arlJackT.throw = 0.9  */
type JRole = 'car' | 'taxi' | 'police' | 'bus' | 'bike';
type JRefs = { door?: THREE.Object3D | null; driver?: THREE.Object3D | null; glass?: THREE.Object3D | null };
const JR: Record<string, JRefs> = {};
const jrefs = (key: string) => { const o = JR[key] || (JR[key] = {}); return { doorRef: (g: THREE.Object3D | null) => { o.door = g; }, driverRef: (g: THREE.Object3D | null) => { o.driver = g; }, glassRef: (g: THREE.Object3D | null) => { o.glass = g; } }; };
type JCfg = { stand: [number, number]; seat: [number, number]; seatY: number; land: [number, number]; away: [number, number]; step: [number, number]; ride: [number, number]; wp: [number, number]; door: boolean };
// car-local coordinates: the vehicle faces +x and the driver's side is -z
const JCFG: Record<'car' | 'bus' | 'bike', JCfg> = {
  car: { stand: [.2, -2.5], seat: [-.27, -.4], seatY: .95, land: [-1.3, -3.3], away: [-1.3, -9], step: [.1, -1.5], ride: [-.25, -.4], wp: [3.4, -1.8], door: true },
  bus: { stand: [2.7, -3.1], seat: [2.4, -.7], seatY: 1.35, land: [1.2, -4.4], away: [-.5, -12], step: [2.6, -2.0], ride: [2.4, -.6], wp: [4.8, -2.8], door: true },
  bike: { stand: [0, -1.7], seat: [-.2, 0], seatY: .85, land: [-.5, -3], away: [-.5, -9], step: [0, -1], ride: [-.1, -.2], wp: [2.4, -1.8], door: false },
};
const jcfg = (r: JRole) => (r === 'bus' ? JCFG.bus : r === 'bike' ? JCFG.bike : JCFG.car);
export const JT = { walk: 7, open: .45, openWait: .5, throw: .6, step: .8, close: .3, finish: .35, giveUp: 4, arc: .55, lie: 1.05, getUp: .45, run: 3.55, runSpeed: 4.6 };
if (typeof window !== 'undefined') (window as any).__arlJackT = JT; // eslint-disable-line @typescript-eslint/no-explicit-any
const specOf = (id: string) => vehicleById(id) || vehicleByName(id) || VEHICLE_CATALOG[0];
const COROLLA = 'toyota-corolla-2024';
const J_SHIRT: Partial<Record<JRole, string>> = { taxi: '#d99a42', police: '#1d3f8f', bus: '#5b6b7a', bike: '#2d8f62' };
export const JACK = {
  key: '', idx: -1, role: 'car' as JRole, ghost: false, gp: { x: 0, z: 0, r: 0 }, ghostOn: false, gModel: '', gColor: '', gLook: DEFAULT_LOOK as Look, gName: '', gUntil: 0,
  ph: 0, t: 0, wp: 0, walk: false, fx: false,
  on: false, sRole: 'car' as JRole, stolenIdx: -1, model: '', color: '', victimUntil: 0,
  refresh: () => {}, ghostRefresh: () => {}, setNpcLook: (_l: Look) => {},
  npc: { on: false, t: 0, from: [0, 0, 0] as [number, number, number], to: [0, 0] as [number, number], run: [0, 0] as [number, number], yaw: 0, walk: false, chase: false, cx: 0, cz: 0, said: 0, called: false },
  /** nearest vehicle you could jack: ordinary car, taxi, police car, bus or bike (not one that is carrying / being hailed) */
  nearest(px: number, pz: number, range: number) {
    let bi = -1, bd = range;
    ROAM.cars.forEach((e, i) => { const tp = TPOS[i]; if (!tp || tp.x > 9e4 || e.c.busy || e.c.hail || e.c.hold) return; const d = Math.hypot(px - tp.x, pz - tp.z); if (d < bd) { bd = d; bi = i; } });
    return bi;
  },
  /** what the server needs to know to give you the car: its role and catalogue model (taxis and police cars are Corollas) */
  info(i: number) { const c = ROAM.cars[i]?.c; if (!c) return null; return { role: c.role as JRole, model: c.role === 'taxi' || c.role === 'police' ? COROLLA : c.model }; },
  start(i: number) {
    const e = ROAM.cars[i], tp = TPOS[i];
    if (JACK.ph || !e || !tp || e.c.busy || GAME.ride || VEH.drv || GAME.jailed || CINE.on) return false;
    JACK.release(); Object.assign(JACK, { key: 'n' + i, idx: i, role: e.c.role as JRole, ghost: false, ph: 1, t: 0, wp: 0, fx: false }); e.c.hold = true; return true;
  },
  /** a real player's car: it is already yours server-side, so the scene plays on a frozen copy of it where it stood */
  startGhost(name: string, x: number, z: number, r: number, look: Look) {
    if (JACK.ph || GAME.ride || VEH.drv || GAME.jailed || CINE.on) return false;
    JACK.release(); const m = VEHICLE_CATALOG[Math.floor(hs(name) * VEHICLE_CATALOG.length)];
    Object.assign(JACK, { key: 'ghost', idx: -1, role: 'car' as JRole, ghost: true, gp: { x, z, r }, gModel: m.id, gColor: m.color, gLook: look, gName: name, gUntil: Infinity, ghostOn: true, ph: 1, t: 0, wp: 0, fx: false });
    JACK.ghostRefresh(); return true;
  },
  /** true while a jacked real player's own car must not be drawn by their Remote (the ghost copy is playing / the server has not caught up yet) */
  hides(name: string) { return JACK.gName === name && Date.now() < JACK.gUntil; },
  /** hand the jacked traffic vehicle back to traffic (the car you own is in your garage) */
  release() { if (!JACK.on) return; JACK.on = false; if (JACK.stolenIdx >= 0) respawnRoamer(JACK.stolenIdx); JACK.stolenIdx = -1; JACK.refresh(); },
  abort() {
    const o = JR[JACK.key] || {}, c = ROAM.cars[JACK.idx]?.c; if (c) c.hold = false;
    if (o.door) o.door.rotation.y = 0; if (o.glass) o.glass.visible = true; if (o.driver) o.driver.visible = true;
    if (JACK.ghost) { JACK.ghostOn = false; JACK.gUntil = Date.now() + 6000; JACK.ghostRefresh(); }
    JACK.npc.on = false; JACK.idx = -1; JACK.ph = 0; JACK.walk = false; JACK.ghost = false;
  },
  /** you were the one driving when someone took your car: you are thrown out and left on the ground */
  victimEject() {
    const cs = Math.cos(VEH.r), sn = Math.sin(VEH.r);
    GAME.tp = { x: VEH.x - .3 * cs - 2.6 * sn, z: VEH.z + .3 * sn - 2.6 * cs }; JACK.victimUntil = Date.now() + 1800; engineStop(); thud(1.2);
  },
};
const ease = (u: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, u)), 3);
function stepJack(p: { x: number; z: number; r: number; y: number; vy: number }, dt: number, ctl: { recenter: boolean }) {
  const cfg = jcfg(JACK.role), o = JR[JACK.key] || {}, e = ROAM.cars[JACK.idx], c = e?.c, tp = JACK.ghost ? JACK.gp : TPOS[JACK.idx];
  if (!tp || (!JACK.ghost && (!c || c.busy)) || GAME.jailed || GAME.ride) { JACK.abort(); return; }
  const cs = Math.cos(tp.r), sn = Math.sin(tp.r), now = Date.now(), door = o.door, glassy = JACK.role === 'bike' ? null : o.glass;
  const w = (l: [number, number]): [number, number] => [tp.x + l[0] * cs + l[1] * sn, tp.z - l[0] * sn + l[1] * cs]; // vehicle-local -> world
  JACK.t += dt; JACK.walk = false; p.y = 0; p.vy = 0;
  const goto = (x: number, z: number, sp: number) => { const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz); if (d < .12) return true; const s = Math.min(d, sp * dt); p.x += dx / d * s; p.z += dz / d * s; p.r = Math.atan2(dx, dz); JACK.walk = true; return false; };
  const faceCar = () => { p.r = Math.atan2(tp.x - p.x, tp.z - p.z); };
  const punch = () => { NET.me.anim = 'punch'; NET.me.animUntil = now + 450; };
  if (JACK.ph === 1) { // walk round to the driver's side (going round the nose / tail if you start on the other side)
    const dx = p.x - tp.x, dz = p.z - tp.z, lx = dx * cs - dz * sn, lz = dx * sn + dz * cs, stand = w(cfg.stand);
    let arrived = false;
    if (JACK.wp === 0 && lz > cfg.stand[1] + 1.1) { const g = w([(lx >= 0 ? 1 : -1) * cfg.wp[0], cfg.wp[1]]); if (goto(g[0], g[1], JT.walk)) JACK.wp = 1; }
    else arrived = goto(stand[0], stand[1], JT.walk);
    if ((arrived && (JACK.ghost || (c!.v ?? 99) < .5)) || JACK.t > JT.giveUp) { if (c) c.v = 0; p.x = stand[0]; p.z = stand[1]; faceCar(); JACK.ph = 2; JACK.t = 0; }
  } else if (JACK.ph === 2) { // yank the door open (a bike has none: the rider just gets shoved)
    faceCar(); if (!JACK.fx) { JACK.fx = true; punch(); }
    if (cfg.door) { if (door) door.rotation.y = -1.15 * ease(JACK.t / JT.open); if (glassy) glassy.visible = false; } // clear glass out of the way so the open door really is an opening
    if (JACK.t >= JT.openWait) { // grab the driver and throw them out
      let look: Look;
      if (JACK.ghost) look = { ...JACK.gLook };
      else {
        const seed = JACK.role === 'car' ? c!.color + specOf(c!.model).model : JACK.role === 'taxi' ? '#e5b72f' + specOf(COROLLA).model : JACK.role === 'police' ? '#eef1f6' + specOf(COROLLA).model : JACK.key + 'x';
        const st = driverStyle(seed, J_SHIRT[JACK.role]); look = { ...DEFAULT_LOOK, name: 'Driver', skin: st.skin, outfit: st.top, hairColor: st.hair };
      }
      JACK.setNpcLook(look); if (o.driver) o.driver.visible = false;
      const from = w(cfg.seat), to = w(cfg.land), away = w(cfg.away);
      Object.assign(JACK.npc, { on: true, t: 0, from: [from[0], cfg.seatY, from[1]], to, run: away, yaw: Math.atan2(to[0] - from[0], to[1] - from[1]), chase: !JACK.ghost, cx: to[0], cz: to[1], said: 0, called: false });   // step 7: an AI driver chases you and phones the police; a real player's own character is not controlled here
      punch(); thud(.8); JACK.ph = 3; JACK.t = 0;
    }
  } else if (JACK.ph === 3) { // the throw
    faceCar(); if (JACK.t >= JT.throw) { JACK.ph = 4; JACK.t = 0; }
  } else if (JACK.ph === 4) { // step up to the open door
    const spot = w(cfg.step); const there = goto(spot[0], spot[1], 5); if (there || JACK.t > JT.step) { JACK.ph = 5; JACK.t = 0; }
  } else if (JACK.ph === 5) { // get in, the door shuts, you drive off
    const seat = w(cfg.ride); p.x += (seat[0] - p.x) * Math.min(1, dt * 9); p.z += (seat[1] - p.z) * Math.min(1, dt * 9); p.r = tp.r + Math.PI / 2;
    if (cfg.door && door) door.rotation.y = -1.15 * (1 - ease(JACK.t / JT.close));
    if (JACK.t >= JT.finish) {
      if (door) door.rotation.y = 0; if (glassy) glassy.visible = true; if (o.driver) o.driver.visible = true;
      VEH.x = tp.x; VEH.z = tp.z; VEH.r = tp.r; VEH.v = 0; VEH.placed = true; VEH.drv = true; engineStart(); ctl.recenter = true;
      p.x = tp.x; p.z = tp.z;
      JACK.on = true; JACK.sRole = JACK.role;
      if (JACK.ghost) { JACK.model = JACK.gModel; JACK.color = JACK.gColor; JACK.stolenIdx = -1; JACK.ghostOn = false; JACK.gUntil = Date.now() + 6000; JACK.ghostRefresh(); }
      else { JACK.model = JACK.role === 'taxi' || JACK.role === 'police' ? COROLLA : c!.model; JACK.color = JACK.role === 'taxi' ? '#e5b72f' : JACK.role === 'police' ? '#eef1f6' : c!.color; JACK.stolenIdx = JACK.idx; c!.hold = false; c!.v = 0; c!.busy = true; } // the traffic vehicle is now YOUR vehicle
      JACK.idx = -1; JACK.ph = 0; JACK.walk = false; JACK.ghost = false; JACK.refresh();
    }
  }
}
/** the thrown-out driver: flies out of the seat, lands on the road, lies there, gets up and runs away */
function JackNpc() {
  const g = useRef<THREE.Group>(null!), bub = useRef<THREE.Group>(null!), [look, setLook] = useState<Look>(DEFAULT_LOOK), [say, setSay] = useState('');
  useEffect(() => { const id = setInterval(() => { const v = OWNER.until > wnow() ? OWNER.text : ''; setSay(p => (p === v ? p : v)); }, 150); return () => clearInterval(id); }, []);
  useEffect(() => { JACK.setNpcLook = setLook; return () => { JACK.setNpcLook = () => {}; }; }, []);
  useFrame((_, dtRaw) => {
    const n = JACK.npc, gr = g.current; if (!gr) return;
    if (!n.on) { gr.visible = false; if (bub.current) bub.current.visible = false; return; }
    const dt = Math.min(dtRaw, .05); n.t += dt; const t = n.t; n.walk = false;
    const LIE = -1.45, t1 = JT.arc, t2 = t1 + JT.lie, t3 = t2 + JT.getUp, t4 = t3 + JT.run;
    let x = n.to[0], z = n.to[1], y = .13, rx = LIE, yaw = n.yaw;
    if (t < t1) { const u = t / t1; x = n.from[0] + (n.to[0] - n.from[0]) * u; z = n.from[2] + (n.to[1] - n.from[2]) * u; y = n.from[1] * (1 - u) + .13 * u + 1.1 * Math.sin(Math.PI * u); rx = LIE * ease(u * 1.4); }
    else if (t < t2) { /* lying in the road */ }
    else if (t < t3) { const u = ease((t - t2) / JT.getUp); rx = LIE * (1 - u); y = .13 * (1 - u); }
    else if (n.chase) {   // step 7: the owner does not just run off: they chase you, shout, then stand and phone the police (Step 6 sends the patrol)
      const tc = t3 + OWNER_CHASE_SECS, tr = tc + OWNER_REPORT_SECS; rx = 0; y = 0;
      const tg = VEH.drv ? VEH : GAME.player, dx = tg.x - n.cx, dz = tg.z - n.cz, d = Math.hypot(dx, dz) || 1;
      if (t < tc && d < 45) { if (d > 1.8) { const st = Math.min(d - 1.8, 5.2 * dt); n.cx += dx / d * st; n.cz += dz / d * st; n.walk = true; } if (OWNER.until < wnow()) ownerSay(OWNER_LINES[Math.floor(t * 1.7) % OWNER_LINES.length], 1.6); }
      else if (t < tr) { if (!n.said) { n.said = 1; ownerSay('Hello? Police! Somebody stole my car!', OWNER_REPORT_SECS + 1.2); } }
      else if (t < tr + 3) { if (!n.called) { n.called = true; if (reportCrime(n.cx, n.cz)) GAME.notice = '📞 The owner is calling the police on you!'; } }
      else { n.on = false; gr.visible = false; if (bub.current) bub.current.visible = false; OWNER.until = 0; return; }
      x = n.cx; z = n.cz; yaw = Math.atan2(dx, dz);
    }
    else if (t < t4) { rx = 0; y = 0; const dx = n.run[0] - n.to[0], dz = n.run[1] - n.to[1], d = Math.hypot(dx, dz) || 1, k = Math.min(1, (t - t3) * JT.runSpeed / d); x = n.to[0] + dx * k; z = n.to[1] + dz * k; yaw = Math.atan2(dx, dz); n.walk = k < 1; }
    else { n.on = false; gr.visible = false; return; }
    gr.visible = true; gr.rotation.order = 'YXZ'; gr.position.set(x, y, z); gr.rotation.set(rx, yaw, 0);
    if (bub.current) { bub.current.visible = t >= t3 && OWNER.until > wnow(); bub.current.position.set(x, 2.3, z); }
  });
  return <><group ref={g} visible={false}><Human key={look.skin + look.outfit + look.hairColor} look={look} getState={() => (JACK.npc.walk ? 'walk' : 'idle')} getAnim={() => undefined} getSpeed={() => (JACK.npc.chase ? 3.6 : 2.6)} /></group>
    <group ref={bub} visible={false}><Html center zIndexRange={[6, 0]}>{say ? <div className="npcShout" style={{ position: 'relative' }}>{say}</div> : null}</Html></group></>;
}
/** a frozen copy of a real player's car, used only while the carjack scene plays */
function JackGhost() {
  const [, bump] = useState(0), kit = pkit();
  useEffect(() => { JACK.ghostRefresh = () => bump(v => v + 1); return () => { JACK.ghostRefresh = () => {}; }; }, []);
  if (!JACK.ghostOn) return null;
  return <group position={[JACK.gp.x, 0, JACK.gp.z]} rotation={[0, JACK.gp.r, 0]}><CarModel kit={kit} color={JACK.gColor} kind={0} model={JACK.gModel} look={JACK.gLook} {...jrefs('ghost')} /></group>;
}
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
const v0 = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
/* Roaming taxis & bike taxis: they drive the city like normal traffic. Tap one to hail it; it pulls over to the kerb, then tap again to choose a destination. */
function Traffic() {
  const lanes = useMemo(makeLanes, []), kit = useMemo(carKit, []);
  const flat = useMemo(() => lanes.flatMap(l => l.cars.map(c => ({ l, c }))), [lanes]);
  const refs = useRef<(THREE.Group | null)[]>([]), DR = useRef<(DriverReaction | null)[]>([]);   // DR: how each AI driver is reacting to a crime right now
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
    const ROBS: typeof OBS = []; for (const [n, q] of Object.entries(NET.peers)) { if (!q.init) continue; if (q.drv || q.cp) { if (!JACK.hides(n)) ROBS.push({ x: q.cx, z: q.cz, on: true, sp: 7 }); } if (!q.drv) ROBS.push({ x: q.x, z: q.z, on: true, sp: 4.5 }); }   // traffic stops for every real player, in a car or on foot
    const OB = ROBS.length ? OBS.concat(ROBS) : OBS;
    const nowS = wnow(), me = GAME.player, crimes = drainDriverCrimes(), brandishing = !!(window as any).__arlWeapon && !VEH.drv && !GAME.jailed;   // witness AI for drivers (same crimes the pedestrians see)
    flat.forEach(({ l, c }, i) => {
      const tp = TPOS[i] || (TPOS[i] = { x: 0, z: 0, r: 0 }), g = refs.current[i], vw = DRVVIEW[i] || (DRVVIEW[i] = { x: 1e5, z: 1e5, yaw: 0, on: false });
      vw.on = false;
      if (c.busy) { tp.x = 1e5; tp.z = 1e5; vw.x = 1e5; vw.z = 1e5; DR.current[i] = null; if (g) g.visible = false; return; } // it is carrying a player (the ride has its own model)
      if (g) g.visible = true;
      /* ── drivers react to crimes (police cars and cars in a hail / carjack are left alone) ── */
      let rk: DriverReaction | null = DR.current[i] && DR.current[i]!.until > nowS ? DR.current[i] : null;
      if (DR.current[i] && !rk) DR.current[i] = null;
      if (c.role === 'police' || c.hail || c.hold) { rk = DR.current[i] = null; }
      else {
        vw.x = tp.x; vw.z = tp.z; vw.yaw = l.rot; vw.on = true;
        const persona = personaOf(i), start = (kind: DriverReaction['kind'], secs: number, fx: number, fz: number) => {
          if (rk && DRV_PRI[rk.kind] >= DRV_PRI[kind]) return;
          rk = DR.current[i] = { kind, until: nowS + secs, fx, fz, shoutAt: nowS + .2 + Math.random() * .8, callAt: kind === 'film' ? nowS + 2.5 + Math.random() * 2 : 0, calledIn: false, honked: false };
        };
        for (const cr of crimes) {
          const dx = cr.x - tp.x, dz = cr.z - tp.z, d = Math.hypot(dx, dz) || .01;
          const sense = perceiveDriver(cr.kind, d, (Math.cos(l.rot) * dx - Math.sin(l.rot) * dz) / d); if (!sense) continue;
          const r = driverDecide(persona, cr.kind, sense, d, false, Math.random()); if (r) start(r.kind, r.secs, cr.x, cr.z);
        }
        if (brandishing && !rk && Math.random() < dt * 1.5) {   // a drawn gun: drivers who can see it react too
          const dx = me.x - tp.x, dz = me.z - tp.z, d = Math.hypot(dx, dz) || .01;
          if (d < 14 && perceiveDriver('armed', d, (Math.cos(l.rot) * dx - Math.sin(l.rot) * dz) / d) === 'saw') { const r = driverDecide(persona, 'armed', 'saw', d, false, Math.random()); if (r) start(r.kind, r.secs, me.x, me.z); }
        }
        if (rk) {
          const R = rk as DriverReaction, near = Math.hypot(tp.x - me.x, tp.z - me.z) < 45;
          if (nowS >= R.shoutAt) { if (near) shout(DRV_SHOUT + i, driverLine(R.kind), 2.6); R.shoutAt = R.kind === 'flee' || R.kind === 'honk' ? nowS + 4 + Math.random() * 3 : 1e9; }
          if (R.kind === 'honk' && !R.honked && v0(tp, me) < 30) { R.honked = true; honk(); }   // lean on the horn once if you are close enough to hear it
          if (R.kind === 'film' && !R.calledIn && R.callAt && nowS >= R.callAt) { R.calledIn = true; if (reportCrime(R.fx, R.fz)) GAME.notice = '📞 A driver is calling the police on you!'; }
        }
      }
      const base = l.speed * c.mul * rainFactor * rush, EX = halfW(l.road) * .5 + (c.role === 'bus' ? CURB_BUS : c.role === 'bike' ? CURB : CURB_CAR); // (a bus is wide: it stops mostly in the road, not on the pavement) EX: how far the vehicle slides sideways to reach the kerb
      let v = c.v ?? base;
      if (c.hold) { v = Math.max(0, v - 14 * dt); c.v = v; } // being carjacked: brake to a stop
      else if (rk) {   // witnessed a crime: stop and stare / film / honk, or floor it away from it (but never straight towards it)
        const R = rk as DriverReaction, fc = l.axis === 'x' ? R.fx : R.fz, ahead = (fc - c.s) * l.dir;
        if (R.kind === 'flee' && !(ahead > 0 && ahead < 30)) v = Math.min(base * 1.7, (c.v ?? base) + 9 * dt);
        else v = Math.max(0, (c.v ?? base) - 18 * dt);
        c.v = v;
      } else if (c.hail === 1) {
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
      let passing = false;   // a hailed vehicle is standing at the kerb ahead: go round it instead of queueing behind it for up to 2 minutes
      for (const o of l.cars) if (o !== c && !o.busy) { const d = (o.s - c.s) * l.dir; if (d > 0 && d < gap) { if (c.hail === 0 && o.hail === 2 && o.off >= .5 && d > 2) { if (d < 16) passing = true; continue; } gap = d; } }
      adv = Math.min(adv, Math.max(0, gap - 7)); // keep a safe distance
      if(c.role==='car' && c.hail===0 && gap<12 && gap>5 && Math.abs(l.fixed)<100){ const sign=hs('ov'+i)>0.5?1:-1; c.laneShift += (sign*1.15-c.laneShift)*Math.min(1,dt*2.5); v=Math.min(base*1.08,Math.max(v,base*.92)); } else c.laneShift += ((passing ? (l.axis === 'x' ? -l.dir : l.dir) * Math.min(1.1, halfW(l.road) * .5) : 0) - c.laneShift) * Math.min(1, dt * 3);
      for (const o of OB) { if (!o.on) continue; const perp = l.axis === 'x' ? Math.abs(o.z - l.fixed) : Math.abs(o.x - l.fixed), along = ((l.axis === 'x' ? o.x : o.z) - c.s) * l.dir; if (perp < 1.7 && along > 0) adv = Math.min(adv, Math.max(0, along - o.sp)); } // stop for the player (on foot or in a car)
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
      {c.role === 'taxi' ? <TaxiBody kit={kit} refs={jrefs('n' + i)} /> : c.role === 'bike' ? <BikeBody scale={.95} rider {...jrefs('n' + i)} /> : c.role === 'police' ? <PoliceBody kit={kit} refs={jrefs('n' + i)} /> : c.role === 'bus' ? <BusBody {...jrefs('n' + i)} /> : <CarModel kit={kit} color={c.color} kind={c.kind} model={c.model} {...jrefs('n' + i)} />}
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
function BusBody({ doorRef, driverRef, glassRef, look }: BodyRefs) { // faces +x like every vehicle: a yellow city bus with a window band, pillars, doors, lights and a destination sign
  const Y = '#e8a923', D = '#14202a';
  return <group>
    <mesh position={[0, .95, 0]} castShadow><boxGeometry args={[6, 1.1, 2.2]} /><meshStandardMaterial color={Y} roughness={.5} /></mesh>
    <mesh position={[0, .52, 0]}><boxGeometry args={[5.9, .26, 2.12]} /><meshStandardMaterial color="#1c1c1f" /></mesh>
    <mesh position={[0, .98, 0]}><boxGeometry args={[6.02, .14, 2.22]} /><meshStandardMaterial color="#b3261e" /></mesh>
    <mesh ref={glassRef} position={[0, 1.88, 0]}><boxGeometry args={[5.9, .76, 2.1]} /><meshStandardMaterial color="#cfe6f2" metalness={.05} roughness={.04} transparent opacity={.2} depthWrite={false} /></mesh>
    {/* cab + passenger seats, visible through the clear windows */}
    {[-2.3, -1.5, -.7, .1, .9].map(x => [-.55, .55].map(z => <mesh key={x + ':' + z} position={[x, 1.72, z]}><boxGeometry args={[.4, .5, .6]} /><meshStandardMaterial color="#2a2d31" roughness={.9} /></mesh>))}
    <mesh position={[2.75, 1.55, 0]}><boxGeometry args={[.4, .3, 2.0]} /><meshStandardMaterial color="#15181b" roughness={.6} /></mesh>
    <group position={[2.4, 0, -.7]}>
      <mesh position={[-.35, 1.7, 0]}><boxGeometry args={[.12, .55, .5]} /><meshStandardMaterial color="#2a2d31" roughness={.9} /></mesh>
      <group ref={driverRef}>
        <mesh position={[-.2, 1.85, 0]}><boxGeometry args={[.26, .42, .42]} /><meshStandardMaterial color={look?.outfit || "#5b6b7a"} roughness={.8} /></mesh>
        <mesh position={[-.17, 2.2, 0]}><sphereGeometry args={[.13, 14, 12]} /><meshStandardMaterial color={look?.skin || "#8d5524"} roughness={.6} /></mesh>
        <mesh position={[.15, 1.85, 0]} rotation-z={.1}><boxGeometry args={[.5, .09, .09]} /><meshStandardMaterial color={look?.outfit || "#5b6b7a"} roughness={.8} /></mesh>
        <mesh position={[.4, 1.78, 0]} rotation-z={.9}><torusGeometry args={[.2, .02, 8, 18]} /><meshStandardMaterial color="#0e0f11" roughness={.5} /></mesh>
      </group>
    </group>
    {/* driver's cab door: hinged at the front, swings outward */}
    <group ref={doorRef} position={[2.95, 0, -1.16]}>
      <mesh position={[-.45, 1.1, 0]}><boxGeometry args={[.9, 1.55, .05]} /><meshStandardMaterial color={Y} roughness={.5} /></mesh>
      <mesh position={[-.45, 1.55, .03]}><boxGeometry args={[.74, .6, .02]} /><meshStandardMaterial color="#cfe6f2" transparent opacity={.25} depthWrite={false} /></mesh>
    </group>
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
type BodyRefs = { doorRef?: (g: THREE.Object3D | null) => void; driverRef?: (g: THREE.Object3D | null) => void; glassRef?: (g: THREE.Object3D | null) => void; look?: DrvLook };
function TaxiBody({ kit, refs }: { kit: Kit; driver?: boolean; refs?: BodyRefs }) {
  return <group>
    <CarModel kit={kit} color="#e5b72f" kind={2} model="toyota-corolla-2024" shirt="#d99a42" {...refs} />
    <group position={[-.05, 1.56, 0]}> {/* roof sign: real 3D text on both sides, so no floating label to clutter the view */}
      <mesh><boxGeometry args={[.9, .2, .5]} /><meshStandardMaterial color="#111" /></mesh>
      {[1, -1].map(sd => <Text key={sd} position={[0, .01, sd * .26]} rotation-y={sd === 1 ? 0 : Math.PI} fontSize={.15} color="#ffd23f" anchorX="center" anchorY="middle">TAXI</Text>)}
    </group>
  </group>;
}
function BikeBody({ scale = 1, rider, driverRef, riderLook }: { scale?: number; rider?: boolean; driverRef?: (g: THREE.Object3D | null) => void; doorRef?: unknown; glassRef?: unknown; riderLook?: Look }) { // faces +x like every vehicle: a motorcycle (okada) with fat tyres, fork, tank, seat, engine and exhaust
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
    {rider && <group ref={driverRef}><group position={[-.2, .66, 0]} rotation-y={Math.PI / 2} scale={.5}><Human look={riderLook || { ...DEFAULT_LOOK, name: 'Bike Driver', outfit: '#2d8f62' }} getState={() => 'idle'} getAnim={() => undefined} getSpeed={() => 1} /></group></group>}
  </group>;
}
function PoliceBody({ kit, refs }: { kit: Kit; refs?: BodyRefs }) {
  const red = useRef<THREE.MeshStandardMaterial>(null!), blue = useRef<THREE.MeshStandardMaterial>(null!);
  useFrame(st => { const f = Math.floor(st.clock.elapsedTime * 5) % 2, k = NIGHT.n * 3 + 1.2; if (red.current) red.current.emissiveIntensity = f ? .1 : k; if (blue.current) blue.current.emissiveIntensity = f ? k : .1; });
  return <group>
    <CarModel kit={kit} color="#eef1f6" kind={0} model="toyota-corolla-2024" shirt="#1d3f8f" {...refs} />
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
const EXIT = { req: false };   // the player pressed "Get off": the vehicle stops at the next safe spot (never inside a junction) and lets them out
type CarPose = { x: number; z: number; r: number };
const smooth = (u: number) => { const c = Math.max(0, Math.min(1, u)); return c * c * (3 - 2 * c); };
// car faces local +x; local +z is its side. door sits on the rear-door spot of the chosen side.
function doorPts(c: CarPose, side: 1 | -1, bike: boolean, bus = false, front = false) {
  const fx = Math.cos(c.r), fz = -Math.sin(c.r), sx = Math.sin(c.r), sz = Math.cos(c.r);
  const at = (lx: number, ls: number): [number, number] => [c.x + fx * lx + sx * ls * side, c.z + fz * lx + sz * ls * side];
  if (bus) return { door: at(1.7, 1.15), out: at(1.7, 2.35), seat: at(.9, .55) }; // the bus's real door is the one drawn at x = 1.7; you sit in the seat block at x = .9
  if (bike) return { door: at(0, .55), out: at(0, 1.5), seat: at(-.55, 0) };      // pillion seat, behind the rider
  return front ? { door: at(.1, 1.0), out: at(.1, 2.05), seat: at(-.3, .4) }      // front passenger door and seat (kerb side)
    : { door: at(-.6, 1.0), out: at(-.6, 2.05), seat: at(-.95, .4) };               // rear door and rear bench
}
/* the vehicle pulling away after it has dropped you: accelerates along the kerb and eases out into its lane */
type Dep = { x: number; z: number; r: number; ux: number; uz: number; lx: number; lz: number; lat: number; done: number; v: number; vmax: number; t: number; idx: number };
function makeDep(car: CarPose, e: { axis: 'x' | 'z'; road: number }, kind: 'taxi' | 'bike' | 'bus'): Dep {
  const ctr = e.road * GRID, dev = e.axis === 'x' ? car.z - ctr : car.x - ctr, lat = Math.max(0, Math.abs(dev) - halfW(e.road) * .5), sg = Math.sign(dev) ? -Math.sign(dev) : 1;
  return { x: car.x, z: car.z, r: car.r, ux: Math.cos(car.r), uz: -Math.sin(car.r), lx: e.axis === 'x' ? 0 : sg, lz: e.axis === 'x' ? sg : 0, lat, done: 0, v: 0, vmax: kind === 'taxi' ? 9 : 7, t: 0, idx: -1 };
}
function stepDep(d: Dep, dt: number) {
  d.t += dt; d.v = Math.min(d.vmax, d.v + 4.5 * dt); const adv = d.v * dt; d.x += d.ux * adv; d.z += d.uz * adv;
  const l = Math.min(d.lat - d.done, adv * .4); if (l > 0) { d.x += d.lx * l; d.z += d.lz * l; d.done += l; }
}
/** you, sitting in the vehicle (faces +x like every vehicle). Origin = the middle of the seat. */
function Passenger({ look, pos }: { look: Look; pos: [number, number, number] }) {
  const skin = look.skin, top = look.outfit, hair = look.hairColor, pants = '#2b3a55';
  return <group position={pos}>
    <mesh position={[0, .14, 0]} material={drvMat(top)}><boxGeometry args={[.24, .34, .36]} /></mesh>
    <mesh position={[.03, .37, 0]} material={drvMat(skin, .6)}><sphereGeometry args={[.1, 14, 12]} /></mesh>
    <mesh position={[.02, .39, 0]} material={drvMat(hair, .9)}><sphereGeometry args={[.105, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.9]} /></mesh>
    {[-.1, .1].map(z => <group key={z}>
      <mesh position={[.22, .0, z]} material={drvMat(pants)}><boxGeometry args={[.46, .12, .13]} /></mesh>
      <mesh position={[.43, -.2, z]} material={drvMat(pants)}><boxGeometry args={[.12, .4, .13]} /></mesh>
    </group>)}
    {[-.21, .21].map(z => <mesh key={z} position={[.2, .14, z]} rotation-z={-.5} material={drvMat(top)}><boxGeometry args={[.34, .08, .08]} /></mesh>)}
  </group>;
}
type Cine = { ph: 'walk' | 'enter' | 'close' | 'open' | 'exit' | 'off'; t: number; side: 1 | -1; bike: boolean; bus?: boolean; front?: boolean; leaving?: boolean; dep?: Dep; ang: number; car: CarPose; ax: number; az: number; yaw: number; walk: boolean; fin: () => void; drop?: [number, number]; from?: [number, number] };
function TransportVehicles({ look }: { look: Look }) {
  const actor = useRef<THREE.Group>(null!), doorG = useRef<THREE.Group>(null!), hinge = useRef<THREE.Group>(null!), cine = useRef<Cine | null>(null), walking = useRef(false);
  const busD = useRef<THREE.Group>(null!), busW = useRef<THREE.Mesh>(null!), busP = useRef<THREE.Group>(null!), paxRef = useRef<THREE.Group>(null!);   // bus sliding door, and you sitting inside
  const seat = useRef<{ front: boolean; side: 1 | -1 }>({ front: false, side: 1 }), lastKind = useRef<'taxi' | 'bike' | 'bus'>('taxi'), dep = useRef<Dep | null>(null);
  const finishDep = () => { const d = dep.current; if (!d) return; dep.current = null; if (activeRef.current) activeRef.current.visible = false; if (d.idx >= 0) respawnRoamer(d.idx); };   // the vehicle is gone: back to roaming
  const kit = useMemo(carKit, []);
  const [open, setOpen] = useState<number | null>(null), [, setTick] = useState(0), [canExit, setCanExit] = useState(false), canExitRef = useRef(false);
  const requestExit = () => { if (!GAME.ride || !rs.current || CINE.on || EXIT.req) return; EXIT.req = true; GAME.notice = '🚪 Stopping so you can get off...'; setCanExit(false); canExitRef.current = false; };
  useEffect(() => { // E gets you off on keyboard
    const kd = (e: KeyboardEvent) => { if (e.code !== 'KeyE' || e.repeat) return; const t = e.target as HTMLElement | null; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return; requestExit(); };
    window.addEventListener('keydown', kd); return () => window.removeEventListener('keydown', kd);
  }, []);
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
    const wantExit = !!ride && !!rs.current && !CINE.on && !EXIT.req;
    if (wantExit !== canExitRef.current) { canExitRef.current = wantExit; setCanExit(wantExit); }
    const cn = cine.current;
    if (cn && ride && g) { // ── door + walk-in / walk-out animation ──
      const dt = Math.min(dtRaw, .05), A = actor.current, D = doorG.current, H = hinge.current, P = doorPts(cn.car, cn.side, cn.bike, cn.bus, cn.front);
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
      } else { // off: walk away to the kerb while the door swings shut, then the vehicle pulls away
        if (cn.t > .55) cn.leaving = true;
        if (cn.leaving && cn.dep) { stepDep(cn.dep, dt); cn.car.x = cn.dep.x; cn.car.z = cn.dep.z; }
        const dr = cn.drop || P.out; const left = goTo(dr[0], dr[1], 3.2); cn.walk = left > .05; door(cn.t > .35 ? 0 : OPEN);
        if (left < .05 && cn.t > .8) { cn.ang = 0; cn.fin(); return; }
      }
      walking.current = cn.walk;
      A.position.set(cn.ax, 0, cn.az); A.rotation.y = cn.yaw; if (cn.ph !== 'close' && cn.ph !== 'open') A.visible = true;
      D.visible = !cn.bike && !cn.bus && cn.ang > .01; D.position.set(cn.car.x, 0, cn.car.z); D.rotation.y = cn.car.r; H.position.set(cn.front ? .55 : .15, 0, cn.side * .93); H.rotation.y = cn.side * cn.ang;
      if (busD.current) { const B = busD.current; B.visible = !!cn.bus && cn.ang > .01; B.position.set(cn.car.x, 0, cn.car.z); B.rotation.y = cn.car.r; busW.current.position.set(1.7, 1.15, cn.side * 1.19); busP.current.position.set(1.7 - Math.min(1, cn.ang / OPEN) * 1.0, 0, cn.side * 1.24); }   // bus door slides back, showing the doorway
      if (paxRef.current) paxRef.current.visible = cn.ph === 'open';   // you stay in your seat until you step out
      ride.x = cn.ax; ride.z = cn.az; ride.r = cn.car.r; GAME.player.x = cn.ax; GAME.player.z = cn.az;
      if (cn.ph === 'walk' || cn.ph === 'enter' || cn.ph === 'close') g.visible = false; else { g.visible = true; g.position.set(cn.car.x, 0, cn.car.z); g.rotation.y = cn.car.r; }
      return;
    }
    const dpn = dep.current;
    if (!ride && dpn && g) { stepDep(dpn, Math.min(dtRaw, .05)); g.visible = true; g.position.set(dpn.x, 0, dpn.z); g.rotation.y = dpn.r; if (paxRef.current) paxRef.current.visible = false; if (dpn.t > 5) finishDep(); return; }   // it has dropped you: it drives away, then goes back to roaming
    if (!ride || !g || !rs.current || !route.current) { if (g) g.visible = false; return; }
    const r = rs.current, rt = route.current;
    const inJ = EXIT.req && inJunction(r.x, r.z);   // asked to get off: keep rolling until clear of the junction, then stop
    stepRide(r, rt, Math.min(dtRaw, .05), { vmax: EXIT.req && !inJ ? 0 : ride.kind === 'taxi' ? 11 : ride.kind === 'bus' ? 8.5 : 7.5, t: st.clock.elapsedTime, light: lightState, cars: TPOS });
    if (!EXIT.req && !r.done && r.wait > 40) { r.s = Math.min(rt.len, r.s + 12); r.wait = 0; GAME.notice = '🚌 Traffic cleared: moving on.'; }   // never stay stuck for good
    ride.x = r.x; ride.z = r.z; ride.r = r.r;
    g.visible = true; g.position.set(r.x, 0, r.z); g.rotation.y = r.r; if (paxRef.current) paxRef.current.visible = true;   // you can be seen sitting inside
    OBS[2].x = r.x; OBS[2].z = r.z; GAME.player.x = r.x; GAME.player.z = r.z;
    const exitNow = EXIT.req && !r.done && r.v < .3 && !inJ;
    if (r.done || exitNow) { // arrived (or the player asked to get off and the vehicle has stopped): the door opens, the rider steps out onto the sidewalk, the door shuts and the taxi / bike goes back to roaming the city
      const bt = busTrip.current, offHere = EXIT.req;   // offHere: get off right here, not at the planned stop
      if (!offHere && bt && !bt.stops[bt.k]?.mine) { // a bus stop that is not yours: the other passengers get off, then the bus drives on to the next stop
        const stop = bt.stops[bt.k];
        if (bt.dwell < 0) { bt.dwell = 2.6; GAME.notice = `🚌 ${stop.name}: ${stop.n} passenger${stop.n === 1 ? '' : 's'} got off`; }
        bt.dwell -= Math.min(dtRaw, .05);
        if (bt.dwell > 0) return;
        let leg: Route | null = null;
        while (bt.k + 1 < bt.stops.length) { bt.k++; const nx = bt.stops[bt.k]; leg = planRide(rt.end, [nx.x, nx.z], CURB_BUS); if (leg || nx.mine) break; }
        bt.dwell = -1;
        if (leg) { route.current = leg; rs.current = newRide(leg, r.r); ride.path = leg.pts; ride.i = 0; GAME.notice = `🚌 Next stop: ${bt.stops[bt.k].name}`; return; }
        busTrip.current = null; GAME.notice = '🚌 The bus cannot reach your stop from here: you get off at the last stop.'; // fall through: let the player off now
      }
      const car: CarPose = { x: r.x, z: r.z, r: r.r }, bike = ride.kind === 'bike', bus = ride.kind === 'bus', name = ride.name, ex = offHere ? exitSpot(r.x, r.z, r.r) : null, drop: [number, number] = ex ? [ex.drop[0], ex.drop[1]] : [rt.drop[0], rt.drop[1]];
      const side: 1 | -1 = ((drop[0] - car.x) * Math.sin(car.r) + (drop[1] - car.z) * Math.cos(car.r)) >= 0 ? 1 : -1, front = seat.current.front && side === 1 && !bike && !bus, seatPt = doorPts(car, side, bike, bus, front).seat;
      CINE.on = true; EXIT.req = false;
      cine.current = { ph: bike ? 'exit' : 'open', t: 0, side, bike, bus, front, dep: makeDep(car, ex || rt.end, ride.kind), ang: 0, car, ax: seatPt[0], az: seatPt[1], yaw: car.r, walk: false, drop, fin: () => {
        const cc = cine.current, dp = cc && cc.leaving ? cc.dep : undefined;   // the vehicle is already pulling away: let it carry on
        cine.current = null; CINE.on = false; walking.current = false; actor.current.visible = false; doorG.current.visible = false; if (busD.current) busD.current.visible = false;
        GAME.ride = null; rs.current = null; route.current = null; OBS[2].on = false; busTrip.current = null;
        if (rideId.current) { const id = rideId.current; rideId.current = null; fetch('/api/rides', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'complete', id }) }).catch(() => {}); }
        GAME.player.x = drop[0]; GAME.player.z = drop[1]; GAME.tp = { x: drop[0], z: drop[1] };
        GAME.notice = `📍 Arrived at ${name}`;
        if (dp) { dp.idx = ROAM.rideIdx; ROAM.rideIdx = -1; dep.current = dp; }
        else { g.visible = false; if (ROAM.rideIdx >= 0) { respawnRoamer(ROAM.rideIdx); ROAM.rideIdx = -1; } }
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
    const curbFor = kind === 'bus' ? CURB_BUS : kind === 'bike' ? CURB : CURB_CAR, direct = planRide(start, [d.x, d.z], curbFor);
    if (!direct) { GAME.notice = 'It cannot set off from here: hail one nearer the middle of the map.'; releaseRoamer(c); DISPATCH.idx = -1; if (pre) refundRide(pre); setOpen(null); return; }
    let rt = direct, stops: BusStop[] | null = null, firstK = 0, riders = 1;
    if (kind === 'bus') { // the bus visits every passenger's stop (nearest first) and ends at yours
      const all: BusStop[] = [...(MANIFEST.get(idx) || []), { name: d.name, x: d.x, z: d.z, n: 0, mine: true }];
      riders = all.reduce((a, m) => a + m.n, 1);
      const order: BusStop[] = []; let cx = tp.x, cz = tp.z;
      while (all.length) { let bi = 0, bd = Infinity; all.forEach((s2, i) => { const dd = Math.hypot(s2.x - cx, s2.z - cz); if (dd < bd) { bd = dd; bi = i; } }); const [s2] = all.splice(bi, 1); order.push(s2); cx = s2.x; cz = s2.z; if (s2.mine) break; } // passengers whose stop is after yours stay on board
      let leg: Route | null = null; for (; firstK < order.length; firstK++) { leg = planRide(start, [order[firstK].x, order[firstK].z], CURB_BUS); if (leg || order[firstK].mine) break; }
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
    const fwd = (p0.x - tp.x) * Math.cos(l.rot) - (p0.z - tp.z) * Math.sin(l.rot), front = kind === 'taxi' && side === 1 && fwd > .2;   // walk up to the front half of a taxi (kerb side) and you get in the front; otherwise the back
    finishDep(); seat.current = { front, side }; lastKind.current = kind;
    CINE.on = true; EXIT.req = false; ROAM.sel = -1; DISPATCH.idx = -1; DISPATCH.ride = null;
    GAME.ride = { kind, x: p0.x, z: p0.z, r: l.rot, name: d.name, path: rt.pts, i: 0, speed: kind === 'taxi' ? 11 : kind === 'bus' ? 8.5 : 7.5, stand: -1 };
    cine.current = { ph: 'walk', t: 0, side, bike, bus, front, ang: 0, car, ax: p0.x, az: p0.z, yaw: Math.atan2(tp.x - p0.x, tp.z - p0.z), walk: true, fin: () => { // door shut, passenger inside: off we go
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
    <group ref={busD} visible={false}>   {/* bus door: a dark doorway and a yellow panel that slides back */}
      <mesh ref={busW} position={[1.7, 1.15, 1.19]}><boxGeometry args={[.95, 1.7, .03]} /><meshStandardMaterial color="#0e1820" roughness={.8} /></mesh>
      <group ref={busP} position={[1.7, 0, 1.24]}><mesh position={[0, 1.15, 0]}><boxGeometry args={[.95, 1.7, .05]} /><meshStandardMaterial color="#e8a923" roughness={.5} /></mesh><mesh position={[0, 1.5, .03]}><boxGeometry args={[.72, .6, .02]} /><meshStandardMaterial color="#cfe6f2" transparent opacity={.3} depthWrite={false} /></mesh></group>
    </group>
    {(() => { const dk = GAME.ride?.kind ?? lastKind.current, sp = seat.current; return <group ref={activeRef} visible={false}>{dk === 'bike' ? <BikeBody scale={1} rider /> : dk === 'bus' ? <BusBody /> : <TaxiBody kit={kit} driver />}
      <group ref={paxRef} visible={false} scale={dk === 'taxi' ? [.9, 1, .98] : [1, 1, 1]}><Passenger look={look} pos={dk === 'bus' ? [.9, 1.85, sp.side * .55] : dk === 'bike' ? [-.55, .75, 0] : sp.front ? [-.3, .92, .4] : [-.95, .92, sp.side * .4]} /></group>
    </group>; })()}
    {canExit && typeof document !== 'undefined' && createPortal(<button className="rideExit" onClick={requestExit} aria-label="Get off">🚪 Get off<small>E</small></button>, document.body)}
    {open !== null && <Html position={[0, 0, 0]}><TransportSheet kind={openKind} manifest={MANIFEST.get(open)} onPick={d => go(open, d)} onClose={() => setOpen(null)} /></Html>}
    <RuntimeStyle css={`${DEST_PICKER_CSS}.hailTag{font:400 15px/1 var(--gf,system-ui);color:#fff;background:var(--plum,#261a36);border:3px solid var(--ink,#1a1410);border-radius:999px;padding:5px 12px 4px;white-space:nowrap;box-shadow:0 3px 0 var(--ink,#1a1410);-webkit-text-stroke:3px var(--ink,#1a1410);paint-order:stroke fill;letter-spacing:.03em;pointer-events:auto;cursor:pointer}.hailTag.go{background:var(--gold,#ffb81c)}\n.trTag{font:400 15px/1 var(--gf,system-ui);color:#fff;background:var(--plum,#261a36);border:3px solid var(--ink,#1a1410);border-radius:999px;padding:4px 11px 3px;white-space:nowrap;box-shadow:0 3px 0 var(--ink,#1a1410);-webkit-text-stroke:3px var(--ink,#1a1410);paint-order:stroke fill;letter-spacing:.03em;transition:opacity .18s;pointer-events:none}.trTag.off{opacity:0}.trTag.near{background:var(--gold,#ffb81c)}
.rideExit{all:unset;box-sizing:border-box;position:fixed;z-index:61;left:50%;transform:translateX(-50%);bottom:calc(86px + env(safe-area-inset-bottom,0px));min-height:48px;display:flex;align-items:center;gap:8px;padding:10px 22px;cursor:pointer;background:var(--gold,#ffb81c);color:#fff;border:4px solid var(--ink,#1a1410);border-radius:999px;box-shadow:0 4px 0 var(--ink,#1a1410),0 10px 22px #0008;font:400 18px/1 var(--gf,system-ui);letter-spacing:.04em;-webkit-text-stroke:4px var(--ink,#1a1410);paint-order:stroke fill;touch-action:manipulation;-webkit-tap-highlight-color:transparent}.rideExit small{font-size:12px;padding:3px 7px;border:2px solid var(--ink,#1a1410);border-radius:7px;background:#fff3d6;color:#1a1410;-webkit-text-stroke:0}.rideExit:active{transform:translateX(-50%) translateY(4px);box-shadow:none}@media (hover:none){.rideExit small{display:none}}\n.trSheet{position:fixed;z-index:60;right:calc(12px + env(safe-area-inset-right,0px));top:calc(54px + env(safe-area-inset-top,0px));bottom:calc(12px + env(safe-area-inset-bottom,0px));width:min(320px,40vw);display:flex;flex-direction:column;overflow:hidden;background:var(--plum,#261a36);color:var(--cream,#fff3d6);border:4px solid var(--ink,#1a1410);border-radius:22px;box-shadow:0 6px 0 var(--ink,#1a1410),0 18px 34px #000a;font-family:var(--gf,system-ui);animation:trIn .24s cubic-bezier(.3,1.4,.5,1)}
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

/* ───────────── NPC police (step 6): patrol cars drive to the scene, officers step out, chase, search and give up ─────────────
 * Crime -> a witness phones it in (event arl-witness-report) or you become WANTED -> a patrol car spawns off-screen and DRIVES to the spot on the real road grid.
 * Officers get out, chase you on foot (they use the building footprints for line of sight and path-finding), and if you drive off the car chases too.
 * Break line of sight and they search your last known spot, then go back to the car; while unseen the server cools your heat a bit (/api/evade).
 * At very high heat, while you drive, a roadblock (two cars across the road) is set up ahead of you. Rewards, heat and arrests stay on the server. */
const COP_MAX = PATROL.maxCops, COP_SPEED = 6.2, COP_CATCHUP = 10, COP_ARREST_R = 2.4, COP_HOLD = 1.2, CAR_MAX = PATROL.maxCars;
export const POLICE_CARS: { x: number; z: number; r: number }[] = []; // live police cars, solid for the player on foot and in a car
type PCar = { id: number; mode: 'drive' | 'park' | 'block'; rt: Route | null; rs: RideState | null; x: number; z: number; r: number; at: number; until: number; replan: number; tx: number; tz: number; leave: boolean; hasCops: boolean; announced: boolean };
type PCop = { x: number; z: number; r: number; hold: number; car: number; state: 'chase' | 'search' | 'back'; until: number; wx: number; wz: number; wAt: number; path: [number, number][]; pi: number; planAt: number; yell: number };
const PBLK: Rect[] = BUILDS.map(b => ({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 }));
function PolicePatrol() {
  const cars = useRef<PCar[]>([]), cops = useRef<PCop[]>([]), Q = useRef<{ x: number; z: number }[]>([]);
  const carRefs = useRef<(THREE.Group | null)[]>([]), copRefs = useRef<(THREE.Group | null)[]>([]), red = useRef<(THREE.Mesh | null)[]>([]), blue = useRef<(THREE.Mesh | null)[]>([]);
  const st = useRef({ calling: false, wasWanted: false, wantedAt: 0, seen: 0, lx: 0, lz: 0, evadeAt: 0, lastDisp: 0, blockAt: 0, pin: 0, nid: 1, lost: false });
  const kit = pkit();
  useEffect(() => { const h = (e: Event) => { const d = (e as CustomEvent).detail as { x: number; z: number } | undefined; if (d && Q.current.length < 4) Q.current.push({ x: d.x, z: d.z }); }; window.addEventListener('arl-witness-report', h); return () => { window.removeEventListener('arl-witness-report', h); sirenStop(); POLICE_CARS.length = 0; OBS[3].on = false; OBS[4].on = false; }; }, []);
  const arrest = async () => {
    const S = st.current; if (S.calling) return; S.calling = true;
    try {
      const r = await fetch('/api/npc-police', { method: 'POST' }); const d = await r.json().catch(() => ({}));
      if (d?.ok) { GAME.notice = `🚔 Arrested by police${d.fine ? ` · fined ₦${Number(d.fine).toLocaleString()}` : ''}`; cops.current.length = 0; cars.current.forEach(c => { c.leave = true; c.until = 0; }); window.dispatchEvent(new Event('arl-refresh')); }
    } catch {}
    setTimeout(() => { S.calling = false; }, 4000);
  };
  const evade = async () => {
    try { const r = await fetch('/api/evade', { method: 'POST' }); const d = await r.json().catch(() => ({})); if (typeof d?.heat === 'number') { GAME.heat = d.heat; if (d.ok) { GAME.notice = d.heat < WANTED_AT ? '😮‍💨 You lost the police.' : '👀 Still hiding... the heat is cooling.'; window.dispatchEvent(new Event('arl-refresh')); } } } catch {}
  };
  /** a patrol car appears on a road >= 60 m from the target (and out of the player's sight) and drives to it */
  const spawnCar = (tx: number, tz: number, now: number) => {
    const P = GAME.player; if (cars.current.length >= CAR_MAX) return false;
    for (let k = 0; k < 12; k++) {
      const axis = Math.random() < .5 ? 'x' : 'z', road = Math.floor(Math.random() * 9) - 4, side: 1 | -1 = Math.random() < .5 ? 1 : -1, along = (Math.random() * 2 - 1) * 110;
      const sp = curbSpot(axis, road, along, side);
      if (Math.hypot(sp.x - tx, sp.z - tz) < 60 || Math.hypot(sp.x - P.x, sp.z - P.z) < 50) continue;
      const rt = planRide(sp, [tx, tz]); if (!rt) continue;
      const rs = newRide(rt, sp.r); cars.current.push({ id: st.current.nid++, mode: 'drive', rt, rs, x: rs.x, z: rs.z, r: rs.r, at: now, until: 0, replan: now + 6000, tx, tz, leave: false, hasCops: false, announced: false });
      return true;
    }
    return false;
  };
  const roadblock = (now: number) => { // two cars across the road about 60 m ahead of your car
    const P = GAME.player, fx = Math.cos(VEH.r), fz = -Math.sin(VEH.r), ax = THREE.MathUtils.clamp(P.x + fx * 60, -118, 118), az = THREE.MathUtils.clamp(P.z + fz * 60, -118, 118);
    const ix = Math.round(ax / GRID), iz = Math.round(az / GRID), alongZ = Math.abs(ax - ix * GRID) <= Math.abs(az - iz * GRID);
    const mid = (v: number) => THREE.MathUtils.clamp(Math.floor(v / GRID) * GRID + GRID / 2, -118, 118); // mid-block, clear of the junctions
    const hw = halfW(alongZ ? ix : iz), spots = [-1, 1].map(s => alongZ ? { x: ix * GRID + s * hw * .55, z: mid(az) + s * 1.2, r: 0 } : { x: mid(ax) + s * 1.2, z: iz * GRID + s * hw * .55, r: Math.PI / 2 });
    if (spots.some(s => Math.hypot(s.x - P.x, s.z - P.z) < 25)) return false;
    spots.forEach(s => cars.current.push({ id: st.current.nid++, mode: 'block', rt: null, rs: null, x: s.x, z: s.z, r: s.r, at: now, until: now + PATROL.roadblockLifeMs, replan: 0, tx: s.x, tz: s.z, leave: false, hasCops: false, announced: true }));
    GAME.notice = '🚧 Police roadblock ahead! Turn off or slow down.'; return true;
  };
  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, .05), now = Date.now(), P = GAME.player, S = st.current, C = cops.current, K = cars.current;
    const wanted = GAME.heat >= WANTED_AT && !GAME.jailed, driving = VEH.drv, flyingFree = driving || !!GAME.ride;
    /* ── wanted begins / ends ── */
    if (wanted && !S.wasWanted) { S.wasWanted = true; S.wantedAt = now; S.seen = now; S.lx = P.x; S.lz = P.z; S.lost = false; GAME.notice = '🚨 You are WANTED: a patrol is on its way. Break line of sight to lose them.'; }
    if (!wanted && S.wasWanted) { S.wasWanted = false; C.forEach(c => { c.state = 'back'; }); }
    /* ── dispatch: witness calls and your own heat ── */
    const live = K.filter(c => c.mode !== 'block' && !c.leave).length;
    while (Q.current.length) { const q = Q.current.shift()!; if (live < (wanted ? carsFor(GAME.heat) : 1) && now - S.lastDisp > 10_000 && !K.some(c => c.mode !== 'block' && !c.leave && Math.hypot(c.tx - q.x, c.tz - q.z) < 40)) { if (spawnCar(q.x, q.z, now)) S.lastDisp = now; } }
    if (wanted && now - S.wantedAt > 3500 && live < carsFor(GAME.heat) && now - S.lastDisp > 12_000 && K.length < CAR_MAX) { const seenNow = now - S.seen < 6000; if (spawnCar(seenNow ? P.x : S.lx, seenNow ? P.z : S.lz, now)) S.lastDisp = now; }
    if (wanted && driving && GAME.heat >= PATROL.roadblockHeat && Math.abs(VEH.v) > 8 && now - S.blockAt > PATROL.roadblockEveryMs && K.length <= CAR_MAX - 2) { if (roadblock(now)) S.blockAt = now; }
    /* ── cars ── */
    let nearest = 999;
    for (let i = K.length - 1; i >= 0; i--) {
      const c = K[i];
      if (c.mode === 'drive' && c.rt && c.rs) {
        stepRide(c.rs, c.rt, dt, { vmax: wanted ? 17 : 13, t: state.clock.elapsedTime, light: () => 'g', cars: TPOS }); c.x = c.rs.x; c.z = c.rs.z; c.r = c.rs.r;
        nearest = Math.min(nearest, Math.hypot(c.x - P.x, c.z - P.z));
        if (c.rs.done) {
          if (c.leave) { K.splice(i, 1); continue; }
          c.mode = 'park'; c.at = now; c.until = now + PATROL.parkMs; c.hasCops = false;
          const f = Math.cos(c.r), g = -Math.sin(c.r), lx = Math.sin(c.r), lz = Math.cos(c.r), n = Math.min(wanted ? copsFor(GAME.heat) : 1, COP_MAX - C.length);
          for (let k = 0; k < n; k++) { const o = { x: c.x + lx * 1.7 + f * (k - .5) * 1.1, z: c.z + lz * 1.7 + g * (k - .5) * 1.1 }; pushOut(o, .6); C.push({ x: o.x, z: o.z, r: c.r, hold: 0, car: c.id, state: wanted ? 'chase' : 'search', until: now + 16_000, wx: c.tx, wz: c.tz, wAt: 0, path: [], pi: 0, planAt: 0, yell: 0 }); c.hasCops = true; }
          if (!c.announced) { c.announced = true; if (!wanted) GAME.notice = '🚔 A police car arrived at the scene of the crime.'; }
        }
      } else if (c.mode === 'park') {
        const mine = C.some(o => o.car === c.id);
        if (wanted && now > c.replan && now - S.seen < 7000 && Math.hypot(c.x - P.x, c.z - P.z) > 22 && c.rt) { // you ran: the car comes after you
          const rt = planRide(c.rt.end, [P.x, P.z]); c.replan = now + 6000; if (rt) { c.rt = rt; c.rs = newRide(rt, c.r); c.mode = 'drive'; c.tx = P.x; c.tz = P.z; continue; }
        }
        if (!mine && now > c.until && c.rt) { // nobody left to pick up: drive off to the edge of the map
          const rt = planRide(c.rt.end, [Math.random() < .5 ? -128 : 128, (Math.random() * 2 - 1) * 100]); if (rt) { c.rt = rt; c.rs = newRide(rt, c.r); c.mode = 'drive'; c.leave = true; } else K.splice(i, 1);
        }
      } else if (c.mode === 'block') {
        if (now > c.until || Math.hypot(c.x - P.x, c.z - P.z) > 130) { K.splice(i, 1); continue; }
      }
    }
    const pinned = driving && wanted && Math.abs(VEH.v) < 2 && K.some(c => c.mode === 'park' && Math.hypot(c.x - VEH.x, c.z - VEH.z) < 8); // a patrol car has boxed in your stopped car
    S.pin = pinned ? S.pin + dt : Math.max(0, S.pin - dt * 2);
    if (S.pin > 1.8) { S.pin = 0; arrest(); }
    /* ── officers ── */
    let anySee = false;
    for (let i = C.length - 1; i >= 0; i--) {
      const c = C[i], d = Math.hypot(P.x - c.x, P.z - c.z);
      const sees = wanted && d < PATROL.seeRange && !lineBlocked(PBLK, c.x, c.z, P.x, P.z);
      if (sees) { anySee = true; S.seen = now; S.lx = P.x; S.lz = P.z; S.lost = false; if (c.state !== 'chase') { c.state = 'chase'; if (now - c.yell > 6000) { c.yell = now; GAME.notice = '🚔 Police! Stop right there!'; } } }
      let tx = c.x, tz = c.z, sp = 0;
      if (c.state === 'chase') {
        if (!wanted) { c.state = 'search'; c.until = now + 6000; }
        else {
          const tgtX = sees ? P.x : S.lx, tgtZ = sees ? P.z : S.lz;
          if (sees && d < 18) { tx = tgtX; tz = tgtZ; c.path = []; } // clear view and close: run straight at you
          else { // path-find around the buildings
            if (now - c.planAt > 1100 || !c.path.length) { c.planAt = now + (i * 137) % 300; c.path = findPath(BL, [c.x, c.z], [tgtX, tgtZ]); c.pi = 0; }
            while (c.pi < c.path.length - 1 && Math.hypot(c.path[c.pi][0] - c.x, c.path[c.pi][1] - c.z) < 1.2) c.pi++;
            const w = c.path[c.pi]; if (w) { tx = w[0]; tz = w[1]; } else { tx = tgtX; tz = tgtZ; }
          }
          sp = d > 40 ? COP_CATCHUP : d > 20 ? 7.4 : COP_SPEED;
          if (!sees && Math.hypot(S.lx - c.x, S.lz - c.z) < 3) { c.state = 'search'; c.until = now + PATROL.searchMs; c.wAt = 0; }
        }
      }
      if (c.state === 'search') {
        if (wanted && sees) { c.state = 'chase'; }
        else {
          if (now > c.wAt) { c.wAt = now + 2500; const a = Math.random() * Math.PI * 2, rr = 4 + Math.random() * 10; c.wx = (wanted ? S.lx : c.wx) + Math.sin(a) * rr; c.wz = (wanted ? S.lz : c.wz) + Math.cos(a) * rr; }
          tx = c.wx; tz = c.wz; sp = Math.hypot(tx - c.x, tz - c.z) > 1 ? 2.6 : 0;
          if (now > c.until) c.state = 'back';
          if (wanted && !anySee && now - S.seen > 4000 && !S.lost) { S.lost = true; GAME.notice = '👀 The police lost sight of you. Stay out of view.'; }
        }
      }
      if (c.state === 'back') {
        const car = K.find(k => k.id === c.car);
        if (!car) { C.splice(i, 1); continue; }
        tx = car.x; tz = car.z; sp = 3.4; if (Math.hypot(car.x - c.x, car.z - c.z) < 2.6) { C.splice(i, 1); continue; }
      }
      const dx = tx - c.x, dz = tz - c.z, dd = Math.hypot(dx, dz);
      if (sp > 0 && dd > .05) { c.x += dx / dd * Math.min(dd, sp * dt); c.z += dz / dd * Math.min(dd, sp * dt); pushOut(c, .6); c.r = Math.atan2(dx, dz); }
      else if (c.state !== 'back') c.r = Math.atan2(P.x - c.x, P.z - c.z);
      // arrest: reach you on foot, or you stopped your car beside them; never while you ride a taxi/bus
      if (c.state === 'chase' && d < COP_ARREST_R && !GAME.ride && (!driving || Math.abs(VEH.v) < 2.2)) { c.hold += dt; if (c.hold >= COP_HOLD) arrest(); } else c.hold = Math.max(0, c.hold - dt * 2);
    }
    /* ── you are hiding: the server cools your heat a bit ── */
    if (wanted && S.lost && !anySee && now - S.seen > PATROL.evadeAfterMs && now - S.evadeAt > PATROL.evadeEveryMs) { S.evadeAt = now; evade(); }
    /* ── draw ── */
    POLICE_CARS.length = 0; OBS[3].on = false; OBS[4].on = false; let b = 0;
    const blink = Math.floor(state.clock.elapsedTime * 4) % 2 === 0;
    for (let i = 0; i < CAR_MAX; i++) {
      const g = carRefs.current[i], c = K[i]; if (!g) continue;
      g.visible = !!c; if (!c) continue;
      g.position.set(c.x, 0, c.z); g.rotation.y = c.r; POLICE_CARS.push({ x: c.x, z: c.z, r: c.r });
      if (c.mode === 'block' && b < 2) { OBS[3 + b].x = c.x; OBS[3 + b].z = c.z; OBS[3 + b].on = true; b++; }
    }
    for (let i = 0; i < COP_MAX; i++) {
      const g = copRefs.current[i], c = C[i]; if (!g) continue;
      g.visible = !!c; if (!c) continue;
      g.position.set(c.x, Math.abs(Math.sin(state.clock.elapsedTime * 9 + i)) * (c.state === 'search' ? .03 : .08), c.z); g.rotation.y = c.r;
      if (red.current[i]) red.current[i]!.visible = blink; if (blue.current[i]) blue.current[i]!.visible = !blink;
    }
    sirenSet(nearest < 999 ? Math.max(0, 1 - nearest / 110) : 0);
  });
  return <>
    {Array.from({ length: CAR_MAX }, (_, i) => <group key={'pc' + i} ref={el => { carRefs.current[i] = el; }} visible={false}><PoliceBody kit={kit} /></group>)}
    {Array.from({ length: COP_MAX }, (_, i) => <group key={i} ref={el => { copRefs.current[i] = el; }} visible={false}>
      <mesh position={[-.13, .4, 0]}><boxGeometry args={[.2, .8, .22]} /><meshStandardMaterial color="#111827" /></mesh>
      <mesh position={[.13, .4, 0]}><boxGeometry args={[.2, .8, .22]} /><meshStandardMaterial color="#111827" /></mesh>
      <mesh position={[0, 1.1, 0]}><boxGeometry args={[.58, .8, .32]} /><meshStandardMaterial color="#1e3a8a" /></mesh>
      <mesh position={[0, 1.65, 0]}><sphereGeometry args={[.17, 12, 12]} /><meshStandardMaterial color="#6b4429" /></mesh>
      <mesh position={[0, 1.82, 0]}><boxGeometry args={[.4, .1, .4]} /><meshStandardMaterial color="#0f172a" /></mesh>
      <mesh ref={el => { red.current[i] = el; }} position={[-.12, 2.05, 0]}><sphereGeometry args={[.09, 8, 8]} /><meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={2} /></mesh>
      <mesh ref={el => { blue.current[i] = el; }} position={[.12, 2.05, 0]}><sphereGeometry args={[.09, 8, 8]} /><meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={2} /></mesh>
    </group>)}
  </>;
}

/* ───────────── pedestrians: walk the pavements, wait for red traffic, scatter when hit ───────────── */
type Ped = { axis: 'x' | 'z'; line: number; u: number; dir: 1 | -1; sp: number; ph: number; down: number; x: number; z: number; moving: boolean; shirt: string; pants: string; skin: string; home:string; work:string; mode:'home'|'commute'|'work'|'social'|'flee'; hidden:boolean; target:[number,number]; vis:number; yaw:number; off:number; vf:number; tc:number; rest:number; ox:number; oz:number; lat:number; latT:number };
const SHIRTS = ['#c0392b', '#2c5aa0', '#e8e8ea', '#1e9e55', '#f1c40f', '#7c3aed', '#0f766e', '#d97706', '#111827', '#be185d'];
const PANTS = ['#1f2937', '#374151', '#4b5563', '#111827', '#2b3a55', '#5b4636'];
const SKINS = ['#3b2417', '#4a2e1c', '#5a3825', '#6b4429', '#7a4f32', '#8d5f3d'];
const PED_N = 32; // Keep NPCs as light ambient life; real users are the primary population.
const pick = <T,>(a: T[], k: string) => a[Math.floor(hs(k) * a.length) % a.length];
function makePeds(): Ped[] {
  return Array.from({ length: PED_N }, (_, n) => {
    const ri = Math.floor(hs('pi' + n) * 11) - 5, side = hs('ps' + n) < .5 ? 1 : -1, axis: 'x' | 'z' = hs('pa' + n) < .5 ? 'x' : 'z';
    const homes=['Gwarinpa','Kubwa','Maitama','Jabi','Asokoro','Utako'], works=['Central Area','Wuse','Garki','Maitama','Jabi','Airport Corridor']; const home=homes[n%homes.length], work=works[(n*3)%works.length]; return { axis, line: ri * GRID + side * (halfW(ri) + 2 + (hs('po' + n) - .5)), u: (hs('pu' + n) * 2 - 1) * 118, dir: (hs('pd' + n) < .5 ? 1 : -1) as 1 | -1, sp: 1.1 + hs('pv' + n) * .7, ph: hs('pp' + n) * 6.28, down: 0, x: 0, z: 0, moving: true, shirt: pick(SHIRTS, 'sh' + n), pants: pick(PANTS, 'pn' + n), skin: pick(SKINS, 'sk' + n), home, work, mode:'work', hidden:false, target:[0,0], vis:1, yaw:NaN, off:hs('po' + n) - .5, vf:.88 + hs('pf' + n) * .24, tc:0, rest:0, ox:0, oz:0, lat:0, latT:0 };
  });
}
const timeToGreen = (t: number, axis: 'x' | 'z') => { const c = t % 32; return axis === 'x' ? (c < 14 ? 0 : 32 - c) : (c >= 16 && c < 30 ? 0 : c < 16 ? 16 - c : 48 - c); };
const canCross = (t: number, carAxis: 'x' | 'z') => lightState(t, carAxis) === 'r' && timeToGreen(t, carAxis) > 5.5;
/* ───────────── solid bodies ─────────────
 * Nobody walks or drives through anybody else. Pedestrians sidestep what is in their way and stop when there is no room; you, other players and cars are pushed out of each other. */
const BODY_R = .3, PED_PUSH = .6;   // body radius of a person; how close two people's centres may get
type Spot = { x: number; z: number };
/** every other real player on foot (those driving are inside their car) */
const peersOnFoot = () => { const o: Spot[] = []; for (const q of Object.values(NET.peers)) if (q.init && !q.drv) o.push({ x: q.x, z: q.z }); return o; };
/** every other real player's car (parked or driven), except one that is being carjacked right now */
const remoteCars = () => { const o: { x: number; z: number; r: number }[] = []; for (const [n, q] of Object.entries(NET.peers)) if (q.init && (q.cp || q.drv) && !JACK.hides(n)) o.push({ x: q.cx, z: q.cz, r: q.cr }); return o; };
/** push p out of a circle at (x, z) with the given reach. true if it moved. */
function pushFrom(p: Spot, x: number, z: number, reach: number) {
  const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz);
  if (d >= reach) return false;
  if (d > 1e-4) { p.x = x + dx / d * reach; p.z = z + dz / d * reach; } else p.x += reach;
  return true;
}
function Pedestrians() {
  const peds = useMemo(makePeds, []);
  const rx = useRef<(Reaction | null)[]>([]), pose = useRef(Array.from({ length: PED_N }, () => ({ up: 0, crouch: 0, film: 0, angry: 0, give: 0 }))), W = useRef({ punchUntil: 0, armedAt: 0, after: {} as Record<number, { at: number; fx: number; fz: number }> }), phone = useRef<THREE.InstancedMesh>(null!);
  useFrame(() => { for (let i = 0; i < peds.length; i++) { const p = peds[i], e = PEDPOS[i] || (PEDPOS[i] = { x: 1e5, z: 1e5 }); e.x = p.hidden ? 1e5 : p.x; e.z = p.hidden ? 1e5 : p.z; e.d = p.down > 0; } });
  useEffect(() => {   // step 7: a pedestrian you held up hands the cash over (then runs), bolts without paying, or squares up. The SERVER already decided whether the robbery worked.
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail as { idx: number; result: 'give' | 'bolt' | 'resist' } | undefined; if (!d || !peds[d.idx]) return;
      const now = wnow(), me = GAME.player, mk = (kind: Reaction['kind'], secs: number, shoutIn: number): Reaction => ({ kind, until: now + secs, fx: me.x, fz: me.z, sense: 'saw', callAt: 0, shoutAt: now + shoutIn, calledIn: false });
      if (d.result === 'give') { rx.current[d.idx] = mk('give', 1.7, .1); W.current.after[d.idx] = { at: now + 1.7, fx: me.x, fz: me.z }; }
      else if (d.result === 'bolt') { rx.current[d.idx] = mk('flee', 9, 4); shout(d.idx, BOLT_LINES[Math.floor(Math.random() * BOLT_LINES.length)], 2.4); }
      else { rx.current[d.idx] = mk('confront', 7, 4); shout(d.idx, RESIST_LINES[Math.floor(Math.random() * RESIST_LINES.length)], 2.6); }
    };
    window.addEventListener('arl-ped-demand', h); return () => window.removeEventListener('arl-ped-demand', h);
  }, [peds]);
  const torso = useRef<THREE.InstancedMesh>(null!), head = useRef<THREE.InstancedMesh>(null!), legs = useRef<THREE.InstancedMesh>(null!), arms = useRef<THREE.InstancedMesh>(null!);
  const handA = useRef<THREE.InstancedMesh>(null!), handB = useRef<THREE.InstancedMesh>(null!), footA = useRef<THREE.InstancedMesh>(null!), footB = useRef<THREE.InstancedMesh>(null!), soles = useRef<THREE.InstancedMesh>(null!);
  // real hands (palm, four fingers, thumb) and bare feet with five toes. The arm at +z has its thumb on the -z side, hence s = -1 for A.
  const G = useMemo(() => ({ handA: handGeometry(false, -1, Math.PI / 2), handB: handGeometry(false, 1, Math.PI / 2), footA: pedFootGeometry(-1), footB: pedFootGeometry(1), sole: pedSoleGeometry() }), []);
  const T = useMemo(() => ({ base: new THREE.Matrix4(), m: new THREE.Matrix4(), t: new THREE.Matrix4(), r: new THREE.Matrix4(), pos: new THREE.Vector3(), one: new THREE.Vector3(1, 1, 1), sc: new THREE.Vector3(1, 1, 1), qa: new THREE.Quaternion(), qb: new THREE.Quaternion(), q: new THREE.Quaternion(), Y: new THREE.Vector3(0, 1, 0), Z: new THREE.Vector3(0, 0, 1) }), []);
  useLayoutEffect(() => {
    const c = new THREE.Color();
    peds.forEach((p, i) => {
      torso.current.setColorAt(i, c.set(p.shirt)); head.current.setColorAt(i, c.set(p.skin));
      for (let s = 0; s < 2; s++) { legs.current.setColorAt(i * 2 + s, c.set(p.pants)); arms.current.setColorAt(i * 2 + s, c.set(p.shirt)); }
      for (const m of [handA, handB, footA, footB]) m.current.setColorAt(i, c.set(p.skin));
    });
    for (const m of [torso, head, legs, arms, handA, handB, footA, footB]) if (m.current.instanceColor) m.current.instanceColor.needsUpdate = true;
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
    const partFlat = (mesh: THREE.InstancedMesh, idx: number, tx: number, ty: number, tz: number, rz: number, dy: number) => { // like part(), but turned back so a foot stays level while its leg swings
      T.t.makeTranslation(tx, ty, tz); T.m.copy(T.base).multiply(T.t); T.r.makeRotationZ(rz); T.m.multiply(T.r); T.t.makeTranslation(0, dy, 0); T.m.multiply(T.t); T.r.makeRotationZ(-rz); T.m.multiply(T.r); mesh.setMatrixAt(idx, T.m);
    };
    const feetOn = peersOnFoot();   // other real players, for the pedestrians to make way for
    const eventActive = (wc.hh >= 0 && wc.hh % 6 === 0) || wx.storm;
    /* ── witness AI (step 5): what the player did this frame, and who can see it ── */
    const nowS = wnow(), nowMs = Date.now(), me = GAME.player, WS = W.current, crimes = drainCrimes();
    const holdingGun = !!(window as any).__arlWeapon && !VEH.drv && !GAME.jailed;
    if (NET.me.anim === 'punch' && NET.me.animUntil > nowMs && NET.me.animUntil !== WS.punchUntil) {   // a swing next to a pedestrian is an assault they (and others) can see
      WS.punchUntil = NET.me.animUntil;
      if (!assaultQuiet()) { let vi = -1, vd = 2.8; peds.forEach((q, qi) => { const d = Math.hypot(q.x - me.x, q.z - me.z); if (!q.hidden && d < vd) { vd = d; vi = qi; } }); if (vi >= 0) pushCrime({ kind: 'assault', x: me.x, z: me.z, victim: vi }); }
    }
    if ((NET.me.anim === 'shoot' || NET.me.anim === 'reload') && NET.me.animUntil > nowMs && holdingGun) WS.armedAt = nowMs;
    const brandishing = holdingGun;   // step 7: a DRAWN gun counts as out (GTA: people react to the weapon, you do not have to fire first)
    peds.forEach((p, i) => {
      let fall = 0; p.moving = false; p.hidden = false;
      const yw = Number.isNaN(p.yaw) ? 0 : p.yaw, persona = personaOf(i);
      let react: Reaction | null = rx.current[i] && rx.current[i]!.until > nowS ? rx.current[i] : null;
      if (rx.current[i] && !react) { rx.current[i] = null; p.sp = 1.1 * p.vf; p.tc = 0; }   // calmed down: back to normal walking
      const start = (k: Reaction['kind'], fx: number, fz: number, sense: 'saw' | 'heard') => {
        const cur = rx.current[i]; if (cur && cur.until > nowS && PRI[cur.kind] >= PRI[k]) return;
        react = rx.current[i] = { kind: k, until: nowS + duration(k, Math.random()), fx, fz, sense, callAt: k === 'film' ? nowS + 2.5 + Math.random() * 2 : 0, shoutAt: nowS + .15 + Math.random() * .7, calledIn: false };
      };
      const af = WS.after[i]; if (af && nowS >= af.at) { delete WS.after[i]; react = rx.current[i] = { kind: 'flee', until: nowS + 9, fx: af.fx, fz: af.fz, sense: 'saw', callAt: 0, shoutAt: nowS + .5, calledIn: false }; }   // step 7: handed it over, now runs
      if (!p.hidden && p.down <= 0) {
        for (const c of crimes) {   // somebody did something: can I see or hear it, and what do I do about it?
          const dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz) || .01, victim = i === c.victim;
          const sense = victim ? 'saw' : perceive(c.kind, d, (Math.cos(yw) * dx - Math.sin(yw) * dz) / d); if (!sense) continue;
          const k = decide(persona, c.kind, sense, d, victim, false, Math.random()); if (k) start(k, c.x, c.z, sense);
        }
        if (brandishing) {   // a weapon in hand: people nearby notice, and anyone you point it at puts their hands up
          const dx = me.x - p.x, dz = me.z - p.z, d = Math.hypot(dx, dz) || .01;
          if (d < 14) {
            const aimed = d < 12 && (Math.sin(me.r) * -dx + Math.cos(me.r) * -dz) / d > .82;
            if (react && react.kind === 'handsup' && aimed) react.until = Math.max(react.until, nowS + 1.5);
            else if (!react && Math.random() < dt * 2.5) {
              const sense = perceive('armed', d, (Math.cos(yw) * dx - Math.sin(yw) * dz) / d);
              if (sense === 'saw') { const k = decide(persona, 'armed', 'saw', d, false, aimed, Math.random()); if (k) start(k, me.x, me.z, 'saw'); }
            }
          }
        }
      }
      const rk = react ? (react as Reaction).kind : null; PEDSTATE[i] = rk;   // CrimeActions shows 'demand cash' only once hands are really up
      if (react) {
        const R = react as Reaction;
        if (nowS >= R.shoutAt) { if (Math.hypot(p.x - me.x, p.z - me.z) < 45) shout(i, lineFor(R.kind), R.kind === 'freeze' ? 1.8 : 2.6); R.shoutAt = R.kind === 'flee' || R.kind === 'confront' ? nowS + 4 + Math.random() * 3 : 1e9; }
        if (R.kind === 'film' && !R.calledIn && R.callAt && nowS >= R.callAt) { R.calledIn = true; if (reportCrime(R.fx, R.fz)) GAME.notice = '📞 A witness is calling the police on you!'; }   // step 6 listens for 'arl-witness-report'
      }
      const hour=wc.hh + wc.mm/60;
      p.mode = (hour < 6 || hour >= 22) ? 'home' : (hour < 10 || (hour >= 16 && hour < 19)) ? 'commute' : hour >= 19 ? 'social' : 'work';
      if (eventActive && i % 11 === 0) p.mode='flee';
      const prof = CITY.districts.find(d=>d.name===((p.mode==='home'||p.mode==='social')?p.home:p.work));
      if(prof) p.target=[prof.x+p.ox,prof.z+p.oz];
      if(p.mode==='flee'){ const dx=p.x-(p.target[0]||0),dz=p.z-(p.target[1]||0),len=Math.hypot(dx,dz)||1;p.target=[p.x+dx/len*18,p.z+dz/len*18]; if(i%11===0 && Math.random()<.002) window.dispatchEvent(new CustomEvent('arl-npc-alert',{detail:`🚨 NPC ${i+1} reported an incident to police.`})); }
      const td=Math.hypot(p.x-p.target[0],p.z-p.target[1]);
      p.tc=Math.max(0,p.tc-dt);
      const wander=()=>(Math.random()<.5?-1:1)*(20+Math.random()*25);
      // Arrived near the destination: stand and linger for a while (visible on the pavement, never shrunk or hidden), then wander off somewhere else.
      if(p.mode==='flee') p.rest=0;
      else if(p.rest>0){ p.rest-=dt; if(p.rest<=0){ p.ox=wander(); p.oz=wander(); p.tc=0; } else if(td>16){ p.rest=0; p.tc=0; } } // destination changed (time of day): stop lingering
      else if(td<12){ p.rest=12+Math.random()*30; }
      const lingering = p.rest>0;
      if (p.down > 0) { p.down -= dt; fall = Math.min(1, (3.2 - p.down) / .25) * Math.min(1, Math.max(0, p.down) / .35); }
      else {
        let go = !lingering;
        if (rk) { // reacting to a crime: everything except fleeing stands still; fleeing sprints along the pavement away from it
          go = rk === 'flee';
          if (go) { const al = p.axis === 'x' ? p.x - react!.fx : p.z - react!.fz; if (Math.abs(al) > .5) p.dir = al > 0 ? 1 : -1; p.sp = 3.4 * p.vf; }
        }
        else if(p.mode==='flee'){ p.dir = p.axis==='x' ? (p.target[0]>=p.x?1:-1) : (p.target[1]>=p.z?1:-1); p.sp=2.8*p.vf; }
        else if(!lingering && td>4){
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
        { // bodies are solid: step aside for whoever is in the way (to your own side, so two people walking towards each other pass cleanly), and stop when there is no room
          const ax = p.axis === 'x'; let dodge = false, stop = false;
          const see = (ox: number, oz: number) => {
            const along = ((ax ? ox - p.x : oz - p.z)) * p.dir, perp = ax ? oz - p.z : ox - p.x, railPerp = ax ? oz - (p.z - p.lat) : ox - (p.x - p.lat);
            if (along > -.6 && along < 1.7 && Math.abs(railPerp) < PED_PUSH) dodge = true;
            if (along > -.05 && along < PED_PUSH + .15 && Math.abs(perp) < PED_PUSH - .1) stop = true;
          };
          for (let q = 0; q < peds.length; q++) { const o = peds[q]; if (q !== i && !o.hidden && o.down <= 0) see(o.x, o.z); }
          if (!VEH.drv && !GAME.jailed) see(me.x, me.z);
          for (const f of feetOn) see(f.x, f.z);
          if (stop && rk !== 'flee') go = false;
          p.latT = dodge ? PED_PUSH * p.dir : 0;
        }
        const nx = nextCenter(p.u, p.dir), rj = Math.round(nx / GRID);
        if (Math.abs(rj) <= 5) { const dist = (nx - p.u) * p.dir - (halfW(rj) + .3); if (dist > -.05 && dist < .5 && signalised(rj, Math.round(p.line / GRID)) && !canCross(t, p.axis === 'x' ? 'z' : 'x') && rk !== 'flee') go = false; } // wait at the kerb for a red light (not when running for your life)
        if (go) { const activityFactor = rk === 'flee' ? 1 : night ? .55 : rain ? .72 : (wc.hh >= 7 && wc.hh < 10 ? 1.15 : 1); p.u += p.dir * p.sp * activityFactor * dt; p.ph += dt * p.sp * 5; p.moving = true; if (p.u > 124) p.dir = -1; else if (p.u < -124) p.dir = 1; }
      }
      if (p.axis === 'x') { p.x = p.u; p.z = p.line; } else { p.x = p.line; p.z = p.u; }
      p.lat += (p.latT - p.lat) * Math.min(1, dt * 3.5); if (p.axis === 'x') p.z += p.lat; else p.x += p.lat;   // the sidestep
      if (p.down <= 0 && VEH.drv && Math.abs(VEH.v) > 3.5) { const dx = p.x - VEH.x, dz = p.z - VEH.z; if (dx * dx + dz * dz < 3.6) { p.down = 3.2; VEH.v *= .9; thud(.5); pushCrime({ kind: 'runover', x: p.x, z: p.z, victim: i }); } } // clipped by the player's car
      const yawT = react && rk !== 'flee' ? Math.atan2(-((react as Reaction).fz - p.z), (react as Reaction).fx - p.x) : p.axis === 'x' ? (p.dir > 0 ? 0 : Math.PI) : -p.dir * Math.PI / 2, sw = p.moving ? Math.sin(p.ph) : 0;   // witnesses turn to look at the crime
      if (Number.isNaN(p.yaw)) p.yaw = yawT; let dyw = yawT - p.yaw; dyw = Math.atan2(Math.sin(dyw), Math.cos(dyw)); p.yaw += dyw * Math.min(1, dt * (react ? 14 : 9)); const pv = PEDVIEW[i] || (PEDVIEW[i] = { x: 0, z: 0, yaw: 0, on: false }); pv.x = p.x; pv.z = p.z; pv.yaw = p.yaw; pv.on = !p.hidden && p.down <= 0; // turn smoothly instead of snapping 180°
      p.vis += ((p.hidden ? 0 : 1) - p.vis) * Math.min(1, dt * 5); const sc = Math.max(.001, p.vis); T.sc.set(sc, sc, sc);
      const Pz = pose.current[i], kk = Math.min(1, dt * 8);   // smooth the reaction pose so hands go up / crouch / phone comes out over a moment
      Pz.up += ((rk === 'handsup' ? 1 : rk === 'cower' ? .75 : 0) - Pz.up) * kk; Pz.crouch += ((rk === 'cower' ? 1 : 0) - Pz.crouch) * kk; Pz.film += ((rk === 'film' ? 1 : 0) - Pz.film) * kk; Pz.angry += ((rk === 'confront' ? 1 : 0) - Pz.angry) * kk; Pz.give += ((rk === 'give' ? 1 : 0) - Pz.give) * kk;
      const lean = (rk === 'flee' && p.moving ? .22 : 0) + Pz.crouch * .45;
      T.qa.setFromAxisAngle(T.Y, p.yaw); T.qb.setFromAxisAngle(T.Z, -(fall * Math.PI / 2 + lean)); T.q.copy(T.qa).multiply(T.qb);
      T.pos.set(p.x, .12 * fall - .36 * Pz.crouch + (p.moving ? Math.abs(sw) * .03 : 0), p.z); T.base.compose(T.pos, T.q, T.sc);
      part(torso.current, i, 0, 1.05, 0); part(head.current, i, 0, 1.52, 0);
      part(legs.current, i * 2, 0, .78, .1, sw * .7 + Pz.crouch, -.38); part(legs.current, i * 2 + 1, 0, .78, -.1, -sw * .7 + Pz.crouch, -.38);
      const trem = Math.sin(t * 22 + i) * .07 * Pz.up, aL = -sw * .6 * (1 - Pz.up) + (2.8 + trem) * Pz.up, aR0 = sw * .6 * (1 - Pz.up) + (2.8 - trem) * Pz.up;
      const aR = aR0 * (1 - Pz.film - Pz.angry - Pz.give) + 1.75 * Pz.film + (1.25 + Math.sin(t * 10 + i) * .55) * Pz.angry + 1.55 * Pz.give;   // hands up / phone held out / angry gesture
      part(arms.current, i * 2, 0, 1.3, .27, aL, -.25); part(arms.current, i * 2 + 1, 0, 1.3, -.27, aR, -.25);
      part(handA.current, i, 0, 1.3, .27, aL, -.5); part(handB.current, i, 0, 1.3, -.27, aR, -.5);   // hands at the wrists, following the arms
      partFlat(footA.current, i, 0, .78, .1, sw * .7 + Pz.crouch, -.725); partFlat(footB.current, i, 0, .78, -.1, -sw * .7 + Pz.crouch, -.725); partFlat(soles.current, i * 2, 0, .78, .1, sw * .7 + Pz.crouch, -.725); partFlat(soles.current, i * 2 + 1, 0, .78, -.1, -sw * .7 + Pz.crouch, -.725);
      if (Pz.film > .6) { T.t.makeTranslation(.52, 1.4, -.27); T.m.copy(T.base).multiply(T.t); } else T.m.makeScale(0, 0, 0);
      phone.current.setMatrixAt(i, T.m);
    });
    for (const m of [torso, head, legs, arms, handA, handB, footA, footB, soles, phone]) m.current.instanceMatrix.needsUpdate = true;
  });
  return <>
    <instancedMesh ref={torso} args={[undefined, undefined, PED_N]} frustumCulled={false} castShadow><boxGeometry args={[.26, .56, .46]} /><meshStandardMaterial roughness={.9} /></instancedMesh>
    <instancedMesh ref={head} args={[undefined, undefined, PED_N]} frustumCulled={false}><sphereGeometry args={[.14, 10, 8]} /><meshStandardMaterial roughness={.8} /></instancedMesh>
    <instancedMesh ref={legs} args={[undefined, undefined, PED_N * 2]} frustumCulled={false}><boxGeometry args={[.15, .76, .17]} /><meshStandardMaterial roughness={.9} /></instancedMesh>
    <instancedMesh ref={arms} args={[undefined, undefined, PED_N * 2]} frustumCulled={false}><boxGeometry args={[.11, .52, .11]} /><meshStandardMaterial roughness={.9} /></instancedMesh>
    <instancedMesh ref={handA} args={[G.handA, undefined, PED_N]} frustumCulled={false}><meshStandardMaterial roughness={.6} /></instancedMesh>
    <instancedMesh ref={handB} args={[G.handB, undefined, PED_N]} frustumCulled={false}><meshStandardMaterial roughness={.6} /></instancedMesh>
    <instancedMesh ref={footA} args={[G.footA, undefined, PED_N]} frustumCulled={false}><meshStandardMaterial roughness={.6} /></instancedMesh>
    <instancedMesh ref={footB} args={[G.footB, undefined, PED_N]} frustumCulled={false}><meshStandardMaterial roughness={.6} /></instancedMesh>
    <instancedMesh ref={soles} args={[G.sole, undefined, PED_N * 2]} frustumCulled={false}><meshStandardMaterial color="#2a2623" roughness={.9} /></instancedMesh>
    <instancedMesh ref={phone} args={[undefined, undefined, PED_N]} frustumCulled={false}><boxGeometry args={[.05, .1, .02]} /><meshBasicMaterial color="#9be8ff" /></instancedMesh>
  </>;
}

/* ───────────── NPC speech bubbles: "Oga, abeg, don't shoot!" (newest 4 shown, anchored above the ped) ───────────── */
function NpcShouts() {
  const slots = useRef<(THREE.Group | null)[]>([]), [list, setList] = useState<typeof SHOUTS>([]);
  useEffect(() => { const id = setInterval(() => { const now = wnow(), act = SHOUTS.filter(s => s.until > now).slice(-4); setList(prev => (prev.map(s => s.id).join() === act.map(s => s.id).join() ? prev : act)); }, 200); return () => clearInterval(id); }, []);
  useFrame(() => { list.forEach((s, k) => { const g = slots.current[k], q = s.i >= DRV_SHOUT ? TPOS[s.i - DRV_SHOUT] : PEDPOS[s.i]; if (g && q && q.x < 9e4) g.position.set(q.x, s.i >= DRV_SHOUT ? 3.2 : 2.15, q.z); }); });
  return <>
    <RuntimeStyle id="arl-npc-shout" css={`.npcShout{background:#fffffff2;color:#111;border-radius:12px;padding:4px 9px;font-size:12px;font-weight:800;white-space:nowrap;box-shadow:0 3px 10px #0007;pointer-events:none;animation:popIn .15s both}.npcShout:after{content:'';position:absolute;left:50%;bottom:-5px;margin-left:-5px;border:5px solid transparent;border-bottom:0;border-top-color:#fffffff2}`} />
    {list.map((s, k) => <group key={s.id} ref={el => { slots.current[k] = el; }}><Html center zIndexRange={[6, 0]}><div className="npcShout" style={{ position: 'relative' }}>{s.text}</div></Html></group>)}
  </>;
}

/* ───────────── the player's car ───────────── */
const CAR_COLOR = '#ff6a00';
function PlayerCar({ carRef, tagRef, spotRef, model, look }: { carRef: React.MutableRefObject<THREE.Group>; tagRef: React.MutableRefObject<HTMLDivElement | null>; spotRef: React.MutableRefObject<THREE.SpotLight>; model: string; look: Look }) {
  const kit = pkit(), tgt = useMemo(() => new THREE.Object3D(), []);
  // the seated figure is YOU (your avatar is hidden while you drive): it wears your look, and it is only there while you are at the wheel. It was always there before, so a car you had just jacked still showed its old driver.
  const drvObj = useRef<THREE.Object3D | null>(null), setDrv = useMemo(() => (g: THREE.Object3D | null) => { drvObj.current = g; }, []);
  const dl = useMemo<DrvLook>(() => ({ skin: look.skin, outfit: look.outfit, hairColor: look.hairColor }), [look.skin, look.outfit, look.hairColor]);
  useFrame(() => { if (drvObj.current) drvObj.current.visible = VEH.drv; }); const [, bump] = useState(0); useEffect(() => { JACK.refresh = () => bump(v => v + 1); return () => { JACK.refresh = () => {}; }; }, []); const stolen = JACK.on; const [style,setStyle]=useState<any>(null); useEffect(()=>{fetch('/api/vehicles').then(r=>r.ok?r.json():null).then(d=>setStyle(d?.vehicles?.[0]||null)).catch(()=>{});},[model]);
  useLayoutEffect(() => { spotRef.current.target = tgt; }, [tgt, spotRef]);
  return <group ref={carRef} visible={false}>
    {stolen && JACK.sRole === 'bus' ? <BusBody driverRef={setDrv} look={dl} /> : stolen && JACK.sRole === 'bike' ? <BikeBody scale={.95} rider driverRef={setDrv} riderLook={look} /> : stolen && JACK.sRole === 'taxi' ? <TaxiBody kit={kit} refs={{ driverRef: setDrv, look: dl }} /> : stolen && JACK.sRole === 'police' ? <PoliceBody kit={kit} refs={{ driverRef: setDrv, look: dl }} /> : <CarModel kit={kit} color={stolen ? JACK.color : (vehicleByName(model).color || CAR_COLOR)} kind={0} driverRef={setDrv} look={dl} model={stolen ? JACK.model : model} style={stolen ? undefined : (style||undefined)} />}
    <spotLight ref={spotRef} position={[2.2, .9, 0]} angle={.5} penumbra={.7} intensity={0} distance={42} decay={2} color="#fff4d6" />
    <primitive object={tgt} position={[16, .2, 0]} />
    <Html position={[0, 2.4, 0]} center zIndexRange={[5, 0]}><div ref={el => { tagRef.current = el; }} className="cityBizTag" style={{ display: 'none' }}>Your car<br /><small>Press E</small></div></Html>
  </group>;
}
// put the car in the nearest lane (right-hand traffic), a few metres ahead of the player, clear of other cars
function placeCar(px: number, pz: number, pr: number) {
  JACK.release(); // calling your own car replaces a stolen one
  const ix = Math.round(px / GRID), iz = Math.round(pz / GRID), alongZ = Math.abs(px - ix * GRID) <= Math.abs(pz - iz * GRID);
  const idx = alongZ ? ix : iz, off = halfW(idx) * .5, face = alongZ ? Math.cos(pr) : Math.sin(pr), sgn: 1 | -1 = face >= 0 ? 1 : -1;
  let a = (alongZ ? pz : px) + sgn * 3;
  const lane = idx * GRID + (alongZ ? (sgn === 1 ? -off : off) : (sgn === 1 ? off : -off));
  for (let tries = 0; tries < 8; tries++) {
    const cx = alongZ ? lane : a, cz = alongZ ? a : lane;
    if (!TPOS.some(c => Math.hypot(c.x - cx, c.z - cz) < 3.6)) break;
    a += sgn * 6;
  }
  for (let k = 0; k < 6 && inJunction(alongZ ? lane : a, alongZ ? a : lane, 3.5); k++) a += sgn * 4;   // never leave it standing in the middle of a junction
  a = THREE.MathUtils.clamp(a, -120, 120);
  VEH.x = alongZ ? lane : a; VEH.z = alongZ ? a : lane;
  VEH.r = alongZ ? -sgn * Math.PI / 2 : (sgn === 1 ? 0 : Math.PI);
  VEH.v = 0; VEH.placed = true; VEH.drv = false;
}

/* ───────────── collision ───────────── */
const BODY = .45;
const SOLIDS = [
  ...LOOK_SOLIDS,
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
export const GAME = { jailed: false, heat: 0, drunk: 0, high: 0, hasCar: false, vehicleModel: 'Toyota Camry', notice: '', tp: null as { x: number; z: number } | null, nav: null as { x: number; z: number; name: string; mission?: string; auto?: boolean } | null, route: null as { pts: [number, number][]; i: number } | null, missionFinal: null as { x: number; z: number; name: string } | null, player: { x: START.x, z: START.z, r: 0 }, ride: null as null | { kind: 'taxi' | 'bike' | 'bus'; x: number; z: number; r: number; name: string; path: [number, number][]; i: number; speed: number; stand?: number } }; // set by the game layer
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
 return <>{events.map(e=>{const d=CITY.districts.find(x=>x.name===e.district)||CITY.districts[0];return <group key={e.id} position={[d.x,0,d.z]}>{e.kind==='fire'&&<pointLight color="#ff6a22" intensity={5} distance={22}/>}{e.kind==='fire'&&<mesh position={[0,2.3,0]}><sphereGeometry args={[1.2,10,10]}/><meshBasicMaterial color="#ff4b20" transparent opacity={.45}/></mesh>}{e.kind==='accident'&&<group rotation-y={.4}><mesh position={[0,.5,0]}><boxGeometry args={[3.2,.7,1.7]}/><meshStandardMaterial color="#7b2d2d"/></mesh><mesh position={[0,1.3,0]}><boxGeometry args={[2,.15,1.1]}/><meshStandardMaterial color="#ffb000" emissive="#ff5a00" emissiveIntensity={2}/></mesh></group>}{(e.kind==='celebration'||e.kind==='concert')&&Array.from({length:8},(_,i)=><mesh key={i} position={[(hs(e.id+i)*2-1)*5,.5,(hs(e.id+'z'+i)*2-1)*5]}><sphereGeometry args={[.18,8,8]}/><meshStandardMaterial color="#d99a42"/></mesh>)}</group>})}</>;
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
function Scene({ look, ctl, hud, setNear, getMinute, roster, ver, bub, onPick, fight, shoot }: { fight: (to: string) => boolean; shoot: (to: string, weapon: string) => boolean; look: Look; ctl: React.MutableRefObject<Ctl>; hud: React.MutableRefObject<Hud>; setNear: (b: any) => void; getMinute?: () => number; roster: string[]; ver: number; bub: Record<string, string>; onPick: (n: string) => void }) {
  const P = useRef({ x: START.x, z: START.z, y: 0, vy: 0, r: START.r });
  const group = useRef<THREE.Group>(null!), controls = useRef<any>(null), sun = useRef<THREE.DirectionalLight>(null!), hemi = useRef<THREE.HemisphereLight>(null!), stars = useRef<THREE.Group>(null!);
  const carG = useRef<THREE.Group>(null!), carTag = useRef<HTMLDivElement | null>(null), spot = useRef<THREE.SpotLight>(null!), nameTag = useRef<HTMLDivElement | null>(null);
  const sunTarget = useMemo(() => new THREE.Object3D(), []);
  const moving = useRef(false), running = useRef(false), nearId = useRef<string | null>(null);
  const drag = useRef({ on: false, end: 0 }), lastN = useRef(-1), fov = useRef(52), hitCool = useRef(0), shown = useRef({ drv: false, placed: false });
  const firstCam = useRef(true); const driveKm=useRef(0); const lastDrivePost=useRef(0);
  const nav = useRef<{ key: string; points: [number, number][]; i: number; at: number } | null>(null);
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
    const stray = !!(GAME.nav && nav.current && Date.now() - nav.current.at > 1500 && Math.hypot(p.x - (nav.current.points[nav.current.i]?.[0] ?? p.x), p.z - (nav.current.points[nav.current.i]?.[1] ?? p.z)) > 22); // wandered off the route: plan a new one
    if (GAME.nav && (!nav.current || stray || nav.current.key !== `${GAME.nav.x}:${GAME.nav.z}`)) {
      const pts = findPath(BL, [p.x, p.z], [GAME.nav.x, GAME.nav.z]);
      nav.current = { key: `${GAME.nav.x}:${GAME.nav.z}`, points: pts.length ? pts : [[GAME.nav.x, GAME.nav.z]], i: 0, at: Date.now() };
    } else if (!GAME.nav) nav.current = null;
    let ix = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0) + c.joy.x;
    let iy = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0) - c.joy.y;
    if (JACK.victimUntil > Date.now()) { ix = 0; iy = 0; c.interact = false; c.jump = false; } // someone just threw you out of your car
    if (JACK.ph) { ix = 0; iy = 0; c.interact = false; c.jump = false; stepJack(p, dt, c); } // carjack in progress: the sequence drives the avatar
    /* Waypoints only GUIDE the player (route line on the minimap and map). The player always steers; only the idle auto-work routine (nav.auto) may walk by itself. */
    if (nav.current && GAME.nav) {
      while (nav.current.i < nav.current.points.length - 1 && Math.hypot(p.x - nav.current.points[nav.current.i][0], p.z - nav.current.points[nav.current.i][1]) < 2.2) nav.current.i++;
      GAME.route = { pts: nav.current.points, i: nav.current.i };
      const guided = !GAME.nav.auto, reach = guided ? 4 : 1.6;
      if (GAME.nav.auto && !VEH.drv && !ix && !iy) {
        const [nx, nz] = nav.current.points[nav.current.i] || [GAME.nav.x, GAME.nav.z];
        const dx = nx - p.x, dz = nz - p.z, len = Math.hypot(dx, dz) || 1;
        const wx = dx / len, wz = dz / len;
        ix = wx * fx + wz * fz;
        iy = wx * -fz + wz * fx;
      }
      if (Math.hypot(p.x - GAME.nav.x, p.z - GAME.nav.z) < reach) {
        const arrived = GAME.nav.name, missionId = GAME.nav.mission; GAME.nav = null; nav.current = null; GAME.route = null; GAME.notice = `📍 Arrived at ${arrived}`; if (missionId) window.dispatchEvent(new CustomEvent('arl-mission-arrived', { detail: { id: missionId, destination: arrived } })); ix = 0; iy = 0;
      }
    } else GAME.route = null;
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
    if (me.ko && nowMs >= me.ko) { const out = me.koKind === 'passout'; me.ko = 0; me.hp = out ? Math.max(me.hp, 60) : 35; me.safe = nowMs + SAFE_AFTER_WAKE_MS; me.koKind = ''; GAME.notice = out ? '🥴 You came to. Your head is pounding. Protected for a few seconds.' : '💪 You got back up. Protected for a few seconds.'; }
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

    /* ── weapon fire: choose the nearest player in the forward aim cone ── */
    if (c.shoot) {
      c.shoot = false;
      if (!down && !VEH.drv && !GAME.jailed) {
        const weapon = (window as any).__arlWeapon as string | undefined;
        if (!weapon || !WEAPON_RULES[weapon]) { GAME.notice = '🚫 You have no weapon. Buy one at a Gun Shop.'; return; }
        const range = WEAPON_RULES[weapon].range;
        let tgt = '', bd = range;
        for (const [pn, q] of Object.entries(NET.peers)) {
          if (q.drv || q.ko) continue;
          const dx=q.x-p.x, dz=q.z-p.z, dd=Math.hypot(dx,dz); if(dd>=bd) continue;
          const dot=(dx/Math.max(dd,.001))*Math.sin(p.r)+(dz/Math.max(dd,.001))*Math.cos(p.r);
          if(dot>.62){bd=dd;tgt=pn;}
        }
        // a bullet is only spent when a shot really went out (the network layer can refuse one on cooldown)
        let fired = true;
        if (tgt) fired = shoot(tgt, weapon);
        else { NET.me.anim='shoot'; NET.me.animUntil=Date.now()+360; }
        if (fired) {
          window.dispatchEvent(new CustomEvent('arl-shot-fired', { detail: weapon })); pushCrime({ kind: 'gunshot', x: p.x, z: p.z });   // everyone nearby hears it, many see it
          GAME.notice = tgt ? `🎯 Fired ${weapon} at ${tgt}` : '🔫 Shot fired — no target in your aim cone';
        }
      }
    }
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
      const RC = remoteCars();
      for (const tc of TPOS.concat(POLICE_CARS, RC)) { // other cars (traffic, police, other players')
        const tx = Math.cos(tc.r), tz = -Math.sin(tc.r);
        for (const to of [-1.1, 1.1]) for (const o of CAR_OFFS) {
          const ax = tc.x + tx * to, az = tc.z + tz * to, bx = V.x + fxw * o, bz = V.z + fzw * o, dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz);
          if (d < CAR_R * 2 && d > 1e-4) { const push = CAR_R * 2 - d; V.x += dx / d * push; V.z += dz / d * push; hit = Math.max(hit, push); }
        }
      }
      { // people are solid too: real players on foot always, pedestrians when you are not fast enough to run them down (above ~3.5 m/s a ped is knocked over, as before)
        const bump = (x: number, z: number, reach: number) => { for (const o of CAR_OFFS) { const dx = V.x + fxw * o - x, dz = V.z + fzw * o - z, d = Math.hypot(dx, dz); if (d < reach && d > 1e-4) { const push = reach - d; V.x += dx / d * push; V.z += dz / d * push; hit = Math.max(hit, push); } } };
        for (const f of peersOnFoot()) bump(f.x, f.z, CAR_R + .45);
        if (Math.abs(V.v) <= 3.5) for (let i = 0; i < PEDPOS.length; i++) { const q = PEDPOS[i]; if (q && q.x < 9e4 && !q.d) bump(q.x, q.z, CAR_R + .4); }
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
      for (const tc of TPOS.concat(POLICE_CARS, remoteCars())) { // cars are solid (traffic, police, other players')
        const tx = Math.cos(tc.r), tz = -Math.sin(tc.r);
        for (const to of [-1.1, 1.1]) { const ax = tc.x + tx * to, az = tc.z + tz * to, dx = p.x - ax, dz = p.z - az, d = Math.hypot(dx, dz); if (d < 1.45 && d > 1e-4) { p.x = ax + dx / d * 1.45; p.z = az + dz / d * 1.45; } }
      }
      if (!GAME.jailed) { // people are solid: pedestrians (unless lying on the ground) and other real players on foot
        for (let i = 0; i < PEDPOS.length; i++) { const q = PEDPOS[i]; if (q && q.x < 9e4 && !q.d) pushFrom(p, q.x, q.z, PED_PUSH); }
        for (const f of peersOnFoot()) pushFrom(p, f.x, f.z, PED_PUSH);
        pushOut(p);   // never into a wall
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
      if (!VEH.placed && JACK.on) JACK.release(); // an abandoned stolen car goes back to traffic
    }
    c.jump = false;
    GAME.player.x = p.x; GAME.player.z = p.z; GAME.player.r = p.r;
    group.current.rotation.order = 'YXZ'; const lying = me.ko > nowMs || JACK.victimUntil > nowMs; group.current.position.set(p.x, p.y + (lying ? .28 : 0), p.z); group.current.rotation.y = p.r; group.current.rotation.x = lying ? -Math.PI / 2 : 0; // knocked out: lying on the ground
    group.current.visible = !VEH.drv;
    if (JACK.ph) moving.current = JACK.walk;
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
    (window as any).__arlPos = { x: p.x, z: p.z };
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
      <LookDriver night={NIGHT} />
      <ShopGlow night={NIGHT} />
      <StreetClutter />
      <Graffiti />
      <PowerLines />
      <Puddles />
      <Signals />
      {BUILDS.map(b => <Building key={b.id} b={b} />)}
      <Traffic />
      <JackNpc />
      <JackGhost />
      <Pedestrians />
      <NpcShouts />
      <PolicePatrol />
      <PlayerCar carRef={carG} tagRef={carTag} spotRef={spot} model={vehicleModel} look={look} />
      <TrainLine />
      <WeatherEffects />
      <WorldEventVisuals />
      <Rain />
      <Airport />
      <ChopYards />
      <JailCell />
      <group ref={group}>
        <Human look={look} getState={() => (moving.current ? 'walk' : 'idle')} getAnim={() => { const m = NET.me; if (moving.current) return undefined; return m.anim && Date.now() < m.animUntil ? m.anim : undefined; }} getSpeed={() => (running.current ? 2.4 : 1.1)} />
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
   Anyone with a chat bubble always keeps a full tag. */
const TAGS: { at: number; rank: Record<string, number> } = { at: 0, rank: {} };
const tagRanks = () => { const now = performance.now(); if (now - TAGS.at < 250) return; TAGS.at = now; const r: Record<string, number> = {}; Object.entries(NET.peers).map(([n, q]) => [n, Math.hypot(NET.me.x - q.x, NET.me.z - q.z)] as const).sort((a, b) => a[1] - b[1]).forEach(([n], i) => { r[n] = i; }); TAGS.rank = r; };
function Remote({ name, bub, onPick }: { name: string; bub?: string; onPick: (n: string) => void }) {
  const drvObj = useRef<THREE.Object3D | null>(null), setDrv = useMemo(() => (g: THREE.Object3D | null) => { drvObj.current = g; }, []);
  const body = useRef<THREE.Group>(null!), car = useRef<THREE.Group>(null!), hum = useRef<THREE.Group>(null!), tag = useRef<HTMLDivElement | null>(null), nameEl = useRef<HTMLDivElement | null>(null);
  const kit = pkit(), remoteModel = VEHICLE_CATALOG[Math.floor(hs(name) * VEHICLE_CATALOG.length)].id, colour = useMemo(() => vehicleById(remoteModel).color, [remoteModel]);
  useFrame((_, dtRaw) => {
    const q = NET.peers[name]; if (!q || !body.current) return;
    const dt = Math.min(dtRaw, .1), k = 1 - Math.exp(-dt * 9);
    q.x += (q.tx - q.x) * k; q.z += (q.tz - q.z) * k; q.r += wrap(q.tr - q.r) * k;
    q.cx += (q.tcx - q.cx) * k; q.cz += (q.tcz - q.cz) * k; q.cr += wrap(q.tcr - q.cr) * k;
    const d = Math.hypot(NET.me.x - q.x, NET.me.z - q.z), near = d < 150;
    body.current.visible = near && !q.drv; body.current.rotation.order = 'YXZ'; body.current.position.set(q.x, q.ko ? .28 : 0, q.z); body.current.rotation.y = q.r; body.current.rotation.x = q.ko ? -Math.PI / 2 : 0;
    car.current.visible = near && (q.cp || q.drv) && !JACK.hides(name); car.current.position.set(q.cx, 0, q.cz); car.current.rotation.y = q.cr;
    if (drvObj.current) drvObj.current.visible = !!q.drv;   // somebody sits in a remote car only while that player is driving it (a parked car is empty)
    tagRanks();
    const rk = TAGS.rank[name] ?? 99, full = rk < 5 || !!bub;
    if (tag.current) {
      const show = full ? d < 60 : rk < 14 && d < 28, sc = full ? THREE.MathUtils.clamp(1.1 - d / 70, .62, 1) : .6, op = full ? THREE.MathUtils.clamp(1.25 - d / 60, .5, 1) : THREE.MathUtils.clamp(1 - d / 28, .35, .85);
      const key = `${show}|${full}|${Math.round(sc * 20)}|${Math.round(op * 20)}`;
      if (tag.current.dataset.k !== key) { tag.current.dataset.k = key; tag.current.style.display = show ? '' : 'none'; tag.current.style.transform = `scale(${sc.toFixed(2)})`; tag.current.style.opacity = String(op.toFixed(2)); nameEl.current?.classList.toggle('mini', !full); }
    }
  });
  const p = NET.peers[name]; if (!p) return null;
  return <>
    <group ref={body} onClick={e => { if (e.delta > 6) return; e.stopPropagation(); onPick(name); }}>
      <Human look={p.look} getState={() => (rWalk(name) ? 'walk' : 'idle')} getAnim={() => { const q = NET.peers[name]; if (!q || rWalk(name)) return undefined; return q.anim && Date.now() < q.animUntil ? q.anim : undefined; }} getSpeed={() => ((NET.peers[name]?.mv || 0) === 2 ? 2.4 : 1.1)} />
      <Html position={[0, 2.8, 0]} center zIndexRange={[5, 0]}><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, transformOrigin: '50% 100%' }} ref={el => { tag.current = el; }}>{bub && <div className="cwSay">{bub}</div>}<div ref={nameEl} className="cityNameTag cwTapTag" onClick={() => onPick(name)}>{name}</div></div></Html>
    </group>
    <group ref={car} visible={false}><CarModel kit={kit} color={colour} kind={0} model={remoteModel} driverRef={setDrv} look={p.look} /></group>
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
      const rt = GAME.route, nv = GAME.nav;
      if (rt && nv) {
        g.strokeStyle = '#ff3b30'; g.lineWidth = 1.4; g.lineJoin = 'round'; g.setLineDash([3, 2]); g.beginPath(); g.moveTo(h.x, h.z);
        for (let i = rt.i; i < rt.pts.length; i++) g.lineTo(rt.pts[i][0], rt.pts[i][1]);
        g.lineTo(nv.x, nv.z); g.stroke(); g.setLineDash([]);
      }
      const mf = (window as any).__arlMissionId ? GAME.missionFinal : null;
      if (mf && nv && (mf.x !== nv.x || mf.z !== nv.z)) { // final destination of the mission: dotted guide from this stop to the end + a gold flag (clamped to the minimap edge)
        g.strokeStyle = '#ffd23f'; g.lineWidth = 1; g.setLineDash([1.5, 2.5]); g.beginPath(); g.moveTo(nv.x, nv.z); g.lineTo(mf.x, mf.z); g.stroke(); g.setLineDash([]);
        const fd = Math.hypot(mf.x - h.x, mf.z - h.z), fk = fd > 46 ? 46 / fd : 1; g.fillStyle = '#ffd23f'; g.strokeStyle = '#000'; g.lineWidth = .5; g.beginPath(); g.arc(h.x + (mf.x - h.x) * fk, h.z + (mf.z - h.z) * fk, 3, 0, Math.PI * 2); g.fill(); g.stroke();
      }
      if (nv) { const dd = Math.hypot(nv.x - h.x, nv.z - h.z), k = dd > 46 ? 46 / dd : 1, mx = h.x + (nv.x - h.x) * k, mz = h.z + (nv.z - h.z) * k; g.fillStyle = '#ff3b30'; g.strokeStyle = '#fff'; g.lineWidth = .5; g.beginPath(); g.arc(mx, mz, k < 1 ? 2.6 : 3.4, 0, Math.PI * 2); g.fill(); g.stroke(); }
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
      if (box.current) box.current.style.display = ko || m.hp < 100 || hurtRecent || m.safe > now ? 'flex' : 'none';
      if (bar.current) { bar.current.style.width = `${Math.max(0, m.hp)}%`; bar.current.style.background = m.hp > 50 ? '#35c46b' : m.hp > 25 ? '#f2b705' : '#ff5147'; }
      if (txt.current) txt.current.textContent = ko ? `${m.koKind === 'passout' ? '🥴 Passed out' : '😵 Knocked out'}: wakes in ${Math.ceil((m.ko - now) / 1000)}s` : m.safe > now ? `🛡️ Protected ${Math.ceil((m.safe - now) / 1000)}s · ❤️ ${Math.ceil(m.hp)}` : `❤️ ${Math.ceil(m.hp)}`;
      if (fx.current) fx.current.style.opacity = ko ? '.55' : String(Math.max(0, 1 - (now - m.hurt) / 350) * .5);
    }, 80);
    return () => clearInterval(id);
  }, []);
  return <><div ref={fx} className="cwHurt" /><div ref={box} className="cwHp" style={{ display: 'none' }}><span ref={txt} /><i><b ref={bar} /></i></div></>;
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
.cwHurt{position:absolute;inset:0;z-index:9;pointer-events:none;opacity:0;background:radial-gradient(ellipse at center,#0000 40%,#ff1010cc 100%)}.cwHp{position:absolute;left:50%;bottom:26px;transform:translateX(-50%);z-index:12;flex-direction:column;align-items:center;gap:4px;color:#fff;font-weight:800;font-size:13px;pointer-events:none;text-shadow:0 2px 0 #000}.cwHp i{display:block;width:180px;height:12px;border:3px solid #1a1410;border-radius:99px;background:#0009;overflow:hidden}.cwHp b{display:block;height:100%;width:100%;transition:width .15s}\n.cwBtn span{font-size:22px;line-height:1}.cwBtn small{font-size:9px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}
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
  const [sel, setSel] = useState<string | null>(null);
  const ctl = useRef<Ctl>({ shoot: false, joy: { x: 0, y: 0 }, look: { x: 0, y: 0 }, keys: new Set(), run: false, jump: false, recenter: false, interact: false, taxi: false, horn: false, punch: false });
  const hud = useRef<Hud>({ x: START.x, z: START.z, fx: Math.sin(START.r), fz: Math.cos(START.r), r: START.r, vx: 0, vz: 0, vp: false, spd: 0, drv: false, prompt: 'E — Call your car' });
  const cfg = useSettings(), [hasCar, setHasCar] = useState(GAME.hasCar), [armed, setArmed] = useState(false);
  useEffect(() => { const w = setInterval(() => { const mid = (window as any).__arlMissionId; if (mid && !(window as any).__arlMissionHold && (GAME.nav as any)?.mission !== mid) { const g = (window as any).__arlMissionGoal as { id: string; x: number; z: number; name: string } | undefined; if (g && g.id === mid) { GAME.nav = { x: g.x, z: g.z, name: g.name, mission: mid }; GAME.notice = '📍 Mission route restored'; } else window.dispatchEvent(new Event('arl-mission-lost')); } }, 800); return () => clearInterval(w); }, []);
  useEffect(() => { const i = setInterval(() => { setHasCar(GAME.hasCar); if (!GAME.hasCar) { if (VEH.drv) JACK.victimEject(); VEH.placed = false; VEH.drv = false; } }, 600); return () => clearInterval(i); }, []);
  useEffect(() => {
    const startMission = (e: Event) => {
      const m = (e as CustomEvent).detail as { id?: string; goto?: { name?: string; type?: string; district?: string }; final?: { name?: string; type?: string; district?: string }; fresh?: boolean; label?: string; title?: string };
      if (!m?.id || !m.goto) return;
      const pos = (window as any).__arlPos as { x: number; z: number } | undefined;
      const resolve = (g: { name?: string; type?: string; district?: string }, from?: { x: number; z: number }) => {
        const near = (l: typeof BUILDING_DESTS) => from ? [...l].sort((a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z))[0] : l[0];
        const pick = (l: typeof BUILDING_DESTS) => l.length ? near(l) : undefined;
        return (g.name ? pick(BUILDING_DESTS.filter(d => d.name.toLowerCase().includes(g.name!.toLowerCase()))) : undefined)
          || (g.type ? pick(BUILDING_DESTS.filter(d => d.type === g.type)) : undefined)
          || (g.district ? pick(BUILDING_DESTS.filter(d => d.district.toLowerCase() === g.district!.toLowerCase())) : undefined);
      };
      const target = resolve(m.goto, pos);
      // the FINAL destination of the whole mission (resolved from the current stage target so multi-stop contracts pick the sensible building)
      const fin = m.final ? resolve(m.final, target || pos) : undefined;
      GAME.missionFinal = fin ? { x: fin.x, z: fin.z, name: fin.name } : null;
      if (!target) { GAME.notice = `Mission started: ${m.title || m.label}. Find the mission destination in the city.`; return; }
      (window as any).__arlMissionTarget = { x: target.x, z: target.z }; (window as any).__arlMissionGoal = { id: m.id, x: target.x, z: target.z, name: target.name };
      GAME.nav = { x: target.x, z: target.z, name: target.name, mission: m.id } as any;
      GAME.notice = `📍 ${m.label || 'Mission waypoint'}: ${target.name} — follow the route on your minimap or map`;
      if (m.fresh) onOpenMap?.(); // a brand-new mission opens the map so you see the route and the final destination straight away
    };
    const cancelMission = () => { GAME.missionFinal = null; if ((GAME.nav as any)?.mission) GAME.nav = null; };
    window.addEventListener('arl-mission-start', startMission); window.addEventListener('arl-mission-cancel', cancelMission);
    return () => { window.removeEventListener('arl-mission-start', startMission); window.removeEventListener('arl-mission-cancel', cancelMission); };
  }, []);
  useEffect(() => {
    const typing = (e: Event) => { const t = e.target as HTMLElement | null; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
    const dn = (e: KeyboardEvent) => {
      if (typing(e)) return; const k = e.key.toLowerCase();
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if (k === 'c') ctl.current.recenter = true;
      if (k === 'f' && !e.repeat) ctl.current.punch = true;
      if (k === 'v' && !e.repeat) window.dispatchEvent(new Event('arl-trigger-fire'));
      if (k === 'e' && !e.repeat) { ctl.current.interact = true; unlockAudio(); }
      if (k === 't' && !e.repeat) { ctl.current.taxi = true; unlockAudio(); }
      if (k === 'h' && !e.repeat) { ctl.current.horn = true; unlockAudio(); }
      ctl.current.keys.add(k);
    };
    const up = (e: KeyboardEvent) => { ctl.current.keys.delete(e.key.toLowerCase()); };
    const clear = () => ctl.current.keys.clear();
    const fire = () => { ctl.current.shoot = true; }; const anim = (e: Event) => { NET.me.anim = String((e as CustomEvent).detail || ''); NET.me.animUntil = Date.now() + 700; }; const selected = (e: Event) => { (window as any).__arlWeapon = String((e as CustomEvent).detail || ''); setArmed(!!(e as CustomEvent).detail); }; window.addEventListener('arl-weapon-shoot', fire); window.addEventListener('arl-player-animation', anim); window.addEventListener('arl-weapon-selected', selected); window.addEventListener('keydown', dn); window.addEventListener('keyup', up); window.addEventListener('blur', clear);
    return () => { window.removeEventListener('arl-weapon-shoot', fire); window.removeEventListener('arl-player-animation', anim); window.removeEventListener('arl-weapon-selected', selected); window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear); };
  }, []);
  return (
    <div className="cityWorld">
      <RuntimeStyle css={CSS} />
      <RuntimeStyle css={GAME_LABEL_CSS} />
      <Canvas shadows dpr={[1, 1.5]} camera={{ position: [START.x - Math.sin(START.r) * 8, 4.2, START.z - Math.cos(START.r) * 8], fov: 52, far: 600 }}>
        <Scene fight={net.punch} shoot={net.shoot} look={look} ctl={ctl} hud={hud} setNear={onNear} getMinute={getMinute} roster={net.roster} ver={net.ver} bub={net.bub} onPick={setSel} />
      </Canvas>
      <Minimap hud={hud} onOpen={onOpenMap} />
      <CityPeople net={net} sel={sel} setSel={setSel} />
      <LookPad ctl={ctl} />
      <Stick ctl={ctl} />
      <DriveHud hud={hud} />
      <FightHud />
      <MissionsCombat />
      <button className="cwMute" aria-label="Toggle sound" onClick={() => { unlockAudio(); setMuted(!cfg.muteAll); }}>{cfg.muteAll ? '🔇' : '🔊'}</button>
      <button className="cwMute cwGear" aria-label="Settings" onClick={openSettings}>⚙️</button>
      <div className="cwBtns">
        {hasCar && <HoldBtn cls="cam cwTouch" label="Horn" icon="📣" down={() => { unlockAudio(); ctl.current.horn = true; }} />}
        {hasCar && <HoldBtn cls="cwTouch" label="Car" icon="🚗" down={() => { unlockAudio(); ctl.current.interact = true; }} />}
        <HoldBtn cls="cwTouch" label="Taxi" icon="🚕" down={() => { unlockAudio(); ctl.current.taxi = true; }} />
        <HoldBtn cls="" label="Fight" icon="👊" down={() => { ctl.current.punch = true; }} />
        {armed && <HoldBtn cls="" label="Fire" icon="🔫" down={() => { window.dispatchEvent(new Event('arl-trigger-fire')); }} />}
        <HoldBtn cls="cam" label="Camera" icon="🎥" down={() => { ctl.current.recenter = true; }} />
        <HoldBtn cls="" label="Sprint" icon="🏃" down={() => { ctl.current.run = true; }} up={() => { ctl.current.run = false; }} />
        <HoldBtn cls="big" label="Jump" icon="⬆️" down={() => { ctl.current.jump = true; }} />
      </div>
      <div className="cwHint"><b>WASD</b> move · <b>Shift</b> sprint · <b>Space</b> jump<br /><b>Drag mouse</b> look · <b>C</b> recenter · <b>F</b> punch · <b>M</b> missions · <b>G</b> weapon · <b>R</b> reload · <b>V</b> fire (guns are sold at Gun Shops)<br />{hasCar ? <><b>E</b> call / enter / exit car · <b>H</b> horn · <b>Space</b> handbrake · </> : null}Gamepad works too</div>
    </div>
  );
}