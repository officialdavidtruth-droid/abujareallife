'use client';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import Human from './Human';
import { DEFAULT_LOOK, type Look } from '../lib/characterModels';
import { NET } from '../lib/cityNet';
import { OWNER_CHASE_SECS, OWNER_REPORT_SECS } from '../lib/profile';
import { engineStart, engineStop, honk, thud } from '../lib/cityAudio';
import { VEHICLE_CATALOG, ROAD_TRAFFIC_CATALOG, vehicleById, vehicleByName } from '../lib/vehicles';
import RuntimeStyle from './RuntimeStyle';
import { worldCalendar, weatherAt, simSeconds } from '../lib/worldClock';
import { TrafficCore, LOOP } from '../lib/trafficCore';
import { createPortal } from 'react-dom';
import { BUILDING_DESTS, type Dest } from '../lib/destinations';
import DestPicker, { DEST_PICKER_CSS } from './DestPicker';
import { DRVVIEW, DRV_PRI, DRV_SHOUT, OWNER, OWNER_LINES, drainDriverCrimes, driverDecide, driverLine, ownerSay, perceiveDriver, personaOf, reportCrime, shout, wnow, type DriverReaction } from '../lib/witness';
import { GRID, WS, CURB, CURB_BUS, CURB_CAR, inJunction, exitSpot, halfW, signalised, planRide, newRide, stepRide, type Route, type RideState } from '../lib/roadRoute';
import { GAME, INTER, LCOL, OBS, OWN, TPOS, VEH, hs, lightState, pick, smooth } from './cityShared';
import { BikeBody, BusBody, CarModel, PoliceBody, TaxiBody, carKit, driverStyle, drvMat, pkit } from './CityCars';
import { BILLBOARDS } from './CityScenery';
import { BodyDom } from './CityUi';
import { PAX, guestsOf } from './cityPax';

export function Signals() {
  const poles = useRef<THREE.InstancedMesh>(null!), heads = useRef<THREE.InstancedMesh>(null!), last = useRef('');
  const corners = useMemo(() => INTER.filter(it => signalised(Math.round(it.x / GRID), Math.round(it.z / GRID))).flatMap(it => [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) => ({ x: it.x + sx * (it.hv + 1.1), z: it.z + sz * (it.hh + 1.1), axis: (sx * sz > 0 ? 'x' : 'z') as 'x' | 'z' }))), []);
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    corners.forEach((c, i) => { o.position.set(c.x, 2.4, c.z); o.updateMatrix(); poles.current.setMatrixAt(i, o.matrix); o.position.set(c.x, 4.95, c.z); o.updateMatrix(); heads.current.setMatrixAt(i, o.matrix); heads.current.setColorAt(i, LCOL.g); });
    poles.current.instanceMatrix.needsUpdate = true; heads.current.instanceMatrix.needsUpdate = true;
  }, [corners]);
  useFrame(st => {
    const t = simSeconds(), xs = lightState(t, 'x') as 'g' | 'y' | 'r', zs = lightState(t, 'z') as 'g' | 'y' | 'r', key = xs + zs;
    if (key === last.current) return; last.current = key;
    corners.forEach((c, i) => heads.current.setColorAt(i, LCOL[c.axis === 'x' ? xs : zs]));
    if (heads.current.instanceColor) heads.current.instanceColor.needsUpdate = true;
  });
  return <>
    <instancedMesh ref={poles} args={[undefined, undefined, corners.length]} frustumCulled={false}><cylinderGeometry args={[.07, .09, 4.8, 6]} /><meshStandardMaterial color="#2f3338" metalness={.5} roughness={.5} /></instancedMesh>
    <instancedMesh ref={heads} args={[undefined, undefined, corners.length]} frustumCulled={false}><boxGeometry args={[.42, .42, .42]} /><meshBasicMaterial color="#ffffff" /></instancedMesh>
  </>;
}

export type Role = 'car' | 'taxi' | 'bike' | 'police' | 'bus';

// Every road user lives in the same lane simulation, so taxis, bikes and police keep gaps / obey lights exactly like normal traffic.
// hail: 0 = driving, 1 = pulling over for a player, 2 = stopped at the kerb waiting.   busy = carrying a player right now.
export type SimCar = { s: number; color: string; kind: number; model: string; role: Role; mul: number; v?: number; off: number; laneShift: number; hail: 0 | 1 | 2; hold?: boolean; stopping?: boolean; readyAt?: number; busy?: boolean };

export type Lane = { axis: 'x' | 'z'; dir: 1 | -1; fixed: number; speed: number; rot: number; road: number; cars: SimCar[] };

/* A ride another player ordered for you (and you accepted): the taxi comes to you and sets off by itself, already paid. */
export const DISPATCH = { idx: -1, ride: null as null | { id: string; name: string; x: number; z: number } };

/* The passengers already on a bus: they each get off at their own stop. n = how many people get off there. */
export type BusStop = { name: string; x: number; z: number; n: number; mine?: boolean };

export const MANIFEST = new Map<number, BusStop[]>();

export function busManifest(): BusStop[] {
  const pool = [...BUILDING_DESTS].sort(() => Math.random() - .5), k = 2 + Math.floor(Math.random() * 3);
  return pool.slice(0, k).map(d => ({ name: d.name, x: d.x, z: d.z, n: 1 + Math.floor(Math.random() * 3) }));
}

export const ROAM = { autoGo: (_i: number) => {}, lanes: [] as Lane[], cars: [] as { l: Lane; c: SimCar }[], sel: -1, rideIdx: -1, openSheet: (_i: number) => {}, tap: (_i: number) => {} };

/* ───────────── GTA-style carjack: the avatar walks to the driver door, yanks it open, throws the driver out and takes the wheel ─────────────
   Works on traffic cars, taxis, police cars, buses and okadas (bikes), and on a real player's car (a frozen "ghost" copy of it is used,
   because the server has already moved the car to you by the time the scene plays). Every duration lives in JT: tweak it live from the
   browser console, e.g.  __arlJackT.throw = 0.9  */
export type JRole = 'car' | 'taxi' | 'police' | 'bus' | 'bike';

export type JRefs = { door?: THREE.Object3D | null; driver?: THREE.Object3D | null; glass?: THREE.Object3D | null };

export const JR: Record<string, JRefs> = {};

export const jrefs = (key: string) => { const o = JR[key] || (JR[key] = {}); return { doorRef: (g: THREE.Object3D | null) => { o.door = g; }, driverRef: (g: THREE.Object3D | null) => { o.driver = g; }, glassRef: (g: THREE.Object3D | null) => { o.glass = g; } }; };

export type JCfg = { stand: [number, number]; seat: [number, number]; seatY: number; land: [number, number]; away: [number, number]; step: [number, number]; ride: [number, number]; wp: [number, number]; door: boolean };

// car-local coordinates: the vehicle faces +x and the driver's side is -z
export const JCFG: Record<'car' | 'bus' | 'bike', JCfg> = {
  car: { stand: [.2, -2.5], seat: [-.27, -.4], seatY: .95, land: [-1.3, -3.3], away: [-1.3, -9], step: [.1, -1.5], ride: [-.25, -.4], wp: [3.4, -1.8], door: true },
  bus: { stand: [2.7, -3.1], seat: [2.4, -.7], seatY: 1.35, land: [1.2, -4.4], away: [-.5, -12], step: [2.6, -2.0], ride: [2.4, -.6], wp: [4.8, -2.8], door: true },
  bike: { stand: [0, -1.7], seat: [-.2, 0], seatY: .85, land: [-.5, -3], away: [-.5, -9], step: [0, -1], ride: [-.1, -.2], wp: [2.4, -1.8], door: false },
};

export const jcfg = (r: JRole) => (r === 'bus' ? JCFG.bus : r === 'bike' ? JCFG.bike : JCFG.car);

export const JT = { walk: 7, open: .45, openWait: .5, throw: .6, step: .8, close: .3, finish: .35, giveUp: 4, arc: .55, lie: 1.05, getUp: .45, run: 3.55, runSpeed: 4.6 };

if (typeof window !== 'undefined') (window as any).__arlJackT = JT;
 // eslint-disable-line @typescript-eslint/no-explicit-any
export const specOf = (id: string) => vehicleById(id) || vehicleByName(id) || VEHICLE_CATALOG[0];

export const COROLLA = 'toyota-corolla-2024';


export const J_SHIRT: Partial<Record<JRole, string>> = { taxi: '#d99a42', police: '#1d3f8f', bus: '#5b6b7a', bike: '#2d8f62' };

