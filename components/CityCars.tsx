'use client';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import { useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import Human from './Human';
import { DEFAULT_LOOK, type Look } from '../lib/characterModels';
import { VEHICLE_CATALOG, vehicleById, vehicleByName } from '../lib/vehicles';
import { NIGHT } from './cityShared';
 // 0 = full day, 1 = full night
export let PKIT: Kit | null = null;

export const pkit = (): Kit => { if (!PKIT) PKIT = carKit(); return PKIT; };


export type Kit = { body: THREE.BufferGeometry; cabin: THREE.BufferGeometry; wheels: THREE.BufferGeometry; head: THREE.BufferGeometry; tail: THREE.BufferGeometry; glass: THREE.Material; tire: THREE.Material; headM: THREE.Material; tailM: THREE.Material };

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
    wheels, head: mergeGeometries(lamp(2.2, .6))!, tail: mergeGeometries(lamp(-2.2, .68))!,
    glass: new THREE.MeshStandardMaterial({ color: '#cfe6f2', metalness: .05, roughness: .04, transparent: true, opacity: .16, depthWrite: false }), // clear glass: you can see the driver through the windshield
    tire: new THREE.MeshStandardMaterial({ color: '#141619', roughness: .9 }),
    headM: new THREE.MeshStandardMaterial({ color: '#fff7d6', emissive: '#fff2b0', emissiveIntensity: 1.4 }),
    tailM: new THREE.MeshStandardMaterial({ color: '#ff3030', emissive: '#ff1a1a', emissiveIntensity: 1.2 }),
  };
}

export const BODYMATS = new Map<string, THREE.MeshStandardMaterial>();

export const bodyMat = (c: string) => { let m = BODYMATS.get(c); if (!m) { m = new THREE.MeshStandardMaterial({ color: c, metalness: .55, roughness: .32 }); BODYMATS.set(c, m); } return m; };

/* ───────── clear-glass interior: seats, dash, steering wheel and a driver you can see through the windshield ───────── */
export const DRV_SKINS = ['#f1c9a5', '#d9a577', '#c68642', '#8d5524', '#5c3a21', '#3b2417'], DRV_SHIRTS = ['#e8e8e8', '#2a4a7a', '#7a2a2a', '#2f6b4a', '#d99a42', '#444b55', '#6b3a7a'], DRV_HAIRS = ['#111', '#1b1410', '#2b1d12', '#555'];

export const drvHash = (str: string) => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0; };

export const DRV_MATS = new Map<string, THREE.MeshStandardMaterial>();

export const drvMat = (c: string, rough = .8, metal = .05) => { const k = c + rough + metal; let m = DRV_MATS.get(k); if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal }); DRV_MATS.set(k, m); } return m; };

export const driverStyle = (seed: string, shirt?: string) => { const h = drvHash(seed); return { skin: DRV_SKINS[h % DRV_SKINS.length], top: shirt || DRV_SHIRTS[(h >> 3) % DRV_SHIRTS.length], hair: DRV_HAIRS[(h >> 6) % DRV_HAIRS.length] }; };

export type DrvLook = { skin?: string; outfit?: string; hairColor?: string };

export function CarInterior({ seed, shirt, suv, driverRef, look }: { seed: string; shirt?: string; suv?: boolean; driverRef?: (g: THREE.Object3D | null) => void; look?: DrvLook }) {
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

export function CarModel({ kit, color, kind, model, style, shirt, driver = true, doorRef, driverRef, glassRef, look }: { kit: Kit; color: string; kind: number; model?: string; style?: { paint?: string; rims?: string; tint?: number }; shirt?: string; driver?: boolean; look?: DrvLook; doorRef?: (g: THREE.Object3D | null) => void; driverRef?: (g: THREE.Object3D | null) => void; glassRef?: (g: THREE.Object3D | null) => void }) {
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

export function BusBody({ doorRef, driverRef, glassRef, look }: BodyRefs) { // faces +x like every vehicle: a yellow city bus with a window band, pillars, doors, lights and a destination sign
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

export type BodyRefs = { doorRef?: (g: THREE.Object3D | null) => void; driverRef?: (g: THREE.Object3D | null) => void; glassRef?: (g: THREE.Object3D | null) => void; look?: DrvLook };

export function TaxiBody({ kit, refs }: { kit: Kit; driver?: boolean; refs?: BodyRefs }) {
  return <group>
    <CarModel kit={kit} color="#e5b72f" kind={2} model="toyota-corolla-2024" shirt="#d99a42" {...refs} />
    <group position={[-.05, 1.56, 0]}> {/* roof sign: real 3D text on both sides, so no floating label to clutter the view */}
      <mesh><boxGeometry args={[.9, .2, .5]} /><meshStandardMaterial color="#111" /></mesh>
      {[1, -1].map(sd => <Text key={sd} position={[0, .01, sd * .26]} rotation-y={sd === 1 ? 0 : Math.PI} fontSize={.15} color="#ffd23f" anchorX="center" anchorY="middle">TAXI</Text>)}
    </group>
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
