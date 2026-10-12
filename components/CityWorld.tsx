'use client';
import { CityCompanion } from './ClubCompanion';
import { GAME_LABEL_CSS } from '../lib/gameLabels';
import { openSettings, useSettings } from '../lib/settings';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls, Stars } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import Human from './Human';
import { CITY } from '../lib/cityData';
import { type Look } from '../lib/characterModels';
import type { CityBuilding } from '../lib/cityTypes';
import { FIGHT, NET, useCityNet } from '../lib/cityNet';
import { SAFE_AFTER_WAKE_MS } from '../lib/downed';
import CityPeople from './CityPeople';
import MissionsCombat from './MissionsCombat';
import { WEAPON_RULES } from '../lib/weapons';
import { engineSet, engineStart, engineStop, honk, setMuted, thud, unlockAudio } from '../lib/cityAudio';
import RuntimeStyle from './RuntimeStyle';
import { worldMinute, weatherAt, lightningAt } from '../lib/worldClock';
import { BUILDING_DESTS } from '../lib/destinations';
import ChopYards from './ChopYards';
import PlayerHouses from './PlayerHouses';
import { HOUSES, nearDoor } from '../lib/houses';
import { Atmosphere } from './CityAtmosphere';
import { Graffiti, LookDriver, PowerLines, Puddles, ShopGlow, StreetClutter } from './CityLook';
import { pushCrime } from '../lib/witness';
import { sidewalkSpawn } from '../lib/roadRoute';
import { BUILDS, CELL, Ctl, GAME, Hud, LIM, NIGHT, OBS, OWN, PEDPOS, SKY, START, TPOS, VEH, WX, distTo, pick, sm, updateDetails, wrap } from './cityShared';
import { Airport, Billboards, Building, Inst, LampGlow, MARKS, MATS, Roads, SLABS, StreetLamps, TrainLine, Trees } from './CityScenery';
import { BL, BODY, CAR_POSTS, findPath, pushOut } from './CityCollision';
import { CINE, JACK, JackGhost, JackNpc, ROAM, Signals, TRANSPORT_SOLIDS, Traffic, TransportVehicles, isHail, stepJack } from './CityTraffic';
import { NpcShouts, PED_PUSH, Pedestrians, PlayerCar, parkNear, peersOnFoot, pushFrom, remoteCars } from './CityPeds';
import { CAR_OFFS, CAR_R, JailCell, Rain, WeatherEffects, WorldEventVisuals } from './CityWeather';
import { POLICE_CARS, PolicePatrol } from './CityPolice';
import { pkit } from './CityCars';
import TailTarget from './TailTarget';
import { RemotePlayers } from './CityRemote';
import { StreetNpcScene } from './StreetNpcs';
import { DriveHud, DrivePad, FightHud, HoldBtn, LookPad, Minimap, Stick } from './CityUi';
import PaxUi from './PaxUi';
import { PAX, stepPax } from './cityPax';
import { PlaneTag, planeBroadcast, stepPlaneNet } from './planeNet';
import { PLANE, Plane, boardPlane, planeCamera, planeNear, planePrompt, resetPlane, stepPlane, togglePlaneView } from './cityPlane';
import { hint } from '../lib/touch';
export { buildingExitPoint, TPOS, PEDPOS, GAME } from './cityShared';
export { JT, JACK, canDispatchRide, dispatchRide } from './CityTraffic';
export { POLICE_CARS } from './CityPolice';

const LOW_END = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches; // phones / tablets: smaller shadow map and pixel ratio

