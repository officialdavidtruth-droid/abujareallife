'use client';
import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { NET } from '../lib/cityNet';
import { GAME, wrap } from './cityShared';
import { PAX, guestsOf } from './cityPax';
import { PLANE, ejectPilot, planeCamReset, resetPlane, syncPlane } from './cityPlane';

/* ───────────── The airport plane in multiplayer (STEP 3) ─────────────
 * There is ONE plane per city instance and the pilot is its only author:
 *   - the pilot broadcasts the plane's pose with the normal "pos" message (NET.me.pl / NET.me.pf, see lib/cityNet.ts);
 *   - everybody else MIRRORS that pose onto their own copy of the plane (same object, same model), smoothed and dead-reckoned between packets;
 *   - nobody else can board while somebody is flying (planeNear() is false while PLANE.remote is set);
 *   - passengers use the ride-along handshake from cityPax.ts (kind 'plane', 3 seats): they ask the pilot (or the pilot invites them) while the plane is parked,
 *     and their screen then follows the plane with the same chase / cockpit camera.
 * Called once per frame by the scene BEFORE it moves the player. */

type Body = { x: number; z: number; r: number; y: number; vy: number };
const ping = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event('arl-plane')); };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
let mirrored = '';

export function stepPlaneNet(dt: number, p: Body) {
  /* am I a passenger of somebody's flight? */
  const pax = !!PAX.host && PAX.kind === 'plane';
  if (PLANE.pax !== pax) { PLANE.pax = pax; planeCamReset(); ping(); }

  /* who is flying (the lowest name wins if two players managed to board in the same instant) */
  let pilot = '';
  for (const n of Object.keys(NET.peers)) { const q = NET.peers[n]; if (q.init && q.pl && (!pilot || n < pilot)) pilot = n; }

  if (PLANE.on) {
    if (pilot && pilot < PLANE.me) { ejectPilot(p); GAME.notice = `✈️ @${pilot} got into the plane first.`; }   // lost the race: stand beside the plane and fall through to mirroring
    else { if (PLANE.remote) { PLANE.remote = ''; ping(); } mirrored = ''; return; }
  }

  if (pilot) {
    const q = NET.peers[pilot], f = q.pf, first = PLANE.remote !== pilot;
    if (first) { PLANE.remote = pilot; mirrored = pilot; ping(); }
    /* dead reckoning: packets arrive 5 times a second, a plane covers up to 12 m in that time */
    const age = first ? 0 : Math.min(.35, (performance.now() - q.pft) / 1000), hv = Math.cos(f[4]) * f[6];
    const tx = f[0] + Math.sin(f[2]) * hv * age, tz = f[1] + Math.cos(f[2]) * hv * age, ty = f[7] ? Math.max(0, f[3] + Math.sin(f[4]) * f[6] * age) : 0;
    const k = first ? 1 : 1 - Math.exp(-dt * 10);
    PLANE.x = lerp(PLANE.x, tx, k); PLANE.z = lerp(PLANE.z, tz, k); PLANE.y = lerp(PLANE.y, ty, k);
    PLANE.h += wrap(f[2] - PLANE.h) * k; PLANE.pitch = lerp(PLANE.pitch, f[4], k); PLANE.roll = lerp(PLANE.roll, f[5], k);
    PLANE.speed = f[6]; PLANE.air = !!f[7]; PLANE.idleAt = 0;
    syncPlane();
  } else if (mirrored) {
    /* the pilot got out, crashed or left the game */
    mirrored = ''; PLANE.remote = ''; ping();
    if (PLANE.air || PLANE.speed > 8 || PLANE.y > .5) resetPlane();   // it was still up there: it is towed back to the runway
    else { PLANE.speed = 0; PLANE.pitch = 0; PLANE.roll = 0; PLANE.y = 0; PLANE.idleAt = Date.now(); syncPlane(); }
  }
}

/** What I broadcast while I fly (read by the net layer through NET.me). Call every frame while PLANE.on, and clear it with pl = 0 otherwise. */
export function planeBroadcast() {
  const M = NET.me;
  M.pl = 1;
  M.pf[0] = PLANE.x; M.pf[1] = PLANE.z; M.pf[2] = PLANE.h; M.pf[3] = PLANE.y; M.pf[4] = PLANE.pitch; M.pf[5] = PLANE.roll; M.pf[6] = PLANE.speed; M.pf[7] = PLANE.air ? 1 : 0;
}

/** A small label over the plane: who is flying and who is aboard. */
export function PlaneTag() {
  const g = useRef<THREE.Group>(null!), [, bump] = useState(0), key = useRef('');
  useEffect(() => {
    const f = () => bump(v => v + 1);
    window.addEventListener('arl-plane', f); window.addEventListener('arl-pax', f);
    const i = setInterval(() => { const k = labelKey(); if (k !== key.current) { key.current = k; f(); } }, 500);
    return () => { window.removeEventListener('arl-plane', f); window.removeEventListener('arl-pax', f); clearInterval(i); };
  }, []);
  useFrame(() => { if (g.current) g.current.position.set(PLANE.x, PLANE.y + 7, PLANE.z); });
  const pilot = PLANE.on ? PAX.me : PLANE.remote, aboard = pilot ? guestsOf(pilot).map(x => x.name) : [];
  const hide = (PLANE.on || PLANE.pax) && PLANE.cam === 'in';
  return <group ref={g}>
    {pilot && !hide && (PLANE.remote || aboard.length > 0) && <Html center zIndexRange={[5, 0]}>
      <div className="cityNameTag" style={{ whiteSpace: 'nowrap', pointerEvents: 'none' }}>✈️ {PLANE.on ? 'You' : '@' + pilot}{aboard.length ? ' · ' + aboard.map(n => (n === PAX.me ? 'you' : '@' + n)).join(', ') : ''}</div>
    </Html>}
  </group>;
}
const labelKey = () => { const pilot = PLANE.on ? PAX.me : PLANE.remote; return pilot + '|' + (pilot ? guestsOf(pilot).map(g => g.name).join(',') : '') + '|' + PLANE.cam + (PLANE.pax ? 'p' : ''); };