export const JACK = {
  key: '', idx: -1, role: 'car' as JRole, ghost: false, gp: { x: 0, z: 0, r: 0 }, ghostOn: false, gModel: '', gColor: '', gLook: DEFAULT_LOOK as Look, gName: '', gUntil: 0,
  ph: 0, t: 0, wp: 0, walk: false, fx: false,
  on: false, sRole: 'car' as JRole, stolenIdx: -1, model: '', color: '', victimUntil: 0,
  refresh: () => {}, ghostRefresh: () => {}, setNpcLook: (_l: Look) => {},
  npc: { on: false, t: 0, from: [0, 0, 0] as [number, number, number], to: [0, 0] as [number, number], run: [0, 0] as [number, number], yaw: 0, walk: false, chase: false, cx: 0, cz: 0, said: 0, called: false },
  /** nearest vehicle you could jack: ordinary car, taxi, police car, bus or bike (not one that is carrying / being hailed) */
  nearest(px: number, pz: number, range: number) {
    let bi = -1, bd = range;
    ROAM.cars.forEach((e, i) => { const tp = TPOS[i]; if (!tp || tp.x > 9e4 || e.c.busy || e.c.hail || e.c.hold) return; const d = Math.hypot(px - tp.x, pz - tp.z); if (d < bd) { bd = d; bi = i; } });
    return bi;
  },
  /** what the server needs to know to give you the car: its role and catalogue model (taxis and police cars are Corollas) */
  info(i: number) { const c = ROAM.cars[i]?.c; if (!c) return null; return { role: c.role as JRole, model: c.role === 'taxi' || c.role === 'police' ? COROLLA : c.model }; },
  start(i: number) {
    const e = ROAM.cars[i], tp = TPOS[i];
    if (JACK.ph || !e || !tp || e.c.busy || GAME.ride || VEH.drv || GAME.jailed || CINE.on) return false;
    JACK.release(); Object.assign(JACK, { key: 'n' + i, idx: i, role: e.c.role as JRole, ghost: false, ph: 1, t: 0, wp: 0, fx: false }); e.c.hold = true; return true;
  },
  /** a real player's car: it is already yours server-side, so the scene plays on a frozen copy of it where it stood */
  startGhost(name: string, x: number, z: number, r: number, look: Look) {
    if (JACK.ph || GAME.ride || VEH.drv || GAME.jailed || CINE.on) return false;
    JACK.release(); const trafficCatalog = ROAD_TRAFFIC_CATALOG.length ? ROAD_TRAFFIC_CATALOG : [VEHICLE_CATALOG[0]]; const m = trafficCatalog[Math.floor(hs(name) * trafficCatalog.length)];
    Object.assign(JACK, { key: 'ghost', idx: -1, role: 'car' as JRole, ghost: true, gp: { x, z, r }, gModel: m.id, gColor: m.color, gLook: look, gName: name, gUntil: Infinity, ghostOn: true, ph: 1, t: 0, wp: 0, fx: false });
    JACK.ghostRefresh(); return true;
  },
  /** true while a jacked real player's own car must not be drawn by their Remote (the ghost copy is playing / the server has not caught up yet) */
  hides(name: string) { return JACK.gName === name && Date.now() < JACK.gUntil; },
  /** hand the jacked traffic vehicle back to traffic (the car you own is in your garage) */
  release() { if (!JACK.on) return; JACK.on = false; if (JACK.stolenIdx >= 0) respawnRoamer(JACK.stolenIdx); JACK.stolenIdx = -1; JACK.refresh(); },
  abort() {
    const o = JR[JACK.key] || {}, c = ROAM.cars[JACK.idx]?.c; if (c) c.hold = false;
    if (o.door) o.door.rotation.y = 0; if (o.glass) o.glass.visible = true; if (o.driver) o.driver.visible = true;
    if (JACK.ghost) { JACK.ghostOn = false; JACK.gUntil = Date.now() + 6000; JACK.ghostRefresh(); }
    JACK.npc.on = false; JACK.idx = -1; JACK.ph = 0; JACK.walk = false; JACK.ghost = false;
  },
  /** you were the one driving when someone took your car: you are thrown out and left on the ground */
  victimEject() {
    const cs = Math.cos(VEH.r), sn = Math.sin(VEH.r);
    GAME.tp = { x: VEH.x - .3 * cs - 2.6 * sn, z: VEH.z + .3 * sn - 2.6 * cs }; JACK.victimUntil = Date.now() + 1800; engineStop(); thud(1.2);
  },
};

export const ease = (u: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, u)), 3);

export function stepJack(p: { x: number; z: number; r: number; y: number; vy: number }, dt: number, ctl: { recenter: boolean }) {
  const cfg = jcfg(JACK.role), o = JR[JACK.key] || {}, e = ROAM.cars[JACK.idx], c = e?.c, tp = JACK.ghost ? JACK.gp : TPOS[JACK.idx];
  if (!tp || (!JACK.ghost && (!c || c.busy)) || GAME.jailed || GAME.ride) { JACK.abort(); return; }
  const cs = Math.cos(tp.r), sn = Math.sin(tp.r), now = Date.now(), door = o.door, glassy = JACK.role === 'bike' ? null : o.glass;
  const w = (l: [number, number]): [number, number] => [tp.x + l[0] * cs + l[1] * sn, tp.z - l[0] * sn + l[1] * cs]; // vehicle-local -> world
  JACK.t += dt; JACK.walk = false; p.y = 0; p.vy = 0;
  const goto = (x: number, z: number, sp: number) => { const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz); if (d < .12) return true; const s = Math.min(d, sp * dt); p.x += dx / d * s; p.z += dz / d * s; p.r = Math.atan2(dx, dz); JACK.walk = true; return false; };
  const faceCar = () => { p.r = Math.atan2(tp.x - p.x, tp.z - p.z); };
  const punch = () => { NET.me.anim = 'punch'; NET.me.animUntil = now + 450; };
  if (JACK.ph === 1) { // walk round to the driver's side (going round the nose / tail if you start on the other side)
    const dx = p.x - tp.x, dz = p.z - tp.z, lx = dx * cs - dz * sn, lz = dx * sn + dz * cs, stand = w(cfg.stand);
    let arrived = false;
    if (JACK.wp === 0 && lz > cfg.stand[1] + 1.1) { const g = w([(lx >= 0 ? 1 : -1) * cfg.wp[0], cfg.wp[1]]); if (goto(g[0], g[1], JT.walk)) JACK.wp = 1; }
    else arrived = goto(stand[0], stand[1], JT.walk);
    if ((arrived && (JACK.ghost || (c!.v ?? 99) < .5)) || JACK.t > JT.giveUp) { if (c) c.v = 0; p.x = stand[0]; p.z = stand[1]; faceCar(); JACK.ph = 2; JACK.t = 0; }
  } else if (JACK.ph === 2) { // yank the door open (a bike has none: the rider just gets shoved)
    faceCar(); if (!JACK.fx) { JACK.fx = true; punch(); }
    if (cfg.door) { if (door) door.rotation.y = -1.15 * ease(JACK.t / JT.open); if (glassy) glassy.visible = false; } // clear glass out of the way so the open door really is an opening
    if (JACK.t >= JT.openWait) { // grab the driver and throw them out
      let look: Look;
      if (JACK.ghost) look = { ...JACK.gLook };
      else {
        const seed = JACK.role === 'car' ? c!.color + specOf(c!.model).model : JACK.role === 'taxi' ? '#e5b72f' + specOf(COROLLA).model : JACK.role === 'police' ? '#eef1f6' + specOf(COROLLA).model : JACK.key + 'x';
        const st = driverStyle(seed, J_SHIRT[JACK.role]); look = { ...DEFAULT_LOOK, name: 'Driver', skin: st.skin, outfit: st.top, hairColor: st.hair };
      }
      JACK.setNpcLook(look); if (o.driver) o.driver.visible = false;
      const from = w(cfg.seat), to = w(cfg.land), away = w(cfg.away);
      Object.assign(JACK.npc, { on: true, t: 0, from: [from[0], cfg.seatY, from[1]], to, run: away, yaw: Math.atan2(to[0] - from[0], to[1] - from[1]), chase: !JACK.ghost, cx: to[0], cz: to[1], said: 0, called: false });   // step 7: an AI driver chases you and phones the police; a real player's own character is not controlled here
      punch(); thud(.8); JACK.ph = 3; JACK.t = 0;
    }
  } else if (JACK.ph === 3) { // the throw
    faceCar(); if (JACK.t >= JT.throw) { JACK.ph = 4; JACK.t = 0; }
  } else if (JACK.ph === 4) { // step up to the open door
    const spot = w(cfg.step); const there = goto(spot[0], spot[1], 5); if (there || JACK.t > JT.step) { JACK.ph = 5; JACK.t = 0; }
  } else if (JACK.ph === 5) { // get in, the door shuts, you drive off
    const seat = w(cfg.ride); p.x += (seat[0] - p.x) * Math.min(1, dt * 9); p.z += (seat[1] - p.z) * Math.min(1, dt * 9); p.r = tp.r + Math.PI / 2;
    if (cfg.door && door) door.rotation.y = -1.15 * (1 - ease(JACK.t / JT.close));
    if (JACK.t >= JT.finish) {
      if (door) door.rotation.y = 0; if (glassy) glassy.visible = true; if (o.driver) o.driver.visible = true;
      if (!JACK.on) { OWN.had = VEH.placed; OWN.x = VEH.x; OWN.z = VEH.z; OWN.r = VEH.r; }   // remember where your own car is parked
      VEH.x = tp.x; VEH.z = tp.z; VEH.r = tp.r; VEH.v = 0; VEH.placed = true; VEH.drv = true; engineStart(); ctl.recenter = true;
      p.x = tp.x; p.z = tp.z;
      JACK.on = true; JACK.sRole = JACK.role;
      if (JACK.ghost) { JACK.model = JACK.gModel; JACK.color = JACK.gColor; JACK.stolenIdx = -1; JACK.ghostOn = false; JACK.gUntil = Date.now() + 6000; JACK.ghostRefresh(); }
      else { JACK.model = JACK.role === 'taxi' || JACK.role === 'police' ? COROLLA : c!.model; JACK.color = JACK.role === 'taxi' ? '#e5b72f' : JACK.role === 'police' ? '#eef1f6' : c!.color; JACK.stolenIdx = JACK.idx; c!.hold = false; c!.v = 0; c!.busy = true; } // the traffic vehicle is now YOUR vehicle
      JACK.idx = -1; JACK.ph = 0; JACK.walk = false; JACK.ghost = false; JACK.refresh();
    }
  }
}

/** the thrown-out driver: flies out of the seat, lands on the road, lies there, gets up and runs away */
export function JackNpc() {
  const g = useRef<THREE.Group>(null!), bub = useRef<THREE.Group>(null!), [look, setLook] = useState<Look>(DEFAULT_LOOK), [say, setSay] = useState('');
  useEffect(() => { const id = setInterval(() => { const v = OWNER.until > wnow() ? OWNER.text : ''; setSay(p => (p === v ? p : v)); }, 150); return () => clearInterval(id); }, []);
  useEffect(() => { JACK.setNpcLook = setLook; return () => { JACK.setNpcLook = () => {}; }; }, []);
  useFrame((_, dtRaw) => {
    const n = JACK.npc, gr = g.current; if (!gr) return;
    if (!n.on) { gr.visible = false; if (bub.current) bub.current.visible = false; return; }
    const dt = Math.min(dtRaw, .05); n.t += dt; const t = n.t; n.walk = false;
    const LIE = -1.45, t1 = JT.arc, t2 = t1 + JT.lie, t3 = t2 + JT.getUp, t4 = t3 + JT.run;
    let x = n.to[0], z = n.to[1], y = .13, rx = LIE, yaw = n.yaw;
    if (t < t1) { const u = t / t1; x = n.from[0] + (n.to[0] - n.from[0]) * u; z = n.from[2] + (n.to[1] - n.from[2]) * u; y = n.from[1] * (1 - u) + .13 * u + 1.1 * Math.sin(Math.PI * u); rx = LIE * ease(u * 1.4); }
    else if (t < t2) { /* lying in the road */ }
    else if (t < t3) { const u = ease((t - t2) / JT.getUp); rx = LIE * (1 - u); y = .13 * (1 - u); }
    else if (n.chase) {   // step 7: the owner does not just run off: they chase you, shout, then stand and phone the police (Step 6 sends the patrol)
      const tc = t3 + OWNER_CHASE_SECS, tr = tc + OWNER_REPORT_SECS; rx = 0; y = 0;
      const tg = VEH.drv ? VEH : GAME.player, dx = tg.x - n.cx, dz = tg.z - n.cz, d = Math.hypot(dx, dz) || 1;
      if (t < tc && d < 45) { if (d > 1.8) { const st = Math.min(d - 1.8, 5.2 * dt); n.cx += dx / d * st; n.cz += dz / d * st; n.walk = true; } if (OWNER.until < wnow()) ownerSay(OWNER_LINES[Math.floor(t * 1.7) % OWNER_LINES.length], 1.6); }
      else if (t < tr) { if (!n.said) { n.said = 1; ownerSay('Hello? Police! Somebody stole my car!', OWNER_REPORT_SECS + 1.2); } }
      else if (t < tr + 3) { if (!n.called) { n.called = true; if (reportCrime(n.cx, n.cz)) GAME.notice = '📞 The owner is calling the police on you!'; } }
      else { n.on = false; gr.visible = false; if (bub.current) bub.current.visible = false; OWNER.until = 0; return; }
      x = n.cx; z = n.cz; yaw = Math.atan2(dx, dz);
    }
    else if (t < t4) { rx = 0; y = 0; const dx = n.run[0] - n.to[0], dz = n.run[1] - n.to[1], d = Math.hypot(dx, dz) || 1, k = Math.min(1, (t - t3) * JT.runSpeed / d); x = n.to[0] + dx * k; z = n.to[1] + dz * k; yaw = Math.atan2(dx, dz); n.walk = k < 1; }
    else { n.on = false; gr.visible = false; return; }
    gr.visible = true; gr.rotation.order = 'YXZ'; gr.position.set(x, y, z); gr.rotation.set(rx, yaw, 0);
    if (bub.current) { bub.current.visible = t >= t3 && OWNER.until > wnow(); bub.current.position.set(x, 2.3, z); }
  });
  return <><group ref={g} visible={false}><Human key={look.skin + look.outfit + look.hairColor} look={look} getState={() => (JACK.npc.walk ? 'walk' : 'idle')} getAnim={() => undefined} getSpeed={() => (JACK.npc.chase ? 3.6 : 2.6)} /></group>
    <group ref={bub} visible={false}><Html center zIndexRange={[6, 0]}>{say ? <div className="npcShout" style={{ position: 'relative' }}>{say}</div> : null}</Html></group></>;
}

