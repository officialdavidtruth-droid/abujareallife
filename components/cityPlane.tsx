'use client';
import { WATER_Y, terrainH } from '../lib/terrain';
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { AIR } from './CityScenery';
import { BUILDS, GAME, NIGHT } from './cityShared';
import { hint } from '../lib/touch';

/* ───────────── The airport plane (STEP 1: flying, single pilot) ─────────────
 * One plane waits on the runway. Walk up to it and press E to get in, then:
 *   Shift (hold) throttle up · Space (hold) throttle down / wheel brake · W / S nose down / up · A / D bank (turn in the air, steer on the ground)
 *   Phone: Sprint = throttle up, Jump = throttle down, joystick = pitch + bank.
 * Take off by rolling past ROTATE speed and pulling up. Land gently (low sink rate, wings level) and slow down to get out with E.
 * Anything solid (buildings) or a hard landing crashes it; it is towed back to the runway and you are put out beside it.
 *
 * Heading convention matches the player: forward = (sin h, cos h). The model's nose points along local +z.
 *   V (or the 📷 View button) switches between the OUTSIDE chase camera and the INSIDE cockpit camera.
 * AIRPORT STEP 3 (take-off and landing): gear and flaps run themselves (gear up after lift-off, down on the way in; flaps out when slow and low) and show on the plane + HUD;
 *   flaps lower the stall and rotate speeds, gear and flaps add drag; ground effect softens the flare; touchdown is graded (smooth / firm / hard) and a gear-up landing, wing strike, nose-first
 *   touchdown or a hard hit off the runway crashes; grass slows you hard.
 * Later step: STEP 3 passengers + network sync.
 *
 * AIRPORT STEP 1 (onboard process): pressing E next to the plane no longer snaps you into the seat.
 *   BOARDING: the airstair is parked at the left-hand door, the door opens, your character walks to the stairs, climbs up and goes in,
 *             the door closes, the engines spool up (fans turn), and only then do the controls come alive. E / Exit-plane skips the show.
 *   LEAVING:  park (under 2 m/s on the ground), press E: the engines wind down, the door opens, your character walks down the stairs and away.
 *   While a sequence runs, PLANE.bd is set (controls are locked, physics frozen) and PLANE.walk says where CityWorld draws the character. */

export const PLANE = {
  x: AIR.x - 7, y: 0, z: AIR.z, h: Math.PI / 2, pitch: 0, roll: 0,
  speed: 0, throttle: 0,
  on: false,            // I am the pilot
  pax: false,           // I am a passenger in somebody else's flight
  remote: '',           // name of the OTHER player who is flying the plane right now ('' = nobody): their flight is mirrored onto this plane
  me: '',               // my own player name (set by the scene)
  air: false,           // wheels are off the ground
  idleAt: 0,            // when the last pilot got out (for the auto-tow)
  cam: 'out' as 'out' | 'in',   // 'out' = chase camera behind the plane, 'in' = from the cockpit
  obj: null as THREE.Group | null,
  bd: null as null | { mode: 'in' | 'out'; t: number; sx: number; sz: number; dA: number },   // boarding / leaving sequence in progress
  walk: { on: false, x: 0, y: 0, z: 0, r: 0 },   // where CityWorld draws my character while a sequence runs
  door: 0, doorT: 0,    // door opening 0 (shut) .. 1 (open), and where it is heading
  gear: 1, flap: 0, vs: 0, gearUp: false, rotCalled: false,   // 1 = gear down / flaps out; vertical speed (m/s); set by the Plane component every frame (pilot and mirrored alike)
  eng: 0, engOn: false, // engine spool 0..1 (fans), and whether the pilot has the engines running
};

export const HOME = { x: AIR.x - 7, z: AIR.z, h: Math.PI / 2 };
const ROTATE = 26;      // m/s needed to lift off
const STALL = 22;       // m/s: below this in the air the nose drops
const VMAX = 62;
const CEILING = 220;
export const FLY_LIM = 850;   // the flyable area (the ground plane in CityWorld is sized to match)
const BOARD_R = 10;     // how close you must stand to board

