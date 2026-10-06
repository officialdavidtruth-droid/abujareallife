'use client';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { animateHuman, buildHuman, type HumanState } from '../lib/humanRig';
import type { Look } from '../lib/characterModels';

export type { HumanState };
// Procedural, fully animated human. `getAnim` picks an action animation (eat, dance, work, ...), `getSpeed` scales walk cadence.
export default function Human({ look, getState, getAnim, getSpeed }: { look: Look; getState: () => HumanState; getAnim?: () => string | undefined; getSpeed?: () => number }) {
  const key = [look.gender, look.hair, look.hairColor, look.skin, look.outfit, look.pants, look.height, look.outfitModel].join('|');
  const rig = useMemo(() => buildHuman(look), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { rig.root.traverse(o => { const m = o as import('three').Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as import('three').Material).dispose(); } }); }, [rig]);
  useFrame((st, dt) => animateHuman(rig, getState(), getAnim?.(), st.clock.elapsedTime, Math.min(dt, .1), getSpeed?.() ?? 1));
  return <primitive object={rig.root} />;
}
