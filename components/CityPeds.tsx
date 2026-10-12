'use client';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { handGeometry, pedFootGeometry, pedSoleGeometry } from '../lib/humanRig';
import { CITY } from '../lib/cityData';
import { type Look } from '../lib/characterModels';
import { NET } from '../lib/cityNet';
import { thud } from '../lib/cityAudio';
import { vehicleByName } from '../lib/vehicles';
import RuntimeStyle from './RuntimeStyle';
import { worldCalendar, weatherAt, simSeconds, simRand } from '../lib/worldClock';
import { BOLT_LINES, DRV_SHOUT, PEDSTATE, PEDVIEW, PRI, RESIST_LINES, SHOUTS, assaultQuiet, decide, drainCrimes, duration, lineFor, perceive, personaOf, pushCrime, reportCrime, shout, wnow, type Reaction } from '../lib/witness';
import { GRID, WS, inJunction, curbSpot, halfW, signalised } from '../lib/roadRoute';
import { GAME, PEDPOS, TPOS, VEH, WSCALE, hs, lightState, pick } from './cityShared';
import { JACK, nextCenter } from './CityTraffic';
import { PAX, guestsOf } from './cityPax';
import { BikeBody, BusBody, CarModel, DrvLook, PoliceBody, TaxiBody, pkit } from './CityCars';
import { CAR_R } from './CityWeather';
import { CAR_POSTS, pedHit, pushPed } from './CityCollision';


/* ───────────── pedestrians: walk the pavements, wait for red traffic, scatter when hit ───────────── */
export type Ped = { axis: 'x' | 'z'; line: number; u: number; dir: 1 | -1; sp: number; ph: number; down: number; x: number; z: number; moving: boolean; shirt: string; pants: string; skin: string; home:string; work:string; mode:'home'|'commute'|'work'|'social'|'flee'; hidden:boolean; target:[number,number]; vis:number; yaw:number; off:number; vf:number; tc:number; rest:number; ox:number; oz:number; lat:number; latT:number; rc:number };

export const SHIRTS = ['#c0392b', '#2c5aa0', '#e8e8ea', '#1e9e55', '#f1c40f', '#7c3aed', '#0f766e', '#d97706', '#111827', '#be185d'];

export const PANTS = ['#1f2937', '#374151', '#4b5563', '#111827', '#2b3a55', '#5b4636'];

export const SKINS = ['#3b2417', '#4a2e1c', '#5a3825', '#6b4429', '#7a4f32', '#8d5f3d'];

export const PED_N = 32;

export function makePeds(): Ped[] {
  return Array.from({ length: PED_N }, (_, n) => {
    const ri = Math.floor(hs('pi' + n) * 11) - 5, side0 = hs('ps' + n) < .5 ? 1 : -1, side = Math.abs(ri) === 5 ? -Math.sign(ri) : side0, axis: 'x' | 'z' = hs('pa' + n) < .5 ? 'x' : 'z';
    const homes=['Gwarinpa','Kubwa','Maitama','Jabi','Asokoro','Utako'], works=['Central Area','Wuse','Garki','Maitama','Jabi','Airport Corridor']; const home=homes[n%homes.length], work=works[(n*3)%works.length]; return { axis, line: ri * GRID + side * (halfW(ri) + 2 + (hs('po' + n) - .5)), u: (hs('pu' + n) * 2 - 1) * Math.min(118 * WS, PED_LIM - 1), dir: (hs('pd' + n) < .5 ? 1 : -1) as 1 | -1, sp: 1.1 + hs('pv' + n) * .7, ph: hs('pp' + n) * 6.28, down: 0, x: 0, z: 0, moving: true, shirt: pick(SHIRTS, 'sh' + n), pants: pick(PANTS, 'pn' + n), skin: pick(SKINS, 'sk' + n), home, work, mode:'work', hidden:false, target:[0,0], vis:1, yaw:NaN, off:hs('po' + n) - .5, vf:.88 + hs('pf' + n) * .24, tc:0, rest:0, ox:0, oz:0, lat:0, latT:0, rc:0 };
  });
}

export const timeToGreen = (t: number, axis: 'x' | 'z') => { const c = t % 32; return axis === 'x' ? (c < 14 ? 0 : 32 - c) : (c >= 16 && c < 30 ? 0 : c < 16 ? 16 - c : 48 - c); };

export const canCross = (t: number, carAxis: 'x' | 'z') => lightState(t, carAxis) === 'r' && timeToGreen(t, carAxis) > 5.5;

/* ───────────── solid bodies ─────────────
 * Nobody walks or drives through anybody else. Pedestrians sidestep what is in their way and stop when there is no room; you, other players and cars are pushed out of each other. */