const onRunway = (x: number, z: number) => x > AIR.x - 11 * AIR.s - 2 && x < AIR.x + 89 * AIR.s + 2 && Math.abs(z - AIR.z) < 3.5 * AIR.s + 3;   // runway + apron
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const ping = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event('arl-plane')); };
export function togglePlaneView() {
  if ((!PLANE.on && !PLANE.pax) || PLANE.bd) return;
  PLANE.cam = PLANE.cam === 'out' ? 'in' : 'out'; camInit = false; applyView();
  GAME.notice = PLANE.cam === 'in' ? '👁️ Cockpit view (V to switch back)' : '🎥 Outside view (V for cockpit)';
  ping();
}

export const planeNear = (x: number, z: number) => !PLANE.on && !PLANE.pax && !PLANE.remote && !PLANE.air && Math.hypot(x - PLANE.x, z - PLANE.z) < BOARD_R;

export function syncPlane() { sync(); }
/** The camera restarts behind the plane (used when a passenger gets in or out). */
export function planeCamReset() { camInit = false; PLANE.cam = 'out'; applyView(); }

/** Throw me out of the pilot seat without the usual checks (somebody else got in first): I stand beside the plane. */
export function ejectPilot(p: P) {
  PLANE.on = false; PLANE.throttle = 0; PLANE.cam = 'out'; PLANE.bd = null; PLANE.walk.on = false; PLANE.engOn = false; PLANE.doorT = 0; applyView(); ping();
  const lx = Math.cos(PLANE.h), lz = -Math.sin(PLANE.h);
  p.x = PLANE.x + lx * 6; p.z = PLANE.z + lz * 6; p.r = Math.atan2(lx, lz); p.y = 0; p.vy = 0;
  sync();
}

function sync() {
  const o = PLANE.obj; if (!o) return;
  o.rotation.order = 'YXZ';
  o.position.set(PLANE.x, PLANE.y, PLANE.z);
  o.rotation.set(-PLANE.pitch, PLANE.h, PLANE.roll);
}

export function resetPlane() {
  PLANE.x = HOME.x; PLANE.z = HOME.z; PLANE.h = HOME.h; PLANE.y = 0; PLANE.pitch = 0; PLANE.roll = 0;
  PLANE.speed = 0; PLANE.throttle = 0; PLANE.air = false; PLANE.on = false; PLANE.cam = 'out'; PLANE.bd = null; PLANE.walk.on = false; PLANE.engOn = false; PLANE.doorT = 0; PLANE.gear = 1; PLANE.flap = 0; PLANE.gearUp = false; PLANE.rotCalled = false; applyView(); sync(); ping();
}

type P = { x: number; z: number; y: number; vy: number; r: number };

export function boardPlane(p: P) {
  PLANE.on = true; PLANE.throttle = 0; PLANE.speed = 0; PLANE.cam = 'out'; camInit = false; applyView(); ping();
  const f = toWorld(SEQ.foot[0], SEQ.foot[2]);
  PLANE.bd = { mode: 'in', t: 0, sx: p.x, sz: p.z, dA: clamp(Math.hypot(f.x - p.x, f.z - p.z) / 4.5, .6, 2.4) };
  PLANE.doorT = 1; PLANE.engOn = false;
  PLANE.walk.on = true; PLANE.walk.x = p.x; PLANE.walk.y = 0; PLANE.walk.z = p.z; PLANE.walk.r = Math.atan2(f.x - p.x, f.z - p.z);
  GAME.notice = '✈️ Boarding… ' + hint('tap Exit plane to skip', 'press E to skip');
}

