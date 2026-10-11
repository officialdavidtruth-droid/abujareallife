'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { AIR } from './CityScenery';
import { BUILDS, GAME } from './cityShared';

/* ───────────── The airport plane (STEP 1: flying, single pilot) ─────────────
 * One plane waits on the runway. Walk up to it and press E to get in, then:
 *   Shift (hold) throttle up · Space (hold) throttle down / wheel brake · W / S nose down / up · A / D bank (turn in the air, steer on the ground)
 *   Phone: Sprint = throttle up, Jump = throttle down, joystick = pitch + bank.
 * Take off by rolling past ROTATE speed and pulling up. Land gently (low sink rate, wings level) and slow down to get out with E.
 * Anything solid (buildings) or a hard landing crashes it; it is towed back to the runway and you are put out beside it.
 *
 * Heading convention matches the player: forward = (sin h, cos h). The model's nose points along local +z.
 *   V (or the 📷 View button) switches between the OUTSIDE chase camera and the INSIDE cockpit camera.
 * Later step: STEP 3 passengers + network sync. */

export const PLANE = {
  x: AIR.x - 7, y: 0, z: AIR.z, h: Math.PI / 2, pitch: 0, roll: 0,
  speed: 0, throttle: 0,
  on: false,            // I am the pilot
  air: false,           // wheels are off the ground
  idleAt: 0,            // when the last pilot got out (for the auto-tow)
  cam: 'out' as 'out' | 'in',   // 'out' = chase camera behind the plane, 'in' = from the cockpit
  obj: null as THREE.Group | null,
};

const HOME = { x: AIR.x - 7, z: AIR.z, h: Math.PI / 2 };
const ROTATE = 26;      // m/s needed to lift off
const STALL = 22;       // m/s: below this in the air the nose drops
const VMAX = 62;
const CEILING = 220;
export const FLY_LIM = 850;   // the flyable area (the ground plane in CityWorld is sized to match)
const BOARD_R = 10;     // how close you must stand to board

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const ping = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event('arl-plane')); };
export function togglePlaneView() {
  if (!PLANE.on) return;
  PLANE.cam = PLANE.cam === 'out' ? 'in' : 'out'; camInit = false; applyView();
  GAME.notice = PLANE.cam === 'in' ? '👁️ Cockpit view (V to switch back)' : '🎥 Outside view (V for cockpit)';
  ping();
}

export const planeNear = (x: number, z: number) => !PLANE.on && !PLANE.air && Math.hypot(x - PLANE.x, z - PLANE.z) < BOARD_R;

function sync() {
  const o = PLANE.obj; if (!o) return;
  o.rotation.order = 'YXZ';
  o.position.set(PLANE.x, PLANE.y, PLANE.z);
  o.rotation.set(-PLANE.pitch, PLANE.h, PLANE.roll);
}

export function resetPlane() {
  PLANE.x = HOME.x; PLANE.z = HOME.z; PLANE.h = HOME.h; PLANE.y = 0; PLANE.pitch = 0; PLANE.roll = 0;
  PLANE.speed = 0; PLANE.throttle = 0; PLANE.air = false; PLANE.on = false; PLANE.cam = 'out'; applyView(); sync(); ping();
}

type P = { x: number; z: number; y: number; vy: number; r: number };

export function boardPlane(p: P) {
  PLANE.on = true; PLANE.throttle = 0; PLANE.cam = 'out'; camInit = false; applyView(); ping();
  p.x = PLANE.x; p.z = PLANE.z; p.y = 0; p.vy = 0;
  GAME.notice = '✈️ In the cockpit: hold Shift for throttle, pull back (S) after ~100 km/h to take off. V switches camera. E to get out on the ground.';
}

function crash(p: P, why: string) {
  resetPlane();
  p.x = HOME.x; p.z = HOME.z - 7; p.y = 0; p.vy = 0; p.r = 0;
  GAME.notice = `💥 ${why} The plane was towed back to the runway.`;
}

