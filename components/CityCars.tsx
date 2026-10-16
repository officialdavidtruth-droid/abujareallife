'use client';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import Human from './Human';
import { DEFAULT_LOOK, type Look } from '../lib/characterModels';
import { VEHICLE_CATALOG, vehicleById, vehicleByName } from '../lib/vehicles';
import { NIGHT } from './cityShared';
import { TRIM_MAT, WHEEL_AT, WHEEL_MAT, WHEEL_R, WHEELBASE, trimGeo, wheelGeo } from '../lib/carParts';
 // 0 = full day, 1 = full night
export let PKIT: Kit | null = null;

export const pkit = (): Kit => { if (!PKIT) PKIT = carKit(); return PKIT; };


export type Kit = { body: THREE.BufferGeometry; cabin: THREE.BufferGeometry; wheels: THREE.BufferGeometry; head: THREE.BufferGeometry; tail: THREE.BufferGeometry; trim: THREE.BufferGeometry; glass: THREE.Material; tire: THREE.Material; headM: THREE.Material; tailM: THREE.Material };

export function carKit(): Kit {
  const ext = (pts: [number, number][], depth: number, bevel: number) => {
    const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, steps: 1 }); g.translate(0, 0, -depth / 2); return g;
  };
  const wheels = mergeGeometries([[1.35, .9], [1.35, -.9], [-1.35, .9], [-1.35, -.9]].map(([x, z]) => { const g = new THREE.CylinderGeometry(.37, .37, .3, 16); g.rotateX(Math.PI / 2); g.translate(x, .37, z); return g; }))!;
  const lamp = (x: number, y: number) => [.62, -.62].map(z => { const g = new THREE.BoxGeometry(.08, .16, .36); g.translate(x, y, z); return g; });
  return {
    body: ext([[-2.12, .34], [2.12, .34], [2.16, .6], [1.55, .8], [-1.92, .84], [-2.16, .68]], 1.7, .08),
    cabin: ext([[-1.25, .84], [1.0, .84], [.5, 1.34], [-.85, 1.34]], 1.46, .04),
    wheels, head: mergeGeometries(lamp(2.2, .6))!, tail: mergeGeometries(lamp(-2.2, .68))!, trim: trimGeo(),
    glass: new THREE.MeshStandardMaterial({ color: '#cfe6f2', metalness: .05, roughness: .04, transparent: true, opacity: .24, depthWrite: false, envMapIntensity: 1.6 }), // clear glass: you can see the driver through the windshield
    tire: new THREE.MeshStandardMaterial({ color: '#141619', roughness: .9 }),
    headM: new THREE.MeshStandardMaterial({ color: '#fff7d6', emissive: '#fff2b0', emissiveIntensity: 1.4 }),
    tailM: new THREE.MeshStandardMaterial({ color: '#ff3030', emissive: '#ff1a1a', emissiveIntensity: 1.2 }),
  };
}

/* ───────── rolling, steering wheels: speed and turn rate are read from how the car actually moves, so EVERY car (traffic, taxis, police, other players, yours) rolls and steers.
   Your own car passes a `steer` function so the wheels turn from your input even when you are standing still. ───────── */
const _wp = new THREE.Vector3(), _wf = new THREE.Vector3(), _wq = new THREE.Quaternion();
export function WheelSet({ rim, steer }: { rim: string; steer?: () => number }) {
  const geo = useMemo(() => wheelGeo(rim), [rim]);
  const root = useRef<THREE.Group>(null), front = useRef<(THREE.Group | null)[]>([]), spin = useRef<(THREE.Group | null)[]>([]);
  const S = useRef({ ok: false, x: 0, z: 0, h: 0, a: 0, v: 0, w: 0, s: 0 });
  useFrame((_, dt) => {
    const g = root.current; if (!g || dt <= 0) return;
    g.getWorldPosition(_wp); g.getWorldQuaternion(_wq); _wf.set(1, 0, 0).applyQuaternion(_wq);
    const s = S.current, h = Math.atan2(_wf.z, _wf.x); let v = 0, w = 0;
    if (s.ok && dt < .25) {
      const dx = _wp.x - s.x, dz = _wp.z - s.z;
      if (Math.abs(dx) + Math.abs(dz) < 8) { v = (dx * _wf.x + dz * _wf.z) / dt; const dh = Math.atan2(Math.sin(h - s.h), Math.cos(h - s.h)); w = -dh / dt; }
    }
    s.ok = true; s.x = _wp.x; s.z = _wp.z; s.h = h;
    const k = Math.min(1, dt * 15); s.v += (v - s.v) * k; s.w += (w - s.w) * k;   // smoothing hides frame-order jitter
    s.a += s.v * dt / WHEEL_R;
    const tgt = steer ? steer() : Math.abs(s.v) > .8 ? THREE.MathUtils.clamp(Math.atan(WHEELBASE * s.w / s.v), -.55, .55) : 0;
    s.s += (tgt - s.s) * Math.min(1, dt * 12);
    for (let i = 0; i < 4; i++) { const sp = spin.current[i], fr = front.current[i]; if (sp) sp.rotation.z = WHEEL_AT[i][1] > 0 ? -s.a : s.a; if (fr && WHEEL_AT[i][2]) fr.rotation.y = s.s; }
  });
  return <group ref={root}>
    {WHEEL_AT.map(([x, z], i) => <group key={i} ref={el => { front.current[i] = el; }} position={[x, WHEEL_R, z]}>
      <group rotation-y={z < 0 ? Math.PI : 0}><group ref={el => { spin.current[i] = el; }}><mesh geometry={geo} material={WHEEL_MAT} /></group></group>
    </group>)}
  </group>;
}