/* ───────────── boarding / leaving sequence (the door is on the left, the airstair stands at it) ───────────── */
const SEQ = { foot: [4.2, 0, 2.4], top: [1.3, 1.4, 2.4], cab: [.3, 1.4, 2.4], away: [6.2, 0, 2.4] };   // plane-local points (+x = left side, +z = nose)
const B1 = 1.3, B2 = .5, CLOSE = .9, ENG_T = 2.0;      // boarding: stairs up, into the door, door closes, engines start
const O0 = .9, O1 = .5, O2 = 1.3, O3 = .7;             // leaving: door opens, out of the door, stairs down, walk away
const toWorld = (lx: number, lz: number) => { const c = Math.cos(PLANE.h), s = Math.sin(PLANE.h); return { x: PLANE.x + lx * c + lz * s, z: PLANE.z - lx * s + lz * c }; };
const ramp = (lx: number) => clamp((4 - lx) * .5, 0, 1.4);   // height of the stairs above the ground at plane-local x
const mix = (a: number, b: number, k: number) => a + (b - a) * k;

/** The character at plane-local (lx, lz) on the stairs (or the ground), walking in the direction (dx, dz) given in plane-local terms. */
function walkAt(lx: number, lz: number, dlx: number) {
  const w = toWorld(lx, lz), W = PLANE.walk, c = Math.cos(PLANE.h), s = Math.sin(PLANE.h);
  W.on = true; W.x = w.x; W.z = w.z; W.y = ramp(lx);
  W.r = Math.atan2(dlx * c, -dlx * s);   // local +x is world (cos h, -sin h)
}

function stepSeq(dt: number, c: { interact: boolean }, p: P, pushOut: (p: any) => void) {
  const bd = PLANE.bd!; bd.t += dt;
  const skip = c.interact; c.interact = false;
  PLANE.speed = 0; PLANE.throttle = 0; PLANE.pitch = 0; PLANE.roll = 0; PLANE.y = 0;
  const F = SEQ.foot, T = SEQ.top, C = SEQ.cab, A = SEQ.away;

  if (bd.mode === 'in') {
    const tA = bd.dA, tB = tA + B1, tC = tB + B2, tD = tC + CLOSE, tE = tD + ENG_T;
    const t = skip ? tE : bd.t;
    if (t < tA) {   /* walk across the apron to the foot of the stairs */
      const f = toWorld(F[0], F[2]), k = t / tA, W = PLANE.walk;
      W.on = true; W.x = mix(bd.sx, f.x, k); W.z = mix(bd.sz, f.z, k); W.y = 0; W.r = Math.atan2(f.x - bd.sx, f.z - bd.sz);
      p.x = W.x; p.z = W.z; p.r = W.r;
    } else if (t < tB) { const k = (t - tA) / B1; walkAt(mix(F[0], T[0], k), F[2], -1); p.x = PLANE.walk.x; p.z = PLANE.walk.z; p.r = PLANE.walk.r; }
    else if (t < tC) { const k = (t - tB) / B2; walkAt(mix(T[0], C[0], k), T[2], -1); p.x = PLANE.walk.x; p.z = PLANE.walk.z; p.r = PLANE.walk.r; }
    else { PLANE.walk.on = false; p.x = PLANE.x; p.z = PLANE.z; p.r = PLANE.h; PLANE.doorT = 0; }
    if (t >= tD && !PLANE.engOn) { PLANE.engOn = true; camInit = false; GAME.notice = '✈️ Engines starting…'; }
    if (t >= tE) {
      PLANE.bd = null; PLANE.walk.on = false; PLANE.engOn = true; PLANE.doorT = 0; PLANE.door = Math.min(PLANE.door, 0); ping();
      p.x = PLANE.x; p.z = PLANE.z; p.y = 0; p.vy = 0; p.r = PLANE.h; camInit = false;
      GAME.notice = '✈️ Ready: ' + hint('hold Sprint for throttle, pull the stick down after ~100 km/h to take off. Tap View to switch camera. Tap Exit plane to get out on the ground.', 'hold Shift for throttle, pull back (S) after ~100 km/h to take off. V switches camera. E to get out on the ground.');
    }
    return;
  }

  /* leaving */
  const tA = O0, tB = tA + O1, tC = tB + O2, tD = tC + O3;
  const t = skip ? tD : bd.t;
  PLANE.engOn = false; PLANE.doorT = 1;
  if (t < tA) { PLANE.walk.on = false; p.x = PLANE.x; p.z = PLANE.z; p.r = PLANE.h; }
  else if (t < tB) { const k = (t - tA) / O1; walkAt(mix(C[0], T[0], k), T[2], 1); p.x = PLANE.walk.x; p.z = PLANE.walk.z; p.r = PLANE.walk.r; }
  else if (t < tC) { const k = (t - tB) / O2; walkAt(mix(T[0], F[0], k), F[2], 1); p.x = PLANE.walk.x; p.z = PLANE.walk.z; p.r = PLANE.walk.r; }
  else if (t < tD) { const k = (t - tC) / O3; walkAt(mix(F[0], A[0], k), A[2], 1); p.x = PLANE.walk.x; p.z = PLANE.walk.z; p.r = PLANE.walk.r; }
  if (t >= tD) {
    walkAt(A[0], A[2], 1);
    PLANE.on = false; PLANE.bd = null; PLANE.walk.on = false; PLANE.speed = 0; PLANE.throttle = 0; PLANE.idleAt = Date.now(); PLANE.cam = 'out'; PLANE.doorT = 0; applyView(); ping();
    p.x = PLANE.walk.x; p.z = PLANE.walk.z; pushOut(p); p.r = PLANE.walk.r; p.y = 0; p.vy = 0;
    sync();
  }
}