/** Called every frame while PLANE.on. `pushOut` keeps the player out of walls when they step out. */
export function stepPlane(dt: number, c: { keys: Set<string>; joy: { x: number; y: number }; run: boolean; jump: boolean; interact: boolean }, p: P, pushOut: (p: any) => void) {
  const k = c.keys;
  const ix = clamp((k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0) + c.joy.x, -1, 1);
  const iy = clamp((k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0) + c.joy.y, -1, 1);   // + = pull up
  const brake = k.has(' ');

  /* throttle */
  let T = PLANE.throttle;
  if (c.run || k.has('shift')) T += .5 * dt;
  if (brake) T -= .7 * dt;
  if (c.jump) { T -= .25; c.jump = false; }
  T = clamp(T, 0, 1); PLANE.throttle = T;

  /* get out */
  if (c.interact) {
    c.interact = false;
    if (PLANE.air) GAME.notice = '✈️ You are still in the air: land first.';
    else if (PLANE.speed > 8) GAME.notice = '✈️ Slow down first (hold Space to brake), then press E.';
    else {
      PLANE.on = false; PLANE.speed = 0; PLANE.throttle = 0; PLANE.idleAt = Date.now(); PLANE.cam = 'out'; applyView(); ping();
      const lx = Math.cos(PLANE.h), lz = -Math.sin(PLANE.h);   // the plane's left-hand side
      p.x = PLANE.x + lx * 6; p.z = PLANE.z + lz * 6; pushOut(p); p.r = Math.atan2(lx, lz); p.y = 0; p.vy = 0;
      sync();
      return;
    }
  }

  let s = PLANE.speed, pitch = PLANE.pitch, roll = PLANE.roll, h = PLANE.h;
  const air = PLANE.air;

  /* speed: thrust − drag − climbing − rolling friction / brakes */
  const thrust = T * 14, drag = .0036 * s * s, climb = Math.sin(pitch) * 9.8 * .55;
  const fric = air ? 0 : 1.2 + (brake ? 9 : 0);
  s = clamp(s + (thrust - drag - climb - (s > .05 ? fric : 0)) * dt, 0, VMAX);

  /* pitch: the stick tilts the nose and the attitude is HELD when you let go (it only drifts back to level slowly), so a gentle descent is easy to keep.
     Too slow in the air = stall: the nose is forced down until you speed up again. */
  const stall = air ? clamp((STALL - s) / 8, 0, 1) : 0;
  const maxUp = .5 * clamp((s - 18) / 14, 0, 1);
  let np = pitch;
  if (iy) np += iy * .95 * dt; else np -= np * (1 - Math.exp(-dt / 6));
  const lo = air ? -.5 : 0, hi = air ? maxUp - stall * .6 : (s >= ROTATE ? .5 : 0);
  np = Math.max(lo, Math.min(np, hi));
  pitch += clamp(np - pitch, -1.4 * dt, 1.4 * dt);

  /* roll + turning */
  if (air) {
    roll += (ix * .75 - roll) * (1 - Math.exp(-3 * dt));
    h -= roll * .9 * clamp(s / 35, 0, 1) * dt;
  } else {
    roll += (0 - roll) * (1 - Math.exp(-8 * dt));
    h -= ix * .55 * clamp(s / 6, 0, 1) * (s > 40 ? 40 / s : 1) * dt;      // nose-wheel steering
  }

  /* move */
  const hv = Math.cos(pitch) * s;
  PLANE.x += Math.sin(h) * hv * dt; PLANE.z += Math.cos(h) * hv * dt;
  let y = PLANE.y, nowAir = air;
  if (!air && pitch > .06 && s >= ROTATE * .95) nowAir = true;      // rotated: wheels leave the runway
  if (nowAir) {
    y += Math.sin(pitch) * s * dt - stall * stall * 14 * dt;
    if (y > CEILING) { y = CEILING; pitch = Math.min(pitch, 0); }
    if (y <= 0) {
      const sink = Math.sin(pitch) * s;
      if (sink < -11 || Math.abs(roll) > .5 || pitch < -.35) { crash(p, 'Hard landing!'); return; }
      y = 0; nowAir = false; roll = 0;
    }
  } else y = 0;

  /* buildings are solid: hitting one at roof height or below is a crash */
  if (nowAir || s > 3) {
    for (const b of BUILDS) {
      if (y > b.h + 1) continue;
      if (Math.abs(PLANE.x - b.x) < b.w / 2 + 3 && Math.abs(PLANE.z - b.z) < b.d / 2 + 3) { crash(p, 'You hit a building!'); return; }
    }
  }
  if (Math.abs(PLANE.x) > FLY_LIM || Math.abs(PLANE.z) > FLY_LIM) { PLANE.x = clamp(PLANE.x, -FLY_LIM, FLY_LIM); PLANE.z = clamp(PLANE.z, -FLY_LIM, FLY_LIM); h += Math.PI; GAME.notice = '✈️ Edge of the map: turning you around.'; }

  PLANE.speed = s; PLANE.pitch = pitch; PLANE.roll = roll; PLANE.h = h; PLANE.y = y; PLANE.air = nowAir;
  p.x = PLANE.x; p.z = PLANE.z; p.y = 0; p.vy = 0; p.r = h;
  sync();
}