export const BODY_R = .3, PED_PUSH = .6;
const PED_LIM = 5 * GRID + halfW(5) - .4;   // pedestrians stay inside the outer ring road: past it are the player houses, yards and gate walls
const sideFor = (k: number, o: number) => (Math.abs(k) === 5 ? -Math.sign(k) : (o >= k * GRID ? 1 : -1));   // on the ring road only the city-side pavement is used
   // body radius of a person; how close two people's centres may get
export type Spot = { x: number; z: number };

/** every other real player on foot (those driving are inside their car) */
export const peersOnFoot = () => { const o: Spot[] = []; for (const q of Object.values(NET.peers)) if (q.init && !q.drv && !q.rd && !q.pa) o.push({ x: q.x, z: q.z }); return o; };   // not someone sitting in a vehicle

/** every other real player's car (parked or driven), except one that is being carjacked right now */
export const remoteCars = () => { const o: { x: number; z: number; r: number }[] = []; for (const [n, q] of Object.entries(NET.peers)) { if (!q.init) continue; if ((q.cp || q.drv) && !JACK.hides(n)) o.push({ x: q.cx, z: q.cz, r: q.cr }); if (q.rd === 1 || q.rd === 3) o.push({ x: q.x, z: q.z, r: q.r }); } return o; };   // a taxi / bus another player rides in is solid too

/** push p out of a circle at (x, z) with the given reach. true if it moved. */
export function pushFrom(p: Spot, x: number, z: number, reach: number) {
  const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz);
  if (d >= reach) return false;
  if (d > 1e-4) { p.x = x + dx / d * reach; p.z = z + dz / d * reach; } else p.x += reach;
  return true;
}