function crash(p: P, why: string) {
  resetPlane();
  p.x = HOME.x; p.z = HOME.z - 7; p.y = 0; p.vy = 0; p.r = 0;
  GAME.notice = `💥 ${why} The plane was towed back to the runway.`;
}

/** Called every frame while PLANE.on. `pushOut` keeps the player out of walls when they step out. */
export function stepPlane(dt: number, c: { keys: Set<string>; joy: { x: number; y: number }; run: boolean; jump: boolean; interact: boolean }, p: P, pushOut: (p: any) => void) {
  if (PLANE.bd) { stepSeq(dt, c, p, pushOut); return; }   // boarding / leaving: controls are locked, the physics wait
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

  /* get out: park first, then the door opens and you walk down the stairs (stepSeq) */
  if (c.interact) {
    c.interact = false;
    if (PLANE.air) GAME.notice = '✈️ You are still in the air: land first.';
    else if (PLANE.speed > 2) GAME.notice = '✈️ Stop the plane first (hold Space to brake), then press E.';
    else {
      PLANE.speed = 0; PLANE.throttle = 0; PLANE.bd = { mode: 'out', t: 0, sx: p.x, sz: p.z, dA: 0 }; PLANE.doorT = 1; PLANE.engOn = false; PLANE.cam = 'out'; camInit = false; applyView(); ping();
      GAME.notice = '✈️ Leaving the plane… ' + hint('tap Exit plane to skip', 'press E to skip');
      return;
    }
  }

  let s = PLANE.speed, pitch = PLANE.pitch, roll = PLANE.roll, h = PLANE.h;
  const air = PLANE.air;

  /* speed: thrust − drag − climbing − rolling friction / brakes */
  const fl = PLANE.flap, gr = PLANE.gear, rot = ROTATE - 2 * fl, stallV = STALL - 4 * fl, onRwy = onRunway(PLANE.x, PLANE.z);
  const thrust = T * 14, drag = (.0036 + fl * .0012 + gr * .0007) * s * s, climb = Math.sin(pitch) * 9.8 * .55;
  const fric = air ? 0 : (onRwy ? 1.2 : 3.4) + (brake ? 9 : 0);   // grass drags
  s = clamp(s + (thrust - drag - climb - (s > .05 ? fric : 0)) * dt, 0, VMAX);

  /* pitch: the stick tilts the nose and the attitude is HELD when you let go (it only drifts back to level slowly), so a gentle descent is easy to keep.
     Too slow in the air = stall: the nose is forced down until you speed up again. */
  const stall = air ? clamp((stallV - s) / 8, 0, 1) : 0;
  const maxUp = .5 * clamp((s - 18) / 14, 0, 1);
  let np = pitch;
  if (iy) np += iy * .95 * dt; else np -= np * (1 - Math.exp(-dt / 6));
  const lo = air ? -.5 : 0, hi = air ? maxUp - stall * .6 : (s >= rot ? .5 : 0);
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
  if (!air && pitch > .06 && s >= rot * .95) { nowAir = true; GAME.notice = '✈️ Airborne: gear comes up by itself.'; }      // rotated: wheels leave the runway
  if (!air && !nowAir) { if (s < 10) PLANE.rotCalled = false; else if (s >= rot && !PLANE.rotCalled) { PLANE.rotCalled = true; GAME.notice = '✈️ Rotate! Pull back (S).'; } }
  if (nowAir) {
    let dy = Math.sin(pitch) * s * dt; if (dy < 0 && y < 4) dy *= .45 + .1375 * y;   // ground effect: the last few metres cushion the descent (the flare)
    y += dy - stall * stall * 14 * dt;
    if (y > CEILING) { y = CEILING; pitch = Math.min(pitch, 0); }
    const gy = terrainH(PLANE.x, PLANE.z);   // hills outside the city (the city core, runway included, is flat at 0)
    if (gy > .3 && y <= gy + .8) { crash(p, 'You flew into the hillside!'); return; }
    if (y <= 0 && gy < WATER_Y - .3) { crash(p, 'You came down in the water!'); return; }
    if (y <= 0) {
      const sink = -dy / dt + stall * stall * 14;   // m/s downwards at touchdown
      const why = PLANE.gear < .7 ? 'Gear up landing!' : sink > 8 ? 'Too fast down: hard landing!' : Math.abs(roll) > .4 ? 'Wing strike: level the wings before touchdown!' : pitch < -.25 ? 'Nose-first landing!' : !onRwy && sink > 4.5 ? 'Hard landing off the runway!' : '';
      if (why) { crash(p, why); return; }
      y = 0; nowAir = false; roll = 0; PLANE.rotCalled = true;
      if (sink < 1.5) GAME.notice = '🛬 Smooth landing. Brake with Space.'; else if (sink < 4) GAME.notice = '🛬 Firm landing. Brake with Space.'; else { s *= .85; GAME.notice = '🛬 Hard landing! Brake with Space.'; }
      if (!onRwy) GAME.notice += ' (off the runway)';
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

export const planePrompt = () => PLANE.bd ? (PLANE.bd.mode === 'in' ? '✈ Boarding…' : '✈ Leaving the plane…') + hint(' tap Exit plane to skip', ' E skips') : PLANE.pax ? `✈ Passenger · ${Math.round(PLANE.speed * 3.6)} km/h · ${Math.round(PLANE.y)} m · V view${PLANE.air ? '' : ' · E out'}` : PLANE.on
  ? `✈ ${Math.round(PLANE.speed * 3.6)} km/h · ${Math.round(PLANE.y)} m · throttle ${Math.round(PLANE.throttle * 100)}% · gear ${PLANE.gear > .5 ? '▼' : '▲'} flaps ${Math.round(PLANE.flap * 100)}% · Shift +  Space − · W/S pitch · A/D bank · V view${PLANE.air ? '' : ' · E out'}`
  : '';

/* ───────────── cameras: outside (chase) and inside (cockpit) ───────────── */
const camP = new THREE.Vector3(), look = new THREE.Vector3(), eye = new THREE.Vector3(), flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI), tq = new THREE.Quaternion();
let camInit = false;
const EYE = new THREE.Vector3(0, 2.72, 4.7);   // the pilot's head, in the plane's own coordinates

const dvE = new THREE.Vector3(), dvL = new THREE.Vector3();
export function planeCamera(cam: THREE.Camera, target: THREE.Vector3, dt: number) {
  const bd = PLANE.bd;
  if (bd && PLANE.obj && (bd.mode === 'out' || bd.t < bd.dA + B1 + B2 + CLOSE)) {
    /* boarding / leaving: a 3/4 view of the door and the airstair from the front left */
    PLANE.obj.updateMatrixWorld(true);
    dvE.set(7.4, 2.9, 8.6); PLANE.obj.localToWorld(dvE); dvL.set(2.4, 1.3, 2.2); PLANE.obj.localToWorld(dvL);
    if (!camInit) { camP.copy(dvE); camInit = true; } else { const kk = 1 - Math.exp(-dt * 3); camP.lerp(dvE, kk); }
    cam.position.copy(camP); cam.lookAt(dvL); target.copy(dvL);
    return;
  }
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
  const inside = PLANE.cam === 'in' && (PLANE.on || PLANE.pax);
  if (VIEW.hull) VIEW.hull.visible = !inside;
  if (VIEW.cockpit) VIEW.cockpit.visible = inside;
}

/* ───────────── the plane itself ───────────── */
const W = '#f4f6f8', G = '#1d8a4a', D = '#1b2a35', GR = '#8b949c';
const M = (c: string, m = .2, r = .55) => <meshStandardMaterial color={c} metalness={m} roughness={r} />;

export function Plane() {
  const g = useRef<THREE.Group>(null!);
  const hull = useRef<THREE.Group>(null!), cockpit = useRef<THREE.Group>(null!);
  const doorG = useRef<THREE.Group>(null!), stairs = useRef<THREE.Group>(null!), fans = useRef<(THREE.Group | null)[]>([]);
  const fanA = useRef(0), lastY = useRef(0), gears = useRef<(THREE.Group | null)[]>([]), flaps = useRef<(THREE.Group | null)[]>([]);
  const nav = useRef<THREE.Group>(null!), strobe = useRef<THREE.Group>(null!), beacon = useRef<THREE.Mesh>(null!), land = useRef<THREE.Mesh>(null!), spot = useRef<THREE.SpotLight>(null!);
  useEffect(() => { const sp = spot.current; if (!sp) return; sp.target.position.set(0, -6, 38); g.current.add(sp.target); return () => { g.current?.remove(sp.target); }; }, []);
  /* door, airstair and engine fans follow the plane's state every frame */
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, .05);
    const want = PLANE.engOn || !!PLANE.remote || (PLANE.pax && PLANE.air) ? 1 : 0;
    PLANE.eng += (want - PLANE.eng) * (1 - Math.exp(-dt * (want ? 1.1 : .7)));
    PLANE.door += clamp(PLANE.doorT - PLANE.door, -dt / .9, dt / .9);
    if (doorG.current) { const k = PLANE.door; doorG.current.rotation.y = -(k * k * (3 - 2 * k)) * 1.45; }
    if (stairs.current) stairs.current.visible = !PLANE.air && PLANE.y < .3 && PLANE.speed < 1 && !PLANE.remote && !PLANE.pax && (!PLANE.on || !!PLANE.bd);
    fanA.current += dt * (PLANE.eng * 34 + PLANE.throttle * 30);
    for (const f of fans.current) if (f) f.rotation.z = fanA.current;
    /* gear + flaps (airport step 3): same rules for the pilot and for a mirrored remote flight */
    PLANE.vs += ((PLANE.y - lastY.current) / Math.max(dt, .001) - PLANE.vs) * Math.min(1, dt * 6); lastY.current = PLANE.y;
    if (!PLANE.air) PLANE.gearUp = false; else if (PLANE.y > 15 && PLANE.vs > .5) PLANE.gearUp = true; else if (PLANE.y < 40 && PLANE.vs < -1) PLANE.gearUp = false;
    PLANE.gear += clamp((PLANE.gearUp ? 0 : 1) - PLANE.gear, -dt / 1.4, dt / 1.4);
    const fT = PLANE.air ? (PLANE.y < 70 && PLANE.speed < 48 ? 1 : 0) : (PLANE.on || PLANE.remote ? .5 : 0);
    PLANE.flap += clamp(fT - PLANE.flap, -dt / 2.5, dt / 2.5);
    for (const q of gears.current) if (q) { q.position.y = (1 - PLANE.gear) * 2.4; q.visible = PLANE.gear > .02; }
    for (const q of flaps.current) if (q) q.rotation.x = -PLANE.flap * .55;
    /* lights (airport step 2): nav + tail + beacon with the engines running, strobes flash, landing light while rolling or flying */
    const on = PLANE.eng > .25, ph = (performance.now() / 1000) % 1.2, rolling = PLANE.eng > .5 && (PLANE.air || PLANE.speed > 1 || (PLANE.on && !PLANE.bd));
    if (nav.current) nav.current.visible = on;
    if (strobe.current) strobe.current.visible = on && PLANE.eng > .5 && (ph < .07 || (ph > .17 && ph < .24));
    if (beacon.current) beacon.current.visible = on && ph < .6;
    if (land.current) land.current.visible = rolling;
    if (spot.current) { spot.current.visible = rolling && NIGHT.n > .08; spot.current.intensity = 900 * NIGHT.n; }
  });
  useEffect(() => { PLANE.obj = g.current; VIEW.hull = hull.current; VIEW.cockpit = cockpit.current; applyView(); sync(); return () => { PLANE.obj = null; VIEW.hull = null; VIEW.cockpit = null; }; }, []);
  /* V switches the view while flying */
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.code !== 'KeyV' || e.repeat || (!PLANE.on && !PLANE.pax)) return;
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
      {/* passenger door on the left (+x): the dark opening, a lit cabin floor patch, and the door panel hinged at its front edge */}
      <mesh position={[.98, -.05, 2.4]}><boxGeometry args={[.05, 1.3, .96]} />{M('#1a1f24', .1, .9)}</mesh>
      <mesh position={[.9, -.66, 2.4]}><boxGeometry args={[.3, .06, .96]} />{M('#6b747c', .2, .7)}</mesh>
      <group ref={doorG} position={[1.07, -.05, 2.9]}>
        <mesh position={[0, 0, -.475]}><boxGeometry args={[.07, 1.3, .95]} />{M(W, .2, .5)}</mesh>
        <mesh position={[.045, .2, -.475]}><boxGeometry args={[.02, .34, .5]} />{M(D, .6, .2)}</mesh>
      </group>
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
      {[-1, 1].map((sx, i) => <group key={sx} ref={el => { flaps.current[i] = el; }} position={[sx * 3.4, -.35, -.8]}><mesh position={[0, 0, -.33]}><boxGeometry args={[4.6, .09, .66]} />{M('#dfe3e6', .2, .5)}</mesh></group>)}
      {[-1, 1].map(sx => <mesh key={sx} position={[sx * 7, -.2, .6]}><boxGeometry args={[.25, .9, 1.6]} />{M(G)}</mesh>)}
      <mesh position={[0, .45, -6.4]} castShadow><boxGeometry args={[5.4, .14, 1.5]} />{M(W)}</mesh>
      <mesh position={[0, 1.85, -6.3]} castShadow><boxGeometry args={[.16, 2.5, 1.9]} />{M(G)}</mesh>
      {/* engines */}
      {[-1, 1].map(sx => <group key={sx} position={[sx * 3.7, -1, 1.1]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[.5, .5, 2.2, 14]} />{M(GR, .6, .35)}</mesh>
        <mesh position={[0, 0, 1.12]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.36, .36, .06, 14]} />{M(D, .3, .8)}</mesh>
        <group ref={el => { fans.current[sx < 0 ? 0 : 1] = el; }} position={[0, 0, 1.17]}>
          {[0, 1, 2, 3, 4].map(k => <mesh key={k} rotation={[0, 0, k * Math.PI / 5]}><boxGeometry args={[.7, .07, .02]} />{M('#9aa3ab', .6, .35)}</mesh>)}
          <mesh position={[0, 0, .03]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[.09, .2, 10]} />{M('#d9dde0', .5, .4)}</mesh>
        </group>
      </group>)}
    </group>
    {/* landing gear (wheel bottoms sit on y = 0) */}
    {[[0, 4.2], [-1.7, -.4], [1.7, -.4]].map(([x, z], i) => <group key={i} ref={el => { gears.current[i] = el; }} position={[x, 0, z]}>
      <mesh position={[0, .38, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[.38, .38, .32, 12]} />{M('#15181b', 0, .9)}</mesh>
      <mesh position={[0, 1, 0]}><boxGeometry args={[.12, 1.2, .12]} />{M(GR, .6, .4)}</mesh>
    </group>)}
    {/* lights: red left / green right wingtip, white tail, white strobes, red beacon, landing light + a spot that lights the runway at night */}
    <group ref={nav}>
      <mesh position={[7.05, 1.9, .6]}><sphereGeometry args={[.14, 8, 8]} /><meshBasicMaterial color="#ff2a2a" toneMapped={false} /></mesh>
      <mesh position={[-7.05, 1.9, .6]}><sphereGeometry args={[.14, 8, 8]} /><meshBasicMaterial color="#25e060" toneMapped={false} /></mesh>
      <mesh position={[0, 4.6, -7.3]}><sphereGeometry args={[.12, 8, 8]} /><meshBasicMaterial color="#ffffff" toneMapped={false} /></mesh>
    </group>
    <group ref={strobe}>
      {[-1, 1].map(sx => <mesh key={sx} position={[sx * 7.05, 2.35, .6]}><sphereGeometry args={[.2, 8, 8]} /><meshBasicMaterial color="#ffffff" toneMapped={false} /></mesh>)}
    </group>
    <mesh ref={beacon} position={[0, 3.3, 1.6]}><sphereGeometry args={[.16, 8, 8]} /><meshBasicMaterial color="#ff3030" toneMapped={false} /></mesh>
    <mesh ref={land} position={[0, 1.15, 4.6]}><sphereGeometry args={[.2, 8, 8]} /><meshBasicMaterial color="#fff6d8" toneMapped={false} /></mesh>
    <spotLight ref={spot} position={[0, 1.2, 4.6]} angle={.38} penumbra={.7} distance={110} decay={1.4} color="#fff2d0" visible={false} />
    {/* airstair at the left-hand door: 7 steps from the ground (x = 4.0) up to the sill (x = 1.2, 1.4 m), a platform and two handrails */}
    <group ref={stairs} visible={false} position={[0, 0, 2.4]}>
      {Array.from({ length: 7 }, (_, i) => { const h = (i + 1) * .2; return <mesh key={i} position={[4 - (i + .5) * .4, h / 2, 0]} castShadow><boxGeometry args={[.4, h, 1]} />{M('#c9a227', .3, .6)}</mesh>; })}
      <mesh position={[1.25, 1.36, 0]}><boxGeometry args={[.7, .08, 1.1]} />{M('#c9a227', .3, .6)}</mesh>
      {[-.52, .52].map(z => <mesh key={z} position={[2.6, 1.6, z]} rotation={[0, 0, -.4636]}><boxGeometry args={[3.13, .07, .06]} />{M('#8b949c', .6, .35)}</mesh>)}
      {[-.52, .52].map(z => [[3.9, .55], [2.6, 1.2], [1.4, 1.8]].map(([x, y]) => <mesh key={z + '-' + x} position={[x, y, z]}><boxGeometry args={[.05, 1.0, .05]} />{M('#8b949c', .6, .35)}</mesh>))}
      {[2.0, 3.3].map(x => <mesh key={x} position={[x, .05, -.9]}><boxGeometry args={[.1, .1, .1]} />{M('#111', 0, 1)}</mesh>)}
    </group>
  </group>;
}
