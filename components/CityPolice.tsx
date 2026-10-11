'use client';
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { WANTED_AT } from '../lib/profile';
import { PATROL, carsFor, copsFor, lineBlocked, type Rect } from '../lib/police';
import { sirenSet, sirenStop } from '../lib/cityAudio';
import { GRID, WS, curbSpot, halfW, planRide, newRide, stepRide, type Route, type RideState } from '../lib/roadRoute';
import { BUILDS, GAME, OBS, TPOS, VEH } from './cityShared';
import { PoliceBody, pkit } from './CityCars';
import { BL, findPath, pushOut } from './CityCollision';


/* ───────────── NPC police (step 6): patrol cars drive to the scene, officers step out, chase, search and give up ─────────────
 * Crime -> a witness phones it in (event arl-witness-report) or you become WANTED -> a patrol car spawns off-screen and DRIVES to the spot on the real road grid.
 * Officers get out, chase you on foot (they use the building footprints for line of sight and path-finding), and if you drive off the car chases too.
 * Break line of sight and they search your last known spot, then go back to the car; while unseen the server cools your heat a bit (/api/evade).
 * At very high heat, while you drive, a roadblock (two cars across the road) is set up ahead of you. Rewards, heat and arrests stay on the server. */
export const COP_MAX = PATROL.maxCops, COP_SPEED = 6.2, COP_CATCHUP = 10, COP_ARREST_R = 2.4, COP_HOLD = 1.2, CAR_MAX = PATROL.maxCars;

export const POLICE_CARS: { x: number; z: number; r: number }[] = [];
 // live police cars, solid for the player on foot and in a car
export type PCar = { id: number; mode: 'drive' | 'park' | 'block'; rt: Route | null; rs: RideState | null; x: number; z: number; r: number; at: number; until: number; replan: number; tx: number; tz: number; leave: boolean; hasCops: boolean; announced: boolean };

export type PCop = { x: number; z: number; r: number; hold: number; car: number; state: 'chase' | 'search' | 'back'; until: number; wx: number; wz: number; wAt: number; path: [number, number][]; pi: number; planAt: number; yell: number };

export const PBLK: Rect[] = BUILDS.map(b => ({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 }));