/** the steering wheel in the cabin: turns with the front wheels (about 3x, like a real car) */
function SteerRim({ steer }: { steer: () => number }) {
  const g = useRef<THREE.Group>(null), s = useRef(0);
  useFrame((_, dt) => { if (!g.current) return; s.current += (steer() - s.current) * Math.min(1, dt * 14); g.current.rotation.x = -s.current * 3; });
  return <group ref={g}>{rimMesh}{rimSpokes}</group>;
}

/* clear-coat paint (extra shader cost) only on non-touch devices; phones keep the cheaper standard paint, which still reflects the sky map */
const HQ_PAINT = typeof window !== 'undefined' && !window.matchMedia?.('(pointer: coarse)').matches;
export const BODYMATS = new Map<string, THREE.MeshStandardMaterial>();

export const bodyMat = (c: string) => { let m = BODYMATS.get(c); if (!m) { m = HQ_PAINT ? new THREE.MeshPhysicalMaterial({ color: c, metalness: .6, roughness: .26, clearcoat: .9, clearcoatRoughness: .07, envMapIntensity: 1.25 }) : new THREE.MeshStandardMaterial({ color: c, metalness: .55, roughness: .32 }); BODYMATS.set(c, m); } return m; };

/* ───────── clear-glass interior: seats, dash, steering wheel and a driver you can see through the windshield ───────── */
export const DRV_SKINS = ['#f1c9a5', '#d9a577', '#c68642', '#8d5524', '#5c3a21', '#3b2417'], DRV_SHIRTS = ['#e8e8e8', '#2a4a7a', '#7a2a2a', '#2f6b4a', '#d99a42', '#444b55', '#6b3a7a'], DRV_HAIRS = ['#111', '#1b1410', '#2b1d12', '#555'];

export const drvHash = (str: string) => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0; };

export const DRV_MATS = new Map<string, THREE.MeshStandardMaterial>();

export const drvMat = (c: string, rough = .8, metal = .05) => { const k = c + rough + metal; let m = DRV_MATS.get(k); if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal }); DRV_MATS.set(k, m); } return m; };

const rimMesh = <mesh rotation-y={Math.PI / 2} material={drvMat('#0e0f11', .5, .3)}><torusGeometry args={[.13, .014, 8, 18]} /></mesh>;
const rimSpokes = <>
  <mesh material={drvMat('#0e0f11', .5, .3)}><boxGeometry args={[.012, .012, .26]} /></mesh>
  <mesh position={[0, -.065, 0]} material={drvMat('#0e0f11', .5, .3)}><boxGeometry args={[.012, .13, .012]} /></mesh>
</>;

export const driverStyle = (seed: string, shirt?: string) => { const h = drvHash(seed); return { skin: DRV_SKINS[h % DRV_SKINS.length], top: shirt || DRV_SHIRTS[(h >> 3) % DRV_SHIRTS.length], hair: DRV_HAIRS[(h >> 6) % DRV_HAIRS.length] }; };

export type DrvLook = { skin?: string; outfit?: string; hairColor?: string };

/** Passengers sitting in a car: where each seat is (x forward, z sideways; the driver is at z = -.4). 0 = front passenger, 1 / 2 = rear left / right. */
export const PAX_AT: [number, number][] = [[0, .4], [-.62, -.4], [-.62, .4]];
export type PaxFig = { look?: DrvLook; seed: string; seat: number };