export function Pedestrians() {
  const peds = useMemo(makePeds, []);
  const rx = useRef<(Reaction | null)[]>([]), pose = useRef(Array.from({ length: PED_N }, () => ({ up: 0, crouch: 0, film: 0, angry: 0, give: 0 }))), W = useRef({ punchUntil: 0, armedAt: 0, after: {} as Record<number, { at: number; fx: number; fz: number }> }), phone = useRef<THREE.InstancedMesh>(null!);
  useFrame(() => { for (let i = 0; i < peds.length; i++) { const p = peds[i], e = PEDPOS[i] || (PEDPOS[i] = { x: 1e5, z: 1e5 }); e.x = p.hidden ? 1e5 : p.x; e.z = p.hidden ? 1e5 : p.z; e.d = p.down > 0; } });
  useEffect(() => {   // step 7: a pedestrian you held up hands the cash over (then runs), bolts without paying, or squares up. The SERVER already decided whether the robbery worked.
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail as { idx: number; result: 'give' | 'bolt' | 'resist' } | undefined; if (!d || !peds[d.idx]) return;
      const now = wnow(), me = GAME.player, mk = (kind: Reaction['kind'], secs: number, shoutIn: number): Reaction => ({ kind, until: now + secs, fx: me.x, fz: me.z, sense: 'saw', callAt: 0, shoutAt: now + shoutIn, calledIn: false });
      if (d.result === 'give') { rx.current[d.idx] = mk('give', 1.7, .1); W.current.after[d.idx] = { at: now + 1.7, fx: me.x, fz: me.z }; }
      else if (d.result === 'bolt') { rx.current[d.idx] = mk('flee', 9, 4); shout(d.idx, BOLT_LINES[Math.floor(Math.random() * BOLT_LINES.length)], 2.4); }
      else { rx.current[d.idx] = mk('confront', 7, 4); shout(d.idx, RESIST_LINES[Math.floor(Math.random() * RESIST_LINES.length)], 2.6); }
    };
    window.addEventListener('arl-ped-demand', h); return () => window.removeEventListener('arl-ped-demand', h);
  }, [peds]);
  const torso = useRef<THREE.InstancedMesh>(null!), head = useRef<THREE.InstancedMesh>(null!), legs = useRef<THREE.InstancedMesh>(null!), arms = useRef<THREE.InstancedMesh>(null!);
  const handA = useRef<THREE.InstancedMesh>(null!), handB = useRef<THREE.InstancedMesh>(null!), footA = useRef<THREE.InstancedMesh>(null!), footB = useRef<THREE.InstancedMesh>(null!), soles = useRef<THREE.InstancedMesh>(null!);
  // real hands (palm, four fingers, thumb) and bare feet with five toes. The arm at +z has its thumb on the -z side, hence s = -1 for A.
  const G = useMemo(() => ({ handA: handGeometry(false, -1, Math.PI / 2), handB: handGeometry(false, 1, Math.PI / 2), footA: pedFootGeometry(-1), footB: pedFootGeometry(1), sole: pedSoleGeometry() }), []);
  const T = useMemo(() => ({ base: new THREE.Matrix4(), m: new THREE.Matrix4(), t: new THREE.Matrix4(), r: new THREE.Matrix4(), pos: new THREE.Vector3(), one: new THREE.Vector3(1, 1, 1), sc: new THREE.Vector3(1, 1, 1), qa: new THREE.Quaternion(), qb: new THREE.Quaternion(), q: new THREE.Quaternion(), Y: new THREE.Vector3(0, 1, 0), Z: new THREE.Vector3(0, 0, 1) }), []);
  useLayoutEffect(() => {
    const c = new THREE.Color();
    peds.forEach((p, i) => {
      torso.current.setColorAt(i, c.set(p.shirt)); head.current.setColorAt(i, c.set(p.skin));
      for (let s = 0; s < 2; s++) { legs.current.setColorAt(i * 2 + s, c.set(p.pants)); arms.current.setColorAt(i * 2 + s, c.set(p.shirt)); }
      for (const m of [handA, handB, footA, footB]) m.current.setColorAt(i, c.set(p.skin));
    });
    for (const m of [torso, head, legs, arms, handA, handB, footA, footB]) if (m.current.instanceColor) m.current.instanceColor.needsUpdate = true;
  }, [peds]);
  useFrame((st, dtRaw) => {
    const dt = Math.min(dtRaw, .05), t = simSeconds();
    const wc = worldCalendar(); const wx = weatherAt(); const night = wc.hh >= 20 || wc.hh < 6; const rain = wx.rain > .45;
    const part = (mesh: THREE.InstancedMesh, idx: number, tx: number, ty: number, tz: number, rz = 0, dy = 0) => {
      T.t.makeTranslation(tx, ty, tz); T.m.copy(T.base).multiply(T.t);
      if (rz) { T.r.makeRotationZ(rz); T.m.multiply(T.r); }
      if (dy) { T.t.makeTranslation(0, dy, 0); T.m.multiply(T.t); }
      mesh.setMatrixAt(idx, T.m);
    };
    const partFlat = (mesh: THREE.InstancedMesh, idx: number, tx: number, ty: number, tz: number, rz: number, dy: number) => { // like part(), but turned back so a foot stays level while its leg swings
      T.t.makeTranslation(tx, ty, tz); T.m.copy(T.base).multiply(T.t); T.r.makeRotationZ(rz); T.m.multiply(T.r); T.t.makeTranslation(0, dy, 0); T.m.multiply(T.t); T.r.makeRotationZ(-rz); T.m.multiply(T.r); mesh.setMatrixAt(idx, T.m);
    };
    const feetOn = peersOnFoot();   // other real players, for the pedestrians to make way for
    const eventActive = (wc.hh >= 0 && wc.hh % 6 === 0) || wx.storm;
    /* ── witness AI (step 5): what the player did this frame, and who can see it ── */
    const nowS = wnow(), nowMs = Date.now(), me = GAME.player, WS = W.current, crimes = drainCrimes();
    const holdingGun = !!(window as any).__arlWeapon && !VEH.drv && !GAME.jailed;
    if (NET.me.anim === 'punch' && NET.me.animUntil > nowMs && NET.me.animUntil !== WS.punchUntil) {   // a swing next to a pedestrian is an assault they (and others) can see
      WS.punchUntil = NET.me.animUntil;
      if (!assaultQuiet()) { let vi = -1, vd = 2.8; peds.forEach((q, qi) => { const d = Math.hypot(q.x - me.x, q.z - me.z); if (!q.hidden && d < vd) { vd = d; vi = qi; } }); if (vi >= 0) pushCrime({ kind: 'assault', x: me.x, z: me.z, victim: vi }); }
    }
    if ((NET.me.anim === 'shoot' || NET.me.anim === 'reload') && NET.me.animUntil > nowMs && holdingGun) WS.armedAt = nowMs;
    const brandishing = holdingGun;   // step 7: a DRAWN gun counts as out (GTA: people react to the weapon, you do not have to fire first)
    peds.forEach((p, i) => {
      let fall = 0; p.moving = false; p.hidden = false;
      const yw = Number.isNaN(p.yaw) ? 0 : p.yaw, persona = personaOf(i);
      let react: Reaction | null = rx.current[i] && rx.current[i]!.until > nowS ? rx.current[i] : null;
      if (rx.current[i] && !react) { rx.current[i] = null; p.sp = 1.1 * p.vf; p.tc = 0; }   // calmed down: back to normal walking
      const start = (k: Reaction['kind'], fx: number, fz: number, sense: 'saw' | 'heard') => {
        const cur = rx.current[i]; if (cur && cur.until > nowS && PRI[cur.kind] >= PRI[k]) return;
        react = rx.current[i] = { kind: k, until: nowS + duration(k, Math.random()), fx, fz, sense, callAt: k === 'film' ? nowS + 2.5 + Math.random() * 2 : 0, shoutAt: nowS + .15 + Math.random() * .7, calledIn: false };
      };
      const af = WS.after[i]; if (af && nowS >= af.at) { delete WS.after[i]; react = rx.current[i] = { kind: 'flee', until: nowS + 9, fx: af.fx, fz: af.fz, sense: 'saw', callAt: 0, shoutAt: nowS + .5, calledIn: false }; }   // step 7: handed it over, now runs
      if (!p.hidden && p.down <= 0) {
        for (const c of crimes) {   // somebody did something: can I see or hear it, and what do I do about it?
          const dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz) || .01, victim = i === c.victim;
          const sense = victim ? 'saw' : perceive(c.kind, d, (Math.cos(yw) * dx - Math.sin(yw) * dz) / d); if (!sense) continue;
          const k = decide(persona, c.kind, sense, d, victim, false, Math.random()); if (k) start(k, c.x, c.z, sense);
        }
        if (brandishing) {   // a weapon in hand: people nearby notice, and anyone you point it at puts their hands up
          const dx = me.x - p.x, dz = me.z - p.z, d = Math.hypot(dx, dz) || .01;
          if (d < 14) {
            const aimed = d < 12 && (Math.sin(me.r) * -dx + Math.cos(me.r) * -dz) / d > .82;
            if (react && react.kind === 'handsup' && aimed) react.until = Math.max(react.until, nowS + 1.5);
            else if (!react && Math.random() < dt * 2.5) {
              const sense = perceive('armed', d, (Math.cos(yw) * dx - Math.sin(yw) * dz) / d);
              if (sense === 'saw') { const k = decide(persona, 'armed', 'saw', d, false, aimed, Math.random()); if (k) start(k, me.x, me.z, 'saw'); }
            }
          }
        }
      }
      const rk = react ? (react as Reaction).kind : null; PEDSTATE[i] = rk;   // CrimeActions shows 'demand cash' only once hands are really up
      if (react) {
        const R = react as Reaction;
        if (nowS >= R.shoutAt) { if (Math.hypot(p.x - me.x, p.z - me.z) < 45) shout(i, lineFor(R.kind), R.kind === 'freeze' ? 1.8 : 2.6); R.shoutAt = R.kind === 'flee' || R.kind === 'confront' ? nowS + 4 + Math.random() * 3 : 1e9; }
        if (R.kind === 'film' && !R.calledIn && R.callAt && nowS >= R.callAt) { R.calledIn = true; if (reportCrime(R.fx, R.fz)) GAME.notice = '📞 A witness is calling the police on you!'; }   // step 6 listens for 'arl-witness-report'
      }
      const hour=wc.hh + wc.mm/60;
      p.mode = (hour < 6 || hour >= 22) ? 'home' : (hour < 10 || (hour >= 16 && hour < 19)) ? 'commute' : hour >= 19 ? 'social' : 'work';
      if (eventActive && i % 11 === 0) p.mode='flee';
      const prof = CITY.districts.find(d=>d.name===((p.mode==='home'||p.mode==='social')?p.home:p.work));
      if(prof) p.target=[prof.x+p.ox,prof.z+p.oz];
      if(p.mode==='flee'){ const dx=p.x-(p.target[0]||0),dz=p.z-(p.target[1]||0),len=Math.hypot(dx,dz)||1;p.target=[p.x+dx/len*18,p.z+dz/len*18]; if(i%11===0 && Math.random()<.002) window.dispatchEvent(new CustomEvent('arl-npc-alert',{detail:`🚨 NPC ${i+1} reported an incident to police.`})); }
      const td=Math.hypot(p.x-p.target[0],p.z-p.target[1]);
      p.tc=Math.max(0,p.tc-dt);
      const rnd=()=>simRand(i,p.rc++), wander=()=>(rnd()<.5?-1:1)*(20+rnd()*25);   // shared-world: each ped's own seeded draws
      // Arrived near the destination: stand and linger for a while (visible on the pavement, never shrunk or hidden), then wander off somewhere else.
      if(p.mode==='flee') p.rest=0;
      else if(p.rest>0){ p.rest-=dt; if(p.rest<=0){ p.ox=wander(); p.oz=wander(); p.tc=0; } else if(td>16){ p.rest=0; p.tc=0; } } // destination changed (time of day): stop lingering
      else if(td<12){ p.rest=12+rnd()*30; }
      const lingering = p.rest>0;
      if (p.down > 0) { p.down -= dt; fall = Math.min(1, (3.2 - p.down) / .25) * Math.min(1, Math.max(0, p.down) / .35); }
      else {
        let go = !lingering;
        if (rk) { // reacting to a crime: everything except fleeing stands still; fleeing sprints along the pavement away from it
          go = rk === 'flee';
          if (go) { const al = p.axis === 'x' ? p.x - react!.fx : p.z - react!.fz; if (Math.abs(al) > .5) p.dir = al > 0 ? 1 : -1; p.sp = 3.4 * p.vf; }
        }
        else if(p.mode==='flee'){ p.dir = p.axis==='x' ? (p.target[0]>=p.x?1:-1) : (p.target[1]>=p.z?1:-1); p.sp=2.8*p.vf; }
        else if(!lingering && td>4){
          const tx=p.target[0],tz=p.target[1],ox=p.x,oz=p.z;
          if(p.tc<=0){ // walk the pavements: go along the road to the junction nearest the target, turn there, never cut across blocks
            if(p.axis==='x'){
              if(Math.abs(tz-oz)>6){ const kt=Math.max(-5,Math.min(5,Math.round(tx/GRID))); if(Math.abs(ox-kt*GRID)<halfW(kt)+2.5){ p.axis='z'; p.line=kt*GRID+sideFor(kt,ox)*(halfW(kt)+2+p.off); p.u=oz; p.dir=tz>oz?1:-1; p.tc=2.5; } else p.dir=kt*GRID>ox?1:-1; }
              else p.dir=tx>ox?1:-1;
            } else {
              if(Math.abs(tx-ox)>6){ const kr=Math.max(-5,Math.min(5,Math.round(tz/GRID))); if(Math.abs(oz-kr*GRID)<halfW(kr)+2.5){ p.axis='x'; p.line=kr*GRID+sideFor(kr,oz)*(halfW(kr)+2+p.off); p.u=ox; p.dir=tx>ox?1:-1; p.tc=2.5; } else p.dir=kr*GRID>oz?1:-1; }
              else p.dir=tz>oz?1:-1;
            }
          }
          p.sp = (p.mode==='commute'?1.8:p.mode==='social'?1.35:1.1)*p.vf;
        }
        { // bodies are solid: step aside for whoever is in the way (to your own side, so two people walking towards each other pass cleanly), and stop when there is no room
          const ax = p.axis === 'x'; let dodge = false, stop = false;
          const see = (ox: number, oz: number) => {
            const along = ((ax ? ox - p.x : oz - p.z)) * p.dir, perp = ax ? oz - p.z : ox - p.x, railPerp = ax ? oz - (p.z - p.lat) : ox - (p.x - p.lat);
            if (along > -.6 && along < 1.7 && Math.abs(railPerp) < PED_PUSH) dodge = true;
            if (along > -.05 && along < PED_PUSH + .15 && Math.abs(perp) < PED_PUSH - .1) stop = true;
          };
          for (let q = 0; q < peds.length; q++) { const o = peds[q]; if (q !== i && !o.hidden && o.down <= 0) see(o.x, o.z); }
          if (!VEH.drv && !GAME.jailed) see(me.x, me.z);
          for (const f of feetOn) see(f.x, f.z);
          if (stop && rk !== 'flee') go = false;
          p.latT = dodge ? PED_PUSH * p.dir : 0;
        }
        const nx = nextCenter(p.u, p.dir), rj = Math.round(nx / GRID);
        if (Math.abs(rj) <= 5) { const dist = (nx - p.u) * p.dir - (halfW(rj) + .3); if (dist > -.05 && dist < .5 && signalised(rj, Math.round(p.line / GRID)) && !canCross(t, p.axis === 'x' ? 'z' : 'x') && rk !== 'flee') go = false; } // wait at the kerb for a red light (not when running for your life)
        if (go && rk !== 'flee') {   // solid ahead (a wall, fence, building, parked car or house)? don't walk into it: turn round and pick another destination
          const ax2 = p.axis === 'x', au = p.u + p.dir * .9, hx = ax2 ? au : p.line + p.lat, hz = ax2 ? p.line + p.lat : au;
          if (pedHit(hx, hz, BODY_R)) { p.dir = (-p.dir) as 1 | -1; p.tc = 3; p.rest = 0; p.ox = wander(); p.oz = wander(); go = false; }
        }
        if (go) { const activityFactor = rk === 'flee' ? 1 : night ? .55 : rain ? .72 : (wc.hh >= 7 && wc.hh < 10 ? 1.15 : 1); p.u += p.dir * p.sp * activityFactor * dt; p.ph += dt * p.sp * 5; p.moving = true; if (p.u > PED_LIM) { p.u = PED_LIM; p.dir = -1; } else if (p.u < -PED_LIM) { p.u = -PED_LIM; p.dir = 1; } }
      }
      if (p.axis === 'x') { p.x = p.u; p.z = p.line; } else { p.x = p.line; p.z = p.u; }
      p.lat += (p.latT - p.lat) * Math.min(1, dt * 3.5); if (p.axis === 'x') p.z += p.lat; else p.x += p.lat;   // the sidestep
      pushPed(p, BODY_R);   // never stand inside a wall, fence, building, parked car or house
      if (p.down <= 0 && VEH.drv && Math.abs(VEH.v) > 3.5) { const dx = p.x - VEH.x, dz = p.z - VEH.z; if (dx * dx + dz * dz < 3.6) { p.down = 3.2; VEH.v *= .9; thud(.5); pushCrime({ kind: 'runover', x: p.x, z: p.z, victim: i }); } } // clipped by the player's car
      const yawT = react && rk !== 'flee' ? Math.atan2(-((react as Reaction).fz - p.z), (react as Reaction).fx - p.x) : p.axis === 'x' ? (p.dir > 0 ? 0 : Math.PI) : -p.dir * Math.PI / 2, sw = p.moving ? Math.sin(p.ph) : 0;   // witnesses turn to look at the crime
      if (Number.isNaN(p.yaw)) p.yaw = yawT; let dyw = yawT - p.yaw; dyw = Math.atan2(Math.sin(dyw), Math.cos(dyw)); p.yaw += dyw * Math.min(1, dt * (react ? 14 : 9)); const pv = PEDVIEW[i] || (PEDVIEW[i] = { x: 0, z: 0, yaw: 0, on: false }); pv.x = p.x; pv.z = p.z; pv.yaw = p.yaw; pv.on = !p.hidden && p.down <= 0; // turn smoothly instead of snapping 180°
      p.vis += ((p.hidden ? 0 : 1) - p.vis) * Math.min(1, dt * 5); const sc = Math.max(.001, p.vis); T.sc.set(sc, sc, sc);
      const Pz = pose.current[i], kk = Math.min(1, dt * 8);   // smooth the reaction pose so hands go up / crouch / phone comes out over a moment
      Pz.up += ((rk === 'handsup' ? 1 : rk === 'cower' ? .75 : 0) - Pz.up) * kk; Pz.crouch += ((rk === 'cower' ? 1 : 0) - Pz.crouch) * kk; Pz.film += ((rk === 'film' ? 1 : 0) - Pz.film) * kk; Pz.angry += ((rk === 'confront' ? 1 : 0) - Pz.angry) * kk; Pz.give += ((rk === 'give' ? 1 : 0) - Pz.give) * kk;
      const lean = (rk === 'flee' && p.moving ? .22 : 0) + Pz.crouch * .45;
      T.qa.setFromAxisAngle(T.Y, p.yaw); T.qb.setFromAxisAngle(T.Z, -(fall * Math.PI / 2 + lean)); T.q.copy(T.qa).multiply(T.qb);
      // the hip drops as the legs swing apart / bend so the lowest foot always rests on the ground (before, both feet lifted off it mid-stride)
      const legA = sw * .7 + Pz.crouch, legB = -sw * .7 + Pz.crouch, hipDrop = .76 * (Math.max(Math.cos(legA), Math.cos(legB)) - 1) * (1 - Math.min(1, fall));
      T.pos.set(p.x, .12 * fall + hipDrop, p.z); T.base.compose(T.pos, T.q, T.sc);
      part(torso.current, i, 0, 1.05, 0); part(head.current, i, 0, 1.52, 0);
      part(legs.current, i * 2, 0, .78, .1, sw * .7 + Pz.crouch, -.38); part(legs.current, i * 2 + 1, 0, .78, -.1, -sw * .7 + Pz.crouch, -.38);
      const trem = Math.sin(t * 22 + i) * .07 * Pz.up, aL = -sw * .6 * (1 - Pz.up) + (2.8 + trem) * Pz.up, aR0 = sw * .6 * (1 - Pz.up) + (2.8 - trem) * Pz.up;
      const aR = aR0 * (1 - Pz.film - Pz.angry - Pz.give) + 1.75 * Pz.film + (1.25 + Math.sin(t * 10 + i) * .55) * Pz.angry + 1.55 * Pz.give;   // hands up / phone held out / angry gesture
      part(arms.current, i * 2, 0, 1.3, .27, aL, -.25); part(arms.current, i * 2 + 1, 0, 1.3, -.27, aR, -.25);
      part(handA.current, i, 0, 1.3, .27, aL, -.5); part(handB.current, i, 0, 1.3, -.27, aR, -.5);   // hands at the wrists, following the arms
      partFlat(footA.current, i, 0, .78, .1, sw * .7 + Pz.crouch, -.725); partFlat(footB.current, i, 0, .78, -.1, -sw * .7 + Pz.crouch, -.725); partFlat(soles.current, i * 2, 0, .78, .1, sw * .7 + Pz.crouch, -.725); partFlat(soles.current, i * 2 + 1, 0, .78, -.1, -sw * .7 + Pz.crouch, -.725);
      if (Pz.film > .6) { T.t.makeTranslation(.52, 1.4, -.27); T.m.copy(T.base).multiply(T.t); } else T.m.makeScale(0, 0, 0);
      phone.current.setMatrixAt(i, T.m);
    });
    for (const m of [torso, head, legs, arms, handA, handB, footA, footB, soles, phone]) m.current.instanceMatrix.needsUpdate = true;
  });
  return <>
    <instancedMesh ref={torso} args={[undefined, undefined, PED_N]} frustumCulled={false} castShadow><boxGeometry args={[.26, .56, .46]} /><meshStandardMaterial roughness={.9} /></instancedMesh>
    <instancedMesh ref={head} args={[undefined, undefined, PED_N]} frustumCulled={false}><sphereGeometry args={[.14, 10, 8]} /><meshStandardMaterial roughness={.8} /></instancedMesh>
    <instancedMesh ref={legs} args={[undefined, undefined, PED_N * 2]} frustumCulled={false}><boxGeometry args={[.15, .76, .17]} /><meshStandardMaterial roughness={.9} /></instancedMesh>
    <instancedMesh ref={arms} args={[undefined, undefined, PED_N * 2]} frustumCulled={false}><boxGeometry args={[.11, .52, .11]} /><meshStandardMaterial roughness={.9} /></instancedMesh>
    <instancedMesh ref={handA} args={[G.handA, undefined, PED_N]} frustumCulled={false}><meshStandardMaterial roughness={.6} /></instancedMesh>
    <instancedMesh ref={handB} args={[G.handB, undefined, PED_N]} frustumCulled={false}><meshStandardMaterial roughness={.6} /></instancedMesh>
    <instancedMesh ref={footA} args={[G.footA, undefined, PED_N]} frustumCulled={false}><meshStandardMaterial roughness={.6} /></instancedMesh>
    <instancedMesh ref={footB} args={[G.footB, undefined, PED_N]} frustumCulled={false}><meshStandardMaterial roughness={.6} /></instancedMesh>
    <instancedMesh ref={soles} args={[G.sole, undefined, PED_N * 2]} frustumCulled={false}><meshStandardMaterial color="#2a2623" roughness={.9} /></instancedMesh>
    <instancedMesh ref={phone} args={[undefined, undefined, PED_N]} frustumCulled={false}><boxGeometry args={[.05, .1, .02]} /><meshBasicMaterial color="#9be8ff" /></instancedMesh>
  </>;
}


