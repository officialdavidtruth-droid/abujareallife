'use client';
import { useFrame } from '@react-three/fiber';
import { BodyDom } from './CityUi';
import { RoundedBox, Text } from '@react-three/drei';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CityBuilding } from '../lib/cityTypes';
import { BuildingDress, ROAD_MAT, awningMat } from './CityLook';
import { GRID, WS, halfW, billboardSpot } from '../lib/roadRoute';
import { BUILDS, Box2, FH, GAME, INTER, Kind, NIGHT, Prof, hs, registerDetail } from './cityShared';


/* ───────────── building looks per business type ───────────── */
export const DEF: Prof = { kind: 'concrete', f: [3, 5], sign: '#2b3440' };

export const PROFILE: Record<string, Prof> = {
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
  'Fashion Boutique': { kind: 'glass', f: [2, 3], sign: '#a3125f' },
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
export const TEX = new Map<string, THREE.CanvasTexture>();

export const EMT = new Map<string, THREE.CanvasTexture>();
 // night-time window glow maps
export const MATS = new Map<string, THREE.MeshStandardMaterial>();

export const BAY = 2.2, NX = 4, NY = 2;


export function facadeTex(kind: Kind, wall: string, balc: boolean) {
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

export function sideMat(kind: Kind, wall: string, balc: boolean) {
  const key = kind + wall + balc;
  const hit = MATS.get(key); if (hit) return hit;
  const m = new THREE.MeshStandardMaterial({ map: facadeTex(kind, wall, balc), emissive: new THREE.Color('#ffffff'), emissiveMap: EMT.get(kind + wall + balc), emissiveIntensity: 0, roughness: kind === 'glass' ? .22 : .88, metalness: kind === 'glass' ? .35 : 0 });
  MATS.set(key, m); return m;
}

export const ROOF = new THREE.MeshStandardMaterial({ color: '#4b5056', roughness: .95 });

export function boxGeo(w: number, d: number, floors: number) {
  const g = new THREE.BoxGeometry(w, floors * FH, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const spans = [d, d, 0, 0, w, w];
  for (let f = 0; f < 6; f++) {
    const su = spans[f] ? Math.max(2, Math.round(spans[f] / BAY)) / NX : 1, sv = spans[f] ? floors / NY : 1;
    for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); }
  }
  uv.needsUpdate = true; return g;
}


/* shared geometry + materials for the buildings: one of each for the whole city instead of one per mesh (the old inline JSX made ~1,500 materials and ~1,500 geometries) */
const GBX = new THREE.BoxGeometry(1, 1, 1), GPL = new THREE.PlaneGeometry(1, 1), GCY = new THREE.CylinderGeometry(.5, .5, 1, 14), GSPH = new THREE.SphereGeometry(.5, 8, 8);
const SMAT = new Map<string, THREE.MeshStandardMaterial>();
const smat = (color: string, rough = .85, metal = 0) => { const k = color + rough + metal; let m = SMAT.get(k); if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }); SMAT.set(k, m); } return m; };
const M_PLINTH = smat('#6d6f72', 1), M_CORNICE = smat('#c9ccce', .9), M_DOOR = smat('#20262c', .85), M_TANK = smat('#14171a', .6), M_AC = smat('#9aa0a6', .5, .4), M_MAST = smat('#555555'), M_RED = smat('#d11a2a');
const M_DOORGLASS = new THREE.MeshStandardMaterial({ color: '#9fd0e8', emissive: '#7fb6d6', emissiveIntensity: .35 });
const M_SHOPGLASS = new THREE.MeshStandardMaterial({ color: '#1a2a35', metalness: .6, roughness: .15, emissive: '#ffcf80', emissiveIntensity: .22 });
const M_BEACON = new THREE.MeshStandardMaterial({ color: '#ff2a2a', emissive: '#ff2a2a', emissiveIntensity: 2 });
const M_NEON_C = new THREE.MeshStandardMaterial({ color: '#c026d3', emissive: '#c026d3', emissiveIntensity: 2.2 }), M_NEON_Y = new THREE.MeshStandardMaterial({ color: '#ffb300', emissive: '#ffb300', emissiveIntensity: 2.2 });

/* ───────────── optional real 3D models ─────────────
   Drop a .glb into public/models/city/ named after the business type (bank.glb, hotel.glb, hospital.glb, tech-company.glb ...)
   or default.glb for every building without its own file. It is scaled to the building footprint and height. No file = the built-in look. */