function Scene({ look, ctl, hud, setNear, getMinute, roster, ver, bub, onPick, fight, shoot }: { fight: (to: string) => boolean; shoot: (to: string, weapon: string) => boolean; look: Look; ctl: React.MutableRefObject<Ctl>; hud: React.MutableRefObject<Hud>; setNear: (b: any) => void; getMinute?: () => number; roster: string[]; ver: number; bub: Record<string, string>; onPick: (n: string) => void }) {
  const P = useRef({ x: START.x, z: START.z, y: 0, vy: 0, r: START.r });
  const group = useRef<THREE.Group>(null!), controls = useRef<any>(null), sun = useRef<THREE.DirectionalLight>(null!), hemi = useRef<THREE.HemisphereLight>(null!), stars = useRef<THREE.Group>(null!);
  const carG = useRef<THREE.Group>(null!), carTag = useRef<HTMLDivElement | null>(null), spot = useRef<THREE.SpotLight>(null!), nameTag = useRef<HTMLDivElement | null>(null);
  const sunTarget = useMemo(() => new THREE.Object3D(), []);
  const moving = useRef(false), running = useRef(false), nearId = useRef<string | null>(null);
  const drag = useRef({ on: false, end: 0 }), lastN = useRef(-1), fov = useRef(52), hitCool = useRef(0), shown = useRef({ drv: false, placed: false });
  const camA = useRef({ x: NaN, y: 0, z: 0 }); const firstCam = useRef(true); const driveKm=useRef(0); const lastDrivePost=useRef(0);
  const nav = useRef<{ key: string; points: [number, number][]; i: number; at: number } | null>(null);
  const [near, setN] = useState<any>(null);
  const [touchDevice, setTouchDevice] = useState(false);
  const [vehicleModel, setVehicleModel] = useState(GAME.vehicleModel);
  useEffect(() => { let dead = false; const load = async () => { try { const r = await fetch('/api/vehicles'); if (!r.ok) return; const d = await r.json(); const m = d.active || GAME.vehicleModel; if (d.vehicles?.[0]) (window as any).__arlVehicleId=d.vehicles[0].id; if (!dead) { GAME.vehicleModel = m; setVehicleModel(m); } } catch {} }; load(); const id = setInterval(load, 8000); return () => { dead = true; clearInterval(id); }; }, []);
  useEffect(() => { let dead=false; const push=()=>{ if(dead||document.hidden)return; const p=GAME.player; const district=CITY.districts.reduce((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)<Math.hypot(b.x-p.x,b.z-p.z)?a:b); fetch('/api/position',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({x:p.x,z:p.z,r:p.r,district:district.name,driving:VEH.drv})}).catch(()=>{}); }; push(); const id=setInterval(push,5000); return()=>{dead=true;clearInterval(id)}; }, []);
  useEffect(() => { const m = window.matchMedia('(pointer: coarse), (max-width: 700px)'); const sync = () => setTouchDevice(m.matches); sync(); m.addEventListener?.('change', sync); return () => m.removeEventListener?.('change', sync); }, []);
  const nearBuilding = near ? BUILDS.find(x => x.business?.id === near.id) : null;
  useEffect(() => { sun.current.target = sunTarget; }, [sunTarget]);
  useEffect(() => { PAX.me = look.name; PAX.look = look; PLANE.me = look.name; }, [look]);   // ride-along needs my own name and look
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    document.addEventListener('gesturestart', stop as any, { passive: false });
    document.addEventListener('gesturechange', stop as any, { passive: false });
    return () => { document.removeEventListener('gesturestart', stop as any); document.removeEventListener('gesturechange', stop as any); };
  }, []);
  useEffect(() => {
    VEH.drv = false;
    const oc = controls.current; if (!oc) return;
    const s = () => { drag.current.on = true; }, e = () => { drag.current.on = false; drag.current.end = performance.now(); };
    oc.addEventListener('start', s); oc.addEventListener('end', e);
    return () => { oc.removeEventListener('start', s); oc.removeEventListener('end', e); engineStop(); VEH.drv = false; OBS[0].on = false; OBS[1].on = false; if (PLANE.on) resetPlane(); };
  }, []);

  useFrame((st, dtRaw) => {
    const dt = Math.min(dtRaw, .05), c = ctl.current, k = c.keys, p = P.current, oc = controls.current;
    if (!oc) return;
    stepPax(p, dt, pushOut);   // ride-along: a guest follows the host's vehicle; a host drops guests when the ride ends
    NET.me.pl = 0; stepPlaneNet(dt, p);   // plane multiplayer: mirror another player's flight onto the plane, give way if they boarded first (the pilot branch below sets pl = 1 again)

    /* ── time of day (follows the in-game clock) ── */
    const hrs = ((((getMinute ? getMinute() : worldMinute()) / 60) % 24) + 24) % 24, ang = (hrs - 6) / 12 * Math.PI, el = Math.sin(ang);
    const day = sm(el, -.08, .3), n = 1 - day, dusk = Math.min(1, Math.max(0, 1 - Math.abs(el) / .28)) * .75;
    NIGHT.n = n;
    const bg = st.scene.background as THREE.Color | null; if (bg) bg.copy(SKY.night).lerp(SKY.day, day).lerp(SKY.dusk, dusk);
    const fg = st.scene.fog as THREE.Fog | null; if (fg) fg.color.copy(SKY.fogNight).lerp(SKY.fogDay, day).lerp(SKY.fogDusk, dusk);
    hemi.current.intensity = .2 + .86 * day;   /* the sky reflection map (CityAtmosphere) now supplies the rest of the ambient light */
    sun.current.intensity = .5 + 2.3 * day; sun.current.color.copy(SKY.moon).lerp(SKY.sun, day).lerp(SKY.sunLow, dusk * day);
    { // shared weather (same for every player): overcast sky, harmattan dust, rain-thinned fog, dimmer sun, lightning
      const W = weatherAt(), gray = Math.max(W.cloud * .55, W.rain * .75, W.storm * .9), lit = .14 + .86 * day;
      WX.tmp.copy(WX.over).multiplyScalar(lit); if (bg) bg.lerp(WX.tmp, gray * .9); if (fg) fg.color.lerp(WX.tmp, gray * .85);
      WX.tmp.copy(WX.dust).multiplyScalar(lit); if (bg) bg.lerp(WX.tmp, W.haze * .7); if (fg) { fg.color.lerp(WX.tmp, W.haze * .85); fg.near = 70 - W.haze * 40 - W.rain * 28; fg.far = 290 - W.haze * 150 - W.rain * 130; }
      hemi.current.intensity *= 1 - gray * .3; sun.current.intensity *= 1 - gray * .8 - W.haze * .25;
      const fl = lightningAt(Date.now(), W.storm); if (fl) { hemi.current.intensity += fl * 2.4; if (bg) bg.lerp(WX.flash, fl * .55); }
    }
    const sy = Math.max(.32, Math.abs(Math.sin(ang))), sx = Math.cos(ang);
    if (Math.abs(n - lastN.current) > .01) { lastN.current = n; MATS.forEach(m => { m.emissiveIntensity = n * 1.2; }); if (stars.current) stars.current.visible = n > .4; }

    /* ── camera basis / input ── */
    const cam = st.camera, t = oc.target as THREE.Vector3;
    // Player-follow camera: the local player's head is the camera anchor.
    // The view is intentionally first-person so every real user experiences Abuja from their own character's perspective.
    const headY = VEH.drv ? 1.55 : 1.62 + p.y * .5 - (c.crouch ? .5 : 0);
    const viewFx = Math.sin(p.r), viewFz = Math.cos(p.r);
    if (c.look.x || c.look.y) {
      const lx = THREE.MathUtils.clamp(c.look.x, -80, 80), ly = THREE.MathUtils.clamp(c.look.y, -80, 80);
      oc.setAzimuthalAngle?.(oc.getAzimuthalAngle() - lx * 0.006);
      oc.setPolarAngle?.(THREE.MathUtils.clamp(oc.getPolarAngle() + ly * 0.004, .35, 1.45));
      c.look = { x: c.look.x - lx, y: c.look.y - ly };
    }
    let fx = t.x - cam.position.x, fz = t.z - cam.position.z; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    if (GAME.ride && GAME.ride.pax && PAX.kind === 'plane') {   /* ── passenger on somebody's flight: the chase / cockpit camera follows the mirrored plane ── */
      const ride = GAME.ride;
      p.x = ride.x; p.z = ride.z; p.y = 0; p.vy = 0; moving.current = false; running.current = false;
      group.current.visible = false; oc.enabled = false;
      planeCamera(cam, t, dt);
      GAME.player.x = ride.x; GAME.player.z = ride.z;
      { const M = NET.me; M.x = ride.x; M.z = ride.z; M.r = ride.r; M.mv = 0; M.drv = false; M.rd = 0; M.pa = PAX.host; M.ps = PAX.seat; M.cp = VEH.placed; M.cx = VEH.x; M.cz = VEH.z; M.cr = VEH.r; }
      hud.current = { x: ride.x, z: ride.z, fx: Math.sin(PLANE.h), fz: Math.cos(PLANE.h), r: PLANE.h, vx: VEH.x, vz: VEH.z, vp: VEH.placed, spd: PLANE.speed * 3.6, drv: false, prompt: planePrompt() };
      sunTarget.position.set(ride.x, 0, ride.z); sun.current.position.set(ride.x + sx * 70, sy * 70 + 8, ride.z + 25);
      if (c.interact) c.interact = false;
      c.taxi = false; c.horn = false;
      updateDetails(ride.x, ride.z, performance.now());
      return;
    }
    if (GAME.ride) {
      const ride = GAME.ride;
      p.x = ride.x; p.z = ride.z; p.y = 0; p.vy = 0; moving.current = false; running.current = false;
      group.current.visible = false;
      const lookDist = 8, rx = Math.cos(ride.r), rz = -Math.sin(ride.r);
      oc.target.set(ride.x, 1.2, ride.z);
      cam.position.set(ride.x - rx * lookDist, 4.6, ride.z - rz * lookDist);
      GAME.player.x = ride.x; GAME.player.z = ride.z;
      { // other players keep seeing you: in a taxi / bike / bus the broadcast pose is the VEHICLE's (rd), a ride-along guest shows up inside the host's vehicle (pa)
        const M = NET.me, vo = !!ride.vOn && !ride.pax;
        M.x = vo ? ride.vx! : ride.x; M.z = vo ? ride.vz! : ride.z; M.r = vo ? ride.vr! : ride.r; M.mv = 0; M.drv = false;
        M.rd = vo ? (ride.kind === 'taxi' ? 1 : ride.kind === 'bike' ? 2 : 3) : 0; M.pa = ride.pax ? PAX.host : ''; M.ps = ride.pax ? PAX.seat : 0;
        M.cp = VEH.placed; M.cx = VEH.x; M.cz = VEH.z; M.cr = VEH.r;
      }
      if (c.interact) c.interact = false;
      c.taxi = false;
      updateDetails(p.x, p.z, performance.now());
      return;
    } else { group.current.visible = true; }
    if (PLANE.on) {   /* ── flying the airport plane (components/cityPlane.tsx) ── */
      group.current.visible = false; moving.current = false; running.current = false; oc.enabled = false;
      stepPlane(dt, c, p, pushOut);
      if (PLANE.on) planeCamera(cam, t, dt);
      GAME.player.x = p.x; GAME.player.z = p.z; OBS[0].on = false; OBS[1].on = VEH.placed;
      { const M = NET.me; M.x = p.x; M.z = p.z; M.r = p.r; M.mv = 0; M.drv = false; M.rd = 0; M.pa = ''; M.ps = 0; M.cp = VEH.placed; M.cx = VEH.x; M.cz = VEH.z; M.cr = VEH.r; planeBroadcast(); }
      hud.current = { x: p.x, z: p.z, fx: Math.sin(PLANE.h), fz: Math.cos(PLANE.h), r: PLANE.h, vx: VEH.x, vz: VEH.z, vp: VEH.placed, spd: PLANE.speed * 3.6, drv: false, prompt: planePrompt() };
      sunTarget.position.set(p.x, 0, p.z); sun.current.position.set(p.x + sx * 70, sy * 70 + 8, p.z + 25);
      c.taxi = false; c.horn = false;
      updateDetails(p.x, p.z, performance.now());
      if (!PLANE.on) firstCam.current = true;   // just stepped out: the walking camera takes over again
      return;
    }
    if (!oc.enabled) { oc.enabled = true; firstCam.current = true; }
    if (GAME.nav?.follow) { const fq = NET.peers[GAME.nav.follow]; if (fq && fq.init && Math.hypot(fq.x - GAME.nav.x, fq.z - GAME.nav.z) > 5) { GAME.nav.x = fq.x; GAME.nav.z = fq.z; } }   // "where is @player" follows them as they move, instead of pointing at the spot they were standing on
    const stray = !!(GAME.nav && nav.current && Date.now() - nav.current.at > 1500 && Math.hypot(p.x - (nav.current.points[nav.current.i]?.[0] ?? p.x), p.z - (nav.current.points[nav.current.i]?.[1] ?? p.z)) > 22); // wandered off the route: plan a new one
    if (GAME.nav && (!nav.current || stray || nav.current.key !== `${GAME.nav.x}:${GAME.nav.z}`)) {
      const pts = findPath(BL, [p.x, p.z], [GAME.nav.x, GAME.nav.z]);
      nav.current = { key: `${GAME.nav.x}:${GAME.nav.z}`, points: pts.length ? pts : [[GAME.nav.x, GAME.nav.z]], i: 0, at: Date.now() };
    } else if (!GAME.nav) nav.current = null;
    let ix = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0) + c.joy.x;
    let iy = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0) - c.joy.y;
    if (JACK.victimUntil > Date.now()) { ix = 0; iy = 0; c.interact = false; c.jump = false; } // someone just threw you out of your car
    if (JACK.ph) { ix = 0; iy = 0; c.interact = false; c.jump = false; stepJack(p, dt, c); } // carjack in progress: the sequence drives the avatar
    /* Waypoints only GUIDE the player (route line on the minimap and map). The player always steers; only the idle auto-work routine (nav.auto) may walk by itself. */
    if (nav.current && GAME.nav) {
      while (nav.current.i < nav.current.points.length - 1 && Math.hypot(p.x - nav.current.points[nav.current.i][0], p.z - nav.current.points[nav.current.i][1]) < 2.2) nav.current.i++;
      GAME.route = { pts: nav.current.points, i: nav.current.i };
      const guided = !GAME.nav.auto, reach = guided ? 4 : 1.6;
      if (GAME.nav.auto && !VEH.drv && !ix && !iy) {
        const [nx, nz] = nav.current.points[nav.current.i] || [GAME.nav.x, GAME.nav.z];
        const dx = nx - p.x, dz = nz - p.z, len = Math.hypot(dx, dz) || 1;
        const wx = dx / len, wz = dz / len;
        ix = wx * fx + wz * fz;
        iy = wx * -fz + wz * fx;
      }
      if (Math.hypot(p.x - GAME.nav.x, p.z - GAME.nav.z) < reach) {
        const arrived = GAME.nav.name, missionId = GAME.nav.mission; GAME.nav = null; nav.current = null; GAME.route = null; GAME.notice = `📍 Arrived at ${arrived}`; if (missionId) window.dispatchEvent(new CustomEvent('arl-mission-arrived', { detail: { id: missionId, destination: arrived } })); ix = 0; iy = 0;
      }
    } else GAME.route = null;
    let wantJump = c.jump || k.has(' '), wantRun = c.run || k.has('shift');
    const gp = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads()[0] : null;
    if (gp) {
      const dz = (v: number) => (Math.abs(v) > .15 ? v : 0), cx = dz(gp.axes[2] || 0), cy = dz(gp.axes[3] || 0);
      ix += dz(gp.axes[0] || 0); iy -= dz(gp.axes[1] || 0);
      if (cx || cy) { oc.setAzimuthalAngle?.(oc.getAzimuthalAngle() - cx * dt * 1.8); oc.setPolarAngle?.(THREE.MathUtils.clamp(oc.getPolarAngle() + cy * dt * 1.15, .34, Math.PI / 2.05)); }
      if (gp.buttons[0]?.pressed) wantJump = true;
      if (gp.buttons[7]?.pressed || gp.buttons[10]?.pressed || gp.buttons[1]?.pressed) wantRun = true;
    }
    /* ── fighting: punch the nearest real player, get knocked out at 0 HP ── */
    const nowMs = Date.now(), me = NET.me;
    if (me.ko && nowMs >= me.ko) { const out = me.koKind === 'passout'; me.ko = 0; me.hp = out ? Math.max(me.hp, 60) : 35; me.safe = nowMs + SAFE_AFTER_WAKE_MS; me.koKind = ''; GAME.notice = out ? '🥴 You came to. Your head is pounding. Protected for a few seconds.' : '💪 You got back up. Protected for a few seconds.'; }
    const down = me.ko > nowMs;
    if (!down && me.hp < 100 && nowMs > me.hurt + 6000) me.hp = Math.min(100, me.hp + 5 * dt); // slow regeneration
    if (NET.msg) { GAME.notice = NET.msg; NET.msg = ''; }
    if (c.punch) {
      c.punch = false;
      if (!down && !VEH.drv && !GAME.jailed) {
        let tgt = '', bd = FIGHT.range, tx = 0, tz = 0;
        for (const [pn, q] of Object.entries(NET.peers)) { if (q.drv || q.ko) continue; const dd = Math.hypot(q.x - p.x, q.z - p.z); if (dd < bd) { bd = dd; tgt = pn; tx = q.x; tz = q.z; } }
        if (tgt) p.r = Math.atan2(tx - p.x, tz - p.z);
        fight(tgt);
      }
    }
    if (down) { ix = 0; iy = 0; wantJump = false; wantRun = false; c.interact = false; c.jump = false; c.taxi = false; }
    const m = Math.hypot(ix, iy); if (m > 1) { ix /= m; iy /= m; }
    const mag = Math.min(m, 1);
    let snapCam = false;

    /* ── weapon fire: choose the nearest player in the forward aim cone ── */
    if (c.shoot) {
      c.shoot = false;
      if (!down && !VEH.drv && !GAME.jailed) {
        const weapon = (window as any).__arlWeapon as string | undefined;
        if (!weapon || !WEAPON_RULES[weapon]) { GAME.notice = '🚫 You have no weapon. Buy one at a Gun Shop.'; return; }
        const range = WEAPON_RULES[weapon].range;
        let tgt = '', bd = range;
        for (const [pn, q] of Object.entries(NET.peers)) {
          if (q.drv || q.ko) continue;
          const dx=q.x-p.x, dz=q.z-p.z, dd=Math.hypot(dx,dz); if(dd>=bd) continue;
          const dot=(dx/Math.max(dd,.001))*Math.sin(p.r)+(dz/Math.max(dd,.001))*Math.cos(p.r);
          if(dot>.62){bd=dd;tgt=pn;}
        }
        // a bullet is only spent when a shot really went out (the network layer can refuse one on cooldown)
        let fired = true;
        if (tgt) fired = shoot(tgt, weapon);
        else { NET.me.anim='shoot'; NET.me.animUntil=Date.now()+360; }
        if (fired) {
          window.dispatchEvent(new CustomEvent('arl-shot-fired', { detail: weapon })); pushCrime({ kind: 'gunshot', x: p.x, z: p.z });   // everyone nearby hears it, many see it
          GAME.notice = tgt ? `🎯 Fired ${weapon} at ${tgt}` : '🔫 Shot fired — no target in your aim cone';
        }
      }
    }
    /* ── T / Taxi button: stopped taxi nearby → destination menu; otherwise hail the closest taxi or bike taxi ── */
    if (c.taxi) {
      c.taxi = false;
      // every blocked case now tells the player why (before, the button silently did nothing)
      if (VEH.drv) GAME.notice = '🚕 Get out of your car first (Car button), then call a taxi.';
      else if (GAME.ride || CINE.on) GAME.notice = '🚕 You are already on a ride.';
      else if (GAME.jailed) GAME.notice = '🚫 You cannot call a taxi from jail.';
      else {
        // a stopped vehicle within reach wins; otherwise the nearest one, but the Taxi button prefers real taxis over bikes and buses
        let bi = -1, bs = 1e9;
        ROAM.cars.forEach((e, i) => {
          const tp = TPOS[i]; if (!tp || e.c.busy || !isHail(e.c.role)) return;
          const d = Math.hypot(p.x - tp.x, p.z - tp.z);
          let sc: number;
          if (e.c.hail === 2 && d < 18) sc = -1; else if (e.c.hail === 1) return; else sc = d + (e.c.role === 'taxi' ? 0 : e.c.role === 'bike' ? 25 : 60);
          if (sc < bs) { bs = sc; bi = i; }
        });
        if (bi < 0) GAME.notice = ROAM.cars.some(e => e.c.hail === 1) ? '🚕 Your taxi is still pulling over...' : '🚕 No taxi, bike or bus nearby: wait for one to drive past.';
        else if (ROAM.cars[bi].c.hail === 2) ROAM.openSheet(bi);
        else ROAM.tap(bi);
      }
    }

    if (GAME.hasCar && !VEH.homed && !VEH.placed && !VEH.drv && !GAME.jailed && !GAME.ride) {   // delivered once, then it stays put: onto your driveway when you step out of your house, else the kerb beside you
      const hm = HOUSES.mine;
      if (hm && Math.hypot(p.x - hm.exit.x, p.z - hm.exit.z) < 12) { JACK.release(); VEH.x = hm.car.x; VEH.z = hm.car.z; VEH.r = hm.car.r; VEH.v = 0; VEH.placed = true; VEH.drv = false; VEH.homed = true; }
      else parkNear(p.x, p.z);
    }
    /* ── E: get in / get out, H: horn ── */
    if (c.interact) {
      c.interact = false;
      const doorH = (!VEH.drv && !GAME.ride) ? nearDoor(p.x, p.z) : null;   // GTA style: walk up to your front door and press E
      const taxiI = (!VEH.drv && !GAME.ride) ? ROAM.cars.findIndex((e, i) => isHail(e.c.role) && !e.c.busy && e.c.hail === 2 && TPOS[i] && Math.hypot(p.x - TPOS[i].x, p.z - TPOS[i].z) < 18) : -1;
      if (taxiI >= 0) ROAM.openSheet(taxiI);
      else if (doorH) { if (doorH.mine) window.dispatchEvent(new CustomEvent('arl-enter-home')); else { GAME.notice = `🔒 ${doorH.u}'s house is locked.`; window.dispatchEvent(new CustomEvent('arl-break-in', { detail: { slot: doorH.slot } })); } }
      else if (!VEH.drv && !GAME.ride && planeNear(p.x, p.z)) { boardPlane(p); nearId.current = null; setN(null); setNear(null); }
      else if (VEH.drv) {
        VEH.drv = false; VEH.v = 0; engineStop();
        const lx = -Math.sin(VEH.r), lz = -Math.cos(VEH.r);
        p.x = VEH.x + lx * 2.4; p.z = VEH.z + lz * 2.4; pushOut(p); p.r = Math.atan2(lx, lz); p.y = 0; p.vy = 0;
      } else if (VEH.placed && Math.hypot(p.x - VEH.x, p.z - VEH.z) < 9) {
        VEH.drv = true; VEH.v = 0; engineStart(); snapCam = true;
        nearId.current = null; setN(null); setNear(null);
      } else if (GAME.hasCar) { const dd = Math.round(Math.hypot(p.x - VEH.x, p.z - VEH.z)); GAME.notice = VEH.placed ? `🚗 Your car is parked ${dd} m away: walk to it (see the map).` : '🚗 Your car is not in the city right now.'; }
      else GAME.notice = '🚗 You do not own a car yet. Buy one at a Car Dealer.';
    }
    if (c.horn) { c.horn = false; if (VEH.drv) honk(); }

    if (VEH.drv) {
      /* ── driving: arcade physics ── */
      const V = VEH, vmax = wantRun ? 34 : 25;
      if (iy > .05) V.v += iy * (V.v < 0 ? 28 : wantRun ? 16 : 12) * dt;
      else if (iy < -.05) V.v += iy * (V.v > 0 ? 26 : 9) * dt;
      else V.v -= Math.sign(V.v) * Math.min(Math.abs(V.v), 3.5 * dt);
      if (wantJump) V.v -= Math.sign(V.v) * Math.min(Math.abs(V.v), 34 * dt);
      V.v = THREE.MathUtils.clamp(V.v, -8, vmax);
      V.brake = (iy < -.05 && V.v > .5) || (wantJump && Math.abs(V.v) > .5);
      const auth = THREE.MathUtils.clamp(V.v / 4, -1, 1) * (1 - Math.min(.55, Math.abs(V.v) / 55));
      V.r -= ix * 2.1 * auth * (wantJump ? 1.5 : 1) * dt;
      V.x += Math.cos(V.r) * V.v * dt; V.z -= Math.sin(V.r) * V.v * dt;
      driveKm.current += Math.abs(V.v*dt)/1000; if(VEH.drv && driveKm.current >= .5 && performance.now()-lastDrivePost.current>5000){ const km=driveKm.current; driveKm.current=0; lastDrivePost.current=performance.now(); fetch('/api/vehicles',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'drive',vehicleId:(window as any).__arlVehicleId||'',km})}).catch(()=>{}); }
      hitCool.current -= dt;
      let hit = 0; const fxw = Math.cos(V.r), fzw = -Math.sin(V.r);
      for (const o of CAR_OFFS) { // buildings
        const cp = { x: V.x + fxw * o, z: V.z + fzw * o }, ox = cp.x, oz = cp.z; pushOut(cp, CAR_R);
        const dx = cp.x - ox, dz = cp.z - oz; if (dx || dz) { V.x += dx; V.z += dz; hit = Math.max(hit, Math.hypot(dx, dz)); }
      }
      for (const q of CAR_POSTS) { // lamp posts, poles, billboard posts, trees
        if (Math.abs(q.x - V.x) > 6 || Math.abs(q.z - V.z) > 6) continue;
        for (const o of CAR_OFFS) { const cx = V.x + fxw * o, cz = V.z + fzw * o, dx = cx - q.x, dz = cz - q.z, d = Math.hypot(dx, dz), m = CAR_R + q.r; if (d < m && d > 1e-4) { const push = m - d; V.x += dx / d * push; V.z += dz / d * push; hit = Math.max(hit, push); } }
      }
      const RC = remoteCars();
      for (const tc of TPOS.concat(POLICE_CARS, RC)) { // other cars (traffic, police, other players')
        const tx = Math.cos(tc.r), tz = -Math.sin(tc.r);
        for (const to of [-1.1, 1.1]) for (const o of CAR_OFFS) {
          const ax = tc.x + tx * to, az = tc.z + tz * to, bx = V.x + fxw * o, bz = V.z + fzw * o, dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz);
          if (d < CAR_R * 2 && d > 1e-4) { const push = CAR_R * 2 - d; V.x += dx / d * push; V.z += dz / d * push; hit = Math.max(hit, push); }
        }
      }
      { // people are solid too: real players on foot always, pedestrians when you are not fast enough to run them down (above ~3.5 m/s a ped is knocked over, as before)
        const bump = (x: number, z: number, reach: number) => { for (const o of CAR_OFFS) { const dx = V.x + fxw * o - x, dz = V.z + fzw * o - z, d = Math.hypot(dx, dz); if (d < reach && d > 1e-4) { const push = reach - d; V.x += dx / d * push; V.z += dz / d * push; hit = Math.max(hit, push); } } };
        for (const f of peersOnFoot()) bump(f.x, f.z, CAR_R + .45);
        if (Math.abs(V.v) <= 3.5) for (let i = 0; i < PEDPOS.length; i++) { const q = PEDPOS[i]; if (q && q.x < 9e4 && !q.d) bump(q.x, q.z, CAR_R + .4); }
      }
      if (hit > .01) { if (hitCool.current <= 0 && Math.abs(V.v) > 4) { thud(Math.abs(V.v) / 20); hitCool.current = .35; } V.v *= hit > .15 ? .55 : .93; }
      const lim = LIM - 2; if (Math.abs(V.x) > lim || Math.abs(V.z) > lim) { V.x = THREE.MathUtils.clamp(V.x, -lim, lim); V.z = THREE.MathUtils.clamp(V.z, -lim, lim); V.v *= .6; }
      p.x = V.x; p.z = V.z; p.y = 0; p.vy = 0;
      engineSet(Math.abs(V.v) / 30, Math.max(0, iy));
    } else {
      /* ── on foot ── */
      moving.current = mag > .08; running.current = wantRun;
      const wx = ix * -fz + iy * fx, wz = ix * fx + iy * fz;
      if (moving.current) {
        if (wantRun && c.crouch) c.crouch = false;
        const sp = c.crouch ? 2.3 : wantRun ? 9 : 4.6;
        p.x += wx * sp * dt; p.z += wz * sp * dt;
        p.r += wrap(Math.atan2(wx, wz) - p.r) * Math.min(1, dt * 12);
      }
      pushOut(p);
      for (const tc of TPOS.concat(POLICE_CARS, remoteCars())) { // cars are solid (traffic, police, other players')
        const tx = Math.cos(tc.r), tz = -Math.sin(tc.r);
        for (const to of [-1.1, 1.1]) { const ax = tc.x + tx * to, az = tc.z + tz * to, dx = p.x - ax, dz = p.z - az, d = Math.hypot(dx, dz); if (d < 1.45 && d > 1e-4) { p.x = ax + dx / d * 1.45; p.z = az + dz / d * 1.45; } }
      }
      if (!GAME.jailed) { // people are solid: pedestrians (unless lying on the ground) and other real players on foot
        for (let i = 0; i < PEDPOS.length; i++) { const q = PEDPOS[i]; if (q && q.x < 9e4 && !q.d) pushFrom(p, q.x, q.z, PED_PUSH); }
        for (const f of peersOnFoot()) pushFrom(p, f.x, f.z, PED_PUSH);
        pushOut(p);   // never into a wall
      }
      // Parked taxi/bike stands are solid too; prevent the player from walking through them.
      for (const t of TRANSPORT_SOLIDS) {
        const dx = p.x - t.x, dz = p.z - t.z, d = Math.hypot(dx, dz), min = t.r + BODY;
        if (d < min && d > 1e-4) { p.x = t.x + dx / d * min; p.z = t.z + dz / d * min; }
        else if (d <= 1e-4) p.z += min;
      }
      if (VEH.placed) { const fxw = Math.cos(VEH.r), fzw = -Math.sin(VEH.r); for (const o of CAR_OFFS) { const ax = VEH.x + fxw * o, az = VEH.z + fzw * o, ex = p.x - ax, ez = p.z - az, d = Math.hypot(ex, ez); if (d < 1.4 && d > 1e-4) { p.x = ax + ex / d * 1.4; p.z = az + ez / d * 1.4; } } } // your parked car is solid too
      p.x = THREE.MathUtils.clamp(p.x, -LIM, LIM); p.z = THREE.MathUtils.clamp(p.z, -LIM, LIM);
      if (GAME.tp) { p.x = GAME.tp.x; p.z = GAME.tp.z; GAME.tp = null; }
      if (GAME.jailed) { VEH.drv = false; p.x = THREE.MathUtils.clamp(Math.abs(p.x - CELL.x) > 3 ? CELL.x : p.x, CELL.x - 2.6, CELL.x + 2.6); p.z = THREE.MathUtils.clamp(Math.abs(p.z - CELL.z) > 3 ? CELL.z : p.z, CELL.z - 2.6, CELL.z + 2.6); }
      if (wantJump && p.y <= .001) p.vy = 6.2;
      c.jump = false;
      p.vy -= 18 * dt; p.y += p.vy * dt; if (p.y < 0) { p.y = 0; p.vy = 0; }
      if (JACK.on && !VEH.drv && Math.hypot(p.x - VEH.x, p.z - VEH.z) > 70) { JACK.release(); if (OWN.had) { VEH.x = OWN.x; VEH.z = OWN.z; VEH.r = OWN.r; VEH.v = 0; VEH.placed = true; } else { VEH.placed = false; VEH.homed = false; } } // an abandoned stolen car goes back to traffic; your own car is still where you parked it
    }
    c.jump = false;
    GAME.player.x = p.x; GAME.player.z = p.z; GAME.player.r = p.r;
    group.current.rotation.order = 'YXZ'; const lying = me.ko > nowMs || JACK.victimUntil > nowMs; group.current.position.set(p.x, p.y + (lying ? .28 : 0), p.z); { const cs = c.crouch && !VEH.drv && !lying ? .8 : 1; group.current.scale.y += (cs - group.current.scale.y) * Math.min(1, dt * 10); } group.current.rotation.y = p.r; group.current.rotation.x = lying ? -Math.PI / 2 : 0; // knocked out: lying on the ground
    group.current.visible = !VEH.drv;
    if (JACK.ph) moving.current = JACK.walk;
    if (nameTag.current && shown.current.drv !== VEH.drv) nameTag.current.style.visibility = VEH.drv ? 'hidden' : 'visible';

    /* ── car mesh, brake lights, headlights, floating label ── */
    if (carG.current) {
      carG.current.visible = VEH.placed; carG.current.position.set(VEH.x, 0, VEH.z); carG.current.rotation.y = VEH.r;
      (pkit().tailM as THREE.MeshStandardMaterial).emissiveIntensity = VEH.drv && VEH.brake ? 3.2 : 1.2;
      spot.current.intensity = VEH.drv || VEH.placed ? NIGHT.n * 220 : 0;
    }
    if (carTag.current) { const want = VEH.placed && !VEH.drv ? 'block' : 'none'; if (carTag.current.style.display !== want) carTag.current.style.display = want; }
    shown.current = { drv: VEH.drv, placed: VEH.placed };
    updateDetails(p.x, p.z, performance.now());
    OBS[0].x = p.x; OBS[0].z = p.z; OBS[0].on = !VEH.drv;
    OBS[1].x = VEH.x; OBS[1].z = VEH.z; OBS[1].on = VEH.placed;

    /* ── third-person follow camera (player is visible, orbit with mouse/touch) ── */
    const dist = VEH.drv ? 8.5 : 4.8, targetY = (VEH.drv ? 1.6 : 1.5) + p.y * .6;
    // The camera follows a lightly smoothed copy of the player, not the raw position: collision push-out, jump bob and
    // network corrections nudge the body a few cm every frame, and a rigidly attached camera turns that into shake.
    const ca = camA.current;
    if (!Number.isFinite(ca.x) || c.recenter || snapCam || firstCam.current || Math.hypot(p.x - ca.x, p.z - ca.z) > 6) { ca.x = p.x; ca.y = targetY; ca.z = p.z; }
    else { const kk = 1 - Math.exp(-dt * (VEH.drv ? 40 : 24)); ca.x += (p.x - ca.x) * kk; ca.y += (targetY - ca.y) * kk; ca.z += (p.z - ca.z) * kk; }
    const dx0 = ca.x - t.x, dy0 = ca.y - t.y, dz0 = ca.z - t.z;
    cam.position.x += dx0; cam.position.y += dy0; cam.position.z += dz0; // carry the camera along with the player
    t.set(ca.x, ca.y, ca.z);
    oc.minDistance = dist; oc.maxDistance = dist;
    if (c.recenter || snapCam || firstCam.current) {
      firstCam.current = false; c.recenter = false;
      const yaw = VEH.drv ? VEH.r : p.r;
      const hx = VEH.drv ? Math.cos(yaw) : Math.sin(yaw), hz = VEH.drv ? -Math.sin(yaw) : Math.cos(yaw);
      oc.setAzimuthalAngle?.(Math.atan2(-hx, -hz));
      oc.setPolarAngle?.(1.2);
    }
    oc.update();
    /* ── camera collision: the camera may never sit inside (or behind) a house / building wall ──
       March from the player out to the camera; at the first solid, bisect back to the last free point and park the camera there.
       oc.update() re-applies the full orbit distance next frame, so nothing accumulates. Pulls in fast, eases back out slowly. */
    {
      const px = t.x, py = t.y, pz = t.z, vx = cam.position.x - px, vy = cam.position.y - py, vz = cam.position.z - pz;
      const solid = (x: number, y: number, z: number) => {
        for (const h of HOUSES.list) { const sb = h.solid; if (x > sb.x0 - .5 && x < sb.x1 + .5 && z > sb.z0 - .5 && z < sb.z1 + .5 && y < 8.5) return true; }
        for (const b of BUILDS) { if (Math.abs(x - b.x) < b.w / 2 + .5 && Math.abs(z - b.z) < b.d / 2 + .5 && y < b.h + .4) return true; }
        return false;
      };
      let want = 1, prev = 0;
      for (let i = 1; i <= 10; i++) {
        const m = i / 10;
        if (solid(px + vx * m, py + vy * m, pz + vz * m)) {
          let lo = prev, hi = m;
          for (let j = 0; j < 6; j++) { const mid = (lo + hi) / 2; if (solid(px + vx * mid, py + vy * mid, pz + vz * mid)) hi = mid; else lo = mid; }
          want = Math.max(.22, lo); break;
        }
        prev = m;
      }
      camK = want < camK ? want : camK + (want - camK) * (1 - Math.exp(-dt * 3));
      if (camK < .999) cam.position.set(px + vx * camK, py + vy * camK, pz + vz * camK);
    }
    sunTarget.position.set(p.x, 0, p.z); sun.current.position.set(p.x + sx * 70, sy * 70 + 8, p.z + 25);

    { const M = NET.me; M.x = p.x; M.z = p.z; M.r = p.r; M.mv = moving.current ? (running.current ? 2 : 1) : 0; M.drv = VEH.drv; M.cp = VEH.placed; M.cx = VEH.x; M.cz = VEH.z; M.cr = VEH.r; M.rd = 0; M.pa = ''; M.ps = 0; }
    /* ── HUD + nearest business ── */
    const dCar = Math.hypot(p.x - VEH.x, p.z - VEH.z);
    (window as any).__arlPos = { x: p.x, z: p.z };
    hud.current = { x: p.x, z: p.z, fx, fz, r: p.r, vx: VEH.x, vz: VEH.z, vp: VEH.placed, spd: Math.abs(VEH.v) * 3.6, drv: VEH.drv, prompt: VEH.drv ? hint('Exit car · handbrake · boost · horn: use the buttons', 'E exit · Space handbrake · Shift boost · H horn') : (() => { const dh = nearDoor(p.x, p.z); return dh ? (dh.mine ? hint('Tap Interact — enter your house', 'E — Enter your house') : `🔒 ${dh.u}'s house`) : VEH.placed && dCar < 9 ? hint('Tap Car — get in your car', 'E — Get in your car') : ''; })() };
    if (!VEH.drv) {
      let best: CityBuilding | null = null, bd = 2.6;
      for (const b of BUILDS) { const d = distTo({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 }, p.x, p.z); if (d < bd && b.business) { bd = d; best = b; } }
      const id = best?.business?.id ?? null;
      if (id !== nearId.current) { nearId.current = id; setN(best?.business ?? null); setNear(best?.business ?? null); }
    }
  });

  return (
    <>
      <color attach="background" args={['#8fc3ea']} />
      <fog attach="fog" args={['#c9dff0', 70, 290]} />
      <hemisphereLight ref={hemi} args={['#cfe6ff', '#7d6d52', 1.05]} />
      <directionalLight ref={sun} position={[40, 60, 25]} color="#fff3e0" intensity={2.8} castShadow shadow-mapSize={LOW_END ? [1024, 1024] : [2048, 2048]} shadow-camera-left={-46} shadow-camera-right={46} shadow-camera-top={46} shadow-camera-bottom={-46} shadow-camera-near={1} shadow-camera-far={190} shadow-bias={-0.0003} shadow-normalBias={0.035} />
      <primitive object={sunTarget} />
      <Atmosphere sun={sun} />
      <group ref={stars} visible={false}><Stars radius={250} depth={40} count={1500} factor={5} fade /></group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.06, 0]} receiveShadow><planeGeometry args={[1900, 1900]} /><meshStandardMaterial color="#5d7f55" /></mesh>
      <Roads />
      <Billboards />
      <TransportVehicles look={look} />
      <Inst items={SLABS} color="#b4b6b2" h={.03} y={.015} receive />{/* sidewalk slab: was 12 cm tall, which buried the feet of everyone standing on it (characters walk at y = 0) */}
      <Inst items={MARKS.yellow} color="#f2b705" h={.02} y={.025} />
      <Inst items={MARKS.white} color="#f4f1e4" h={.02} y={.025} />
      <Inst items={MARKS.zebra} color="#f4f1e4" h={.02} y={.025} />
      <Trees />
      <StreetLamps />
      <LampGlow />
      <LookDriver night={NIGHT} />
      <ShopGlow night={NIGHT} />
      <StreetClutter />
      <Graffiti />
      <PowerLines />
      <Puddles />
      <Signals />
      {BUILDS.map(b => <Building key={b.id} b={b} />)}
      <PlayerHouses />
      <Traffic />
      <JackNpc />
      <JackGhost />
      <TailTarget />
      <Pedestrians />
      <NpcShouts />
      <PolicePatrol />
      <PlayerCar carRef={carG} tagRef={carTag} spotRef={spot} model={vehicleModel} look={look} />
      <TrainLine />
      <WeatherEffects />
      <WorldEventVisuals />
      <Rain />
      <Airport />
      <Plane />
      <PlaneTag />
      <ChopYards />
      <JailCell />
      <group ref={group}>
        <Human look={look} getState={() => (moving.current ? 'walk' : 'idle')} getAnim={() => { const m = NET.me; if (moving.current) return undefined; return m.anim && Date.now() < m.animUntil ? m.anim : undefined; }} getSpeed={() => (running.current ? 2.4 : 1.1)} />
        <Html position={[0, 2.8, 0]} center zIndexRange={[5, 0]}><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>{bub[look.name] && <div className="cwSay">{bub[look.name]}</div>}<div ref={el => { nameTag.current = el; }} className="cityNameTag" style={{ display: 'none' }}>{look.name}</div></div></Html>
      </group>
      <StreetNpcScene />
      <CityCompanion />
      <RemotePlayers roster={roster} ver={ver} bub={bub} onPick={onPick} />
      <OrbitControls ref={controls} makeDefault enableRotate={true} enableZoom={false} enablePan={false} enableDamping={false} touches={{ ONE: -1 as any, TWO: -1 as any }} rotateSpeed={.38} minDistance={4.8} maxDistance={4.8} minPolarAngle={.35} maxPolarAngle={1.45} target={[START.x, 1.62, START.z + 6]} />
    </>
  );
}


