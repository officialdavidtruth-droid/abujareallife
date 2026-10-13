'use client';
import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo } from 'react';
import { animateHuman, buildHuman, type HumanState } from '../lib/humanRig';
import type { Look } from '../lib/characterModels';
import GlbHuman from './GlbHuman';

export type { HumanState };
type Props = { look: Look; getState: () => HumanState; getAnim?: () => string | undefined; getSpeed?: () => number };

/** Which looks use the skinned GLB character (Kara, a woman) instead of the procedural rig. Everyone else keeps the procedural human.
 *  Set to () => true to put every player in the GLB, or () => false to switch the GLB off. */
export const useGlbFor = (look: Look) => look.gender === 'f';

// Procedural, fully animated human. `getAnim` picks an action animation (eat, dance, work, ...), `getSpeed` scales walk cadence.
function ProcHuman({ look, getState, getAnim, getSpeed }: Props) {
  const key = [look.gender, look.hair, look.hairColor, look.skin, look.outfit, look.pants, look.height, look.outfitModel, look.shoeColor, look.shoeStyle, (look.acc || []).join(',')].join('|');
  const rig = useMemo(() => buildHuman(look), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { rig.root.traverse(o => { const m = o as import('three').Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as import('three').Material).dispose(); } }); }, [rig]);
  useFrame((st, dt) => animateHuman(rig, getState(), getAnim?.(), st.clock.elapsedTime, Math.min(dt, .1), getSpeed?.() ?? 1));
  return <primitive object={rig.root} />;
}

// While the GLB downloads, the procedural human stands in, so nobody is ever invisible.
export default function Human(p: Props) {
  if (!useGlbFor(p.look)) return <ProcHuman {...p} />;
  return <Suspense fallback={<ProcHuman {...p} />}><GlbHuman {...p} /></Suspense>;
}
