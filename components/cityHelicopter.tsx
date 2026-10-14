'use client';
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { AIR } from './CityScenery';
import { HelicopterBody } from './CityCars';
import { BUILDS, GAME } from './cityShared';

/** Step 8: first playable helicopter flight loop. Keyboard: Shift collective up, Space collective down,
 * W/S pitch forward/back, A/D yaw, E exit while landed, V chase/cockpit view. */
export const HELI = {
  x: AIR.x + 38, z: AIR.z + 22, y: 0, heading: 0, speed: 0, verticalSpeed: 0,
  pitch: 0, roll: 0, collective: 0, on: false, cam: 'out' as 'out' | 'in',
  obj: null as THREE.Group | null, padX: AIR.x + 38, padZ: AIR.z + 22, owned: false, vehicleId: '', damage: 0, lastSync: 0, lastImpactAt: 0,
};
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const ping = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event('arl-helicopter')); };
export const helicopterNear = (x: number, z: number) => !HELI.on && Math.hypot(x - HELI.x, z - HELI.z) < 9 && HELI.y < .5;
export async function boardHelicopter(p: {x:number;z:number;y:number;vy:number;r:number}) {
  if (HELI.on || HELI.y > .5) return;
  if (!HELI.owned || !HELI.vehicleId) { GAME.notice = '🚁 Buy a helicopter in your garage/dealership before boarding.'; ping(); return; }
  try { const r = await fetch('/api/vehicles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'takeout', vehicleId: HELI.vehicleId }) }); const d = await r.json().catch(() => ({})); if (!r.ok) { GAME.notice = String(d.error || 'Could not take out your helicopter.'); ping(); return; } } catch { GAME.notice = 'Could not connect to the garage. Try again.'; ping(); return; }
  HELI.on = true; HELI.collective = 0; HELI.speed = 0; HELI.verticalSpeed = 0; HELI.pitch = 0; HELI.roll = 0; HELI.cam = 'out';
  p.x = HELI.x; p.z = HELI.z; p.y = 0; p.vy = 0; p.r = HELI.heading;
  GAME.notice = '🚁 Helicopter ready: Shift lift · Space descend · W/S pitch · A/D yaw · E exit when landed · V camera'; ping();
}
export function exitHelicopter(p: {x:number;z:number;y:number;vy:number;r:number}) {
  if (!HELI.on || HELI.y > .65 || Math.abs(HELI.verticalSpeed) > 1.2 || HELI.speed > 2) {
    GAME.notice = '🚁 Land gently and come to a stop before exiting.'; return false;
  }
  HELI.on = false; HELI.collective = 0; HELI.speed = 0; HELI.verticalSpeed = 0; HELI.pitch = 0; HELI.roll = 0; window.dispatchEvent(new CustomEvent('arl-heli-pose', { detail: { on: false } })); fetch('/api/vehicles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'park', vehicleId: HELI.vehicleId, at: 'Airport Helipad' }) }).catch(() => {});
  const sx = Math.sin(HELI.heading), cz = -Math.cos(HELI.heading);
  p.x = HELI.x + sx * 3.2; p.z = HELI.z + cz * 3.2; p.y = 0; p.vy = 0; p.r = HELI.heading;
  GAME.notice = '🚁 Helicopter parked.'; ping(); return true;
}
export function toggleHelicopterView() {
  if (!HELI.on) return; HELI.cam = HELI.cam === 'out' ? 'in' : 'out';
  GAME.notice = HELI.cam === 'in' ? '🚁 Cockpit view · V to return' : '🚁 Chase view · V for cockpit'; ping();
}
function helicopterBuildingCollision(x: number, z: number, y: number) {
  // Aircraft body/rotor envelope is wider than a car; at low altitude, prevent entry into building footprints.
  const radius = 2.5;
  for (const b of BUILDS) {
    const top = Math.max(5, Number(b.h) || 10);
    if (y > top + 1.5) continue;
    if (x > b.x - b.w / 2 - radius && x < b.x + b.w / 2 + radius && z > b.z - b.d / 2 - radius && z < b.z + b.d / 2 + radius) return { id: b.id, top };
  }
  return null;
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
  const nextX = clamp(HELI.x + Math.cos(HELI.heading) * HELI.speed * dt, -820, 820);
  const nextZ = clamp(HELI.z + Math.sin(HELI.heading) * HELI.speed * dt, -820, 820);
  const obstacle = helicopterBuildingCollision(nextX, nextZ, HELI.y);
  if (obstacle) {
    // Stop horizontal penetration and apply a small impact penalty. Low-altitude contact settles the craft beside the building.
    HELI.speed = 0; HELI.pitch *= .35; HELI.roll *= .35; HELI.damage = Math.min(100, HELI.damage + Math.max(2, Math.round(Math.abs(targetSpeed) * 1.4)));
    if (performance.now() - HELI.lastImpactAt > 1200) { HELI.lastImpactAt = performance.now(); fetch('/api/vehicles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'collision', vehicleId: HELI.vehicleId, speedKph: Math.max(8, Math.abs(targetSpeed) * 3.6), zone: 'front', severity: Math.min(1, Math.max(.15, Math.abs(targetSpeed) / 22)) }) }).catch(() => {}); }
    if (HELI.y < obstacle.top + 2) { HELI.verticalSpeed = Math.min(0, HELI.verticalSpeed); HELI.y = Math.max(0, Math.min(HELI.y, obstacle.top + 2)); }
    GAME.notice = `🚁 Building impact! Helicopter damage ${HELI.damage}%. Move away from structures.`;
  } else { HELI.x = nextX; HELI.z = nextZ; }
  // Keep the aircraft inside the supported city play area.
  HELI.x = clamp(HELI.x, -820, 820); HELI.z = clamp(HELI.z, -820, 820);
  p.x = HELI.x; p.z = HELI.z; p.y = HELI.y; p.vy = HELI.verticalSpeed; p.r = HELI.heading;
  const now = performance.now(); if (now - HELI.lastSync > 100) { HELI.lastSync = now; window.dispatchEvent(new CustomEvent('arl-heli-pose', { detail: { on: true, pose: [HELI.x, HELI.z, HELI.heading, HELI.y, HELI.pitch, HELI.roll, HELI.speed, HELI.verticalSpeed] } })); }
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
  const pilot = useRef<THREE.Group>(null!);
  useFrame(() => { if (!HELI.on && craft.current) { craft.current.position.set(HELI.x, 0, HELI.z); craft.current.rotation.set(0, -HELI.heading, 0); } if (pilot.current) { pilot.current.visible = HELI.on; const cs = Math.cos(HELI.heading), sn = Math.sin(HELI.heading); pilot.current.position.set(HELI.x + cs * .78, HELI.y + .83 + Math.sin(performance.now() / 150) * .012, HELI.z + sn * .78); pilot.current.rotation.y = -HELI.heading; } });
  return <group>
    {[0, 1].map(i => <group key={i} position={[HELI.padX + (i ? 20 : 0), .025, HELI.padZ + (i ? 0 : 0)]}>
      <mesh rotation-x={-Math.PI/2} position={[0,-.01,0]}><circleGeometry args={[5.8, 32]} /><meshStandardMaterial color="#d5d9dc" roughness={.85} /></mesh>
      <mesh rotation-x={-Math.PI/2} position={[0,0,0]}><ringGeometry args={[4.9,5.15,32]} /><meshBasicMaterial color="#f5c84b" /></mesh>
      <mesh position={[0,.04,0]}><boxGeometry args={[.65,.025,3.2]} /><meshBasicMaterial color="#f5c84b" /></mesh>
      <mesh position={[0,.04,0]}><boxGeometry args={[3.2,.025,.65]} /><meshBasicMaterial color="#f5c84b" /></mesh>
    </group>)}
    <group ref={craft} position={[HELI.x, 0, HELI.z]}><HelicopterBody scale={1.25} /></group>
    <group ref={pilot} position={[HELI.x + .78, HELI.y + .83, HELI.z]} rotation-y={-HELI.heading}>
      <mesh position={[0,-.14,0]}><capsuleGeometry args={[.16,.34,4,8]} /><meshStandardMaterial color="#263b4a" /></mesh>
      <mesh position={[.02,-.35,.11]} rotation-x={-.85}><capsuleGeometry args={[.07,.28,4,8]} /><meshStandardMaterial color="#263b4a" /></mesh>
      <mesh position={[.02,-.35,-.11]} rotation-x={-.85}><capsuleGeometry args={[.07,.28,4,8]} /><meshStandardMaterial color="#263b4a" /></mesh>
      <mesh position={[.02,.12,0]}><sphereGeometry args={[.13,12,10]} /><meshStandardMaterial color="#9a6948" /></mesh>
      <mesh position={[.05,.14,0]}><sphereGeometry args={[.135,12,8]} /><meshStandardMaterial color="#20242a" /></mesh>
      <mesh position={[.08,-.12,.17]} rotation-z={-.6}><capsuleGeometry args={[.055,.23,4,8]} /><meshStandardMaterial color="#263b4a" /></mesh>
      <mesh position={[.08,-.12,-.17]} rotation-z={-.6}><capsuleGeometry args={[.055,.23,4,8]} /><meshStandardMaterial color="#263b4a" /></mesh>
    </group>
  </group>;
}