export const planePrompt = () => PLANE.on
  ? `✈ ${Math.round(PLANE.speed * 3.6)} km/h · ${Math.round(PLANE.y)} m · throttle ${Math.round(PLANE.throttle * 100)}% · Shift +  Space − · W/S pitch · A/D bank · V view${PLANE.air ? '' : ' · E out'}`
  : '';

/* ───────────── cameras: outside (chase) and inside (cockpit) ───────────── */
const camP = new THREE.Vector3(), look = new THREE.Vector3(), eye = new THREE.Vector3(), flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI), tq = new THREE.Quaternion();
let camInit = false;
const EYE = new THREE.Vector3(0, 2.72, 4.7);   // the pilot's head, in the plane's own coordinates

export function planeCamera(cam: THREE.Camera, target: THREE.Vector3, dt: number) {
  if (PLANE.cam === 'in' && PLANE.obj) {
    /* cockpit: the camera is glued to the pilot's head and banks / pitches with the plane, so the horizon tilts like the real thing */
    PLANE.obj.updateMatrixWorld(true);
    eye.copy(EYE); PLANE.obj.localToWorld(eye);
    cam.position.copy(eye);
    PLANE.obj.getWorldQuaternion(tq); cam.quaternion.copy(tq).multiply(flip);   // the camera looks down -z, the nose points down +z
    look.set(0, 0, 10); PLANE.obj.localToWorld(look); target.copy(look);
    return;
  }
  const sh = Math.sin(PLANE.h), ch = Math.cos(PLANE.h);
  const back = 19 + PLANE.speed * .05, up = 6 + Math.max(0, PLANE.pitch) * 6;
  const wx = PLANE.x - sh * back, wy = Math.max(PLANE.y + up, 2.2), wz = PLANE.z - ch * back;
  if (!camInit) { camP.set(wx, wy, wz); camInit = true; }
  else { const kk = 1 - Math.exp(-dt * 4.5); camP.x += (wx - camP.x) * kk; camP.y += (wy - camP.y) * kk; camP.z += (wz - camP.z) * kk; }
  look.set(PLANE.x + sh * 12, PLANE.y + 2 + Math.sin(PLANE.pitch) * 8, PLANE.z + ch * 12);
  cam.position.copy(camP); cam.lookAt(look); target.copy(look);
}

/* Which parts are drawn: from the cockpit the hull is hidden (you would see its inside) and a dashboard + window frame is shown instead. */
const VIEW = { hull: null as THREE.Object3D | null, cockpit: null as THREE.Object3D | null };
function applyView() {
  const inside = PLANE.cam === 'in' && PLANE.on;
  if (VIEW.hull) VIEW.hull.visible = !inside;
  if (VIEW.cockpit) VIEW.cockpit.visible = inside;
}

/* ───────────── the plane itself ───────────── */
const W = '#f4f6f8', G = '#1d8a4a', D = '#1b2a35', GR = '#8b949c';
const M = (c: string, m = .2, r = .55) => <meshStandardMaterial color={c} metalness={m} roughness={r} />;

