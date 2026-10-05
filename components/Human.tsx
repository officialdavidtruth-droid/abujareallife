'use client';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MODELS, type Look } from '../lib/characterModels';

export type HumanState = 'idle' | 'walk' | 'sit' | 'sleep';
MODELS.forEach(m => useGLTF.preload(m.url));

export default function Human({ look, getState }: { look: Look; getState: () => HumanState }) {
  const def = MODELS.find(m => m.id === look.model) || MODELS[0];
  const { scene, animations } = useGLTF(def.url);
  const obj = useMemo(() => {
    const o = clone(scene);
    o.traverse(c => { const m = c as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; m.material = (m.material as THREE.Material).clone(); } });
    return o;
  }, [scene]);
  const mixer = useMemo(() => new THREE.AnimationMixer(obj), [obj]);
  const cur = useRef<THREE.AnimationAction | null>(null);

  useEffect(() => {
    obj.traverse(c => {
      const m = c as THREE.Mesh; if (!m.isMesh) return;
      const mat = m.material as THREE.MeshStandardMaterial;
      if (def.skin.includes(mat.name)) mat.color.set(look.skin);
      else if (def.outfit.includes(mat.name)) mat.color.set(look.outfit);
    });
  }, [obj, def, look.skin, look.outfit]);

  useEffect(() => () => { mixer.stopAllAction(); }, [mixer]);

  useFrame((_, dt) => {
    const st = getState(), want = def.clips[st as 'idle' | 'walk'] || def.clips.idle;
    const clip = THREE.AnimationClip.findByName(animations, want);
    if (clip) {
      const next = mixer.clipAction(clip, obj);
      if (cur.current !== next) { cur.current?.fadeOut(.25); next.reset().fadeIn(.25).play(); cur.current = next; }
    }
    mixer.update(dt);
  });

  return <primitive object={obj} scale={look.height} />;
}
