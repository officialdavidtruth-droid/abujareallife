'use client';
import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type * as THREE from 'three';
import Human from './Human';
import { ROOM, useRoomNet } from '../lib/roomNet';
import { HOUSES } from '../lib/houses';
import type { Look } from '../lib/characterModels';

/* Shared homes (HOME-PRESENCE.md): everyone who is inside the same house sees each other. One realtime room per house (room:home-<plot slot>),
   built on the same channel the shops use (lib/roomNet.ts). Rendered inside the home <Canvas>; it draws the OTHER people, your own avatar stays in Sim.tsx. */
export type HomeSample = { x: number; z: number; r: number; walking: boolean; pose: 0 | 1 | 2 };
/* Set by Sim.tsx while you are a guest: the plot slot of the house you are visiting (null = your own home). */
export const HOME_VIEW = { slot: null as number | null };
const BED = { x: -4.95, y: .86, z: -2.45 };   // where a sleeping person lies (mirrors Avatar in Sim.tsx)

function Guest({ name }: { name: string }) {
  const g = useRef<THREE.Group>(null!), inner = useRef<THREE.Group>(null!), p = ROOM.peers[name]; if (!p) return null;
  useFrame((_, dt) => {
    const q = ROOM.peers[name]; if (!q) return; const k = 1 - Math.exp(-10 * dt); q.x += (q.tx - q.x) * k; q.z += (q.tz - q.z) * k; let dr = q.tr - q.r; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); q.r += dr * k;
    const sleep = q.p === 2; g.current.position.set(sleep ? BED.x : q.x, sleep ? BED.y : 0, sleep ? BED.z : q.z); g.current.rotation.y = sleep ? 0 : q.r; inner.current.rotation.x = sleep ? -Math.PI / 2 : 0;
  });
  return <group ref={g}><group ref={inner}><Human look={p.look} getState={() => { const q = ROOM.peers[name]; return q?.p === 2 ? 'sleep' : q?.p === 1 ? 'sit' : q?.mv ? 'walk' : 'idle'; }} /></group>
    <Html position={[0, 2.3 * p.look.height + .3, 0]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}><div className="tag">{name}</div></Html></group>;
}

/** The house you are in as a realtime room. Mount it only while you are inside a home. */
function Net({ slot, look, sample }: { slot: number; look: Look; sample: () => HomeSample }) {
  const net = useRoomNet('home-' + slot, look);
  useFrame(() => { const s = sample(); ROOM.me.x = s.x; ROOM.me.z = s.z; ROOM.me.r = s.r; ROOM.me.mv = s.walking ? 1 : 0; ROOM.me.p = s.pose; ROOM.me.w = 0; });
  useEffect(() => () => { ROOM.me.p = 0; }, []);
  return <>{net.roster.map(n => ROOM.peers[n] && <Guest key={n + net.ver} name={n} />)}</>;
}
export default function HomePeers({ look, sample }: { look: Look; sample: () => HomeSample }) {
  const [mine, setSlot] = useState<number | null>(HOUSES.mine ? HOUSES.mine.slot : null), slot = HOME_VIEW.slot ?? mine;
  useEffect(() => { const f = () => setSlot(HOUSES.mine ? HOUSES.mine.slot : null); window.addEventListener('arl-houses', f); f(); return () => window.removeEventListener('arl-houses', f); }, []);
  if (slot == null) return null;
  return <Net key={slot} slot={slot} look={look} sample={sample} />;
}