/** a frozen copy of a real player's car, used only while the carjack scene plays */
export function JackGhost() {
  const [, bump] = useState(0), kit = pkit();
  useEffect(() => { JACK.ghostRefresh = () => bump(v => v + 1); return () => { JACK.ghostRefresh = () => {}; }; }, []);
  if (!JACK.ghostOn) return null;
  return <group position={[JACK.gp.x, 0, JACK.gp.z]} rotation={[0, JACK.gp.r, 0]}><CarModel kit={kit} color={JACK.gColor} kind={0} model={JACK.gModel} look={JACK.gLook} {...jrefs('ghost')} /></group>;
}

export const isHail = (r: Role) => r === 'taxi' || r === 'bike' || r === 'bus';
 // vehicles a player can flag down
export const roleOf = (n: number): Role => (n % 17 === 7 ? 'bus' : n % 4 === 1 ? 'taxi' : n % 9 === 3 ? 'bike' : n % 12 === 5 ? 'police' : 'car');

export const ROLE_MUL: Record<Role, number> = { car: 1, taxi: 1, bike: .8, police: 1.15, bus: .72 };

export const COLORS = ['#c0392b', '#e8e8ea', '#1f2933', '#2c5aa0', '#8e949a', '#b7791f', '#0f766e', '#7c2d12', '#d9d9dc', '#1e9e55'];

export function makeLanes(): Lane[] {
  const lanes: Lane[] = []; let n = 0;
  for (let i = -5; i <= 5; i++) {
    const hw = halfW(i), off = hw * .5, major = hw > 3;
    for (const axis of ['x', 'z'] as const) for (const dir of [1, -1] as const) {
      const fixed = axis === 'x' ? i * GRID + (dir === 1 ? off : -off) : i * GRID + (dir === 1 ? -off : off); // drive on the right
      const rot = axis === 'x' ? (dir === 1 ? 0 : Math.PI) : (dir === 1 ? -Math.PI / 2 : Math.PI / 2);
      const cars = Array.from({ length: major ? 2 : 1 }, (_, k): SimCar => { const role = roleOf(n); return { s: (-100 + k * 105 + hs(`${i}${axis}${dir}${k}`) * 40) * WS, color: COLORS[n++ % COLORS.length], kind: (n * 7) % 4, model: ROAD_TRAFFIC_CATALOG[(n + k) % ROAD_TRAFFIC_CATALOG.length].id, role, mul: ROLE_MUL[role], off: 0, laneShift: 0, hail: 0 }; });
      lanes.push({ axis, dir, fixed, speed: major ? 9 : 6.5, rot, road: i, cars });
    }
  }
  return lanes;
}

export const nextCenter = (s: number, dir: 1 | -1) => (dir === 1 ? Math.floor(s / GRID + 1e-6) * GRID + GRID : Math.ceil(s / GRID - 1e-6) * GRID - GRID);

