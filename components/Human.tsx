'use client';
import { useFrame } from '@react-three/fiber';
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { animateHuman, buildHuman, type HumanState } from '../lib/humanRig';
import type { Look } from '../lib/characterModels';
import { MixamoDriver, chooseClip, loadMixamo, type MixamoSource } from '../lib/mixamoRetarget';

export type { HumanState };
type Props = { look: Look; getState: () => HumanState; getAnim?: () => string | undefined; getSpeed?: () => number };

/** Which looks use the skinned GLB characters (Kara for women, Man In Suit for men) instead of the procedural rig.
 *  () => true = everyone uses a GLB character; () => false switches the GLB off; (look) => look.gender === 'f' = women only. */
export const useGlbFor: (look: Look) => boolean = () => false;   // false = the procedural creator character (hair, outfits, shoes, accessories) driven by the Mixamo clips

if (typeof window !== 'undefined') void loadMixamo();   // start downloading the Mixamo motion files the moment the game code loads, not when the first character appears
const GlbHuman = lazy(() => import('./GlbHuman'));   // loaded only if useGlbFor switches the skinned GLB characters back on (so its big models are not downloaded otherwise)

// Procedural character from the creator, animated with the Mixamo motion files (lib/mixamoRetarget.ts): idle, walk, run, dances, doors, car, punches ...
// Sitting, sleeping and actions that have no Mixamo clip (eat, cook, shoot, phone ...) keep the rig's own pose, blended in and out.
// While the Mixamo files load (or if animations.glb is missing) the character simply uses its procedural animation.
function useMixamo(): MixamoSource | null {
  const [src, setSrc] = useState<MixamoSource | null>(null);
  useEffect(() => { let on = true; loadMixamo().then(x => { if (on && x) setSrc(x); }); return () => { on = false; }; }, []);
  return src;
}
function ProcHuman({ look, getState, getAnim, getSpeed }: Props) {
  const key = [look.gender, look.hair, look.hairColor, look.skin, look.outfit, look.pants, look.height, look.outfitModel, look.shoeColor, look.shoeStyle, (look.acc || []).join(',')].join('|');
  const rig = useMemo(() => buildHuman(look), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { rig.root.traverse(o => { const m = o as import('three').Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as import('three').Material).dispose(); } }); }, [rig]);
  const src = useMixamo();
  const drv = useMemo(() => (src ? new MixamoDriver(src, rig) : null), [src, rig]);
  useEffect(() => () => drv?.dispose(), [drv]);
  const w = useRef(0);   // 0 = the rig's own pose, 1 = fully Mixamo
  useFrame((st, dt) => {
    const d = Math.min(dt, .1), state = getState(), anim = getAnim?.(), speed = getSpeed?.() ?? 1;
    animateHuman(rig, state, anim, st.clock.elapsedTime, d, speed);
    if (!drv) return;
    const pick = chooseClip(state, anim, speed, drv.names);
    w.current += ((pick ? 1 : 0) - w.current) * (1 - Math.exp(-d * 10));
    if (pick) drv.set(pick);
    if (w.current > .002) { drv.update(d); drv.apply(rig, w.current); } else drv.release(rig);
  });
  return <primitive object={rig.root} />;
}

// While the GLB downloads, the procedural human stands in, so nobody is ever invisible.
export default function Human(p: Props) {
  if (!useGlbFor(p.look)) return <ProcHuman {...p} />;
  return <Suspense fallback={<ProcHuman {...p} />}><GlbHuman {...p} /></Suspense>;
}