export function CarInterior({ seed, shirt, suv, driverRef, look, pax, steer }: { steer?: () => number; seed: string; shirt?: string; suv?: boolean; driverRef?: (g: THREE.Object3D | null) => void; look?: DrvLook; pax?: PaxFig[] }) {
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
      <group position={[.3, 1.02, 0]} rotation-z={.65}>{steer ? <SteerRim steer={steer} /> : rimMesh}</group>
    </group>
    {pax && pax.map(px => { const ps = driverStyle(px.seed), at = PAX_AT[px.seat] || PAX_AT[0]; return <group key={px.seed + px.seat} position={[at[0], 0, at[1]]}>
      <mesh position={[-.3, 1.06, 0]} material={drvMat(px.look?.outfit || ps.top)}><boxGeometry args={[.24, .32, .36]} /></mesh>
      <mesh position={[-.27, 1.27, 0]} material={drvMat(px.look?.skin || ps.skin, .6)}><sphereGeometry args={[.095, 14, 12]} /></mesh>
      <mesh position={[-.28, 1.29, 0]} material={drvMat(px.look?.hairColor || ps.hair, .9)}><sphereGeometry args={[.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.9]} /></mesh>
    </group>; })}
  </group>;
}


/* ───────── real car models: public/models/cars/<name>.glb (optimised from the Porsche 911 and Alfa Romeo files). No file = the built-in car.
   The model's long axis is turned to face +x like every vehicle here, scaled to 4.3 long and put on the ground. Wheels in the model are fixed (no roll/steer). ───────── */
type GlbSpec = { file: string; real?: boolean };   // real: the file is already car-sized, facing +x, with separate 'wheel' nodes that roll and steer
const CAR_GLB: Record<string, GlbSpec> = {
  'porsche-911-carrera-4s-2024': { file: 'porsche' }, 'alfa-romeo-stradale-1967': { file: 'alfa' },
  'toyota-camry-2024': { file: 'sedan', real: true }, 'toyota-corolla-2024': { file: 'compact', real: true }, 'lexus-es-2024': { file: 'wagon', real: true },
  'mercedes-c200-2024': { file: 'coupe', real: true }, 'bmw-530i-2024': { file: 'hatchback', real: true }, 'honda-accord-2024': { file: 'sedan', real: true },
  'land-rover-discovery-2024': { file: 'offroad', real: true }, 'lexus-lx-2024': { file: 'suv', real: true },
};
const GLB_CACHE = new Map<string, Promise<THREE.Object3D | null>>();
const loadCarGlb = (name: string) => {
  let p = GLB_CACHE.get(name);
  if (!p) { const url = `/models/cars/${name}.glb`; p = fetch(url, { method: 'HEAD' }).then(r => r.ok ? new GLTFLoader().loadAsync(url).then(g => g.scene) : null).catch(() => null); GLB_CACHE.set(name, p); }
  return p;
};
function useCarGlb(id: string): { src: THREE.Object3D; real: boolean } | null {
  const [m, setM] = useState<{ src: THREE.Object3D; real: boolean } | null>(null);
  useEffect(() => { const n = CAR_GLB[id]; if (!n) { setM(null); return; } let dead = false; loadCarGlb(n.file).then(g => { if (!dead) setM(g ? { src: g, real: !!n.real } : null); }); return () => { dead = true; }; }, [id]);
  return m;
}
function FittedCar({ src, real, steer, doorRef }: { src: THREE.Object3D; real: boolean; steer?: () => number; doorRef?: (g: THREE.Object3D | null) => void }) {
  const root = useRef<THREE.Group>(null);
  const { obj, wheels } = useMemo(() => {
    const c = src.clone(true), b0 = new THREE.Box3().setFromObject(c), s0 = b0.getSize(new THREE.Vector3());
    const turn = new THREE.Group(); turn.add(c); if (s0.z > s0.x) turn.rotation.y = Math.PI / 2;   // front of the model is +z, the game's front is +x
    turn.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(turn), sz = b.getSize(new THREE.Vector3()), ct = b.getCenter(new THREE.Vector3()), k = real ? 1 : 4.3 / (sz.x || 1);
    const g = new THREE.Group(); g.add(turn); turn.position.set(-ct.x, real ? 0 : -b.min.y, -ct.z); g.scale.setScalar(k);
    const wheels: { steer: THREE.Group; spin: THREE.Object3D; front: boolean; r: number }[] = [];
    if (real) {
      const found: THREE.Object3D[] = []; c.traverse(o => { if (/^wheel/.test(o.name) && o.parent) found.push(o); });
      for (const w of found) {
        const wb = new THREE.Box3().setFromObject(w), r = (wb.max.y - wb.min.y) / 2, par = w.parent!, st = new THREE.Group();
        st.position.copy(w.position); w.position.set(0, 0, 0); par.add(st); st.add(w);
        wheels.push({ steer: st, spin: w, front: st.position.x > 0, r: r || .33 });
      }
    }
    g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; const mt = m.material as THREE.MeshStandardMaterial; if (mt && 'envMapIntensity' in mt) mt.envMapIntensity = 1.4; } });
    return { obj: g, wheels };
  }, [src, real]);
  const S = useRef({ ok: false, x: 0, z: 0, h: 0, a: 0, v: 0, w: 0, s: 0 });
  useFrame((_, dt) => {   // same idea as WheelSet: speed and turn rate come from how the car actually moves
    const g = root.current; if (!g || !wheels.length || dt <= 0) return;
    g.getWorldPosition(_wp); g.getWorldQuaternion(_wq); _wf.set(1, 0, 0).applyQuaternion(_wq);
    const s = S.current, h = Math.atan2(_wf.z, _wf.x); let v = 0, w = 0;
    if (s.ok && dt < .25) { const dx = _wp.x - s.x, dz = _wp.z - s.z; if (Math.abs(dx) + Math.abs(dz) < 8) { v = (dx * _wf.x + dz * _wf.z) / dt; const dh = Math.atan2(Math.sin(h - s.h), Math.cos(h - s.h)); w = -dh / dt; } }
    s.ok = true; s.x = _wp.x; s.z = _wp.z; s.h = h;
    const k = Math.min(1, dt * 15); s.v += (v - s.v) * k; s.w += (w - s.w) * k;
    const tgt = steer ? steer() : Math.abs(s.v) > .8 ? THREE.MathUtils.clamp(Math.atan(WHEELBASE * s.w / s.v), -.55, .55) : 0;
    s.s += (tgt - s.s) * Math.min(1, dt * 12);
    s.a += s.v * dt;   // metres rolled
    for (const wh of wheels) { wh.spin.rotation.z = -s.a / wh.r; if (wh.front) wh.steer.rotation.y = s.s; }
  });
  // GLB models often have no named/rigged door meshes. Provide a hinged driver-side door
  // in the normalized vehicle coordinate system so the shared door animation works for them too.
  const doorMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#b9a33d', metalness: .55, roughness: .34 }), []);
  const trimMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#20252a', roughness: .82 }), []);
  const glassMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#142637', metalness: .15, roughness: .18, transparent: true, opacity: .82 }), []);
  return <group ref={root}><primitive object={obj} />
    <group ref={doorRef} position={[.05, 0, -.86]}>
      <mesh position={[-.5, .57, 0]} material={doorMat} castShadow><boxGeometry args={[.96, .42, .055]} /></mesh>
      <mesh position={[-.5, .58, .033]} material={trimMat}><boxGeometry args={[.84, .31, .012]} /></mesh>
      <mesh position={[-.5, .99, 0]} material={glassMat}><boxGeometry args={[.91, .38, .025]} /></mesh>
      <mesh position={[-.5, 1.19, 0]} material={doorMat}><boxGeometry args={[.96, .035, .04]} /></mesh>
      <mesh position={[-.09, .68, .04]} material={trimMat}><boxGeometry args={[.09, .025, .018]} /></mesh>
    </group>
  </group>;
}

