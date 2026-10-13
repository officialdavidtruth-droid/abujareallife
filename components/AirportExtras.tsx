'use client';
/* Real 3D models around the airport (public/models/airport/*.glb). No file = nothing is drawn.
   - two parked airliners (CRJ-900 + a jumbo) on a new apron north of the runway, with solid hulls so you cannot walk through them
   - a bus station put in the free city block nearest the airport (edit BUS_STATION_SPOT below to move it) */
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GRID } from '../lib/roadRoute';
import { AIR } from './CityScenery';
import { SOLIDS } from './CityCollision';

const CACHE = new Map<string, Promise<THREE.Object3D | null>>();
const load = (name: string) => {
  let p = CACHE.get(name);
  if (!p) { const url = `/models/airport/${name}.glb`; p = fetch(url, { method: 'HEAD' }).then(r => r.ok ? new GLTFLoader().loadAsync(url).then(g => g.scene) : null).catch(() => null); CACHE.set(name, p); }
  return p;
};
function useModel(name: string) {
  const [m, setM] = useState<THREE.Object3D | null>(null);
  useEffect(() => { let dead = false; load(name).then(g => { if (!dead) setM(g); }); return () => { dead = true; }; }, [name]);
  return m;
}
/** clone, scale so the model's longest ground side is `len`, centre it on x/z and stand it on y = 0 */
function Fit({ src, len, rotY = 0 }: { src: THREE.Object3D; len: number; rotY?: number }) {
  const obj = useMemo(() => {
    const c = src.clone(true), b = new THREE.Box3().setFromObject(c), sz = b.getSize(new THREE.Vector3()), ct = b.getCenter(new THREE.Vector3()), k = len / (Math.max(sz.x, sz.z) || 1);
    const pivot = new THREE.Group(); c.position.set(-ct.x, -b.min.y, -ct.z); pivot.add(c); pivot.scale.setScalar(k); pivot.rotation.y = rotY;
    const g = new THREE.Group(); g.add(pivot);
    g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    return g;
  }, [src, len, rotY]);
  return <primitive object={obj} />;
}

/* parked jets, in the airport's local units (group scaled by AIR.s). Nose points +z, towards the runway. */
const JETS = [
  { name: 'crj900', x: 26, z: -10.5, len: 11, hullW: 1.0 },
  { name: 'prop', x: 54, z: -15.5, len: 19, hullW: 1.4 },    // the four-engine jumbo (file is called prop)
];
let solidsAdded = false;
function addJetSolids() {
  if (solidsAdded) return; solidsAdded = true;
  for (const j of JETS) { const x = AIR.x + j.x * AIR.s, z = AIR.z + j.z * AIR.s, hw = j.hullW * AIR.s, hl = j.len / 2 * AIR.s; SOLIDS.push({ x0: x - hw, x1: x + hw, z0: z - hl, z1: z + hl }); }
}
function Jet({ j }: { j: typeof JETS[number] }) {
  const m = useModel(j.name);
  if (!m) return null;
  return <group position={[j.x, 0, j.z]}><Fit src={m} len={j.len} /></group>;
}

/* bus station: nearest free block interior to the airport (blocks are GRID wide, roads on the grid lines) */
const ST = { w: 20, d: 7.5 };
function stationSpot() {
  const free = (x: number, z: number) => !SOLIDS.some(s => x + ST.w / 2 + 2 > s.x0 && x - ST.w / 2 - 2 < s.x1 && z + ST.d / 2 + 2 > s.z0 && z - ST.d / 2 - 2 < s.z1);
  const nearAirport = (x: number, z: number) => x > AIR.x - 30 * AIR.s - 12 && x < AIR.x + 100 * AIR.s + 12 && Math.abs(z - AIR.z) < 28 * AIR.s;   // runway, jets and terminal
  const approach = (x: number, z: number) => x < AIR.x && x > AIR.x - 100 && Math.abs(z - AIR.z) < 10;
  let best: [number, number] | null = null, bd = 1e9;
  for (let i = -12; i <= 12; i++) for (let j = -12; j <= 12; j++) {
    const x = Math.round(AIR.x / GRID + i) * GRID + GRID / 2, z = Math.round(AIR.z / GRID + j) * GRID + GRID / 2;
    if (nearAirport(x, z) || approach(x, z) || !free(x, z)) continue;
    const d = Math.hypot(x - AIR.x, z - AIR.z); if (d < bd) { bd = d; best = [x, z]; }
  }
  return best;
}
export const BUS_STATION_SPOT: { x: number; z: number; r: number } | null = null;   // set {x, z, r} here to force a position; null = automatic

function BusStation() {
  const m = useModel('bus-station');
  const spot = useMemo(() => { const s = BUS_STATION_SPOT ?? (() => { const p = stationSpot(); return p ? { x: p[0], z: p[1], r: 0 } : null; })(); return s; }, []);
  if (!m || !spot) return null;
  return <group position={[spot.x, 0, spot.z]} rotation={[0, spot.r, 0]}><Fit src={m} len={ST.w} /></group>;
}

export default function AirportExtras() {
  useEffect(() => { addJetSolids(); }, []);
  const flat = [-Math.PI / 2, 0, 0] as const;
  return <>
    <group position={[AIR.x, 0, AIR.z]} scale={AIR.s}>
      <mesh rotation={flat} position={[40, .043, -14.5]}><planeGeometry args={[56, 22]} /><meshStandardMaterial color="#6f757b" roughness={.95} /></mesh>
      {JETS.map(j => <Jet key={j.name} j={j} />)}
    </group>
    <BusStation />
  </>;
}