export function Plane() {
  const g = useRef<THREE.Group>(null!);
  const hull = useRef<THREE.Group>(null!), cockpit = useRef<THREE.Group>(null!);
  useEffect(() => { PLANE.obj = g.current; VIEW.hull = hull.current; VIEW.cockpit = cockpit.current; applyView(); sync(); return () => { PLANE.obj = null; VIEW.hull = null; VIEW.cockpit = null; }; }, []);
  /* V switches the view while flying */
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.code !== 'KeyV' || e.repeat || !PLANE.on) return;
      const t = e.target as HTMLElement | null; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      togglePlaneView();
    };
    window.addEventListener('keydown', kd); return () => window.removeEventListener('keydown', kd);
  }, []);
  /* a plane left on the grass or in the city is towed back to the runway after 90 s (nobody flying it) */
  useEffect(() => {
    const i = setInterval(() => {
      if (PLANE.on || PLANE.air || !PLANE.idleAt) return;
      if (Date.now() - PLANE.idleAt > 90000 && Math.hypot(PLANE.x - HOME.x, PLANE.z - HOME.z) > 25) { resetPlane(); PLANE.idleAt = 0; }
    }, 5000);
    return () => clearInterval(i);
  }, []);
  return <group ref={g}>
    <group position={[0, 2.05, 0]}>
      <group ref={hull}>
      {/* fuselage + nose + tail */}
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[1.15, 1.15, 11, 20]} />{M(W)}</mesh>
      <mesh position={[0, 0, 7.5]} rotation={[Math.PI / 2, 0, 0]} castShadow><coneGeometry args={[1.15, 3, 20]} />{M(W)}</mesh>
      <mesh position={[0, .25, -6.5]} rotation={[-Math.PI / 2, 0, 0]} castShadow><coneGeometry args={[1.15, 3, 20]} />{M(W)}</mesh>
      {/* belly stripe + windows + windscreen */}
      <mesh position={[0, -.52, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[1.17, 1.17, 11, 20, 1, false, Math.PI * .72, Math.PI * .56]} />{M(G)}</mesh>
      {[-1, 1].map(sx => <mesh key={sx} position={[sx * 1.1, .35, 0]}><boxGeometry args={[.06, .34, 7.5]} />{M(D, .6, .2)}</mesh>)}
      <mesh position={[0, .7, 6.35]} rotation={[-.45, 0, 0]}><boxGeometry args={[1.7, .5, 1.2]} />{M(D, .7, .15)}</mesh>
      </group>
      {/* cockpit interior: only drawn in the inside view */}
      <group ref={cockpit} visible={false}>
        <mesh position={[0, -.12, 3.55]}><boxGeometry args={[2.3, .55, .9]} />{M('#23282d', .1, .8)}</mesh>
        <mesh position={[0, .22, 3.55]}><boxGeometry args={[1.5, .12, .5]} />{M('#0d1114', .2, .6)}</mesh>
        {[-.5, 0, .5].map(x => <mesh key={x} position={[x, .3, 3.3]} rotation={[-.9, 0, 0]}><boxGeometry args={[.32, .22, .02]} /><meshBasicMaterial color={x === 0 ? '#38d27a' : '#3aa0ff'} /></mesh>)}
        <mesh position={[0, -.05, 2.9]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[.22, .035, 8, 18]} />{M('#111', .2, .7)}</mesh>
        <mesh position={[0, -.3, 2.9]}><cylinderGeometry args={[.04, .04, .5, 8]} />{M('#111', .2, .7)}</mesh>
        {[-1, 1].map(sx => <mesh key={sx} position={[sx * 1.02, .55, 3.1]} rotation={[0, 0, sx * -.12]}><boxGeometry args={[.1, 1.5, .14]} />{M('#23282d', .1, .8)}</mesh>)}
        <mesh position={[0, 1.18, 3.2]}><boxGeometry args={[2.1, .12, .8]} />{M('#23282d', .1, .8)}</mesh>
      </group>
      {/* wings, tailplane, fin */}
      <mesh position={[0, -.35, .6]} castShadow><boxGeometry args={[14, .2, 2.8]} />{M(W)}</mesh>
      {[-1, 1].map(sx => <mesh key={sx} position={[sx * 7, -.2, .6]}><boxGeometry args={[.25, .9, 1.6]} />{M(G)}</mesh>)}
      <mesh position={[0, .45, -6.4]} castShadow><boxGeometry args={[5.4, .14, 1.5]} />{M(W)}</mesh>
      <mesh position={[0, 1.85, -6.3]} castShadow><boxGeometry args={[.16, 2.5, 1.9]} />{M(G)}</mesh>
      {/* engines */}
      {[-1, 1].map(sx => <group key={sx} position={[sx * 3.7, -1, 1.1]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[.5, .5, 2.2, 14]} />{M(GR, .6, .35)}</mesh>
        <mesh position={[0, 0, 1.12]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.36, .36, .06, 14]} />{M(D, .3, .8)}</mesh>
      </group>)}
    </group>
    {/* landing gear (wheel bottoms sit on y = 0) */}
    {[[0, 4.2], [-1.7, -.4], [1.7, -.4]].map(([x, z], i) => <group key={i} position={[x, 0, z]}>
      <mesh position={[0, .38, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[.38, .38, .32, 12]} />{M('#15181b', 0, .9)}</mesh>
      <mesh position={[0, 1, 0]}><boxGeometry args={[.12, 1.2, .12]} />{M(GR, .6, .4)}</mesh>
    </group>)}
  </group>;
}
