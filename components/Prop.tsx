'use client';
/* Drop-in realistic 3D prop: loads a .glb, scales it to a target width (or height), stands it on the floor and centres it on the origin.
   Front faces +z like every other piece in the home. If the model fails to load, the old primitive version (fallback) is drawn instead. */
import { Component, Suspense, useMemo, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

class Guard extends Component<{ fallback: ReactNode; children: ReactNode }, { bad: boolean }> {
  state = { bad: false };
  static getDerivedStateFromError() { return { bad: true }; }
  componentDidCatch() { /* keep the game running with the fallback */ }
  render() { return this.state.bad ? this.props.fallback : this.props.children; }
}

type PropOpts = { url: string; w?: number; h?: number; ry?: number; y?: number; tint?: string };

function Model({ url, w, h, ry = 0, y = 0, tint }: PropOpts) {
  const { scene } = useGLTF(url);
  const obj = useMemo(() => {
    const c = scene.clone(true);
    c.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true; m.receiveShadow = true;
        if (tint) { const mats = (Array.isArray(m.material) ? m.material : [m.material]).map(x => { const k = (x as THREE.MeshStandardMaterial).clone(); k.color.lerp(new THREE.Color(tint), .35); return k; }); m.material = Array.isArray(m.material) ? mats : mats[0]; }
      }
    });
    const box = new THREE.Box3().setFromObject(c), size = box.getSize(new THREE.Vector3());
    const s = h ? h / size.y : (w ?? size.x) / size.x;
    const g = new THREE.Group(); c.scale.setScalar(s); g.add(c);
    const b2 = new THREE.Box3().setFromObject(g), ctr = b2.getCenter(new THREE.Vector3());
    c.position.set(-ctr.x, -b2.min.y, -ctr.z);
    return g;
  }, [scene, w, h, tint]);
  return <group rotation-y={ry} position-y={y}><primitive object={obj} /></group>;
}

export default function Prop({ fallback, ...o }: PropOpts & { fallback: ReactNode }) {
  return <Guard fallback={fallback}><Suspense fallback={fallback}><Model {...o} /></Suspense></Guard>;
}
