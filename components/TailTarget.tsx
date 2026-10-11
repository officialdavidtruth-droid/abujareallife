'use client';
import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { CarModel, pkit } from './CityCars';
import { OBS, TPOS, lightState } from './cityShared';
import { simSeconds } from '../lib/worldClock';
import { MISSIONS, type TailSpec } from '../lib/missions';
import { TAIL, clearTail, goTail, prepareTail, stepTail, tailShot } from '../lib/tailRoute';

/* The dealer's car for the Wuse Market Tail (lives inside the 3D scene).
   All rules are in lib/tailRoute.ts; this only draws the car, feeds it the world (traffic, lights, player position)
   and turns the outcome into an event for MissionsCombat:  'arl-tail-done'  or  'arl-tail-fail' (detail = message). */
const FAIL_MSG = {
  spotted: '❌ Mission failed: the dealer made you.',
  lost: '❌ Mission failed: you lost the dealer.',
} as const;
const OB = 5;   // AI traffic treats OBS[5] as an obstacle (OBS[0-4] are used by the player, taxis and police), so cars brake for the dealer instead of driving through him

export default function TailTarget() {
  const grp = useRef<THREE.Group>(null), sent = useRef(false);
  const [spec, setSpec] = useState<TailSpec | null>(null), [following, setFollowing] = useState(false);
  const kit = pkit();

  useEffect(() => {
    const drop = () => { clearTail(); setSpec(null); setFollowing(false); sent.current = false; (window as any).__arlTail = undefined; if (OBS[OB]) OBS[OB].on = false; };
    const prepare = (e: Event) => {
      const id = (e as CustomEvent).detail?.id as string | undefined, m = MISSIONS.find(x => x.id === id); if (!m?.tail) return;
      if (TAIL.on && TAIL.spec === m.tail) return;            // already parked / running (stage changes re-send this)
      sent.current = false;
      if (prepareTail(m.tail, (window as any).__arlPos)) setSpec(m.tail);
      else window.dispatchEvent(new CustomEvent('arl-combat-notice', { detail: 'The dealer could not be placed on the map. Abandon and try again.' }));
    };
    const go = () => { goTail(); setFollowing(true); window.dispatchEvent(new CustomEvent('arl-combat-notice', { detail: '🕶️ He is getting in his car. Hang back: stay out of sight, but do not lose him.' })); };
    const shot = () => { const p = (window as any).__arlPos as { x: number; z: number } | undefined; if (p) tailShot(p.x, p.z); };
    window.addEventListener('arl-tail-prepare', prepare); window.addEventListener('arl-tail-go', go); window.addEventListener('arl-tail-clear', drop); window.addEventListener('arl-shot-fired', shot);
    return () => { window.removeEventListener('arl-tail-prepare', prepare); window.removeEventListener('arl-tail-go', go); window.removeEventListener('arl-tail-clear', drop); window.removeEventListener('arl-shot-fired', shot); drop(); };
  }, []);

  useFrame((st, dtRaw) => {
    if (!TAIL.on) return;
    const dt = Math.min(dtRaw, .05);
    stepTail(dt, { t: simSeconds(), light: lightState, cars: TPOS, player: (window as any).__arlPos });
    const g = grp.current;
    if (g) { g.position.set(TAIL.x, 0, TAIL.z); g.rotation.y = TAIL.r; }
    (window as any).__arlTail = { x: TAIL.x, z: TAIL.z, follow: TAIL.follow };
    if (!OBS[OB]) OBS[OB] = { x: TAIL.x, z: TAIL.z, on: true, sp: 7 };
    OBS[OB].x = TAIL.x; OBS[OB].z = TAIL.z; OBS[OB].on = true;
    if (TAIL.result && !sent.current) {
      sent.current = true;
      if (TAIL.result === 'win') window.dispatchEvent(new Event('arl-tail-done'));
      else window.dispatchEvent(new CustomEvent('arl-tail-fail', { detail: FAIL_MSG[TAIL.result] }));
    }
  });

  if (!spec) return null;
  return <group ref={grp} position={[TAIL.x, 0, TAIL.z]} rotation={[0, TAIL.r, 0]}>
    <CarModel kit={kit} color={spec.color} kind={1} model={spec.model} shirt="#0b0b0d" />
    <Html position={[0, 2.7, 0]} center zIndexRange={[5, 0]}>
      <div style={{ font: '800 10px system-ui', letterSpacing: '.08em', color: '#fff', background: following ? '#0b2a33e8' : '#33260be8', border: `1px solid ${following ? '#35d0ff' : '#e5b14b'}`, borderRadius: 8, padding: '3px 7px', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
        {following ? '🎯 DEALER' : '🎯 DEALER\u2019S CAR'}
      </div>
    </Html>
  </group>;
}