/* ───────────── NPC speech bubbles: "Oga, abeg, don't shoot!" (newest 4 shown, anchored above the ped) ───────────── */
export function NpcShouts() {
  const slots = useRef<(THREE.Group | null)[]>([]), [list, setList] = useState<typeof SHOUTS>([]);
  useEffect(() => { const id = setInterval(() => { const now = wnow(), act = SHOUTS.filter(s => s.until > now).slice(-4); setList(prev => (prev.map(s => s.id).join() === act.map(s => s.id).join() ? prev : act)); }, 200); return () => clearInterval(id); }, []);
  useFrame(() => { list.forEach((s, k) => { const g = slots.current[k], q = s.i >= DRV_SHOUT ? TPOS[s.i - DRV_SHOUT] : PEDPOS[s.i]; if (g && q && q.x < 9e4) g.position.set(q.x, s.i >= DRV_SHOUT ? 3.2 : 2.15, q.z); }); });
  return <>
    <RuntimeStyle id="arl-npc-shout" css={`.npcShout{background:#fffffff2;color:#111;border-radius:12px;padding:4px 9px;font-size:12px;font-weight:800;white-space:nowrap;box-shadow:0 3px 10px #0007;pointer-events:none;animation:popIn .15s both}.npcShout:after{content:'';position:absolute;left:50%;bottom:-5px;margin-left:-5px;border:5px solid transparent;border-bottom:0;border-top-color:#fffffff2}`} />
    {list.map((s, k) => <group key={s.id} ref={el => { slots.current[k] = el; }}><Html center zIndexRange={[6, 0]}><div className="npcShout" style={{ position: 'relative' }}>{s.text}</div></Html></group>)}
  </>;
}