const MODEL_CACHE = new Map<string, Promise<THREE.Object3D | null>>();
function loadCityModel(slug: string) {
  let p = MODEL_CACHE.get(slug);
  if (!p) {
    const url = `/models/city/${slug}.glb`;
    p = fetch(url, { method: 'HEAD' }).then(r => r.ok && /model|octet|gltf/i.test(r.headers.get('content-type') || 'model') ? new GLTFLoader().loadAsync(url).then(g => g.scene) : null).catch(() => null);
    MODEL_CACHE.set(slug, p);
  }
  return p;
}
function useCityModel(type: string): THREE.Object3D | null {
  const [m, setM] = useState<THREE.Object3D | null>(null);
  useEffect(() => {
    let dead = false; const slug = type.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    loadCityModel(slug).then(a => a ?? loadCityModel('default')).then(g => { if (!dead) setM(g); });
    return () => { dead = true; };
  }, [type]);
  return m;
}
function FittedModel({ src, w, d, h }: { src: THREE.Object3D; w: number; d: number; h: number }) {
  const obj = useMemo(() => {
    const c = src.clone(true), box = new THREE.Box3().setFromObject(c), sz = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
    c.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    const g = new THREE.Group(); c.position.set(-ctr.x, -box.min.y, -ctr.z); g.add(c);
    g.scale.set(w / (sz.x || 1), h / (sz.y || 1), d / (sz.z || 1)); return g;
  }, [src, w, d, h]);
  return <primitive object={obj} />;
}

