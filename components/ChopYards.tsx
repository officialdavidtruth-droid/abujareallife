'use client';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import { YARDS, type YardSite } from '../lib/chopData';

/* The four chop yards, built as plain scenery on open ground outside the street grid (see YARDS in lib/chopData.ts).
   Nothing here is marked on the map. The one you are sent to gets an amber light beam while you have a hot car.
   No colliders: the fence is only for looks, so nothing can trap a player or a car. */
const Box = ({ p, s, c, r = 0, e }: { p: [number, number, number]; s: [number, number, number]; c: string; r?: number; e?: string }) =>
  <mesh position={p} rotation={[0, r, 0]} castShadow receiveShadow><boxGeometry args={s} /><meshStandardMaterial color={c} roughness={.9} metalness={.15} {...(e ? { emissive: e, emissiveIntensity: 1.4 } : {})} /></mesh>;

const Wreck = ({ p, r, c, up = 0 }: { p: [number, number, number]; r: number; c: string; up?: number }) => <group position={[p[0], p[1] + up, p[2]]} rotation={[0, r, 0]}>
  <Box p={[0, .55, 0]} s={[4.2, 1, 1.8]} c={c} /><Box p={[-.2, 1.25, 0]} s={[2.1, .7, 1.6]} c="#2a2f36" />
  <Box p={[1.4, .15, .95]} s={[.7, .3, .12]} c="#111" /><Box p={[-1.4, .15, -.95]} s={[.7, .3, .12]} c="#111" /></group>;

function Yard({ y }: { y: YardSite }) {
  const beam = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const m = beam.current; if (!m) return;
    const on = (window as unknown as { __arlChop?: { yard?: string } | null }).__arlChop?.yard === y.id;
    m.visible = on; if (on) (m.material as THREE.MeshBasicMaterial).opacity = .22 + Math.sin(clock.elapsedTime * 3) * .08;
  });
  const face = Math.abs(y.x) > Math.abs(y.z) ? [-Math.sign(y.x), 0] : [0, -Math.sign(y.z)], ry = Math.atan2(face[0], face[1]), H = 7, FH = 2.2, FC = '#59616b', gap = 2.6;   // the gate faces the city, squared to the street grid so the pad never touches a road
  return <group position={[y.x, 0, y.z]} rotation={[0, ry, 0]}>
    <mesh position={[0, .03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[H * 2 + .5, H * 2 + .5]} /><meshStandardMaterial color="#4a463f" roughness={1} /></mesh>
    <Box p={[0, FH / 2, -H]} s={[H * 2, FH, .15]} c={FC} /><Box p={[-H, FH / 2, 0]} s={[.15, FH, H * 2]} c={FC} /><Box p={[H, FH / 2, 0]} s={[.15, FH, H * 2]} c={FC} />
    <Box p={[-(H + gap) / 2, FH / 2, H]} s={[H - gap, FH, .15]} c={FC} /><Box p={[(H + gap) / 2, FH / 2, H]} s={[H - gap, FH, .15]} c={FC} />
    <Box p={[-gap, 1.5, H]} s={[.3, 3, .3]} c="#292524" /><Box p={[gap, 1.5, H]} s={[.3, 3, .3]} c="#292524" /><Box p={[0, 3.1, H]} s={[gap * 2 + .3, .3, .3]} c="#f59e0b" e="#7c4a03" />
    <Box p={[-3.4, 1.3, -4.6]} s={[6, 2.6, 2.4]} c="#7c2d12" /><Box p={[3.6, 1.3, -4.8]} s={[6, 2.6, 2.4]} c="#1e3a8a" /><Box p={[3.6, 3.9, -4.8]} s={[6, 2.6, 2.4]} c="#3f6212" r={.12} />
    <Wreck p={[-3.6, 0, 1.2]} r={.5} c="#7f1d1d" /><Wreck p={[-3.6, 0, 1.2]} r={.45} c="#334155" up={1.55} /><Wreck p={[3.4, 0, 2.4]} r={-.3} c="#78716c" />
    <Box p={[0, .45, -1.4]} s={[1.2, .9, 1.2]} c="#1f2937" /><Box p={[.2, 1.05, -1.4]} s={[.7, .3, .7]} c="#9ca3af" />
    <Box p={[-H + .6, 2.3, H - .6]} s={[.18, 4.6, .18]} c="#292524" /><Box p={[-H + .6, 4.6, H - .6]} s={[.7, .18, .5]} c="#fde68a" e="#fbbf24" />
    <mesh ref={beam} position={[0, 22, 0]} visible={false}><cylinderGeometry args={[.7, 1.4, 44, 16, 1, true]} /><meshBasicMaterial color="#fbbf24" transparent opacity={.25} depthWrite={false} /></mesh>
  </group>;
}
export default function ChopYards() { return <>{YARDS.map(y => <Yard key={y.id} y={y} />)}</>; }
