'use client';
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { AIR } from './CityScenery';
import { HelicopterBody } from './CityCars';
import { GAME } from './cityShared';

/** Step 8: first playable helicopter flight loop. Keyboard: Shift collective up, Space collective down,
 * W/S pitch forward/back, A/D yaw, E exit while landed, V chase/cockpit view. */
export const HELI = {
  x: AIR.x + 38, z: AIR.z + 22, y: 0, heading: 0, speed: 0, verticalSpeed: 0,
  pitch: 0, roll: 0, collective: 0, on: false, cam: 'out' as 'out' | 'in',
  obj: null as THREE.Group | null, padX: AIR.x + 38, padZ: AIR.z + 22,
};
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const ping = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event('arl-helicopter')); };
export const helicopterNear = (x: number, z: number) => !HELI.on && Math.hypot(x - HELI.x, z - HELI.z) < 9 && HELI.y < .5;
export function boardHelicopter(p: {x:number;z:number;y:number;vy:number;r:number}) {
  if (HELI.on || HELI.y > .5) return;
  HELI.on = true; HELI.collective = 0; HELI.speed = 0; HELI.verticalSpeed = 0; HELI.pitch = 0; HELI.roll = 0; HELI.cam = 'out';
  p.x = HELI.x; p.z = HELI.z; p.y = 0; p.vy = 0; p.r = HELI.heading;
  GAME.notice = '🚁 Helicopter ready: Shift lift · Space descend · W/S pitch · A/D yaw · E exit when landed · V camera'; ping();
}
export function exitHelicopter(p: {x:number;z:number;y:number;vy:number;r:number}) {
  if (!HELI.on || HELI.y > .65 || Math.abs(HELI.verticalSpeed) > 1.2 || HELI.speed > 2) {
    GAME.notice = '🚁 Land gently and come to a stop before exiting.'; return false;
  }
  HELI.on = false; HELI.collective = 0; HELI.speed = 0; HELI.verticalSpeed = 0; HELI.pitch = 0; HELI.roll = 0;
  const sx = Math.sin(HELI.heading), cz = -Math.cos(HELI.heading);
  p.x = HELI.x + sx * 3.2; p.z = HELI.z + cz * 3.2; p.y = 0; p.vy = 0; p.r = HELI.heading;
  GAME.notice = '🚁 Helicopter parked.'; ping(); return true;
}
export function toggleHelicopterView() {
  if (!HELI.on) return; HELI.cam = HELI.cam === 'out' ? 'in' : 'out';
  GAME.notice = HELI.cam === 'in' ? '🚁 Cockpit view · V to return' : '🚁 Chase view · V for cockpit'; ping();
}
export function stepHelicopter(dtRaw: number, c: {keys:Set<string>; joy:{x:number;y:number}; run:boolean; interact:boolean}, p: {x:number;z:number;y:number;vy:number;r:number}, camera: THREE.Camera, target: THREE.Vector3) {
  const dt = Math.min(.04, Math.max(0, dtRaw));
  if (c.interact) { c.interact = false; if (exitHelicopter(p)) return; }
  const k = c.keys;
  if (k.has('k')) { toggleHelicopterView(); k.delete('k'); }
  const lift = c.run || k.has('shift');
  const descend = k.has(' ') || k.has('control');
  HELI.collective = clamp(HELI.collective + (lift ? .52 : 0) * dt - (descend ? .68 : 0) * dt, 0, 1);
  const pitchInput = clamp((k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0) - c.joy.y, -1, 1);
  const yawInput = clamp((k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0) + c.joy.x, -1, 1);
  HELI.heading += yawInput * dt * (HELI.y > .8 ? 1.05 : .72);
  const wantedPitch = -pitchInput * .24;
  HELI.pitch += (wantedPitch - HELI.pitch) * Math.min(1, dt * 2.8);
  HELI.roll += ((-yawInput * .22) - HELI.roll) * Math.min(1, dt * 3);
  const liftForce = HELI.collective * 17.5;
  HELI.verticalSpeed += (liftForce - 9.81 - HELI.verticalSpeed * 1.65) * dt;
  HELI.verticalSpeed = clamp(HELI.verticalSpeed, -8, 8);
  HELI.y = clamp(HELI.y + HELI.verticalSpeed * dt, 0, 180);
  if (HELI.y === 0 && HELI.verticalSpeed < 0) HELI.verticalSpeed = 0;
  const targetSpeed = clamp(-HELI.pitch * 34, -8, 22);
  HELI.speed += (targetSpeed - HELI.speed) * Math.min(1, dt * (HELI.y > .5 ? 1.0 : 2.5));
  HELI.x += Math.cos(HELI.heading) * HELI.speed * dt;
  HELI.z += Math.sin(HELI.heading) * HELI.speed * dt;
  // Keep the aircraft inside the supported city play area.
  HELI.x = clamp(HELI.x, -820, 820); HELI.z = clamp(HELI.z, -820, 820);
  p.x = HELI.x; p.z = HELI.z; p.y = HELI.y; p.vy = HELI.verticalSpeed; p.r = HELI.heading;
  if (HELI.obj) {
    HELI.obj.position.set(HELI.x, HELI.y, HELI.z);
    // model nose is local +X; heading 0 faces world +X.
    HELI.obj.rotation.order = 'YXZ'; HELI.obj.rotation.set(HELI.roll, -HELI.heading, HELI.pitch);
  }
  const fwdX = Math.cos(HELI.heading), fwdZ = Math.sin(HELI.heading);
  if (HELI.cam === 'in') {
    camera.position.set(HELI.x + fwdX * 1.05, HELI.y + 1.2, HELI.z + fwdZ * 1.05);
    target.set(HELI.x + fwdX * 30, HELI.y + 1.0, HELI.z + fwdZ * 30);
  } else {
    camera.position.lerp(new THREE.Vector3(HELI.x - fwdX * 10, HELI.y + 4.6, HELI.z - fwdZ * 10), 1 - Math.exp(-dt * 4));
    target.set(HELI.x + fwdX * 2, HELI.y + 1.2, HELI.z + fwdZ * 2);
  }
  camera.lookAt(target);
}

/** Two marked helipads and the parked player helicopter at the airport. */
export function HelicopterPads() {
  const craft = useRef<THREE.Group>(null!);
  useEffect(() => { HELI.obj = craft.current; return () => { HELI.obj = null; }; }, []);
  useFrame(() => { if (!HELI.on && craft.current) { craft.current.position.set(HELI.x, 0, HELI.z); craft.current.rotation.set(0, -HELI.heading, 0); } });
  return <group>
    {[0, 1].map(i => <group key={i} position={[HELI.padX + (i ? 20 : 0), .025, HELI.padZ + (i ? 0 : 0)]}>
      <mesh rotation-x={-Math.PI/2} position={[0,-.01,0]}><circleGeometry args={[5.8, 32]} /><meshStandardMaterial color="#d5d9dc" roughness={.85} /></mesh>
      <mesh rotation-x={-Math.PI/2} position={[0,0,0]}><ringGeometry args={[4.9,5.15,32]} /><meshBasicMaterial color="#f5c84b" /></mesh>
      <mesh position={[0,.04,0]}><boxGeometry args={[.65,.025,3.2]} /><meshBasicMaterial color="#f5c84b" /></mesh>
      <mesh position={[0,.04,0]}><boxGeometry args={[3.2,.025,.65]} /><meshBasicMaterial color="#f5c84b" /></mesh>
    </group>)}
    <group ref={craft} position={[HELI.x, 0, HELI.z]}><HelicopterBody scale={1.25} /></group>
  </group>;
}