export function CarModel({ kit, color, kind, model, style, shirt, driver = true, doorRef, driverRef, glassRef, look, pax, steer, damageLevel = 0 }: { steer?: () => number; pax?: PaxFig[]; kit: Kit; color: string; kind: number; model?: string; style?: { paint?: string; rims?: string; tint?: number }; shirt?: string; driver?: boolean; look?: DrvLook; doorRef?: (g: THREE.Object3D | null) => void; driverRef?: (g: THREE.Object3D | null) => void; glassRef?: (g: THREE.Object3D | null) => void; damageLevel?: number }) {
  const spec = model ? (vehicleById(model) || vehicleByName(model)) : VEHICLE_CATALOG[0];
  const glb = useCarGlb(spec.id);
  // Two-wheel vehicles use purpose-built procedural models instead of rendering as cars.
  if (spec.type === 'MOTORCYCLE') return <BikeBody scale={0.9} rider={driver} />;
  if (spec.type === 'BICYCLE') return <BicycleBody scale={0.92} rider={driver} />;
  if (spec.type === 'HELICOPTER') return <HelicopterBody scale={1.05} />;
  if (spec.type === 'BOAT') return <BoatBody color={style?.paint && style.paint !== 'factory' ? style.paint : color} scale={1.05} />;
  if (spec.type === 'TRAIN') return <TrainBody color={style?.paint && style.paint !== 'factory' ? style.paint : color} passenger={/carriage/i.test(spec.model)} scale={1.05} />;
  const suv = spec.type === 'SUV' || /land rover|lx/i.test(spec.model);
  const premium = /mercedes|bmw|lexus/i.test(spec.brand);
  const sc: [number, number, number] = suv ? [1.12, 1.32, 1.14] : kind === 1 ? [1.04, 1.22, 1.06] : kind === 2 ? [.9, 1, .98] : [1, 1, 1];
  const grille = premium ? '#c7ccd1' : '#20252a'; const bodyColor = style?.paint && style.paint !== 'factory' ? style.paint : color; const rimColor = style?.rims === 'sport' ? '#d8dde3' : style?.rims === 'black' ? '#15171a' : '#b4bac1';
  const damage = Math.max(0, Math.min(100, damageLevel));
  if (glb) return <group>
    <FittedCar src={glb.src} real={glb.real} steer={steer} doorRef={doorRef} />
    <CarDamageVisuals level={damage} />
    {driver && <group position={[0, suv ? 0 : -.1, 0]} scale={[1, suv ? 1 : .85, 1]}><CarInterior seed={bodyColor + spec.model} shirt={shirt} suv={false} driverRef={driverRef} look={look} pax={pax} steer={steer} /></group>}
  </group>;
  return <group scale={sc}>
    <CarDamageVisuals level={damage} />
    <mesh geometry={kit.body} material={bodyMat(bodyColor)} castShadow />
    {driver && <CarInterior seed={bodyColor + spec.model} shirt={shirt} suv={suv} driverRef={driverRef} look={look} pax={pax} steer={steer} />}
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
    <WheelSet rim={rimColor} steer={steer} />
    <mesh geometry={kit.trim} material={TRIM_MAT} />
    <mesh geometry={kit.head} material={kit.headM} /><mesh geometry={kit.tail} material={kit.tailM} />
    <mesh position={[-1.55, .58, .91]} material={new THREE.MeshStandardMaterial({ color: '#111', metalness: .25, roughness: .55 })}><boxGeometry args={[.5, .05, .05]} /></mesh>
  </group>;
}