/* ───────────── the player's car ───────────── */
export const CAR_COLOR = '#ff6a00';

export function PlayerCar({ carRef, tagRef, spotRef, model, look }: { carRef: React.MutableRefObject<THREE.Group>; tagRef: React.MutableRefObject<HTMLDivElement | null>; spotRef: React.MutableRefObject<THREE.SpotLight>; model: string; look: Look }) {
  const kit = pkit(), tgt = useMemo(() => new THREE.Object3D(), []);
  // the seated figure is YOU (your avatar is hidden while you drive): it wears your look, and it is only there while you are at the wheel. It was always there before, so a car you had just jacked still showed its old driver.
  const drvObj = useRef<THREE.Object3D | null>(null), setDrv = useMemo(() => (g: THREE.Object3D | null) => { drvObj.current = g; }, []);
  const dl = useMemo<DrvLook>(() => ({ skin: look.skin, outfit: look.outfit, hairColor: look.hairColor }), [look.skin, look.outfit, look.hairColor]);
  useFrame(() => { if (drvObj.current) drvObj.current.visible = VEH.drv; }); const [, bump] = useState(0); useEffect(() => { JACK.refresh = () => bump(v => v + 1); return () => { JACK.refresh = () => {}; }; }, []);
  useEffect(() => { const f = () => bump(v => v + 1); window.addEventListener('arl-pax', f); return () => window.removeEventListener('arl-pax', f); }, []);   // a friend got in or out
  const guests = guestsOf(PAX.me).map(g => ({ look: g.look, seed: g.name, seat: g.seat }));
   const stolen = JACK.on; const [style,setStyle]=useState<any>(null); useEffect(()=>{fetch('/api/vehicles').then(r=>r.ok?r.json():null).then(d=>setStyle(d?.vehicles?.[0]||null)).catch(()=>{});},[model]);
  useLayoutEffect(() => { spotRef.current.target = tgt; }, [tgt, spotRef]);
  return <group ref={carRef} visible={false}>
    {stolen && JACK.sRole === 'bus' ? <BusBody driverRef={setDrv} look={dl} /> : stolen && JACK.sRole === 'bike' ? <BikeBody scale={.95} rider driverRef={setDrv} riderLook={look} /> : stolen && JACK.sRole === 'taxi' ? <TaxiBody kit={kit} refs={{ driverRef: setDrv, look: dl }} /> : stolen && JACK.sRole === 'police' ? <PoliceBody kit={kit} refs={{ driverRef: setDrv, look: dl }} /> : <CarModel kit={kit} color={stolen ? JACK.color : (vehicleByName(model).color || CAR_COLOR)} kind={0} driverRef={setDrv} look={dl} model={stolen ? JACK.model : model} style={stolen ? undefined : (style||undefined)} pax={guests} />}
    <spotLight ref={spotRef} position={[2.2, .9, 0]} angle={.5} penumbra={.7} intensity={0} distance={42} decay={2} color="#fff4d6" />
    <primitive object={tgt} position={[16, .2, 0]} />
    <Html position={[0, 2.4, 0]} center zIndexRange={[5, 0]}><div ref={el => { tagRef.current = el; }} className="cityBizTag" style={{ display: 'none' }}>Your car<br /><small>Press E</small></div></Html>
  </group>;
}