const CSS = `
.cityNameTag.mini{font-size:10px!important;padding:1px 6px 0!important;border-width:2px!important;border-radius:8px!important;max-width:84px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;box-shadow:none!important}.cwTapTag{pointer-events:auto;cursor:pointer;padding:6px 10px;font-size:12px}
.cwSay{background:#fff;color:#111;border-radius:12px;padding:5px 10px;font-size:12px;max-width:190px;text-align:center;box-shadow:0 2px 8px #0006;white-space:normal;line-height:1.25}
.worldEventTag{background:#111d;color:#fff;border:1px solid #ffffff33;border-radius:999px;padding:6px 10px;font:800 11px system-ui;white-space:nowrap;box-shadow:0 3px 10px #0007}.worldEventTag small{display:block;color:#f3c56f;font-size:8px;text-align:center;margin-top:2px}.cityWorld{touch-action:none}.cwLookPad{display:none;position:absolute;right:0;top:18%;width:52%;height:64%;z-index:8;touch-action:none;border-radius:24px;background:linear-gradient(180deg,#07100d08,#07100d18);pointer-events:auto}.cwLookPad span{position:absolute;right:12px;top:12px;color:#ffffff55;font-size:9px;letter-spacing:.12em;font-weight:800}.cwStick{position:absolute;left:22px;bottom:22px;width:128px;height:128px;border-radius:50%;background:#0b1511aa;border:2px solid #ffffff3a;touch-action:none;z-index:10;display:none}
.cwKnob{position:absolute;left:50%;top:50%;width:58px;height:58px;border-radius:50%;background:#ffffffcc;transform:translate(-50%,-50%);box-shadow:0 2px 8px #0006;pointer-events:none}
.cwBtns{position:absolute;right:18px;bottom:22px;z-index:12;display:grid;grid-template-columns:64px 64px 80px;gap:10px;align-items:center;justify-items:center}.cwBtns .big{grid-column:3;grid-row:1 / span 2}
.cwBtn{width:64px;height:64px;border-radius:50%;border:2px solid #ffffff44;background:#0b1511cc;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;touch-action:none;user-select:none;-webkit-user-select:none;cursor:pointer}
.cwHurt{position:absolute;inset:0;z-index:9;pointer-events:none;opacity:0;background:radial-gradient(ellipse at center,#0000 40%,#ff1010cc 100%)}.cwHp{position:absolute;left:50%;bottom:26px;transform:translateX(-50%);z-index:12;flex-direction:column;align-items:center;gap:4px;color:#fff;font-weight:800;font-size:13px;pointer-events:none;text-shadow:0 2px 0 #000}.cwHp i{display:block;width:180px;height:12px;border:3px solid #1a1410;border-radius:99px;background:#0009;overflow:hidden}.cwHp b{display:block;height:100%;width:100%;transition:width .15s}\n.cwBtn span{font-size:22px;line-height:1}.cwBtn small{font-size:9px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}
.cwBtn:active{background:#d99a42;color:#111}.cwBtn.big{width:78px;height:78px}.cwBtn.cam{width:50px;height:50px}.cwBtn.cam small{display:none}
.cwMap{position:absolute;left:12px;top:72px;width:140px;height:140px;border-radius:50%;border:3px solid #ffffffcc;box-shadow:0 4px 18px #0008;z-index:6;background:#35553f;pointer-events:none}
.cwHint{position:absolute;right:18px;bottom:110px;z-index:6;color:#fff;font-size:11px;line-height:1.55;background:#0b1511b0;border:1px solid #ffffff22;border-radius:10px;padding:8px 11px;pointer-events:none}
.cwHint b{color:#d99a42}
.cwSpeed{position:absolute;right:270px;bottom:30px;z-index:7;display:none;align-items:baseline;gap:4px;color:#fff;background:#0b1511d0;border:1px solid #ffffff2a;border-radius:14px;padding:8px 14px;pointer-events:none}
.cwSpeed b{font-size:28px;font-weight:800;color:#ffd23f;min-width:46px;text-align:right}.cwSpeed small{font-size:10px;font-weight:700;opacity:.8}
.cwTip{position:absolute;left:50%;bottom:104px;transform:translateX(-50%);z-index:7;color:#fff;font-size:12px;font-weight:700;background:#0b1511c0;border:1px solid #ffffff22;border-radius:999px;padding:6px 14px;pointer-events:none;white-space:nowrap}
.cwTip:empty{display:none}
.cwGear{top:268px}
.cwMute{position:absolute;left:12px;top:222px;z-index:7;width:38px;height:38px;border-radius:50%;border:2px solid #ffffff44;background:#0b1511cc;color:#fff;font-size:17px;cursor:pointer}
.cwTouch{display:none}
@media (pointer:coarse),(max-width:700px){.cwLookPad{display:block}.cwStick{display:block}.cwHint{display:none}.cwMap{width:96px;height:96px;top:96px;left:10px}.cwBtns{bottom:20px;right:14px;grid-template-columns:58px 58px 72px;gap:8px}.cwBtn{width:58px;height:58px}.cwBtn.big{width:70px;height:70px}.cwBtn.cam{width:48px;height:48px}.cwTouch{display:flex}.cwSpeed{right:auto;left:14px;bottom:166px}.cwTip{bottom:170px;font-size:11px}.cwMute{left:10px;top:200px}.cwGear{top:246px!important}}
`;