/** Cosmetic damage layer driven by a 0..100 damage level from the vehicle state. */
function CarDamageVisuals({ level }: { level: number }) {
  if (level < 5) return null;
  const dent = new THREE.MeshStandardMaterial({ color: '#34383d', roughness: .88, metalness: .15, transparent: true, opacity: Math.min(.78, .18 + level / 125) });
  const crack = new THREE.LineBasicMaterial({ color: '#dce8ef', transparent: true, opacity: Math.min(.95, .35 + level / 150) });
  const broken = level >= 30;
  return <group>
    {/* compressed dark panels read as dents/scrapes on the front corners and side panels */}
    <mesh position={[2.08, .48, -.53]} rotation-z={-.16} material={dent}><boxGeometry args={[.12, .16 + level / 500, .24]} /></mesh>
    <mesh position={[2.08, .48, .53]} rotation-z={.16} material={dent}><boxGeometry args={[.12, .16 + level / 500, .24]} /></mesh>
    <mesh position={[-.25, .66, -.86]} rotation-z={.04} material={dent}><boxGeometry args={[.65 + level / 180, .06 + level / 700, .035]} /></mesh>
    <mesh position={[-.25, .66, .86]} rotation-z={-.04} material={dent}><boxGeometry args={[.65 + level / 180, .06 + level / 700, .035]} /></mesh>
    {broken && <group>
      <mesh position={[2.18, .62, -.48]} material={new THREE.MeshStandardMaterial({ color: '#17191c', emissive: '#080808' })}><boxGeometry args={[.035, .13, .2]} /></mesh>
      <mesh position={[2.18, .62, .48]} material={new THREE.MeshStandardMaterial({ color: '#17191c', emissive: '#080808' })}><boxGeometry args={[.035, .13, .2]} /></mesh>
    </group>}
    {level >= 45 && <group position={[.72, 1.08, -.69]}>
      <primitive object={new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(.13, -.12, .01), new THREE.Vector3(.08, -.22, .015)]), crack)} />
      <primitive object={new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(.13, -.12, .01), new THREE.Vector3(.27, -.15, .01)]), crack)} />
    </group>}
  </group>;
}