// Your car is a real, physical car: it is parked at the kerb beside the road nearest to you ONCE (when you get it / when the city loads) and then stays
// exactly where you leave it. You walk to it; there is no calling it. Mid-block, clear of junctions and of other cars.
export function parkNear(px: number, pz: number) {
  JACK.release();
  const ix = Math.round(px / GRID), iz = Math.round(pz / GRID), alongZ = Math.abs(px - ix * GRID) <= Math.abs(pz - iz * GRID);
  const road = Math.max(-5, Math.min(5, alongZ ? ix : iz)), dev = alongZ ? px - ix * GRID : pz - iz * GRID, side: 1 | -1 = dev >= 0 ? 1 : -1;
  const base = alongZ ? pz : px, axisKey = alongZ ? 'z' : 'x';
  const touches = (q: { x: number; z: number; r: number }, c: { x: number; z: number; r: number }) => [-1.35, 0, 1.35].some(o => Math.hypot(c.x + Math.cos(c.r) * o - q.x, c.z - Math.sin(c.r) * o - q.z) < CAR_R + q.r + .15);
  let sp = curbSpot(axisKey, road, base, side);
  for (let n = 0; n < 60; n++) {   // search outwards along the kerb for the first spot that is clear of junctions, cars, posts and trees
    const cand = curbSpot(axisKey, road, THREE.MathUtils.clamp(base + (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 2.5, -112 * WS, 112 * WS), side);
    if (inJunction(cand.x, cand.z, 3.5)) continue;
    if (TPOS.some(c => Math.hypot(c.x - cand.x, c.z - cand.z) < 5) || Math.hypot(cand.x - px, cand.z - pz) < 3) continue;
    if (CAR_POSTS.some(q => Math.abs(q.x - cand.x) < 6 && Math.abs(q.z - cand.z) < 6 && touches(q, cand))) continue;
    sp = cand; break;
  }
  VEH.x = sp.x; VEH.z = sp.z; VEH.r = sp.r; VEH.v = 0; VEH.placed = true; VEH.drv = false; VEH.homed = true;
}
