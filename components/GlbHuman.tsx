'use client';
// Skinned GLB human (Kara) driven by Mixamo animation clips. Drop-in for <Human>: same props.
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { HumanState } from '../lib/humanRig';
import type { Look } from '../lib/characterModels';

export const CHAR_URL = '/models/characters/kara.glb';
export const ANIM_URL = '/models/characters/animations.glb';
const TARGET_HEIGHT = 1.75;      // the game's human is ~1.75 m; Kara is ~1.66 m
const MODEL_HEIGHT = 1.66;
const FADE = 0.2;

/** game action name -> Mixamo clip. A clip name passed directly as `anim` (e.g. 'Punching') also works. */
const ACTION: Record<string, string> = {
  dance: 'Hip_Hop_Dancing', cheer: 'Rumba_Dancing', wave: 'Salute', salute: 'Salute',
  door: 'Opening_Door_Inwards', work: 'Pilot_Flips_Switches', game: 'Pilot_Flips_Switches',
  pray: 'Praying', dismiss: 'Dismissing_Gesture', punch: 'Punching', fight: 'Punching',
  elbow: 'Illegal_Elbow_Punch', block: 'Body_Block', die: 'Dying', dead: 'Dying', crouch: 'Crouch_Running',
  getup: 'Situp_To_Idle', wake: 'Waking', drive: 'Driving', honk: 'Honking_Horn', entercar: 'Entering_Car', exitcar: 'Exiting_Car',
  sleep: 'Sleeping_Idle', lay: 'Laying_Sleeping', laym: 'Male_Laying_Pose', layf: 'Female_Laying_Pose', stop: 'Running_To_Stop', turn: 'Running_Right_Turn',
};
const ONCE = new Set(['Dying', 'Salute', 'Opening_Door_Inwards', 'Punching', 'Illegal_Elbow_Punch', 'Body_Block', 'Dismissing_Gesture', 'Situp_To_Idle', 'Running_To_Stop', 'Running_Right_Turn', 'Entering_Car', 'Exiting_Car', 'Honking_Horn', 'Waking', 'Laying_Sleeping', 'Male_Laying_Pose', 'Female_Laying_Pose', 'Female_Laying_Pose__1_']);
const CLAMP = new Set(['Dying', 'Male_Laying_Pose', 'Female_Laying_Pose', 'Female_Laying_Pose__1_']);   // stay on the last frame

function pick(state: HumanState, anim: string | undefined, speed: number, names: Set<string>): { clip: string; ts: number } {
  if (anim) {
    const direct = [...names].find(n => n.toLowerCase() === anim.toLowerCase());
    const c = direct || ACTION[anim];
    if (c && names.has(c)) return { clip: c, ts: 1 };
  }
  if (state === 'walk') return speed >= 1.8 ? { clip: 'Running', ts: Math.min(1.3, Math.max(.8, speed / 2.4)) } : { clip: 'Strut_Walking', ts: Math.min(1.4, Math.max(.8, speed / 1.1)) };
  if (state === 'sleep') return { clip: 'Sleeping_Idle', ts: 1 };
  return { clip: 'Idle', ts: 1 };       // idle, and sit (no sit clip yet)
}

export default function GlbHuman({ look, getState, getAnim, getSpeed }: { look: Look; getState: () => HumanState; getAnim?: () => string | undefined; getSpeed?: () => number }) {
  const char = useGLTF(CHAR_URL), anims = useGLTF(ANIM_URL);
  const model = useMemo(() => {
    const m = cloneSkinned(char.scene) as THREE.Object3D;
    m.traverse(o => { const s = o as THREE.SkinnedMesh; if (s.isMesh) { s.castShadow = true; s.frustumCulled = false; } });
    return m;
  }, [char.scene]);

  // The clips are in metres, Kara's bones in her own units: rescale the hips translation so the hips keep their height.
  const clips = useMemo(() => {
    const hips = model.getObjectByName('mixamorigHips');
    const idle = anims.animations.find(a => a.name === 'Idle');
    const rest = idle?.tracks.find(t => t.name === 'mixamorigHips.position')?.values[1] || 1;
    const k = hips ? hips.position.y / rest : 1;
    const map = new Map<string, THREE.AnimationClip>();
    for (const a of anims.animations) {
      const c = a.clone();
      for (const t of c.tracks) if (t.name === 'mixamorigHips.position') { const v = t.values; for (let i = 0; i < v.length; i++) v[i] *= k; }
      map.set(c.name, c);
    }
    return map;
  }, [model, anims.animations]);

  const names = useMemo(() => new Set(clips.keys()), [clips]);
  const mixer = useMemo(() => new THREE.AnimationMixer(model), [model]);
  const cur = useRef<{ name: string; action: THREE.AnimationAction } | null>(null);
  useEffect(() => () => { mixer.stopAllAction(); mixer.uncacheRoot(model); cur.current = null; }, [mixer, model]);

  useFrame((_, dt) => {
    const w = pick(getState(), getAnim?.(), getSpeed?.() ?? 1, names);
    const c = cur.current;
    if (!c || c.name !== w.clip) {
      const clip = clips.get(w.clip); if (!clip) return;
      const a = mixer.clipAction(clip);
      a.reset().setLoop(ONCE.has(w.clip) ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = CLAMP.has(w.clip);
      a.fadeIn(FADE).play();
      if (c) c.action.fadeOut(FADE);
      cur.current = { name: w.clip, action: a };
    }
    if (cur.current) cur.current.action.timeScale = w.ts;
    mixer.update(Math.min(dt, .1));
    // a one-shot that has finished falls back to idle/walk on the next frame (unless it is held, like Dying)
    const a = cur.current?.action; if (a && !a.isRunning() && !CLAMP.has(cur.current!.name) && ONCE.has(cur.current!.name)) cur.current = null;
  });

  const s = (TARGET_HEIGHT / MODEL_HEIGHT) * (look.height || 1);
  return <group scale={s}><primitive object={model} /></group>;
}

useGLTF.preload(CHAR_URL);
useGLTF.preload(ANIM_URL);