/* ───────────── buildings (towers get a setback upper tier) ───────────── */
export function Building({ b }: { b: CityBuilding }) {
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
  const detail = useRef<THREE.Group>(null!);
  useEffect(() => registerDetail(detail.current, b.x, b.z), [b.x, b.z]);
  const rtank = rw * (r - .5) * .6;
  const model = useCityModel(type);
  if (model) return <group position={[b.x, 0, b.z]}><FittedModel src={model} w={b.w} d={b.d} h={bodyTop} /><mesh geometry={GBX} material={smat(P.sign, .6)} position={[0, 2.95, fz + .07]} scale={[b.w * .8, .55, .1]} /></group>;
  return (
    <group position={[b.x, 0, b.z]}>
      {/* always drawn: the silhouette (body, plinth, cornice, name board) */}
      <mesh geometry={geo1} material={mats} position={[0, H1 / 2, 0]} castShadow receiveShadow />
      <mesh geometry={GBX} material={M_PLINTH} position={[0, .35, 0]} scale={[b.w + .12, .7, b.d + .12]} receiveShadow />
      <mesh geometry={GBX} material={M_CORNICE} position={[0, H1 + .12, 0]} scale={[b.w + .25, .24, b.d + .25]} />
      {geo2 && <>
        <mesh geometry={geo2} material={mats} position={[0, H1 + .24 + upF * FH / 2, 0]} castShadow receiveShadow />
        <mesh geometry={GBX} material={M_CORNICE} position={[0, bodyTop + .12, 0]} scale={[uw + .25, .24, ud + .25]} />
      </>}
      <mesh geometry={GBX} material={smat(P.sign, .6)} position={[0, 2.95, fz + .07]} scale={[b.w * .8, .55, .1]} />
      {/* small detail: only built up near the player (see registerDetail in cityShared), hundreds of tiny draw calls otherwise */}
      <group ref={detail}>
        {/* entrance + shopfront */}
        <mesh geometry={GBX} material={M_DOOR} position={[0, .95, fz + .1]} scale={[gov ? 1.7 : 1.1, gov ? 2.3 : 1.9, .08]} />
        <mesh geometry={GPL} material={M_DOORGLASS} position={[0, 1.05, fz + .15]} scale={[gov ? 1.4 : .8, gov ? 1.9 : 1.45, 1]} />
        {!gov && <>
          <mesh geometry={GPL} material={M_SHOPGLASS} position={[0, 1.5, fz + .07]} scale={[b.w * .78, 1.45, 1]} />
          <mesh geometry={GBX} position={[0, 2.45, fz + .5]} rotation={[.4, 0, 0]} material={awningMat(P.sign, type)} scale={[b.w * .7, .07, .95]} />
        </>}
        {/* roof: Geepee water tank, AC unit, aviation-light antenna on towers */}
        <mesh geometry={GCY} material={M_TANK} position={[rtank, top + .4, rd * .2]} scale={[1, .8, 1]} />
        <mesh geometry={GBX} material={M_AC} position={[-rw * .22, top + .28, -rd * .18]} scale={[1, .55, .7]} />
        {floors >= 6 && <>
          <mesh geometry={GCY} material={M_MAST} position={[rw * .3, top + 1.6, -rd * .25]} scale={[.09, 3.2, .09]} />
          <mesh geometry={GSPH} material={M_BEACON} position={[rw * .3, top + 3.25, -rd * .25]} scale={[.2, .2, .2]} />
        </>}
        {gov && <>
          <mesh position={[0, .15, fz + .5]} castShadow><boxGeometry args={[b.w * .95, .3, 1]} /><meshStandardMaterial color="#cfc9b8" /></mesh>
          {[-3, -1.8, -.6, .6, 1.8, 3].map(x => <mesh key={x} position={[x * (b.w / 7), 1.85, fz + .6]} castShadow><cylinderGeometry args={[.2, .22, 3.1, 12]} /><meshStandardMaterial color="#efeadb" /></mesh>)}
          <mesh position={[0, 3.55, fz + .5]}><boxGeometry args={[b.w * .95, .4, 1]} /><meshStandardMaterial color="#e6e0cf" /></mesh>
          <mesh position={[0, top, 0]} castShadow><sphereGeometry args={[Math.min(b.w, b.d) * .32, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#c8b560" metalness={.5} roughness={.35} /></mesh>
        </>}
        {type === 'Hospital' && <>
          <mesh geometry={GBX} material={M_RED} position={[0, H1 - 1.5, fz + .05]} scale={[1.6, .45, .06]} />
          <mesh geometry={GBX} material={M_RED} position={[0, H1 - 1.5, fz + .05]} scale={[.45, 1.6, .06]} />
        </>}
        {(type === 'Nightclub' || type === 'Cinema') && <mesh geometry={GBX} material={type === 'Nightclub' ? M_NEON_C : M_NEON_Y} position={[0, 3.35, fz + .08]} scale={[b.w * .9, .1, .05]} />}
        <BuildingDress b={b} type={type} signColor={P.sign} top={top} floors={floors} rw={rw} rd={rd} />
      </group>
    </group>
  );
}


/* ───────────── street furniture (all instanced) ───────────── */
export function Inst({ items, color, h, y, receive = false, basic = false }: { items: Box2[]; color: string; h: number; y: number; receive?: boolean; basic?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    items.forEach((it, i) => { o.position.set(it.x, y, it.z); o.scale.set(it.sx, h, it.sz); o.updateMatrix(); ref.current.setMatrixAt(i, o.matrix); });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [items, h, y]);
  return <instancedMesh ref={ref} args={[undefined, undefined, items.length]} frustumCulled={false} receiveShadow={receive}><boxGeometry args={[1, 1, 1]} />{basic ? <meshBasicMaterial color={color} /> : <meshStandardMaterial color={color} roughness={1} />}</instancedMesh>;
}

export const SLABS: Box2[] = BUILDS.map(b => ({ x: b.x, z: b.z, sx: 16 * WS, sz: 16 * WS }));

export const MARKS = (() => {
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

export function Roads() {
  const idx = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
  return <>{idx.map(i => <group key={i}>
    <mesh position={[i * GRID, .01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[halfW(i) * 2, 250 * WS]} /><primitive object={ROAD_MAT} attach="material" /></mesh>
    <mesh position={[0, .02, i * GRID]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[250 * WS, halfW(i) * 2]} /><primitive object={ROAD_MAT} attach="material" /></mesh>
  </group>)}</>;
}

/* Trees stand beside each building. On car-park / alley lots the building is pushed to the back of its plot, so some of these spots fell ON the road: those trees are dropped. */
export const onCarriageway = (x: number, z: number, m = .4) => { for (let i = -5; i <= 5; i++) { const hw = halfW(i) + m; if (Math.abs(x - i * GRID) < hw && Math.abs(z) <= 5 * GRID + 8) return true; if (Math.abs(z - i * GRID) < hw && Math.abs(x) <= 5 * GRID + 8) return true; } return false; };

export const TREE_PTS = BUILDS.flatMap(b => [[-4.2 * WS, 7 * WS], [4.2 * WS, 7 * WS], [-4.2 * WS, -7 * WS], [4.2 * WS, -7 * WS]].map(([dx, dz], k) => ({ x: b.x + dx, z: b.z + dz, s: .9 + hs(b.id + k) * .5 }))).filter(t => !onCarriageway(t.x, t.z));

export function Trees() {
  const trunks = useRef<THREE.InstancedMesh>(null!), crowns = useRef<THREE.InstancedMesh>(null!);
  const pts = TREE_PTS;
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

export const LAMP_PTS = (() => { const a: { x: number; z: number }[] = []; for (let i = -5; i <= 5; i++) for (let j = -5; j <= 4; j++) { const mid = (j + .5) * GRID, o = halfW(i) + 1.1, c = i * GRID; for (const s of [1, -1]) a.push({ x: mid, z: c + s * o }, { x: c + s * o, z: mid }); } return a; })();

export function StreetLamps() {
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


/* ───────────── transport: roaming taxis + bike taxis (hail them in the street) ───────────── */

/* ───────────── roadside advertising billboards ───────────── */
// On the sidewalk strip, front face towards the road, up on tall posts so they read above the traffic. (They used to sit mid-block, inside the buildings.)
export const BILLBOARD_COLORS = ['#1d7654', '#c9831f', '#2c5aa0', '#7a2fb0', '#b3261e', '#0f766e'];

export const BILLBOARDS = ([
  ['x', 0, -11, 1, 'ABUJA REAL LIFE', 'Your city. Your story.'],
  ['x', 0, 11, -1, 'BIZNEST', 'Build your business.'],
  ['z', 0, 11, 1, 'NOW HIRING', 'Find a job near you'],
  ['z', 0, -11, -1, 'ABUJA NIGHTS', 'Work · Meet · Connect'],
  ['x', 0, 33, 1, 'YOUR AD HERE', 'abujareallife.online/adbooking'],
  ['z', 0, 33, -1, 'DRIVE & EXPLORE', 'Taxis · Bikes · Cars'],
] as const).map(([axis, road, along, side, title, sub], i) => ({ ...billboardSpot(axis, road, along, side), ax: axis === 'x' ? 1 : 0, az: axis === 'x' ? 0 : 1, title, sub, i }));

/* Paid ads from /adbooking: checked every 10 seconds. A board with no live ad keeps its default message. */
type LiveAd = { slot: number; title: string; sub: string; contact: string; website?: string; color: string; img?: string };

/* An advertiser's uploaded flyer drawn on the board face. The picture is already cut to the face's shape (5.2 x 2.3) by the booking page,
   and it is still fitted by its real width / height here, so it can never come out stretched. It uses an unlit material so the colours stay true. */
function FlyerFace({ url, onFail }: { url: string; onFail: (u: string) => void }) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let dead = false, t: THREE.Texture | null = null, obj = '';
    const apply = (x: THREE.Texture) => { if (dead) { x.dispose(); return; } x.colorSpace = THREE.SRGBColorSpace; x.anisotropy = 8; x.needsUpdate = true; t = x; setTex(x); };
    const fail = (why: string) => { if (!dead) { console.warn('[billboard] flyer failed to load:', url, why); onFail(url); } };
    // First the normal way. If that fails, fetch the picture again fresh (skipping any stale cached copy) and load it from memory.
    new THREE.TextureLoader().load(url, apply, undefined, async () => {
      if (dead) return;
      try {
        const r = await fetch(url, { cache: 'reload' }); if (!r.ok) throw new Error('HTTP ' + r.status);
        obj = URL.createObjectURL(await r.blob());
        new THREE.TextureLoader().load(obj, apply, undefined, () => fail('cannot decode'));
      } catch (e) { fail(String((e as Error).message || e)); }
    });
    return () => { dead = true; t?.dispose(); if (obj) URL.revokeObjectURL(obj); };
  }, [url, onFail]);
  if (!tex) return null;
  const im = tex.image as { width: number; height: number }, asp = (im.width || 1) / (im.height || 1), FW = 5.2, FH = 2.3;
  const w = Math.min(FW, FH * asp), h = w / asp;
  return <mesh position={[0, 4.5, -.17]} rotation-y={Math.PI} renderOrder={2}><planeGeometry args={[w, h]} /><meshBasicMaterial map={tex} toneMapped={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} /></mesh>;
}

/* Full-screen look at an ad: the flyer at full size, plus call / WhatsApp / website buttons. Plain DOM with inline styles (the game's CSS does not reach it). */
const digits = (s: string) => s.replace(/\D/g, '');
const intl = (s: string) => { const d = digits(s); return d.startsWith('0') && d.length === 11 ? '234' + d.slice(1) : d; };   // 0704... -> 234704...
function AdViewer({ ad, onClose }: { ad: LiveAd; onClose: () => void }) {
  const [imgOk, setImgOk] = useState(false), [imgBad, setImgBad] = useState(false), [src, setSrc] = useState('');
  // Load the flyer as a blob (same fallback the 3D board uses), so a stale cached copy or a hiccup cannot leave an empty gap.
  useEffect(() => {
    if (!ad.img) return; let dead = false, obj = '';
    fetch(ad.img, { cache: 'reload' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
      .then(bl => { if (dead) return; obj = URL.createObjectURL(bl); setSrc(obj); })
      .catch(() => { if (!dead) setImgBad(true); });
    return () => { dead = true; if (obj) URL.revokeObjectURL(obj); };
  }, [ad.img]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const num = intl(ad.contact || ''), okNum = num.length >= 10 && num.length <= 15, host = ad.website ? ad.website.replace(/^https?:\/\//, '').replace(/\/$/, '') : '';
  const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, padding: '0 18px', borderRadius: 12, background: '#e0a24a', color: '#1a1205', fontWeight: 800, fontSize: 15, textDecoration: 'none', border: 0, cursor: 'pointer' };
  return <div role="dialog" aria-modal="true" aria-label={'Ad: ' + ad.title} onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(3,8,6,.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'max(12px,env(safe-area-inset-top)) 12px max(12px,env(safe-area-inset-bottom))', overflowY: 'auto', font: '400 16px/1.4 system-ui,sans-serif', color: '#f2f6f3' }}>
    <div onClick={e => e.stopPropagation()} style={{ width: 'min(920px,100%)', background: '#0e1b16', border: '1px solid #26392f', borderRadius: 18, padding: 14, display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>
      <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', right: 8, top: 8, width: 40, height: 40, borderRadius: 99, border: '1px solid #26392f', background: '#0a1410', color: '#fff', fontSize: 22, cursor: 'pointer', zIndex: 1 }}>×</button>
      {ad.img && !imgBad
        // eslint-disable-next-line @next/next/no-img-element
        ? <div style={{ minHeight: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', background: ad.color, borderRadius: 10, overflow: 'hidden' }}>
            {!imgOk && <div style={{ position: 'absolute', color: '#fff', fontSize: 14, opacity: .8 }}>Loading ad…</div>}
            <img src={src || undefined} alt={'Flyer: ' + ad.title} onLoad={() => setImgOk(true)} onError={() => setImgBad(true)} style={{ width: '100%', maxHeight: 'min(62vh,520px)', objectFit: 'contain', display: imgOk ? 'block' : 'none' }} />
          </div>
        : <div style={{ background: ad.color, borderRadius: 10, padding: '36px 16px', textAlign: 'center' }}><div style={{ fontSize: 'clamp(26px,6vw,44px)', fontWeight: 800 }}>{ad.title}</div>{ad.sub ? <div style={{ fontSize: 'clamp(15px,3.4vw,22px)', marginTop: 8 }}>{ad.sub}</div> : null}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', paddingRight: 4 }}>
        <b style={{ fontSize: 18, flex: '1 1 160px' }}>{ad.title}</b>
        {okNum && <a style={btn} href={'tel:+' + num}>📞 Call</a>}
        {okNum && <a style={{ ...btn, background: '#25d366', color: '#052e16' }} href={'https://wa.me/' + num} target="_blank" rel="noopener noreferrer">💬 WhatsApp</a>}
        {host && <a style={{ ...btn, background: 'transparent', color: '#f2f6f3', border: '1px solid #3b5a49' }} href={ad.website} target="_blank" rel="noopener noreferrer nofollow">🌐 {host.slice(0, 28)}</a>}
      </div>
      {ad.contact ? <div style={{ color: '#93a89d', fontSize: 13 }}>{ad.contact} · Advertisement</div> : <div style={{ color: '#93a89d', fontSize: 13 }}>Advertisement</div>}
    </div>
  </div>;
}

export function Billboards() {
  const [ads, setAds] = useState<Record<number, LiveAd>>({}), [bad, setBad] = useState<string[]>([]), [open, setOpen] = useState<LiveAd | null>(null);
  const adsRef = useRef(ads); adsRef.current = ads;
  const openRef = useRef(open); openRef.current = open;
  const lastNear = useRef(0), close = useCallback(() => setOpen(null), []);
  // No floating button: an ad opens only when the player actually touches the billboard (walks into its posts / under the board). It will not
  // pop up again until the player has walked away from that board, so closing it never re-triggers it while they stand there.
  const armed = useRef(true);
  useFrame(st => {
    const t = st.clock.elapsedTime; if (t - lastNear.current < .15) return; lastNear.current = t;
    if (GAME.ride) return;
    const p = GAME.player; let touched: LiveAd | null = null, anyClose = false;
    for (const b of BILLBOARDS) {
      const dx = p.x - b.x, dz = p.z - b.z; if (Math.abs(dx) > 8 || Math.abs(dz) > 8) continue;
      const lat = dx * b.ax + dz * b.az, dep = -dx * b.az + dz * b.ax;   // along the board / across it
      if (Math.abs(lat) < 4.4 && Math.abs(dep) < 3) anyClose = true;
      const a = adsRef.current[b.i];
      if (a && Math.abs(lat) < 3.3 && Math.abs(dep) < 1.3) touched = a;
    }
    if (!anyClose) armed.current = true;
    if (touched && armed.current && !openRef.current) { armed.current = false; setOpen(touched); }
  });
  const onFail = useCallback((u: string) => setBad(b => (b.includes(u) ? b : [...b, u])), []);   // a flyer that cannot load falls back to the ad's text, so the board is never left blank
  useEffect(() => {
    let dead = false, last = '';
    // Asks for the live ads every 10 s (and the moment the tab is shown again), so an ad you approve appears in the open game within seconds, with no reload.
    const load = () => { if (document.hidden) return; fetch('/api/ads/live', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => {
      if (dead || !d?.ads) return; const j = JSON.stringify(d.ads); if (j === last) return; last = j;
      setAds(Object.fromEntries((d.ads as LiveAd[]).map(a => [a.slot, a])));
    }).catch(() => {}); };
    load(); const id = setInterval(load, 10_000); document.addEventListener('visibilitychange', load);
    return () => { dead = true; clearInterval(id); document.removeEventListener('visibilitychange', load); };
  }, []);
  return <>
    <BodyDom>{open ? <AdViewer ad={open} onClose={close} /> : null}</BodyDom>
    {BILLBOARDS.map(b => { const ad = ads[b.i], title = ad?.title ?? b.title, sub = ad?.sub ?? b.sub, col = ad?.color ?? BILLBOARD_COLORS[b.i % BILLBOARD_COLORS.length]; return <group key={b.i} position={[b.x, 0, b.z]} rotation-y={b.ry} onClick={ad ? (e: { stopPropagation: () => void }) => { e.stopPropagation(); setOpen(ad); } : undefined} onPointerOver={ad ? () => { document.body.style.cursor = 'pointer'; } : undefined} onPointerOut={ad ? () => { document.body.style.cursor = ''; } : undefined}>
    {[-1.7, 1.7].map(o => <mesh key={o} position={[o, 1.8, 0]} castShadow><boxGeometry args={[.16, 3.6, .16]} /><meshStandardMaterial color="#2f343a" metalness={.3} roughness={.6} /></mesh>)}
    <mesh position={[0, 4.5, 0]} castShadow><boxGeometry args={[5.6, 2.7, .22]} /><meshStandardMaterial color="#14201b" roughness={.6} /></mesh>
    <mesh position={[0, 4.5, -.12]}><boxGeometry args={[5.2, 2.3, .04]} /><meshStandardMaterial color={col} emissive={col} emissiveIntensity={.45} roughness={.5} /></mesh>
    {ad?.img && !bad.includes(ad.img) ? <FlyerFace key={ad.img} url={ad.img} onFail={onFail} /> : <>
    {/* the front of the board faces -z (towards the road); drei Text faces +z, so it is turned round */}
    <Text position={[0, 4.85, -.16]} rotation-y={Math.PI} fontSize={.46} color="#fff" outlineWidth={.02} outlineColor="#0b0b0b" anchorX="center" anchorY="middle" maxWidth={4.9}>{title}</Text>
    <Text position={[0, 4.12, -.16]} rotation-y={Math.PI} fontSize={.22} color="#fff7e0" anchorX="center" anchorY="middle" maxWidth={4.9}>{sub}</Text>
    {ad?.contact ? <Text position={[0, 3.62, -.16]} rotation-y={Math.PI} fontSize={.17} color="#ffffff" anchorX="center" anchorY="middle" maxWidth={4.9}>{ad.contact}</Text> : null}
    </>}
    {[-1.8, 0, 1.8].map(x => <mesh key={x} position={[x, 6.0, -.35]}><boxGeometry args={[.5, .1, .3]} /><meshStandardMaterial color="#fff2c4" emissive="#ffe29a" emissiveIntensity={.9} /></mesh>)}
  </group>; })}</>;
}


/* ───────────── railway + airport on the city edge ───────────── */
export const RAIL_Z = 126 * WS;

export function TrainLine() {
  const g = useRef<THREE.Group>(null!);
  useFrame((st) => { const x = ((st.clock.elapsedTime * 14 + 150 * WS) % (300 * WS)) - 150 * WS; g.current.position.x = x; });
  return <>
    <mesh position={[0, .05, RAIL_Z]}><boxGeometry args={[300 * WS, .1, 3]} /><meshStandardMaterial color="#6b6a66" roughness={1} /></mesh>
    {[-.7, .7].map(o => <mesh key={o} position={[0, .16, RAIL_Z + o]}><boxGeometry args={[300 * WS, .1, .12]} /><meshStandardMaterial color="#9aa0a6" metalness={.7} roughness={.3} /></mesh>)}
    <group ref={g} position={[0, 1.5, RAIL_Z]}>
      {[0, -9.6].map(x => <group key={x} position={[x, 0, 0]}>
        <RoundedBox args={[9, 2.4, 2.6]} radius={.2} smoothness={2} castShadow><meshStandardMaterial color="#d99a42" metalness={.3} roughness={.5} /></RoundedBox>
        <mesh position={[0, .35, 0]}><boxGeometry args={[8.6, .8, 2.64]} /><meshStandardMaterial color="#1b2a35" metalness={.7} roughness={.15} /></mesh>
      </group>)}
    </group>
  </>;
}

export const AIR = { x: 122 * WS, z: -12 * WS, s: 1.8 };

/* Runway lights (airport step 2): edge, threshold green / end red, approach lights and a PAPI, switched on with the street lamps at night.
   Drawn as unlit glowing blocks plus a flat additive halo each, so they cost no real lights. Local airport units (group scaled by AIR.s). */
type LP = [number, number, string];
const RWY_LIGHTS: LP[] = (() => {
  const a: LP[] = [];
  for (let x = -10; x <= 88; x += 4.9) { a.push([x, -3.75, '#fff3d6'], [x, 3.75, '#fff3d6']); }                   // edge
  for (let x = -6; x <= 86; x += 3.1) a.push([x, 0, '#ffffff']);                                                      // centreline
  for (let k = 0; k < 11; k++) { a.push([-10.9, -3.5 + k * .7, '#35e06a']); a.push([88.9, -3.5 + k * .7, '#ff3b30']); } // threshold green / end red
  for (let k = 1; k <= 14; k++) { a.push([-11 - k * 3, 0, '#ffffff']); if (k % 4 === 0) for (const z of [-1.6, -.8, .8, 1.6]) a.push([-11 - k * 3, z, '#ffffff']); }   // approach
  [['#ff3b30', 5.2], ['#ff3b30', 6], ['#ffffff', 6.8], ['#ffffff', 7.6]].forEach(([c, z]) => a.push([8, z as number, c as string]));   // PAPI (2 red 2 white = on the glide slope)
  return a;
})();
export function AirportLights() {
  const g = useRef<THREE.Group>(null!), blocks = useRef<THREE.InstancedMesh>(null!), halos = useRef<THREE.InstancedMesh>(null!), hm = useRef<THREE.MeshBasicMaterial>(null!);
  const tex = useMemo(() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d')!, gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.35, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }, []);
  useLayoutEffect(() => {
    const o = new THREE.Object3D(), col = new THREE.Color();
    RWY_LIGHTS.forEach(([x, z, c], i) => {
      col.set(c);
      o.position.set(x, .12, z); o.rotation.set(0, 0, 0); o.scale.set(.32, .16, .32); o.updateMatrix(); blocks.current.setMatrixAt(i, o.matrix); blocks.current.setColorAt(i, col);
      o.position.set(x, .16, z); o.rotation.set(-Math.PI / 2, 0, 0); o.scale.set(2.6, 2.6, 1); o.updateMatrix(); halos.current.setMatrixAt(i, o.matrix); halos.current.setColorAt(i, col);
    });
    for (const m of [blocks.current, halos.current]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }, []);
  useFrame(() => { const n = NIGHT.n; g.current.visible = n > .03; hm.current.opacity = Math.min(1, n * 1.2) * .75; });
  return <group ref={g} visible={false}>
    <instancedMesh ref={blocks} args={[undefined as any, undefined as any, RWY_LIGHTS.length]} frustumCulled={false}><boxGeometry args={[1, 1, 1]} /><meshBasicMaterial toneMapped={false} /></instancedMesh>
    <instancedMesh ref={halos} args={[undefined as any, undefined as any, RWY_LIGHTS.length]} frustumCulled={false}><planeGeometry args={[1, 1]} /><meshBasicMaterial ref={hm} map={tex} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></instancedMesh>
  </group>;
}

export function Airport() {
  /* Local units, group scaled by AIR.s. Runway: x -11..89, z +-3.5 (east-west, so the numbers are 09 / 27). Terminal footprint (x +-4.5, z -9.5..-4.5) is what CityCollision.SOLIDS and lib/houses.ts KEEP_OUT mirror: keep it. */
  const flat = [-Math.PI / 2, 0, 0] as const;
  return <group position={[AIR.x, 0, AIR.z]} scale={AIR.s}>
    {/* runway, edge lines, centre dashes, thresholds (piano keys) and numbers */}
    <mesh rotation={flat} position={[39, .04, 0]}><planeGeometry args={[100, 7]} /><meshStandardMaterial color="#33383e" roughness={.95} /></mesh>
    {[-3.2, 3.2].map(z => <mesh key={z} rotation={flat} position={[39, .06, z]}><planeGeometry args={[100, .14]} /><meshStandardMaterial color="#e8e8e8" /></mesh>)}
    {Array.from({ length: 16 }, (_, i) => <mesh key={i} rotation={flat} position={[-6 + i * 6.2, .07, 0]}><planeGeometry args={[3, .22]} /><meshStandardMaterial color="#e8e8e8" /></mesh>)}
    {[-10.2, 87.4].map(x => Array.from({ length: 10 }, (_, k) => <mesh key={x + '-' + k} rotation={flat} position={[x, .07, -2.7 + k * .6]}><planeGeometry args={[1.4, .3]} /><meshStandardMaterial color="#f2f2f2" /></mesh>))}
    <group position={[-8.2, .09, 0]} rotation={[0, -Math.PI / 2, 0]}><Text rotation={flat} fontSize={1.3} color="#f4f4f4" anchorX="center" anchorY="middle">09</Text></group>
    <group position={[85.4, .09, 0]} rotation={[0, Math.PI / 2, 0]}><Text rotation={flat} fontSize={1.3} color="#f4f4f4" anchorX="center" anchorY="middle">27</Text></group>
    <Text position={[39, .1, 0]} rotation={flat} fontSize={.6} color="#fff" anchorX="center">RUNWAY</Text>
    {/* apron between the terminal and the runway edge, with the yellow stand line the plane waits on */}
    <mesh rotation={flat} position={[0, .045, -4.05]}><planeGeometry args={[22, 1.1]} /><meshStandardMaterial color="#7d848b" roughness={.95} /></mesh>
    <mesh rotation={flat} position={[0, .075, -3.6]}><planeGeometry args={[22, .08]} /><meshStandardMaterial color="#e2b92b" /></mesh>
    {/* terminal: body, glass front, roof, entrance canopy, sign */}
    <RoundedBox args={[9, 1.5, 5]} position={[0, .75, -7]} radius={.15}><meshStandardMaterial color="#7b8791" /></RoundedBox>
    <mesh position={[0, .8, -4.47]}><boxGeometry args={[8.2, .85, .05]} /><meshStandardMaterial color="#1b2f44" metalness={.6} roughness={.15} /></mesh>
    <mesh position={[0, 1.56, -7]}><boxGeometry args={[9.6, .12, 5.4]} /><meshStandardMaterial color="#56626c" /></mesh>
    <mesh position={[0, 1.35, -4.1]}><boxGeometry args={[5.4, .07, 1.0]} /><meshStandardMaterial color="#d9dde0" /></mesh>
    {[-2.5, 2.5].map(x => <mesh key={x} position={[x, .68, -3.7]}><boxGeometry args={[.08, 1.34, .08]} /><meshStandardMaterial color="#9aa3ab" metalness={.5} roughness={.4} /></mesh>)}
    <Text position={[0, 1.65, -4.4]} fontSize={.45} color="#fff" anchorX="center">Nnamdi Azikiwe Airport</Text>
    {/* control tower on the terminal roof */}
    <mesh position={[-2.8, 3.1, -8]}><boxGeometry args={[1.1, 3, 1.1]} /><meshStandardMaterial color="#cfd5da" /></mesh>
    <mesh position={[-2.8, 4.9, -8]}><boxGeometry args={[1.9, .85, 1.9]} /><meshStandardMaterial color="#223a52" metalness={.6} roughness={.15} /></mesh>
    <mesh position={[-2.8, 5.42, -8]}><boxGeometry args={[2.15, .1, 2.15]} /><meshStandardMaterial color="#c0c6cb" /></mesh>
    <mesh position={[-2.8, 6.0, -8]}><cylinderGeometry args={[.03, .03, 1.1, 6]} /><meshStandardMaterial color="#9aa3ab" /></mesh>
    <AirportLights />
    {/* windsock */}
    <mesh position={[8, 1.1, 4]}><cylinderGeometry args={[.05, .05, 2.2, 6]} /><meshStandardMaterial color="#d9dde0" /></mesh>
    <mesh position={[8.55, 2.15, 4]} rotation={[0, 0, Math.PI / 2]}><coneGeometry args={[.28, 1.1, 10, 1, true]} /><meshStandardMaterial color="#ee7a1d" side={THREE.DoubleSide} /></mesh>
  </group>;
}


/* ───────────── night lighting: glow pools under street lamps ───────────── */
export function LampGlow() {
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