export const v0 = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/* Roaming taxis & bike taxis: they drive the city like normal traffic. Tap one to hail it; it pulls over to the kerb, then tap again to choose a destination. */
export function Traffic() {
  const lanes = useMemo(makeLanes, []), kit = useMemo(carKit, []);
  const flat = useMemo(() => lanes.flatMap(l => l.cars.map(c => ({ l, c }))), [lanes]);
  const core = useMemo(() => new TrafficCore(lanes.map(l => ({ axis: l.axis, dir: l.dir, road: l.road, speed: l.speed, cars: l.cars.map(c => ({ s: c.s, mul: c.mul })) }))), [lanes]);   // shared-world core: same canonical car positions on every phone (lib/trafficCore.ts)
  const refs = useRef<(THREE.Group | null)[]>([]), DR = useRef<(DriverReaction | null)[]>([]);   // DR: how each AI driver is reacting to a crime right now
  const lbl = useRef<THREE.Group>(null!), lblEl = useRef<HTMLDivElement | null>(null), lblKey = useRef('');
  useEffect(() => {
    ROAM.cars = flat; ROAM.lanes = lanes;
    ROAM.tap = (i: number) => {
      const e = ROAM.cars[i]; if (!e || e.c.busy || GAME.ride || VEH.drv || GAME.jailed) return;
      const t = TPOS[i], d = t ? Math.hypot(GAME.player.x - t.x, GAME.player.z - t.z) : 999, role = e.c.role;
      const nm = role === 'taxi' ? 'taxi' : role === 'bus' ? 'bus' : 'bike';
      if (e.c.hail === 2) { if (d < 18) ROAM.openSheet(i); else GAME.notice = `Walk up to the ${nm} first.`; return; }
      if (e.c.hail === 1) return;
      if (d > 90) { GAME.notice = 'Too far away: wait for it to come closer.'; return; }
      const old = ROAM.cars[ROAM.sel]; if (old && old.c.hail && old.c !== e.c) releaseRoamer(old.c);
      e.c.hail = 1; e.c.stopping = false; e.c.v = e.l.speed * e.c.mul; ROAM.sel = i;
      if (role === 'bus') MANIFEST.set(i, busManifest());
      GAME.notice = role === 'taxi' ? '🚕 Taxi is pulling over for you...' : role === 'bus' ? '🚌 Bus is pulling over at the stop...' : '🚲 Bike taxi is pulling over for you...';
    };
    return () => { ROAM.cars = []; ROAM.sel = -1; ROAM.rideIdx = -1; DISPATCH.idx = -1; MANIFEST.clear(); };
  }, [flat]);
  useFrame((st, dtRaw) => {
    const dt = Math.min(dtRaw, .05), t = simSeconds();
    core.sync(t); if (core.fresh) { flat.forEach(({ c }, i) => { c.s = core.pos(i); }); core.fresh = false; }   // first frame / new era: snap to the shared layout
    const wc = worldCalendar(); const wx = weatherAt(); const rainFactor = wx.storm ? .62 : wx.rain > .45 ? .78 : 1; const rush = (wc.hh >= 7 && wc.hh < 10) || (wc.hh >= 16 && wc.hh < 19) ? 1.18 : 1;
    let nearI = -1, nearD = 90;
    const ROBS: typeof OBS = []; for (const [n, q] of Object.entries(NET.peers)) { if (!q.init) continue; if (q.drv || q.cp) { if (!JACK.hides(n)) ROBS.push({ x: q.cx, z: q.cz, on: true, sp: 7 }); } if (!q.drv) ROBS.push({ x: q.x, z: q.z, on: true, sp: 4.5 }); }   // traffic stops for every real player, in a car or on foot
    const OB = ROBS.length ? OBS.concat(ROBS) : OBS;
    const nowS = wnow(), me = GAME.player, crimes = drainDriverCrimes(), brandishing = !!(window as any).__arlWeapon && !VEH.drv && !GAME.jailed;   // witness AI for drivers (same crimes the pedestrians see)
    flat.forEach(({ l, c }, i) => {
      const tp = TPOS[i] || (TPOS[i] = { x: 0, z: 0, r: 0 }), g = refs.current[i], vw = DRVVIEW[i] || (DRVVIEW[i] = { x: 1e5, z: 1e5, yaw: 0, on: false });
      vw.on = false;
      if (c.busy) { tp.x = 1e5; tp.z = 1e5; vw.x = 1e5; vw.z = 1e5; DR.current[i] = null; if (g) g.visible = false; return; } // it is carrying a player (the ride has its own model)
      if (g) g.visible = true;
      /* ── drivers react to crimes (police cars and cars in a hail / carjack are left alone) ── */
      let rk: DriverReaction | null = DR.current[i] && DR.current[i]!.until > nowS ? DR.current[i] : null;
      if (DR.current[i] && !rk) DR.current[i] = null;
      if (c.role === 'police' || c.hail || c.hold) { rk = DR.current[i] = null; }
      else {
        vw.x = tp.x; vw.z = tp.z; vw.yaw = l.rot; vw.on = true;
        const persona = personaOf(i), start = (kind: DriverReaction['kind'], secs: number, fx: number, fz: number) => {
          if (rk && DRV_PRI[rk.kind] >= DRV_PRI[kind]) return;
          rk = DR.current[i] = { kind, until: nowS + secs, fx, fz, shoutAt: nowS + .2 + Math.random() * .8, callAt: kind === 'film' ? nowS + 2.5 + Math.random() * 2 : 0, calledIn: false, honked: false };
        };
        for (const cr of crimes) {
          const dx = cr.x - tp.x, dz = cr.z - tp.z, d = Math.hypot(dx, dz) || .01;
          const sense = perceiveDriver(cr.kind, d, (Math.cos(l.rot) * dx - Math.sin(l.rot) * dz) / d); if (!sense) continue;
          const r = driverDecide(persona, cr.kind, sense, d, false, Math.random()); if (r) start(r.kind, r.secs, cr.x, cr.z);
        }
        if (brandishing && !rk && Math.random() < dt * 1.5) {   // a drawn gun: drivers who can see it react too
          const dx = me.x - tp.x, dz = me.z - tp.z, d = Math.hypot(dx, dz) || .01;
          if (d < 14 && perceiveDriver('armed', d, (Math.cos(l.rot) * dx - Math.sin(l.rot) * dz) / d) === 'saw') { const r = driverDecide(persona, 'armed', 'saw', d, false, Math.random()); if (r) start(r.kind, r.secs, me.x, me.z); }
        }
        if (rk) {
          const R = rk as DriverReaction, near = Math.hypot(tp.x - me.x, tp.z - me.z) < 45;
          if (nowS >= R.shoutAt) { if (near) shout(DRV_SHOUT + i, driverLine(R.kind), 2.6); R.shoutAt = R.kind === 'flee' || R.kind === 'honk' ? nowS + 4 + Math.random() * 3 : 1e9; }
          if (R.kind === 'honk' && !R.honked && v0(tp, me) < 30) { R.honked = true; honk(); }   // lean on the horn once if you are close enough to hear it
          if (R.kind === 'film' && !R.calledIn && R.callAt && nowS >= R.callAt) { R.calledIn = true; if (reportCrime(R.fx, R.fz)) GAME.notice = '📞 A driver is calling the police on you!'; }
        }
      }
      const base = l.speed * c.mul * rainFactor * rush, EX = halfW(l.road) * .5 + (c.role === 'bus' ? CURB_BUS : c.role === 'bike' ? CURB : CURB_CAR); // (a bus is wide: it stops mostly in the road, not on the pavement) EX: how far the vehicle slides sideways to reach the kerb
      let v = c.v ?? base;
      if (c.hold) { v = Math.max(0, v - 14 * dt); c.v = v; } // being carjacked: brake to a stop
      else if (rk) {   // witnessed a crime: stop and stare / film / honk, or floor it away from it (but never straight towards it)
        const R = rk as DriverReaction, fc = l.axis === 'x' ? R.fx : R.fz, ahead = (fc - c.s) * l.dir;
        if (R.kind === 'flee' && !(ahead > 0 && ahead < 30)) v = Math.min(base * 1.7, (c.v ?? base) + 9 * dt);
        else v = Math.max(0, (c.v ?? base) - 18 * dt);
        c.v = v;
      } else if (c.hail === 1) {
        const prev = l.dir === 1 ? c.s - Math.floor(c.s / GRID) * GRID : Math.ceil(c.s / GRID) * GRID - c.s; // metres past the last junction
        if (prev >= 3 && prev <= 14) c.stopping = true; // brake only mid-block, never inside a junction
        if (c.stopping) v = Math.max(0, v - 16 * dt);
        c.off = Math.min(EX, c.off + 3.5 * dt);
        if (c.stopping && v === 0 && c.off >= EX - .02) { c.hail = 2; c.readyAt = t; if (DISPATCH.idx === i) ROAM.autoGo(i); else { if (Math.hypot(GAME.player.x - tp.x, GAME.player.z - tp.z) < 18) ROAM.openSheet(i); GAME.notice = c.role === 'taxi' ? '🚕 Taxi stopped: walk up and tap it.' : c.role === 'bus' ? '🚌 Bus stopped: walk up and tap it.' : '🚲 Bike taxi stopped: walk up and tap it.'; } }
        c.v = v;
      } else if (c.hail === 2) {
        v = 0; c.v = 0; c.off = EX;
        const d = Math.hypot(GAME.player.x - tp.x, GAME.player.z - tp.z);
        if (DISPATCH.idx !== i && (!CINE.on && (t - (c.readyAt || t) > 120 || d > 140) || (GAME.ride && !CINE.on) || VEH.drv)) releaseRoamer(c); // you changed your mind: it drives off
      } else {
        if (c.off > 0) c.off = Math.max(0, c.off - 2.2 * dt);
        if (c.v !== undefined) { v = Math.min(base, c.v + 5 * dt); c.v = v >= base && c.off === 0 ? undefined : v; }
      }
      let adv = v * dt, gap = Infinity;
      if (!c.hail && !c.hold && !rk && c.v === undefined) {   // free-driving: follow the shared core position. Stopping for you / a crime / a hail makes this car LAG it, then it catches back up.
        const cs = core.pos(i); let lag = (cs - c.s) * l.dir; if (lag > LOOP / 2) lag -= LOOP; else if (lag < -LOOP / 2) lag += LOOP;
        const tx = l.axis === 'x' ? cs : l.fixed, tz = l.axis === 'x' ? l.fixed : cs;
        if (Math.abs(lag) > 60 && Math.hypot(tx - me.x, tz - me.z) > 60 && Math.hypot(tp.x - me.x, tp.z - me.z) > 60) { c.s = cs; adv = 0; }   // far behind and nobody can see the jump: rejoin the shared position
        else { const cap = .6 * v * dt; adv = Math.max(0, v * dt + Math.max(-cap, Math.min(cap, lag * Math.min(1, dt * 1.5)))); }
      }
      let passing = false;   // a hailed vehicle is standing at the kerb ahead: go round it instead of queueing behind it for up to 2 minutes
      for (const o of l.cars) if (o !== c && !o.busy) { const d = (o.s - c.s) * l.dir; if (d > 0 && d < gap) { if (c.hail === 0 && o.hail === 2 && o.off >= .5 && d > 2) { if (d < 16) passing = true; continue; } gap = d; } }
      adv = Math.min(adv, Math.max(0, gap - 7)); // keep a safe distance
      let passAmt = 1.1; const parkedMine = VEH.placed && !VEH.drv && Math.abs(VEH.v) < .5;   // the player's parked car is an obstacle to drive AROUND, not to queue behind for ever
      if (parkedMine && c.hail === 0) { const a1 = ((l.axis === 'x' ? VEH.x : VEH.z) - c.s) * l.dir, p1 = l.axis === 'x' ? Math.abs(VEH.z - l.fixed) : Math.abs(VEH.x - l.fixed); if (a1 > 0 && a1 < 18 && p1 < 2.3) { passing = true; passAmt = Math.min(1.7, halfW(l.road) * .5 + .5); } }
      if(c.role==='car' && c.hail===0 && gap<12 && gap>5 && Math.abs(l.fixed)<100*WS){ const sign=hs('ov'+i)>0.5?1:-1; c.laneShift += (sign*1.15-c.laneShift)*Math.min(1,dt*2.5); v=Math.min(base*1.08,Math.max(v,base*.92)); } else c.laneShift += ((passing ? (l.axis === 'x' ? -l.dir : l.dir) * Math.min(passAmt, passAmt === 1.1 ? halfW(l.road) * .5 : passAmt) : 0) - c.laneShift) * Math.min(1, dt * 3);
      for (const o of OB) { if (!o.on || (o === OBS[1] && parkedMine)) continue; const perp = l.axis === 'x' ? Math.abs(o.z - l.fixed) : Math.abs(o.x - l.fixed), along = ((l.axis === 'x' ? o.x : o.z) - c.s) * l.dir; if (perp < 1.7 && along > 0) adv = Math.min(adv, Math.max(0, along - o.sp)); } // stop for the player (on foot or in a car)
      const nx = nextCenter(c.s, l.dir), d = (nx - c.s) * l.dir, ci = Math.round(nx / GRID);
      const ls = lightState(t, l.axis); if (Math.abs(ci) <= 5 && signalised(ci, l.road) && (ls === 'r' || (ls === 'y' && d - (halfW(ci) + 5.2) > 9)) && d >= halfW(ci) + 5.2 - .05) adv = Math.min(adv, Math.max(0, d - (halfW(ci) + 5.2))); // stop at the red light
      c.s += adv * l.dir; if (c.s > 118 * WS) c.s = -118 * WS; else if (c.s < -118 * WS) c.s = 118 * WS;
      const px = l.axis === 'x' ? c.s : l.fixed - l.dir * c.off + c.laneShift, pz = l.axis === 'x' ? l.fixed + l.dir * c.off + c.laneShift : c.s;
      tp.x = px; tp.z = pz; tp.r = l.rot;
      if (g) { g.position.set(px, 0, pz); g.rotation.y = l.rot; }
      if (isHail(c.role) && !GAME.ride && !VEH.drv && !GAME.jailed) {
        const dd = Math.hypot(GAME.player.x - px, GAME.player.z - pz);
        if (ROAM.sel === i && c.hail) { nearI = i; nearD = -1; } else if (!c.hail && dd < nearD) { nearI = i; nearD = dd; }
      }
    });
    // one floating "hail" tag that follows the closest hailable taxi / bike
    const el = lblEl.current, grp = lbl.current;
    if (el && grp) {
      let key = '';
      if (nearI >= 0) {
        const e = flat[nearI], tp = TPOS[nearI], d = Math.hypot(GAME.player.x - tp.x, GAME.player.z - tp.z), ic = e.c.role === 'taxi' ? '🚕' : e.c.role === 'bus' ? '🚌' : '🚲';
        grp.position.set(tp.x, e.c.role === 'taxi' ? 2.5 : e.c.role === 'bus' ? 3.4 : 2.1, tp.z);
        key = e.c.hail === 1 ? `${ic} Pulling over...` : e.c.hail === 2 ? (d < 18 ? `${ic} Tap to ride` : `${ic} Waiting: walk up`) : `${ic} Tap to hail`;
        if (e.c.hail === 2 && d < 18) key += '|go'; else if (e.c.hail === 0) key += '|go';
      }
      if (key !== lblKey.current) { lblKey.current = key; el.style.display = key ? '' : 'none'; el.className = 'hailTag' + (key.endsWith('|go') ? ' go' : ''); el.textContent = key.replace('|go', ''); el.dataset.i = String(nearI); }
    }
  });
  return <>
    {flat.map(({ l, c }, i) => <group key={i} ref={el => { refs.current[i] = el; }} position={l.axis === 'x' ? [c.s, 0, l.fixed] : [l.fixed, 0, c.s]} rotation={[0, l.rot, 0]}
      onClick={isHail(c.role) ? (e => { if (e.delta > 6) return; e.stopPropagation(); ROAM.tap(i); }) : undefined}>
      {isHail(c.role) && <mesh position={[0, 1.1, 0]}><boxGeometry args={c.role === 'bus' ? [7, 3, 3.4] : [3.4, 2.6, 5.6]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>}
      {c.role === 'taxi' ? <TaxiBody kit={kit} refs={jrefs('n' + i)} /> : c.role === 'bike' ? <BikeBody scale={.95} rider {...jrefs('n' + i)} /> : c.role === 'police' ? <PoliceBody kit={kit} refs={jrefs('n' + i)} /> : c.role === 'bus' ? <BusBody {...jrefs('n' + i)} /> : <CarModel kit={kit} color={c.color} kind={c.kind} model={c.model} {...jrefs('n' + i)} />}
    </group>)}
    <group ref={lbl}><Html center zIndexRange={[4, 0]}><div ref={lblEl} className="hailTag" style={{ display: 'none' }} onClick={() => { const i = Number(lblEl.current?.dataset.i); if (i >= 0) ROAM.tap(i); }} /></Html></group>
  </>;
}

/* a roamer is finished with its passenger / hail: back on the road */
export function releaseRoamer(c: SimCar) { c.hail = 0; c.stopping = false; c.readyAt = undefined; if (ROAM.cars[ROAM.sel]?.c === c) ROAM.sel = -1; }

export function respawnRoamer(idx: number) {
  const e = ROAM.cars[idx]; if (!e) return; const { l, c } = e;
  let best = c.s, bd = -1;
  for (let k = 0; k < 14; k++) { const s = (-110 + Math.random() * 220) * WS, near = Math.min(...l.cars.filter(o => o !== c).map(o => Math.abs(o.s - s)), 999), far = Math.hypot((l.axis === 'x' ? s : l.fixed) - GAME.player.x, (l.axis === 'x' ? l.fixed : s) - GAME.player.z); const score = Math.min(near, 30) + Math.min(far, 60); if (score > bd) { bd = score; best = s; } }
  c.s = best; c.off = 0; c.hail = 0; c.stopping = false; c.v = undefined; c.busy = false; c.readyAt = undefined;
}


// Solid footprints so players cannot walk through billboard posts.
export const TRANSPORT_SOLIDS = [
  ...BILLBOARDS.flatMap(b => [-1.7, 1.7].map(o => ({ x: b.x + b.ax * o, z: b.z + b.az * o, r: .1 }))),
];


/** Can this player take a dispatched ride right now? (null = yes, otherwise the reason why not.) */
export function canDispatchRide(): string | null {
  if (GAME.ride || CINE.on) return 'You are already on a ride.';
  if (VEH.drv) return 'Get out of your car first.';
  if (GAME.jailed) return 'You cannot take a ride from jail.';
  if (DISPATCH.idx >= 0) return 'A ride is already on its way to you.';
  if (!ROAM.cars.length) return 'The city streets are still loading: try again in a moment.';
  return null;
}

/** A taxi / bike taxi drives to this player and takes them to the destination another player picked. The fare was already paid by that player. */
export function dispatchRide(r: { id: string; name: string; x: number; z: number; kind: string }): string | null {
  const bad = canDispatchRide(); if (bad) return bad;
  const want: Role = r.kind === 'bike' ? 'bike' : 'taxi', P = GAME.player;
  let bi = -1, bd = Infinity;
  ROAM.cars.forEach((e, i) => { if (e.c.role !== want || e.c.busy || e.c.hail) return; const tp = TPOS[i]; if (!tp) return; const d = Math.hypot(P.x - tp.x, P.z - tp.z); if (d < bd) { bd = d; bi = i; } });
  if (bi < 0) return `No free ${want === 'bike' ? 'bike taxi' : 'taxi'} right now: try again in a moment.`;
  const e = ROAM.cars[bi];
  if (bd > 70) { // too far to drive over in reasonable time: it joins the road beside the player, a short way back
    let best: Lane | null = null, bp = Infinity;
    for (const l of ROAM.lanes) { const perp = Math.abs((l.axis === 'x' ? P.z : P.x) - l.fixed); if (perp < bp) { bp = perp; best = l; } }
    if (best) {
      const L: Lane = best, pa = L.axis === 'x' ? P.x : P.z;
      e.l.cars = e.l.cars.filter(o => o !== e.c); L.cars.push(e.c); e.l = L;
      e.c.s = Math.max(-110 * WS, Math.min(110 * WS, pa - L.dir * 30)); e.c.off = 0; e.c.laneShift = 0;
    }
  }
  const { l, c } = e;
  c.hail = 1; c.stopping = false; c.v = l.speed * c.mul; ROAM.sel = bi;
  DISPATCH.idx = bi; DISPATCH.ride = { id: r.id, name: r.name, x: r.x, z: r.z };
  GAME.notice = want === 'bike' ? '🚲 Your bike taxi is on its way to you...' : '🚕 Your taxi is on its way to you...';
  return null;
}

export function TransportSheet({ kind, manifest, onPick, onClose }: { kind: 'taxi' | 'bike' | 'bus'; manifest?: BusStop[]; onPick: (d: Dest, mate?: string) => Promise<string | void> | void; onClose: () => void }) {
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [fare, setFare] = useState<number | null>(null), [mate, setMate] = useState('');
  // other real players: pick one as the destination ("take me to @friend": resolved to where they are when you tap it), or bring a nearby one along in the taxi
  const around = useMemo(() => Object.entries(NET.peers).filter(([, q]) => q.init).map(([n, q]) => ({ n, q, d: Math.hypot(q.x - GAME.player.x, q.z - GAME.player.z) })).sort((a, b) => a.d - b.d), []);
  const players = useMemo<Dest[]>(() => around.slice(0, 8).map(o => ({ id: 'player:' + o.n, name: '@' + o.n, type: 'Player', district: `${Math.round(o.d)} m away`, x: o.q.x, z: o.q.z })), [around]);
  const nearby = useMemo(() => around.filter(o => o.d < 30 && !o.q.drv && !o.q.rd && !o.q.pa).slice(0, 4), [around]);
  const riders = kind === 'bus' ? 1 + (manifest || []).reduce((a, m) => a + m.n, 0) : 1;
  useEffect(() => { fetch(`/api/transport?riders=${riders}`).then(r => r.json()).then(d => { const f = d?.fares?.[kind]; if (typeof f === 'number') setFare(f); }).catch(() => {}); }, [kind, riders]);
  const pick = async (d: Dest) => {
    if (busy) return; setBusy(true); setMsg('');
    try { const m = await onPick(d, kind === 'taxi' ? mate : ''); if (m) { setMsg(m); setBusy(false); } } catch { setMsg('Something went wrong. Try again.'); setBusy(false); }
  };
  return createPortal(<div className="trSheet">
    <button className="trX" aria-label="Close" onClick={onClose}>✕</button>
    <h3><span>{kind === 'taxi' ? '🚕 Taxi' : kind === 'bus' ? '🚌 City bus' : '🚲 Bike taxi'}</span></h3>
    <div className="trBody">
      {kind === 'bus'
        ? <p>Cheap shared ride{fare !== null ? `: ₦${fare.toLocaleString()}` : ''}. {riders - 1} other passenger{riders - 1 === 1 ? ' is' : 's are'} aboard and the bus drops each one at their own stop before yours.</p>
        : <p>Where to? An NPC driver takes you there along the road.{fare !== null ? ` Fare: ₦${fare.toLocaleString()}` : ''}</p>}
      {kind === 'bus' && manifest && manifest.length > 0 && <p>🧍 Stops on this bus: {manifest.map(m => m.name).join(' · ')}</p>}
      {msg && <p style={{ background: '#ffd9d4', color: '#7a1608', fontWeight: 800 }}>{msg}</p>}
      {kind === 'taxi' && nearby.length > 0 && <div className="trMates"><small>👫 Bring someone along (they have to accept):</small><div>{nearby.map(o => <button key={o.n} className={mate === o.n ? 'on' : ''} onClick={() => setMate(m => (m === o.n ? '' : o.n))}>{mate === o.n ? '✓ ' : ''}@{o.n}</button>)}</div></div>}
      <DestPicker disabled={busy} extra={players} onPick={pick} />
    </div>
  </div>, document.body);
}

/* ── passenger cinematic: the door swings open, the character walks up and gets in; at the destination the door opens and they step out ── */
export const CINE = { on: false };

export const EXIT = { req: false };
   // the player pressed "Get off": the vehicle stops at the next safe spot (never inside a junction) and lets them out
export type CarPose = { x: number; z: number; r: number };

// car faces local +x; local +z is its side. door sits on the rear-door spot of the chosen side.
export function doorPts(c: CarPose, side: 1 | -1, bike: boolean, bus = false, front = false) {
  const fx = Math.cos(c.r), fz = -Math.sin(c.r), sx = Math.sin(c.r), sz = Math.cos(c.r);
  const at = (lx: number, ls: number): [number, number] => [c.x + fx * lx + sx * ls * side, c.z + fz * lx + sz * ls * side];
  if (bus) return { door: at(1.7, 1.15), out: at(1.7, 2.35), seat: at(.9, .55) }; // the bus's real door is the one drawn at x = 1.7; you sit in the seat block at x = .9
  if (bike) return { door: at(0, .55), out: at(0, 1.5), seat: at(-.55, 0) };      // pillion seat, behind the rider
  return front ? { door: at(.1, 1.0), out: at(.1, 2.05), seat: at(-.3, .4) }      // front passenger door and seat (kerb side)
    : { door: at(-.6, 1.0), out: at(-.6, 2.05), seat: at(-.95, .4) };               // rear door and rear bench
}

/* the vehicle pulling away after it has dropped you: accelerates along the kerb and eases out into its lane */
export type Dep = { x: number; z: number; r: number; ux: number; uz: number; lx: number; lz: number; lat: number; done: number; v: number; vmax: number; t: number; idx: number };

export function makeDep(car: CarPose, e: { axis: 'x' | 'z'; road: number }, kind: 'taxi' | 'bike' | 'bus'): Dep {
  const ctr = e.road * GRID, dev = e.axis === 'x' ? car.z - ctr : car.x - ctr, lat = Math.max(0, Math.abs(dev) - halfW(e.road) * .5), sg = Math.sign(dev) ? -Math.sign(dev) : 1;
  // Pull away ALONG THE ROAD, never along the car's own (possibly angled) parked heading, so it cannot slide into a building.
  const hx = Math.cos(car.r), hz = -Math.sin(car.r);
  const ux = e.axis === 'x' ? (Math.sign(hx) || 1) : 0, uz = e.axis === 'z' ? (Math.sign(hz) || 1) : 0;
  return { x: car.x, z: car.z, r: car.r, ux, uz, lx: e.axis === 'x' ? 0 : sg, lz: e.axis === 'x' ? sg : 0, lat, done: 0, v: 0, vmax: kind === 'taxi' ? 9 : 7, t: 0, idx: -1 };
}

export function stepDep(d: Dep, dt: number) {
  d.t += dt; d.v = Math.min(d.vmax, d.v + 4.5 * dt); const adv = d.v * dt;
  // only ease toward the lane centre once actually rolling, and always towards it (never further into the kerb)
  const l = d.v > 1.2 ? Math.max(0, Math.min(d.lat - d.done, adv * .4)) : 0;
  const dx = d.ux * adv + d.lx * l, dz = d.uz * adv + d.lz * l;
  d.x += dx; d.z += dz; d.done += l;
  // steer: face the way it is actually travelling, then straighten up onto the road axis (no crabbing, no staying tilted)
  const tr = l > 0 && adv > 1e-4 ? Math.atan2(-dz, dx) : Math.atan2(-d.uz, d.ux);
  const diff = Math.atan2(Math.sin(tr - d.r), Math.cos(tr - d.r));
  d.r += diff * Math.min(1, 6 * dt);
}

/** you, sitting in the vehicle (faces +x like every vehicle). Origin = the middle of the seat. */
export function Passenger({ look, pos }: { look: Look; pos: [number, number, number] }) {
  const skin = look.skin, top = look.outfit, hair = look.hairColor, pants = '#2b3a55';
  return <group position={pos}>
    <mesh position={[0, .14, 0]} material={drvMat(top)}><boxGeometry args={[.24, .34, .36]} /></mesh>
    <mesh position={[.03, .37, 0]} material={drvMat(skin, .6)}><sphereGeometry args={[.1, 14, 12]} /></mesh>
    <mesh position={[.02, .39, 0]} material={drvMat(hair, .9)}><sphereGeometry args={[.105, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.9]} /></mesh>
    {[-.1, .1].map(z => <group key={z}>
      <mesh position={[.22, .0, z]} material={drvMat(pants)}><boxGeometry args={[.46, .12, .13]} /></mesh>
      <mesh position={[.43, -.2, z]} material={drvMat(pants)}><boxGeometry args={[.12, .4, .13]} /></mesh>
    </group>)}
    {[-.21, .21].map(z => <mesh key={z} position={[.2, .14, z]} rotation-z={-.5} material={drvMat(top)}><boxGeometry args={[.34, .08, .08]} /></mesh>)}
  </group>;
}

export type Cine = { ph: 'walk' | 'enter' | 'close' | 'open' | 'exit' | 'off'; t: number; side: 1 | -1; bike: boolean; bus?: boolean; front?: boolean; leaving?: boolean; dep?: Dep; ang: number; car: CarPose; ax: number; az: number; yaw: number; walk: boolean; fin: () => void; drop?: [number, number]; from?: [number, number] };

export function TransportVehicles({ look }: { look: Look }) {
  const actor = useRef<THREE.Group>(null!), doorG = useRef<THREE.Group>(null!), hinge = useRef<THREE.Group>(null!), cine = useRef<Cine | null>(null), walking = useRef(false);
  const busD = useRef<THREE.Group>(null!), busW = useRef<THREE.Mesh>(null!), busP = useRef<THREE.Group>(null!), paxRef = useRef<THREE.Group>(null!);   // bus sliding door, and you sitting inside
  const seat = useRef<{ front: boolean; side: 1 | -1 }>({ front: false, side: 1 }), lastKind = useRef<'taxi' | 'bike' | 'bus'>('taxi'), dep = useRef<Dep | null>(null);
  const finishDep = () => { const d = dep.current; if (!d) return; dep.current = null; if (activeRef.current) activeRef.current.visible = false; if (d.idx >= 0) respawnRoamer(d.idx); };   // the vehicle is gone: back to roaming
  const kit = useMemo(carKit, []);
  const [open, setOpen] = useState<number | null>(null), [, setTick] = useState(0), [canExit, setCanExit] = useState(false), canExitRef = useRef(false);
  const requestExit = () => { if (!GAME.ride || !rs.current || CINE.on || EXIT.req) return; EXIT.req = true; GAME.notice = '🚪 Stopping so you can get off...'; setCanExit(false); canExitRef.current = false; };
  useEffect(() => { // E gets you off on keyboard
    const kd = (e: KeyboardEvent) => { if (e.code !== 'KeyE' || e.repeat) return; const t = e.target as HTMLElement | null; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return; requestExit(); };
    window.addEventListener('keydown', kd); return () => window.removeEventListener('keydown', kd);
  }, []);
  const activeRef = useRef<THREE.Group>(null!), rs = useRef<RideState | null>(null), route = useRef<Route | null>(null);
  const busTrip = useRef<{ stops: BusStop[]; k: number; dwell: number } | null>(null), rideId = useRef<string | null>(null); // bus stops still to serve / the id of a ride another player ordered for you
  useEffect(() => { ROAM.openSheet = (i: number) => { if (!GAME.ride) setOpen(i); }; return () => { ROAM.openSheet = () => {}; }; }, []);
  useEffect(() => { // walk away (or the vehicle drives off) and the destination menu closes
    const id = setInterval(() => {
      if (open === null) return; const e = ROAM.cars[open], tp = TPOS[open];
      if (!e || e.c.hail !== 2 || !tp || Math.hypot(GAME.player.x - tp.x, GAME.player.z - tp.z) > 24) setOpen(null);
    }, 250);
    return () => clearInterval(id);
  }, [open]);

  useFrame((st, dtRaw) => {
    const ride = GAME.ride, g = activeRef.current;
    OBS[2].on = !!ride && !!rs.current;
    const wantExit = !!ride && !!rs.current && !CINE.on && !EXIT.req;
    if (wantExit !== canExitRef.current) { canExitRef.current = wantExit; setCanExit(wantExit); }
    const cn = cine.current;
    if (cn && ride && g) { // ── door + walk-in / walk-out animation ──
      const dt = Math.min(dtRaw, .05), A = actor.current, D = doorG.current, H = hinge.current, P = doorPts(cn.car, cn.side, cn.bike, cn.bus, cn.front);
      cn.t += dt;
      const goTo = (tx: number, tz: number, sp: number) => { const dx = tx - cn.ax, dz = tz - cn.az, d = Math.hypot(dx, dz); if (d > .02) cn.yaw = Math.atan2(dx, dz); const s = Math.min(d, sp * dt); if (d > 1e-4) { cn.ax += dx / d * s; cn.az += dz / d * s; } return d - s; };
      const door = (want: number) => { cn.ang += (want - cn.ang) * Math.min(1, dt * 16); };
      const OPEN = 1.1;
      if (cn.ph === 'walk') { const left = goTo(P.out[0], P.out[1], 8); cn.walk = true; door(Math.hypot(P.out[0] - cn.ax, P.out[1] - cn.az) < 2.6 ? OPEN : 0); if (left < .05) { cn.ph = 'enter'; cn.t = 0; } }
      else if (cn.ph === 'enter') {
        const u = Math.min(1, cn.t / .45); cn.walk = true; door(OPEN);
        const a = u < .5 ? P.out : P.door, b = u < .5 ? P.door : P.seat, k = smooth(u < .5 ? u * 2 : (u - .5) * 2);
        cn.ax = a[0] + (b[0] - a[0]) * k; cn.az = a[1] + (b[1] - a[1]) * k; cn.yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
        if (u >= 1) { cn.ph = 'close'; cn.t = 0; A.visible = false; cn.walk = false; }
      } else if (cn.ph === 'close') { door(0); if (cn.t > .2) { cn.ang = 0; cn.fin(); return; } }
      else if (cn.ph === 'open') { cn.walk = false; door(OPEN); A.visible = false; if (cn.t > .3) { cn.ph = 'exit'; cn.t = 0; A.visible = true; } }
      else if (cn.ph === 'exit') {
        const u = Math.min(1, cn.t / .55); cn.walk = true; door(OPEN);
        const a = u < .5 ? P.seat : P.door, b = u < .5 ? P.door : P.out, k = smooth(u < .5 ? u * 2 : (u - .5) * 2);
        cn.ax = a[0] + (b[0] - a[0]) * k; cn.az = a[1] + (b[1] - a[1]) * k; cn.yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
        if (u >= 1) { cn.ph = 'off'; cn.t = 0; }
      } else { // off: walk away to the kerb while the door swings shut, then the vehicle pulls away
        if (cn.t > .55) cn.leaving = true;
        if (cn.leaving && cn.dep) { stepDep(cn.dep, dt); cn.car.x = cn.dep.x; cn.car.z = cn.dep.z; cn.car.r = cn.dep.r; }
        const dr = cn.drop || P.out; const left = goTo(dr[0], dr[1], 3.2); cn.walk = left > .05; door(cn.t > .35 ? 0 : OPEN);
        if (left < .05 && cn.t > .8) { cn.ang = 0; cn.fin(); return; }
      }
      walking.current = cn.walk;
      A.position.set(cn.ax, 0, cn.az); A.rotation.y = cn.yaw; if (cn.ph !== 'close' && cn.ph !== 'open') A.visible = true;
      D.visible = !cn.bike && !cn.bus && cn.ang > .01; D.position.set(cn.car.x, 0, cn.car.z); D.rotation.y = cn.car.r; H.position.set(cn.front ? .55 : .15, 0, cn.side * .93); H.rotation.y = cn.side * cn.ang;
      if (busD.current) { const B = busD.current; B.visible = !!cn.bus && cn.ang > .01; B.position.set(cn.car.x, 0, cn.car.z); B.rotation.y = cn.car.r; busW.current.position.set(1.7, 1.15, cn.side * 1.19); busP.current.position.set(1.7 - Math.min(1, cn.ang / OPEN) * 1.0, 0, cn.side * 1.24); }   // bus door slides back, showing the doorway
      if (paxRef.current) paxRef.current.visible = cn.ph === 'open';   // you stay in your seat until you step out
      ride.x = cn.ax; ride.z = cn.az; ride.r = cn.car.r; GAME.player.x = cn.ax; GAME.player.z = cn.az;
      ride.vOn = cn.ph === 'open'; ride.exiting = cn.ph === 'open' || cn.ph === 'exit' || cn.ph === 'off'; ride.vx = cn.car.x; ride.vz = cn.car.z; ride.vr = cn.car.r;   // other players see the vehicle only while you are still sitting in it; guests step out as soon as the door opens
      if (cn.ph === 'walk' || cn.ph === 'enter' || cn.ph === 'close') g.visible = false; else { g.visible = true; g.position.set(cn.car.x, 0, cn.car.z); g.rotation.y = cn.car.r; }
      return;
    }
    const dpn = dep.current;
    if (!ride && dpn && g) { stepDep(dpn, Math.min(dtRaw, .05)); g.visible = true; g.position.set(dpn.x, 0, dpn.z); g.rotation.y = dpn.r; if (paxRef.current) paxRef.current.visible = false; if (dpn.t > 5) finishDep(); return; }   // it has dropped you: it drives away, then goes back to roaming
    if (!ride || !g || !rs.current || !route.current) { if (g) g.visible = false; return; }
    const r = rs.current, rt = route.current;
    const inJ = EXIT.req && inJunction(r.x, r.z);   // asked to get off: keep rolling until clear of the junction, then stop
    stepRide(r, rt, Math.min(dtRaw, .05), { vmax: EXIT.req && !inJ ? 0 : ride.kind === 'taxi' ? 11 : ride.kind === 'bus' ? 8.5 : 7.5, t: simSeconds(), light: lightState, cars: TPOS });
    if (!EXIT.req && !r.done && r.wait > 40) { r.s = Math.min(rt.len, r.s + 12); r.wait = 0; GAME.notice = '🚌 Traffic cleared: moving on.'; }   // never stay stuck for good
    ride.x = r.x; ride.z = r.z; ride.r = r.r; ride.vOn = true; ride.exiting = false; ride.vx = r.x; ride.vz = r.z; ride.vr = r.r;
    g.visible = true; g.position.set(r.x, 0, r.z); g.rotation.y = r.r; if (paxRef.current) paxRef.current.visible = true;   // you can be seen sitting inside
    OBS[2].x = r.x; OBS[2].z = r.z; GAME.player.x = r.x; GAME.player.z = r.z;
    const exitNow = EXIT.req && !r.done && r.v < .3 && !inJ;
    if (r.done || exitNow) { // arrived (or the player asked to get off and the vehicle has stopped): the door opens, the rider steps out onto the sidewalk, the door shuts and the taxi / bike goes back to roaming the city
      const bt = busTrip.current, offHere = EXIT.req;   // offHere: get off right here, not at the planned stop
      if (!offHere && bt && !bt.stops[bt.k]?.mine) { // a bus stop that is not yours: the other passengers get off, then the bus drives on to the next stop
        const stop = bt.stops[bt.k];
        if (bt.dwell < 0) { bt.dwell = 2.6; GAME.notice = `🚌 ${stop.name}: ${stop.n} passenger${stop.n === 1 ? '' : 's'} got off`; }
        bt.dwell -= Math.min(dtRaw, .05);
        if (bt.dwell > 0) return;
        let leg: Route | null = null;
        while (bt.k + 1 < bt.stops.length) { bt.k++; const nx = bt.stops[bt.k]; leg = planRide(rt.end, [nx.x, nx.z], CURB_BUS); if (leg || nx.mine) break; }
        bt.dwell = -1;
        if (leg) { route.current = leg; rs.current = newRide(leg, r.r); ride.path = leg.pts; ride.i = 0; GAME.notice = `🚌 Next stop: ${bt.stops[bt.k].name}`; return; }
        busTrip.current = null; GAME.notice = '🚌 The bus cannot reach your stop from here: you get off at the last stop.'; // fall through: let the player off now
      }
      const car: CarPose = { x: r.x, z: r.z, r: r.r }, bike = ride.kind === 'bike', bus = ride.kind === 'bus', name = ride.name, ex = offHere ? exitSpot(r.x, r.z, r.r) : null, drop: [number, number] = ex ? [ex.drop[0], ex.drop[1]] : [rt.drop[0], rt.drop[1]];
      const side: 1 | -1 = ((drop[0] - car.x) * Math.sin(car.r) + (drop[1] - car.z) * Math.cos(car.r)) >= 0 ? 1 : -1, front = seat.current.front && side === 1 && !bike && !bus, seatPt = doorPts(car, side, bike, bus, front).seat;
      CINE.on = true; EXIT.req = false;
      cine.current = { ph: bike ? 'exit' : 'open', t: 0, side, bike, bus, front, dep: makeDep(car, ex || rt.end, ride.kind), ang: 0, car, ax: seatPt[0], az: seatPt[1], yaw: car.r, walk: false, drop, fin: () => {
        const cc = cine.current, dp = cc && cc.leaving ? cc.dep : undefined;   // the vehicle is already pulling away: let it carry on
        cine.current = null; CINE.on = false; walking.current = false; actor.current.visible = false; doorG.current.visible = false; if (busD.current) busD.current.visible = false;
        GAME.ride = null; rs.current = null; route.current = null; OBS[2].on = false; busTrip.current = null;
        if (rideId.current) { const id = rideId.current; rideId.current = null; fetch('/api/rides', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'complete', id }) }).catch(() => {}); }
        GAME.player.x = drop[0]; GAME.player.z = drop[1]; GAME.tp = { x: drop[0], z: drop[1] };
        GAME.notice = `📍 Arrived at ${name}`;
        { const fo = followRef.current; followRef.current = ''; const fq = fo ? NET.peers[fo] : null; if (fq && fq.init) GAME.nav = { x: fq.x, z: fq.z, name: `@${fo}`, follow: fo }; }   // the taxi stops at the kerb: a live waypoint walks you the rest of the way to them
        if (dp) { dp.idx = ROAM.rideIdx; ROAM.rideIdx = -1; dep.current = dp; }
        else { g.visible = false; if (ROAM.rideIdx >= 0) { respawnRoamer(ROAM.rideIdx); ROAM.rideIdx = -1; } }
        setTick(v => v + 1);
      } };
    }
  });

  const refundRide = (id: string) => { fetch('/api/rides', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'refund', id }) }).catch(() => {}); };
  /** `pre` = the id of a ride another player already paid for: nothing is charged and the destination was chosen by them. */
  const followRef = useRef('');   // the player this ride is taking you to: a live waypoint follows them once you get out
  const go = async (idx: number, d: Dest, pre?: string, mate?: string): Promise<string | void> => {
    const e = ROAM.cars[idx], tp = TPOS[idx]; if (!e || !tp || e.c.hail !== 2 || e.c.busy) { setOpen(null); if (pre) refundRide(pre); return; }
    let follow = '';
    if (d.id.startsWith('player:')) follow = d.id.slice(7); else if (d.id === 'dispatch') { const mm = /^Meet @(.+)$/.exec(d.name); if (mm) follow = mm[1]; }
    if (follow) { // a player is the destination: use where they are RIGHT NOW (the list was a snapshot from when the menu opened)
      const fq = NET.peers[follow];
      if (fq && fq.init) d = { ...d, x: fq.x, z: fq.z };
      else if (d.id.startsWith('player:')) return `@${follow} just left the city.`;
    }
    const { l, c } = e, kind: 'taxi' | 'bike' | 'bus' = c.role === 'bus' ? 'bus' : c.role === 'bike' ? 'bike' : 'taxi';
    const start = { x: tp.x, z: tp.z, axis: l.axis, road: l.road, along: c.s, h: l.dir };
    const curbFor = kind === 'bus' ? CURB_BUS : kind === 'bike' ? CURB : CURB_CAR, direct = planRide(start, [d.x, d.z], curbFor);
    if (!direct) { GAME.notice = 'It cannot set off from here: hail one nearer the middle of the map.'; releaseRoamer(c); DISPATCH.idx = -1; if (pre) refundRide(pre); setOpen(null); return; }
    let rt = direct, stops: BusStop[] | null = null, firstK = 0, riders = 1;
    if (kind === 'bus') { // the bus visits every passenger's stop (nearest first) and ends at yours
      const all: BusStop[] = [...(MANIFEST.get(idx) || []), { name: d.name, x: d.x, z: d.z, n: 0, mine: true }];
      riders = all.reduce((a, m) => a + m.n, 1);
      const order: BusStop[] = []; let cx = tp.x, cz = tp.z;
      while (all.length) { let bi = 0, bd = Infinity; all.forEach((s2, i) => { const dd = Math.hypot(s2.x - cx, s2.z - cz); if (dd < bd) { bd = dd; bi = i; } }); const [s2] = all.splice(bi, 1); order.push(s2); cx = s2.x; cz = s2.z; if (s2.mine) break; } // passengers whose stop is after yours stay on board
      let leg: Route | null = null; for (; firstK < order.length; firstK++) { leg = planRide(start, [order[firstK].x, order[firstK].z], CURB_BUS); if (leg || order[firstK].mine) break; }
      if (!leg) { leg = direct; firstK = order.length - 1; }
      rt = leg; stops = order;
    }
    let res: Response, data: any;
    try { res = await fetch('/api/transport', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(pre ? { rideId: pre } : { kind, riders }) }); data = await res.json().catch(() => ({})); } catch { return 'Network error. Try again.'; }
    if (!res.ok) { const m = data.error || 'Transport unavailable.'; GAME.notice = m; if (pre) { releaseRoamer(c); DISPATCH.idx = -1; } return m; }
    if (c.hail !== 2 || c.busy) { GAME.notice = 'That ride left without you.'; setOpen(null); return; }
    MANIFEST.delete(idx);
    const p0 = GAME.player, bike = kind === 'bike', bus = kind === 'bus', car: CarPose = { x: tp.x, z: tp.z, r: l.rot };
    const side: 1 | -1 = ((p0.x - tp.x) * Math.sin(l.rot) + (p0.z - tp.z) * Math.cos(l.rot)) >= 0 ? 1 : -1;
    const fwd = (p0.x - tp.x) * Math.cos(l.rot) - (p0.z - tp.z) * Math.sin(l.rot), front = kind === 'taxi' && side === 1 && fwd > .2;   // walk up to the front half of a taxi (kerb side) and you get in the front; otherwise the back
    finishDep(); seat.current = { front, side }; lastKind.current = kind;
    CINE.on = true; EXIT.req = false; ROAM.sel = -1; DISPATCH.idx = -1; DISPATCH.ride = null;
    GAME.ride = { kind, x: p0.x, z: p0.z, r: l.rot, name: d.name, path: rt.pts, i: 0, speed: kind === 'taxi' ? 11 : kind === 'bus' ? 8.5 : 7.5, stand: -1 };
    cine.current = { ph: 'walk', t: 0, side, bike, bus, front, ang: 0, car, ax: p0.x, az: p0.z, yaw: Math.atan2(tp.x - p0.x, tp.z - p0.z), walk: true, fin: () => { // door shut, passenger inside: off we go
      cine.current = null; CINE.on = false; walking.current = false; actor.current.visible = false; doorG.current.visible = false;
      route.current = rt; rs.current = newRide(rt, l.rot); c.busy = true; c.hail = 0; c.stopping = false; ROAM.rideIdx = idx;
      busTrip.current = stops ? { stops, k: firstK, dwell: -1 } : null; rideId.current = pre || null; followRef.current = follow;
      if (mate && kind === 'taxi') setTimeout(() => window.dispatchEvent(new CustomEvent('arl-seat-start', { detail: mate })), 700);   // the taxi has set off: invite the person you brought along
      GAME.notice = kind === 'bus' ? `🚌 Bus to ${d.name}: ${stops && stops.length > 1 ? `${stops.length - 1} stop${stops.length === 2 ? '' : 's'} on the way` : 'no stops on the way'}` : `${kind === 'taxi' ? '🚕 Your driver' : '🚲 Your rider'} is taking you to ${d.name}`; setTick(v => v + 1);
    } };
    GAME.notice = kind === 'bus' ? '🚌 Getting on...' : kind === 'taxi' ? '🚕 Getting in...' : '🚲 Hopping on...';
    setOpen(null); setTick(v => v + 1);
  };
  // a ride another player ordered for you has pulled up: climb in and go, no menu, no payment
  useEffect(() => { ROAM.autoGo = (i: number) => { const r = DISPATCH.ride; if (!r || DISPATCH.idx !== i) return; if (VEH.drv || GAME.ride || GAME.jailed) { refundRide(r.id); const rc = ROAM.cars[i]; if (rc) releaseRoamer(rc.c); DISPATCH.idx = -1; DISPATCH.ride = null; GAME.notice = 'Ride cancelled: you were busy. The fare was returned.'; return; } go(i, { id: 'dispatch', name: r.name, type: 'Meeting point', district: '', x: r.x, z: r.z }, r.id); }; return () => { ROAM.autoGo = () => {}; }; });
  useEffect(() => { const f = () => setTick(v => v + 1); window.addEventListener('arl-pax', f); return () => window.removeEventListener('arl-pax', f); }, []);   // a friend got in or out of your taxi
  const openKind: 'taxi' | 'bike' | 'bus' = open !== null ? (ROAM.cars[open]?.c.role === 'bike' ? 'bike' : ROAM.cars[open]?.c.role === 'bus' ? 'bus' : 'taxi') : 'taxi';
  return <>
    <group ref={actor} visible={false}><Human look={look} getState={() => (walking.current ? 'walk' : 'idle')} getSpeed={() => 1.9} /></group>
    <group ref={doorG} visible={false}><group ref={hinge} position={[.15, 0, .93]}>
      <mesh position={[-.45, .72, 0]}><boxGeometry args={[.9, .56, .05]} /><meshStandardMaterial color="#e5b72f" metalness={.35} roughness={.45} /></mesh>
      <mesh position={[-.45, 1.17, 0]}><boxGeometry args={[.8, .3, .04]} /><meshStandardMaterial color="#1b2a38" metalness={.6} roughness={.15} /></mesh>
      <mesh position={[-.82, .92, .05]}><boxGeometry args={[.14, .03, .05]} /><meshStandardMaterial color="#222" /></mesh>
    </group></group>
    <group ref={busD} visible={false}>   {/* bus door: a dark doorway and a yellow panel that slides back */}
      <mesh ref={busW} position={[1.7, 1.15, 1.19]}><boxGeometry args={[.95, 1.7, .03]} /><meshStandardMaterial color="#0e1820" roughness={.8} /></mesh>
      <group ref={busP} position={[1.7, 0, 1.24]}><mesh position={[0, 1.15, 0]}><boxGeometry args={[.95, 1.7, .05]} /><meshStandardMaterial color="#e8a923" roughness={.5} /></mesh><mesh position={[0, 1.5, .03]}><boxGeometry args={[.72, .6, .02]} /><meshStandardMaterial color="#cfe6f2" transparent opacity={.3} depthWrite={false} /></mesh></group>
    </group>
    {(() => { const dk = GAME.ride?.kind ?? lastKind.current, sp = seat.current; return <group ref={activeRef} visible={false}>{dk === 'bike' ? <BikeBody scale={1} rider /> : dk === 'bus' ? <BusBody /> : <TaxiBody kit={kit} driver />}
      <group ref={paxRef} visible={false} scale={dk === 'taxi' ? [.9, 1, .98] : [1, 1, 1]}><Passenger look={look} pos={dk === 'bus' ? [.9, 1.85, sp.side * .55] : dk === 'bike' ? [-.55, .75, 0] : sp.front ? [-.3, .92, .4] : [-.95, .92, sp.side * .4]} /></group>
      {dk === 'taxi' && guestsOf(PAX.me).map(gst => <group key={gst.name} scale={[.9, 1, .98]}><Passenger look={gst.look} pos={sp.front ? [-.95, .92, .4] : [-.95, .92, -sp.side * .4]} /></group>)}
    </group>; })()}
    {canExit && <BodyDom><button className="rideExit" onClick={requestExit} aria-label="Get off">🚪 Get off<small className="kbd">E</small></button></BodyDom>}
    {open !== null && <Html position={[0, 0, 0]}><TransportSheet kind={openKind} manifest={MANIFEST.get(open)} onPick={(d, mate) => go(open, d, undefined, mate)} onClose={() => setOpen(null)} /></Html>}
    <RuntimeStyle css={`${DEST_PICKER_CSS}.hailTag{font:400 15px/1 var(--gf,system-ui);color:#fff;background:var(--plum,#261a36);border:3px solid var(--ink,#1a1410);border-radius:999px;padding:5px 12px 4px;white-space:nowrap;box-shadow:0 3px 0 var(--ink,#1a1410);-webkit-text-stroke:3px var(--ink,#1a1410);paint-order:stroke fill;letter-spacing:.03em;pointer-events:auto;cursor:pointer}.hailTag.go{background:var(--gold,#ffb81c)}\n.trTag{font:400 15px/1 var(--gf,system-ui);color:#fff;background:var(--plum,#261a36);border:3px solid var(--ink,#1a1410);border-radius:999px;padding:4px 11px 3px;white-space:nowrap;box-shadow:0 3px 0 var(--ink,#1a1410);-webkit-text-stroke:3px var(--ink,#1a1410);paint-order:stroke fill;letter-spacing:.03em;transition:opacity .18s;pointer-events:none}.trTag.off{opacity:0}.trTag.near{background:var(--gold,#ffb81c)}
.rideExit{all:unset;box-sizing:border-box;position:fixed;z-index:61;left:50%;transform:translateX(-50%);bottom:calc(86px + env(safe-area-inset-bottom,0px));min-height:48px;display:flex;align-items:center;gap:8px;padding:10px 22px;cursor:pointer;background:var(--gold,#ffb81c);color:#fff;border:4px solid var(--ink,#1a1410);border-radius:999px;box-shadow:0 4px 0 var(--ink,#1a1410),0 10px 22px #0008;font:400 18px/1 var(--gf,system-ui);letter-spacing:.04em;-webkit-text-stroke:4px var(--ink,#1a1410);paint-order:stroke fill;touch-action:manipulation;-webkit-tap-highlight-color:transparent}.rideExit small{font-size:12px;padding:3px 7px;border:2px solid var(--ink,#1a1410);border-radius:7px;background:#fff3d6;color:#1a1410;-webkit-text-stroke:0}.rideExit:active{transform:translateX(-50%) translateY(4px);box-shadow:none}@media (hover:none){.rideExit small{display:none}}\n.trSheet{position:fixed;z-index:60;right:calc(12px + env(safe-area-inset-right,0px));top:calc(54px + env(safe-area-inset-top,0px));bottom:calc(12px + env(safe-area-inset-bottom,0px));width:min(320px,40vw);display:flex;flex-direction:column;overflow:hidden;background:var(--plum,#261a36);color:var(--cream,#fff3d6);border:4px solid var(--ink,#1a1410);border-radius:22px;box-shadow:0 6px 0 var(--ink,#1a1410),0 18px 34px #000a;font-family:var(--gf,system-ui);animation:trIn .24s cubic-bezier(.3,1.4,.5,1)}
.trSheet h3{flex:none;margin:0;padding:10px 54px 8px 16px;background:var(--gold,#ffb81c);border-bottom:4px solid var(--ink,#1a1410);font-weight:400;font-size:22px;line-height:1.1;letter-spacing:.04em;color:#fff;background-image:repeating-linear-gradient(135deg,#ffffff1c 0 10px,#0000 10px 20px)}.trSheet h3 span{display:block;-webkit-text-stroke:6px var(--ink,#1a1410);paint-order:stroke fill}
.trX{all:unset;box-sizing:border-box;position:absolute;z-index:2;right:10px;top:8px;width:34px;height:34px;display:grid;place-items:center;border-radius:50%;cursor:pointer;background:var(--red,#ff5147);border:3px solid var(--ink,#1a1410);box-shadow:0 3px 0 var(--ink,#1a1410);color:#fff;font-size:15px}.trX:active{transform:translateY(3px);box-shadow:none}
.trBody{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:12px;display:flex;flex-direction:column;gap:9px;scrollbar-width:thin;scrollbar-color:var(--gold,#ffb81c) transparent}
.trBody p{margin:0;padding:7px 12px;background:var(--cream,#fff3d6);color:var(--ink,#1a1410);border:3px solid var(--ink,#1a1410);border-radius:14px;box-shadow:0 3px 0 var(--ink,#1a1410);font-size:13px;line-height:1.28}
.trBody button{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:10px;cursor:pointer;width:100%;padding:8px 9px 8px 12px;background:var(--plum2,#34244a);color:var(--cream,#fff3d6);border:3px solid var(--ink,#1a1410);border-radius:16px;box-shadow:0 4px 0 var(--ink,#1a1410);font-family:var(--gf,system-ui);transition:transform .1s,filter .1s}.trBody button:hover{filter:brightness(1.12)}.trBody button:active{transform:translateY(4px);box-shadow:none}
.trBody .tx{flex:1;min-width:0}.trBody b{font-weight:400;font-size:16px;letter-spacing:.03em;color:#fff}.trBody em{flex:none;font-style:normal;padding:5px 14px 4px;background:var(--green,#2fc66b);color:#fff;border:3px solid var(--ink,#1a1410);border-radius:12px;box-shadow:0 3px 0 var(--ink,#1a1410),inset 0 3px 0 #ffffff55;font-size:15px;-webkit-text-stroke:4px var(--ink,#1a1410);paint-order:stroke fill}
\n.trMates{display:flex;flex-direction:column;gap:6px}.trMates small{color:var(--cream,#fff3d6);font-size:12px}.trMates div{display:flex;flex-wrap:wrap;gap:6px}.trBody .trMates button{width:auto;padding:5px 12px;border-radius:999px;font-size:14px;box-shadow:0 3px 0 var(--ink,#1a1410)}.trBody .trMates button.on{background:var(--green,#2fc66b)}
@keyframes trIn{from{transform:translateX(40px);opacity:0}to{transform:none;opacity:1}}@media (max-width:620px) and (orientation:portrait){.trSheet{left:10px;right:10px;top:auto;width:auto;max-height:46vh}}`} />
  </>;
}