/* real city bus: public/models/buses/city-bus.glb (no file = the box-built bus). Turned to face +x, ~7 m long, on the ground. Its wheels are fixed. */
let BUS_GLB: Promise<THREE.Object3D | null> | null = null;
const loadBus = () => BUS_GLB ||= fetch('/models/buses/city-bus.glb', { method: 'HEAD' }).then(r => r.ok ? new GLTFLoader().loadAsync('/models/buses/city-bus.glb').then(g => g.scene) : null).catch(() => null);
function useBusGlb(): THREE.Object3D | null {
  const [m, setM] = useState<THREE.Object3D | null>(null);
  useEffect(() => { let dead = false; loadBus().then(g => { if (!dead) setM(g); }); return () => { dead = true; }; }, []);
  return m;
}
function FittedBus({ src }: { src: THREE.Object3D }) {
  const obj = useMemo(() => {
    const c = src.clone(true), turn = new THREE.Group(); turn.add(c); turn.rotation.y = Math.PI;   // the model's front is -x
    turn.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(turn), ct = b.getCenter(new THREE.Vector3()), g = new THREE.Group();
    g.add(turn); turn.position.set(-ct.x, -b.min.y, -ct.z); g.scale.setScalar(.68);
    g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = true; });
    return g;
  }, [src]);
  return <primitive object={obj} />;
}
export function BusBody({ doorRef, driverRef, glassRef, look }: BodyRefs) { // faces +x like every vehicle: a yellow city bus with a window band, pillars, doors, lights and a destination sign
  const Y = '#e8a923', D = '#14202a';
  const glb = useBusGlb();
  if (glb) return <group>
    <FittedBus src={glb} />
    <group position={[2.4, 0, -.7]}><group ref={driverRef}>
      <mesh position={[-.2, 1.5, 0]}><boxGeometry args={[.26, .42, .42]} /><meshStandardMaterial color={look?.outfit || '#5b6b7a'} roughness={.8} /></mesh>
      <mesh position={[-.17, 1.85, 0]}><sphereGeometry args={[.13, 14, 12]} /><meshStandardMaterial color={look?.skin || '#8d5524'} roughness={.6} /></mesh>
    </group></group>
    <group ref={doorRef} position={[2.95, 0, -1.16]} />
  </group>;
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

export type BodyRefs = { doorRef?: (g: THREE.Object3D | null) => void; driverRef?: (g: THREE.Object3D | null) => void; glassRef?: (g: THREE.Object3D | null) => void; look?: DrvLook };

export function TaxiBody({ kit, refs, pax }: { kit: Kit; driver?: boolean; refs?: BodyRefs; pax?: PaxFig[] }) {
  return <group>
    <CarModel kit={kit} color="#e5b72f" kind={2} model="toyota-corolla-2024" shirt="#d99a42" pax={pax} {...refs} />
    <group position={[-.05, 1.56, 0]}> {/* roof sign: real 3D text on both sides, so no floating label to clutter the view */}
      <mesh><boxGeometry args={[.9, .2, .5]} /><meshStandardMaterial color="#111" /></mesh>
      {[1, -1].map(sd => <Text key={sd} position={[0, .01, sd * .26]} rotation-y={sd === 1 ? 0 : Math.PI} fontSize={.15} color="#ffd23f" anchorX="center" anchorY="middle">TAXI</Text>)}
    </group>
  </group>;
}

/** Procedural city/mountain bicycle. Faces +x like the other drivable vehicles. */
export function BicycleBody({ scale = 1, rider, driverRef, riderLook }: { scale?: number; rider?: boolean; driverRef?: (g: THREE.Object3D | null) => void; riderLook?: Look }) {
  const frame = '#d71920', dark = '#171a1d', metal = '#aeb6bd';
  const tube = (a: [number, number, number], b: [number, number, number], radius = 0.025, color = frame) => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = new THREE.Vector3().subVectors(end, start);
    const geo = new THREE.CylinderGeometry(radius, radius, delta.length(), 8);
    geo.translate(0, delta.length() / 2, 0);
    const mesh = <mesh geometry={geo} material={new THREE.MeshStandardMaterial({ color, metalness: .45, roughness: .4 })} position={start.toArray()} quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize())} />;
    return mesh;
  };
  const wheels: [number, number][] = [[-.58, .34], [.58, .34]];
  return <group scale={[scale, scale, scale]}>
    {wheels.map(([x, y]) => <group key={x} position={[x, y, 0]}>
      <mesh><torusGeometry args={[.29, .035, 8, 24]} /><meshStandardMaterial color={dark} roughness={.95} /></mesh>
      <mesh rotation-x={Math.PI / 2}><cylinderGeometry args={[.018, .018, .09, 10]} /><meshStandardMaterial color={metal} metalness={.75} /></mesh>
      {Array.from({ length: 12 }, (_, i) => <mesh key={i} rotation-z={i * Math.PI / 6}>
        <boxGeometry args={[.56, .009, .009]} /><meshStandardMaterial color={metal} metalness={.7} />
      </mesh>)}
    </group>)}
    {tube([-.58,.34,0],[-.18,.72,0])}{tube([-.18,.72,0],[.12,.36,0])}{tube([.12,.36,0],[-.58,.34,0])}
    {tube([-.18,.72,0],[.58,.34,0])}{tube([.12,.36,0],[.58,.34,0])}{tube([-.18,.72,0],[-.28,.82,0],.025,dark)}
    {tube([.58,.34,0],[.64,.78,0],.022,metal)}{tube([.64,.78,0],[.45,.83,0],.022,dark)}
    <mesh position={[-.31,.84,0]}><boxGeometry args={[.24,.045,.13]} /><meshStandardMaterial color={dark} /></mesh>
    <mesh position={[.12,.36,0]}><cylinderGeometry args={[.055,.055,.08,12]} /><meshStandardMaterial color={dark} /></mesh>
    {tube([.12,.36,0],[.26,.26,.07],.018,dark)}{tube([.12,.36,0],[-.02,.26,-.07],.018,dark)}
    <mesh position={[.12,.36,0]} rotation-x={Math.PI/2}><cylinderGeometry args={[.025,.025,.18,10]} /><meshStandardMaterial color={metal} metalness={.8} /></mesh>
    {rider && <group ref={driverRef} position={[-.02,.72,0]}><group rotation-y={Math.PI/2} scale={.46}><Human look={riderLook || { ...DEFAULT_LOOK, name: 'Cyclist', outfit: '#1769aa' }} getState={() => 'idle'} getAnim={() => undefined} getSpeed={() => 1} /></group></group>}
  </group>;
}