export function PolicePatrol() {
  const cars = useRef<PCar[]>([]), cops = useRef<PCop[]>([]), Q = useRef<{ x: number; z: number }[]>([]);
  const carRefs = useRef<(THREE.Group | null)[]>([]), copRefs = useRef<(THREE.Group | null)[]>([]), red = useRef<(THREE.Mesh | null)[]>([]), blue = useRef<(THREE.Mesh | null)[]>([]);
  const st = useRef({ calling: false, wasWanted: false, wantedAt: 0, seen: 0, lx: 0, lz: 0, evadeAt: 0, lastDisp: 0, blockAt: 0, pin: 0, nid: 1, lost: false });
  const kit = pkit();
  useEffect(() => { const h = (e: Event) => { const d = (e as CustomEvent).detail as { x: number; z: number } | undefined; if (d && Q.current.length < 4) Q.current.push({ x: d.x, z: d.z }); }; window.addEventListener('arl-witness-report', h); return () => { window.removeEventListener('arl-witness-report', h); sirenStop(); POLICE_CARS.length = 0; OBS[3].on = false; OBS[4].on = false; }; }, []);
  const arrest = async () => {
    const S = st.current; if (S.calling) return; S.calling = true;
    try {
      const r = await fetch('/api/npc-police', { method: 'POST' }); const d = await r.json().catch(() => ({}));
      if (d?.ok) { GAME.notice = `🚔 Arrested by police${d.fine ? ` · fined ₦${Number(d.fine).toLocaleString()}` : ''}`; cops.current.length = 0; cars.current.forEach(c => { c.leave = true; c.until = 0; }); window.dispatchEvent(new Event('arl-refresh')); }
    } catch {}
    setTimeout(() => { S.calling = false; }, 4000);
  };
  const evade = async () => {
    try { const r = await fetch('/api/evade', { method: 'POST' }); const d = await r.json().catch(() => ({})); if (typeof d?.heat === 'number') { GAME.heat = d.heat; if (d.ok) { GAME.notice = d.heat < WANTED_AT ? '😮‍💨 You lost the police.' : '👀 Still hiding... the heat is cooling.'; window.dispatchEvent(new Event('arl-refresh')); } } } catch {}
  };
  /** a patrol car appears on a road >= 60 m from the target (and out of the player's sight) and drives to it */
  const spawnCar = (tx: number, tz: number, now: number) => {
    const P = GAME.player; if (cars.current.length >= CAR_MAX) return false;
    for (let k = 0; k < 12; k++) {
      const axis = Math.random() < .5 ? 'x' : 'z', road = Math.floor(Math.random() * 9) - 4, side: 1 | -1 = Math.random() < .5 ? 1 : -1, along = (Math.random() * 2 - 1) * 110 * WS;
      const sp = curbSpot(axis, road, along, side);
      if (Math.hypot(sp.x - tx, sp.z - tz) < 60 || Math.hypot(sp.x - P.x, sp.z - P.z) < 50) continue;
      const rt = planRide(sp, [tx, tz]); if (!rt) continue;
      const rs = newRide(rt, sp.r); cars.current.push({ id: st.current.nid++, mode: 'drive', rt, rs, x: rs.x, z: rs.z, r: rs.r, at: now, until: 0, replan: now + 6000, tx, tz, leave: false, hasCops: false, announced: false });
      return true;
    }
    return false;
  };
  const roadblock = (now: number) => { // two cars across the road about 60 m ahead of your car
    const P = GAME.player, fx = Math.cos(VEH.r), fz = -Math.sin(VEH.r), ax = THREE.MathUtils.clamp(P.x + fx * 60, -118 * WS, 118 * WS), az = THREE.MathUtils.clamp(P.z + fz * 60, -118 * WS, 118 * WS);
    const ix = Math.round(ax / GRID), iz = Math.round(az / GRID), alongZ = Math.abs(ax - ix * GRID) <= Math.abs(az - iz * GRID);
    const mid = (v: number) => THREE.MathUtils.clamp(Math.floor(v / GRID) * GRID + GRID / 2, -118 * WS, 118 * WS); // mid-block, clear of the junctions
    const hw = halfW(alongZ ? ix : iz), spots = [-1, 1].map(s => alongZ ? { x: ix * GRID + s * hw * .55, z: mid(az) + s * 1.2, r: 0 } : { x: mid(ax) + s * 1.2, z: iz * GRID + s * hw * .55, r: Math.PI / 2 });
    if (spots.some(s => Math.hypot(s.x - P.x, s.z - P.z) < 25)) return false;
    spots.forEach(s => cars.current.push({ id: st.current.nid++, mode: 'block', rt: null, rs: null, x: s.x, z: s.z, r: s.r, at: now, until: now + PATROL.roadblockLifeMs, replan: 0, tx: s.x, tz: s.z, leave: false, hasCops: false, announced: true }));
    GAME.notice = '🚧 Police roadblock ahead! Turn off or slow down.'; return true;
  };
  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, .05), now = Date.now(), P = GAME.player, S = st.current, C = cops.current, K = cars.current;
    const wanted = GAME.heat >= WANTED_AT && !GAME.jailed, driving = VEH.drv, flyingFree = driving || !!GAME.ride;
    /* ── wanted begins / ends ── */
    if (wanted && !S.wasWanted) { S.wasWanted = true; S.wantedAt = now; S.seen = now; S.lx = P.x; S.lz = P.z; S.lost = false; GAME.notice = '🚨 You are WANTED: a patrol is on its way. Break line of sight to lose them.'; }
    if (!wanted && S.wasWanted) { S.wasWanted = false; C.forEach(c => { c.state = 'back'; }); }
    /* ── dispatch: witness calls and your own heat ── */
    const live = K.filter(c => c.mode !== 'block' && !c.leave).length;
    while (Q.current.length) { const q = Q.current.shift()!; if (live < (wanted ? carsFor(GAME.heat) : 1) && now - S.lastDisp > 10_000 && !K.some(c => c.mode !== 'block' && !c.leave && Math.hypot(c.tx - q.x, c.tz - q.z) < 40)) { if (spawnCar(q.x, q.z, now)) S.lastDisp = now; } }
    if (wanted && now - S.wantedAt > 3500 && live < carsFor(GAME.heat) && now - S.lastDisp > 12_000 && K.length < CAR_MAX) { const seenNow = now - S.seen < 6000; if (spawnCar(seenNow ? P.x : S.lx, seenNow ? P.z : S.lz, now)) S.lastDisp = now; }
    if (wanted && driving && GAME.heat >= PATROL.roadblockHeat && Math.abs(VEH.v) > 8 && now - S.blockAt > PATROL.roadblockEveryMs && K.length <= CAR_MAX - 2) { if (roadblock(now)) S.blockAt = now; }
    /* ── cars ── */
    let nearest = 999;
    for (let i = K.length - 1; i >= 0; i--) {
      const c = K[i];
      if (c.mode === 'drive' && c.rt && c.rs) {
        stepRide(c.rs, c.rt, dt, { vmax: wanted ? 17 : 13, t: state.clock.elapsedTime, light: () => 'g', cars: TPOS }); c.x = c.rs.x; c.z = c.rs.z; c.r = c.rs.r;
        nearest = Math.min(nearest, Math.hypot(c.x - P.x, c.z - P.z));
        if (c.rs.done) {
          if (c.leave) { K.splice(i, 1); continue; }
          c.mode = 'park'; c.at = now; c.until = now + PATROL.parkMs; c.hasCops = false;
          const f = Math.cos(c.r), g = -Math.sin(c.r), lx = Math.sin(c.r), lz = Math.cos(c.r), n = Math.min(wanted ? copsFor(GAME.heat) : 1, COP_MAX - C.length);
          for (let k = 0; k < n; k++) { const o = { x: c.x + lx * 1.7 + f * (k - .5) * 1.1, z: c.z + lz * 1.7 + g * (k - .5) * 1.1 }; pushOut(o, .6); C.push({ x: o.x, z: o.z, r: c.r, hold: 0, car: c.id, state: wanted ? 'chase' : 'search', until: now + 16_000, wx: c.tx, wz: c.tz, wAt: 0, path: [], pi: 0, planAt: 0, yell: 0 }); c.hasCops = true; }
          if (!c.announced) { c.announced = true; if (!wanted) GAME.notice = '🚔 A police car arrived at the scene of the crime.'; }
        }
      } else if (c.mode === 'park') {
        const mine = C.some(o => o.car === c.id);
        if (wanted && now > c.replan && now - S.seen < 7000 && Math.hypot(c.x - P.x, c.z - P.z) > 22 && c.rt) { // you ran: the car comes after you
          const rt = planRide(c.rt.end, [P.x, P.z]); c.replan = now + 6000; if (rt) { c.rt = rt; c.rs = newRide(rt, c.r); c.mode = 'drive'; c.tx = P.x; c.tz = P.z; continue; }
        }
        if (!mine && now > c.until && c.rt) { // nobody left to pick up: drive off to the edge of the map
          const rt = planRide(c.rt.end, [(Math.random() < .5 ? -128 : 128) * WS, (Math.random() * 2 - 1) * 100 * WS]); if (rt) { c.rt = rt; c.rs = newRide(rt, c.r); c.mode = 'drive'; c.leave = true; } else K.splice(i, 1);
        }
      } else if (c.mode === 'block') {
        if (now > c.until || Math.hypot(c.x - P.x, c.z - P.z) > 130 * WS) { K.splice(i, 1); continue; }
      }
    }
    const pinned = driving && wanted && Math.abs(VEH.v) < 2 && K.some(c => c.mode === 'park' && Math.hypot(c.x - VEH.x, c.z - VEH.z) < 8); // a patrol car has boxed in your stopped car
    S.pin = pinned ? S.pin + dt : Math.max(0, S.pin - dt * 2);
    if (S.pin > 1.8) { S.pin = 0; arrest(); }
    /* ── officers ── */
    let anySee = false;
    for (let i = C.length - 1; i >= 0; i--) {
      const c = C[i], d = Math.hypot(P.x - c.x, P.z - c.z);
      const sees = wanted && d < PATROL.seeRange && !lineBlocked(PBLK, c.x, c.z, P.x, P.z);
      if (sees) { anySee = true; S.seen = now; S.lx = P.x; S.lz = P.z; S.lost = false; if (c.state !== 'chase') { c.state = 'chase'; if (now - c.yell > 6000) { c.yell = now; GAME.notice = '🚔 Police! Stop right there!'; } } }
      let tx = c.x, tz = c.z, sp = 0;
      if (c.state === 'chase') {
        if (!wanted) { c.state = 'search'; c.until = now + 6000; }
        else {
          const tgtX = sees ? P.x : S.lx, tgtZ = sees ? P.z : S.lz;
          if (sees && d < 18) { tx = tgtX; tz = tgtZ; c.path = []; } // clear view and close: run straight at you
          else { // path-find around the buildings
            if (now - c.planAt > 1100 || !c.path.length) { c.planAt = now + (i * 137) % 300; c.path = findPath(BL, [c.x, c.z], [tgtX, tgtZ]); c.pi = 0; }
            while (c.pi < c.path.length - 1 && Math.hypot(c.path[c.pi][0] - c.x, c.path[c.pi][1] - c.z) < 1.2) c.pi++;
            const w = c.path[c.pi]; if (w) { tx = w[0]; tz = w[1]; } else { tx = tgtX; tz = tgtZ; }
          }
          sp = d > 40 ? COP_CATCHUP : d > 20 ? 7.4 : COP_SPEED;
          if (!sees && Math.hypot(S.lx - c.x, S.lz - c.z) < 3) { c.state = 'search'; c.until = now + PATROL.searchMs; c.wAt = 0; }
        }
      }
      if (c.state === 'search') {
        if (wanted && sees) { c.state = 'chase'; }
        else {
          if (now > c.wAt) { c.wAt = now + 2500; const a = Math.random() * Math.PI * 2, rr = 4 + Math.random() * 10; c.wx = (wanted ? S.lx : c.wx) + Math.sin(a) * rr; c.wz = (wanted ? S.lz : c.wz) + Math.cos(a) * rr; }
          tx = c.wx; tz = c.wz; sp = Math.hypot(tx - c.x, tz - c.z) > 1 ? 2.6 : 0;
          if (now > c.until) c.state = 'back';
          if (wanted && !anySee && now - S.seen > 4000 && !S.lost) { S.lost = true; GAME.notice = '👀 The police lost sight of you. Stay out of view.'; }
        }
      }
      if (c.state === 'back') {
        const car = K.find(k => k.id === c.car);
        if (!car) { C.splice(i, 1); continue; }
        tx = car.x; tz = car.z; sp = 3.4; if (Math.hypot(car.x - c.x, car.z - c.z) < 2.6) { C.splice(i, 1); continue; }
      }
      const dx = tx - c.x, dz = tz - c.z, dd = Math.hypot(dx, dz);
      if (sp > 0 && dd > .05) { c.x += dx / dd * Math.min(dd, sp * dt); c.z += dz / dd * Math.min(dd, sp * dt); pushOut(c, .6); c.r = Math.atan2(dx, dz); }
      else if (c.state !== 'back') c.r = Math.atan2(P.x - c.x, P.z - c.z);
      // arrest: reach you on foot, or you stopped your car beside them; never while you ride a taxi/bus
      if (c.state === 'chase' && d < COP_ARREST_R && !GAME.ride && (!driving || Math.abs(VEH.v) < 2.2)) { c.hold += dt; if (c.hold >= COP_HOLD) arrest(); } else c.hold = Math.max(0, c.hold - dt * 2);
    }
    /* ── you are hiding: the server cools your heat a bit ── */
    if (wanted && S.lost && !anySee && now - S.seen > PATROL.evadeAfterMs && now - S.evadeAt > PATROL.evadeEveryMs) { S.evadeAt = now; evade(); }
    /* ── draw ── */
    POLICE_CARS.length = 0; OBS[3].on = false; OBS[4].on = false; let b = 0;
    const blink = Math.floor(state.clock.elapsedTime * 4) % 2 === 0;
    for (let i = 0; i < CAR_MAX; i++) {
      const g = carRefs.current[i], c = K[i]; if (!g) continue;
      g.visible = !!c; if (!c) continue;
      g.position.set(c.x, 0, c.z); g.rotation.y = c.r; POLICE_CARS.push({ x: c.x, z: c.z, r: c.r });
      if (c.mode === 'block' && b < 2) { OBS[3 + b].x = c.x; OBS[3 + b].z = c.z; OBS[3 + b].on = true; b++; }
    }
    for (let i = 0; i < COP_MAX; i++) {
      const g = copRefs.current[i], c = C[i]; if (!g) continue;
      g.visible = !!c; if (!c) continue;
      g.position.set(c.x, Math.abs(Math.sin(state.clock.elapsedTime * 9 + i)) * (c.state === 'search' ? .03 : .08), c.z); g.rotation.y = c.r;
      if (red.current[i]) red.current[i]!.visible = blink; if (blue.current[i]) blue.current[i]!.visible = !blink;
    }
    sirenSet(nearest < 999 ? Math.max(0, 1 - nearest / 110) : 0);
  });
  return <>
    {Array.from({ length: CAR_MAX }, (_, i) => <group key={'pc' + i} ref={el => { carRefs.current[i] = el; }} visible={false}><PoliceBody kit={kit} /></group>)}
    {Array.from({ length: COP_MAX }, (_, i) => <group key={i} ref={el => { copRefs.current[i] = el; }} visible={false}>
      <mesh position={[-.13, .4, 0]}><boxGeometry args={[.2, .8, .22]} /><meshStandardMaterial color="#111827" /></mesh>
      <mesh position={[.13, .4, 0]}><boxGeometry args={[.2, .8, .22]} /><meshStandardMaterial color="#111827" /></mesh>
      <mesh position={[0, 1.1, 0]}><boxGeometry args={[.58, .8, .32]} /><meshStandardMaterial color="#1e3a8a" /></mesh>
      <mesh position={[0, 1.65, 0]}><sphereGeometry args={[.17, 12, 12]} /><meshStandardMaterial color="#6b4429" /></mesh>
      <mesh position={[0, 1.82, 0]}><boxGeometry args={[.4, .1, .4]} /><meshStandardMaterial color="#0f172a" /></mesh>
      <mesh ref={el => { red.current[i] = el; }} position={[-.12, 2.05, 0]}><sphereGeometry args={[.09, 8, 8]} /><meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={2} /></mesh>
      <mesh ref={el => { blue.current[i] = el; }} position={[.12, 2.05, 0]}><sphereGeometry args={[.09, 8, 8]} /><meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={2} /></mesh>
    </group>)}
  </>;
}