let camK = 1;   // camera collision pull-in factor (1 = full orbit distance)
export default function CityWorld({ look, onNear, getMinute, onSocial, onOpenMap }: { look: Look; onNear: (b: any) => void; getMinute?: () => number; onSocial?: (a?: number) => void; onOpenMap?: () => void }) {
  useState(() => { // stepping out of the house: appear on a sidewalk, somewhere different each time and not on top of another player (building exits set GAME.tp instead)
    if (GAME.tp) { START.x = GAME.tp.x; START.z = GAME.tp.z; START.r = GAME.tp.r ?? 0; GAME.player.x = GAME.tp.x; GAME.player.z = GAME.tp.z; } // arriving from a building / jail / ride: start the camera right there, not at the old default
    else { const s = sidewalkSpawn(Math.random, (x, z) => Object.values(NET.peers).some(q => Math.hypot(q.x - x, q.z - z) < 3)); START.x = s.x; START.z = s.z; START.r = s.r; GAME.player.x = s.x; GAME.player.z = s.z; }
    return 0;
  });
  const net = useCityNet(look, onSocial);
  const [sel, setSel] = useState<string | null>(null);
  const nearBiz = useRef<any>(null);   // the building you are standing next to, for the Interact button
  const ctl = useRef<Ctl>({ shoot: false, joy: { x: 0, y: 0 }, look: { x: 0, y: 0 }, keys: new Set(), run: false, jump: false, recenter: false, interact: false, taxi: false, horn: false, punch: false });
  const hud = useRef<Hud>({ x: START.x, z: START.z, fx: Math.sin(START.r), fz: Math.cos(START.r), r: START.r, vx: 0, vz: 0, vp: false, spd: 0, drv: false, prompt: '' });
  const cfg = useSettings(), [hasCar, setHasCar] = useState(GAME.hasCar), [armed, setArmed] = useState(false);
  /* plane buttons for phones: "Plane" (board / get out) appears next to the plane or while flying, "View" switches cockpit / outside */
  const [pl, setPl] = useState<'' | 'near' | 'fly' | 'pax'>('');
  useEffect(() => { const f = () => { const v = PLANE.on ? 'fly' : PLANE.pax ? 'pax' : planeNear(GAME.player.x, GAME.player.z) ? 'near' : ''; setPl(o => o === v ? o : v); }; f(); const i = setInterval(f, 300); window.addEventListener('arl-plane', f); return () => { clearInterval(i); window.removeEventListener('arl-plane', f); }; }, []);
  useEffect(() => { const w = setInterval(() => { const mid = (window as any).__arlMissionId; if (mid && !(window as any).__arlMissionHold && (GAME.nav as any)?.mission !== mid) { const g = (window as any).__arlMissionGoal as { id: string; x: number; z: number; name: string } | undefined; if (g && g.id === mid) { GAME.nav = { x: g.x, z: g.z, name: g.name, mission: mid }; GAME.notice = '📍 Mission route restored'; } else window.dispatchEvent(new Event('arl-mission-lost')); } }, 800); return () => clearInterval(w); }, []);
  useEffect(() => { // killed: climb out of any vehicle, drop the waypoint and the arrival spot; Sim.tsx puts you back in your house
    const f = () => { VEH.drv = false; VEH.v = 0; GAME.nav = null; GAME.tp = null; }; window.addEventListener('arl-respawn-home', f); return () => window.removeEventListener('arl-respawn-home', f);
  }, []);
  useEffect(() => { const i = setInterval(() => { setHasCar(GAME.hasCar); if (!GAME.hasCar) { if (VEH.drv) JACK.victimEject(); VEH.placed = false; VEH.drv = false; VEH.homed = false; } }, 600); return () => clearInterval(i); }, []);
  useEffect(() => {
    const startMission = (e: Event) => {
      const m = (e as CustomEvent).detail as { id?: string; goto?: { name?: string; type?: string; district?: string }; final?: { name?: string; type?: string; district?: string }; fresh?: boolean; label?: string; title?: string };
      if (!m?.id) return;
      if (!m.goto) { GAME.missionFinal = null; if ((GAME.nav as any)?.mission) GAME.nav = null; (window as any).__arlMissionTarget = undefined; GAME.notice = `🎯 ${m.label || m.title || 'Mission'}`; return; }   // a stage with no waypoint (the stealth tail): clear the old route and just show the objective
      const pos = (window as any).__arlPos as { x: number; z: number } | undefined;
      const resolve = (g: { name?: string; type?: string; district?: string }, from?: { x: number; z: number }) => {
        const near = (l: typeof BUILDING_DESTS) => from ? [...l].sort((a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z))[0] : l[0];
        const pick = (l: typeof BUILDING_DESTS) => l.length ? near(l) : undefined;
        return (g.name ? pick(BUILDING_DESTS.filter(d => d.name.toLowerCase().includes(g.name!.toLowerCase()))) : undefined)
          || (g.type ? pick(BUILDING_DESTS.filter(d => d.type === g.type)) : undefined)
          || (g.district ? pick(BUILDING_DESTS.filter(d => d.district.toLowerCase() === g.district!.toLowerCase())) : undefined);
      };
      const target = resolve(m.goto, pos);
      // the FINAL destination of the whole mission (resolved from the current stage target so multi-stop contracts pick the sensible building)
      const fin = m.final ? resolve(m.final, target || pos) : undefined;
      GAME.missionFinal = fin ? { x: fin.x, z: fin.z, name: fin.name } : null;
      if (!target) { GAME.notice = `Mission started: ${m.title || m.label}. Find the mission destination in the city.`; return; }
      (window as any).__arlMissionTarget = { x: target.x, z: target.z }; (window as any).__arlMissionGoal = { id: m.id, x: target.x, z: target.z, name: target.name };
      GAME.nav = { x: target.x, z: target.z, name: target.name, mission: m.id } as any;
      GAME.notice = `📍 ${m.label || 'Mission waypoint'}: ${target.name} — follow the route on your minimap or map`;
      if (m.fresh) onOpenMap?.(); // a brand-new mission opens the map so you see the route and the final destination straight away
    };
    const cancelMission = () => { GAME.missionFinal = null; if ((GAME.nav as any)?.mission) GAME.nav = null; };
    window.addEventListener('arl-mission-start', startMission); window.addEventListener('arl-mission-cancel', cancelMission);
    return () => { window.removeEventListener('arl-mission-start', startMission); window.removeEventListener('arl-mission-cancel', cancelMission); };
  }, []);
  useEffect(() => {
    const typing = (e: Event) => { const t = e.target as HTMLElement | null; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
    const dn = (e: KeyboardEvent) => {
      if (typing(e)) return; const k = e.key.toLowerCase();
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if (k === 'c') ctl.current.recenter = true;
      if (k === 'f' && !e.repeat) ctl.current.punch = true;
      if (k === 'v' && !e.repeat) window.dispatchEvent(new Event('arl-trigger-fire'));
      if (k === 'e' && !e.repeat) { ctl.current.interact = true; unlockAudio(); }
      if (k === 't' && !e.repeat) { ctl.current.taxi = true; unlockAudio(); }
      if (k === 'h' && !e.repeat) { ctl.current.horn = true; unlockAudio(); }
      ctl.current.keys.add(k);
    };
    const up = (e: KeyboardEvent) => { ctl.current.keys.delete(e.key.toLowerCase()); };
    const clear = () => ctl.current.keys.clear();
    const fire = () => { ctl.current.shoot = true; }; const anim = (e: Event) => { NET.me.anim = String((e as CustomEvent).detail || ''); NET.me.animUntil = Date.now() + 700; }; const selected = (e: Event) => { (window as any).__arlWeapon = String((e as CustomEvent).detail || ''); setArmed(!!(e as CustomEvent).detail); }; window.addEventListener('arl-weapon-shoot', fire); window.addEventListener('arl-player-animation', anim); window.addEventListener('arl-weapon-selected', selected); window.addEventListener('keydown', dn); window.addEventListener('keyup', up); window.addEventListener('blur', clear);
    return () => { window.removeEventListener('arl-weapon-shoot', fire); window.removeEventListener('arl-player-animation', anim); window.removeEventListener('arl-weapon-selected', selected); window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear); };
  }, []);
  return (
    <div className="cityWorld">
      <RuntimeStyle css={CSS} />
      <RuntimeStyle css={GAME_LABEL_CSS} />
      <Canvas shadows dpr={LOW_END ? [1, 1.25] : [1, 1.5]} gl={{ powerPreference: 'high-performance' }} camera={{ position: [START.x - Math.sin(START.r) * 8, 4.2, START.z - Math.cos(START.r) * 8], fov: 52, near: .4, far: 600 }}>
        <Scene fight={net.punch} shoot={net.shoot} look={look} ctl={ctl} hud={hud} setNear={(b: any) => { nearBiz.current = b; onNear(b); }} getMinute={getMinute} roster={net.roster} ver={net.ver} bub={net.bub} onPick={setSel} />
      </Canvas>
      <Minimap hud={hud} onOpen={onOpenMap} />
      <CityPeople net={net} sel={sel} setSel={setSel} />
      <LookPad ctl={ctl} />
      <Stick ctl={ctl} />
      <DriveHud hud={hud} />
      <DrivePad ctl={ctl} hud={hud} />
      <FightHud />
      <PaxUi />
      <MissionsCombat />
      <button className="cwMute" aria-label="Toggle sound" onClick={() => { unlockAudio(); setMuted(!cfg.muteAll); }}>{cfg.muteAll ? '🔇' : '🔊'}</button>
      <button className="cwMute cwGear" aria-label="Settings" onClick={openSettings}>⚙️</button>
      <button type="button" className="cwPhoneBtn" aria-label="Phone" onClick={() => window.dispatchEvent(new Event('arl-open-phone'))}>📱</button>
      <div className="cwBtns">
        {hasCar && <HoldBtn cls="cam cwTouch" label="Horn" icon="📣" down={() => { unlockAudio(); ctl.current.horn = true; }} />}
        {(pl === 'fly' || pl === 'near') && <HoldBtn cls="cwTouch" label={pl === 'fly' ? 'Exit plane' : 'Board plane'} icon="✈️" down={() => { unlockAudio(); ctl.current.interact = true; }} />}
        {(pl === 'fly' || pl === 'pax') && <HoldBtn cls="cwTouch" label="View" icon="📷" down={() => { togglePlaneView(); }} />}
        {hasCar && <HoldBtn cls="cwTouch" label="Car" icon="🚗" down={() => { unlockAudio(); ctl.current.interact = true; }} />}
        <HoldBtn cls="cwTouch" label="Taxi" icon="🚕" down={() => { unlockAudio(); ctl.current.taxi = true; }} />
        <HoldBtn cls="" label="Interact" icon="🖐️" down={() => { unlockAudio(); if (nearBiz.current?.id) window.dispatchEvent(new CustomEvent('arl-enter', { detail: nearBiz.current.id })); else ctl.current.interact = true; }} />
        <HoldBtn cls="" label="Phone" icon="📱" down={() => { window.dispatchEvent(new Event('arl-open-phone')); }} />
        <HoldBtn cls="" label="Fight" icon="👊" down={() => { ctl.current.punch = true; }} />
        <HoldBtn cls="" label="Crouch" icon="🧎" down={() => { ctl.current.crouch = !ctl.current.crouch; }} />
        {armed && <HoldBtn cls="" label="Fire" icon="🔫" down={() => { window.dispatchEvent(new Event('arl-trigger-fire')); }} />}
        <HoldBtn cls="cam" label="Camera" icon="🎥" down={() => { ctl.current.recenter = true; }} />
        <HoldBtn cls="" label="Sprint" icon="🏃" down={() => { ctl.current.run = true; }} up={() => { ctl.current.run = false; }} />
        <HoldBtn cls="big" label="Jump" icon="⬆️" down={() => { ctl.current.jump = true; }} />
      </div>
      <div className="cwHint"><b>WASD</b> move · <b>Shift</b> sprint · <b>Space</b> jump<br /><b>Drag mouse</b> look · <b>C</b> recenter · <b>F</b> punch · <b>M</b> missions · <b>G</b> weapon · <b>R</b> reload · <b>V</b> fire (guns are sold at Gun Shops)<br />{hasCar ? <><b>E</b> call / enter / exit car · <b>H</b> horn · <b>Space</b> handbrake · </> : null}Gamepad works too</div>
    </div>
  );
}