export function BikeBody({ scale = 1, rider, driverRef, riderLook }: { scale?: number; rider?: boolean; driverRef?: (g: THREE.Object3D | null) => void; doorRef?: unknown; glassRef?: unknown; riderLook?: Look }) { // faces +x like every vehicle: a motorcycle (okada) with fat tyres, fork, tank, seat, engine and exhaust
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


/** Procedural helicopter body used by the flyable Step 8 helicopter craft. */
export function HelicopterBody({ scale = 1 }: { scale?: number }) {
  const mainRotor = useRef<THREE.Group>(null), tailRotor = useRef<THREE.Group>(null);
  const hull = '#e8e8df', glass = new THREE.MeshStandardMaterial({ color: '#6ba8c7', metalness: .25, roughness: .18, transparent: true, opacity: .78 });
  useFrame((_, dt) => { if (mainRotor.current) mainRotor.current.rotation.y += dt * 24; if (tailRotor.current) tailRotor.current.rotation.x += dt * 34; });
  return <group scale={[scale, scale, scale]}>
    {/* cabin and rounded nose face +x, matching ARL vehicle orientation */}
    <mesh position={[.12, .86, 0]} scale={[1.18, .52, .48]}><sphereGeometry args={[1, 20, 14]} /><meshStandardMaterial color={hull} metalness={.28} roughness={.4} /></mesh>
    <mesh position={[.72, .96, 0]} scale={[.48, .34, .405]}><sphereGeometry args={[1, 18, 12]} /><primitive object={glass} attach="material" /></mesh>
    <mesh position={[-1.05, .91, 0]} rotation-z={-.04}><cylinderGeometry args={[.13, .2, 1.65, 12]} /><meshStandardMaterial color={hull} metalness={.25} roughness={.42} /></mesh>
    <mesh position={[-1.9, 1.0, 0]} rotation-z={-.08}><boxGeometry args={[.5, .48, .08]} /><meshStandardMaterial color={hull} metalness={.25} roughness={.42} /></mesh>
    <group ref={mainRotor} position={[-.05, 1.42, 0]}>
      <mesh><cylinderGeometry args={[.12, .12, .12, 12]} /><meshStandardMaterial color="#33383d" metalness={.7} /></mesh>
      {[0, Math.PI / 2].map((a) => <mesh key={a} rotation-y={a} position={[0, .035, 0]}><boxGeometry args={[2.9, .035, .13]} /><meshStandardMaterial color="#262b30" metalness={.45} roughness={.4} /></mesh>)}
    </group>
    <group ref={tailRotor} position={[-2.12, 1.02, .12]}>
      <mesh rotation-x={Math.PI / 2}><cylinderGeometry args={[.08, .08, .12, 10]} /><meshStandardMaterial color="#343a40" /></mesh>
      {[0, Math.PI / 2].map((a) => <mesh key={a} rotation-z={a}><boxGeometry args={[.48, .045, .06]} /><meshStandardMaterial color="#343a40" /></mesh>)}
    </group>
    {[-.55, .55].map((z) => <group key={z}>
      <mesh position={[.02, .34, z]} rotation-z={Math.PI / 2}><cylinderGeometry args={[.035, .035, .85, 8]} /><meshStandardMaterial color="#4a5056" metalness={.7} /></mesh>
      <mesh position={[.02, .22, z]}><sphereGeometry args={[.12, 10, 8]} /><meshStandardMaterial color="#22272c" /></mesh>
    </group>)}
    <mesh position={[.95, .72, 0]}><boxGeometry args={[.08, .12, .12]} /><meshStandardMaterial color="#fff2c2" emissive="#fff0a0" emissiveIntensity={.7} /></mesh>
  </group>;
}

/** Step 4 boat silhouette. Faces +x to match ARL vehicle orientation; it is visual-only until water physics/docking are implemented. */
export function BoatBody({ color = '#f4f4f0', scale = 1 }: { color?: string; scale?: number }) {
  const hullMat = useMemo(() => new THREE.MeshStandardMaterial({ color, metalness: .28, roughness: .32 }), [color]);
  const glassMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#7db7d4', metalness: .18, roughness: .16, transparent: true, opacity: .72 }), []);
  const trimMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#202a34', metalness: .45, roughness: .38 }), []);
  return <group scale={[scale, scale, scale]}>
    {/* pointed bow at +x; hull and stern sit below the cabin */}
    <mesh position={[-.12, .34, 0]} scale={[1.52, .3, .62]}><sphereGeometry args={[1, 18, 10]} /><primitive object={hullMat} attach="material" /></mesh>
    <mesh position={[.82, .34, 0]} rotation-z={-Math.PI / 2} scale={[.62, 1, 1]}><coneGeometry args={[.56, .9, 8]} /><primitive object={hullMat} attach="material" /></mesh>
    <mesh position={[.05, .59, 0]}><boxGeometry args={[1.72, .22, .94]} /><meshStandardMaterial color="#f5f5f0" roughness={.4} /></mesh>
    <mesh position={[-.12, .91, 0]}><boxGeometry args={[.92, .5, .82]} /><primitive object={glassMat} attach="material" /></mesh>
    <mesh position={[-.12, 1.17, 0]}><boxGeometry args={[1.03, .07, .91]} /><primitive object={hullMat} attach="material" /></mesh>
    <mesh position={[.68, .69, 0]}><boxGeometry args={[.16, .08, .62]} /><primitive object={trimMat} attach="material" /></mesh>
    {[-.35, .35].map(z => <mesh key={z} position={[-.47, .48, z]}><boxGeometry args={[.52, .1, .06]} /><primitive object={trimMat} attach="material" /></mesh>)}
    <mesh position={[-.79, .43, 0]}><boxGeometry args={[.28, .22, .5]} /><meshStandardMaterial color="#252a30" metalness={.5} roughness={.4} /></mesh>
    <mesh position={[1.04, .42, 0]}><sphereGeometry args={[.07, 10, 8]} /><meshStandardMaterial color="#fff0b3" emissive="#ffe7a0" emissiveIntensity={.6} /></mesh>
  </group>;
}

export function PoliceBody({ kit, refs }: { kit: Kit; refs?: BodyRefs }) {
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

/** Step 5 train rolling-stock silhouette. This is a visual model only; rail paths, station stops and passenger boarding are not wired yet. */
export function TrainBody({ color = '#173e63', passenger = false, scale = 1 }: { color?: string; passenger?: boolean; scale?: number }) {
  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({ color, metalness: .28, roughness: .38 }), [color]);
  const glassMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#83b9d4', metalness: .18, roughness: .2 }), []);
  const trimMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e8e9e7', metalness: .35, roughness: .42 }), []);
  return <group scale={[scale, scale, scale]}>
    <mesh position={[0, .82, 0]}><boxGeometry args={[4.25, 1.18, 1.32]} /><primitive object={bodyMat} attach="material" /></mesh>
    <mesh position={[passenger ? 0 : 1.7, .86, 0]}><boxGeometry args={[passenger ? 3.95 : .5, .92, 1.35]} /><primitive object={bodyMat} attach="material" /></mesh>
    {!passenger && <mesh position={[2.12, .72, 0]} rotation-z={-.12}><boxGeometry args={[.12, .78, 1.28]} /><primitive object={trimMat} attach="material" /></mesh>}
    {Array.from({ length: passenger ? 6 : 4 }, (_, i) => { const x = passenger ? -1.52 + i * .61 : -.95 + i * .62; return <mesh key={i} position={[x, 1.02, .671]}><boxGeometry args={[.38, .42, .035]} /><primitive object={glassMat} attach="material" /> </mesh>; })}
    {Array.from({ length: 4 }, (_, i) => { const x = -1.5 + i; return <group key={i} position={[x, .28, 0]}>
      {[-.53, .53].map(z => <mesh key={z} position={[0, 0, z]} rotation-x={Math.PI / 2}><cylinderGeometry args={[.22, .22, .12, 16]} /><meshStandardMaterial color="#20252a" metalness={.55} roughness={.55} /></mesh>)}
    </group>; })}
    <mesh position={[0, .43, 0]}><boxGeometry args={[4.05, .13, 1.12]} /><primitive object={trimMat} attach="material" /></mesh>
    <mesh position={[passenger ? 0 : 2.15, .87, -.69]}><boxGeometry args={[.34, .15, .025]} /><meshStandardMaterial color="#ffedb0" emissive="#ffcc66" emissiveIntensity={.65} /></mesh>
  </group>;
}
