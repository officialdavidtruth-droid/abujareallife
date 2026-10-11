'use client';
import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import Human from './Human';
import RuntimeStyle from './RuntimeStyle';
import { GAME, VEH } from './cityShared';
import { CLUB_LOOKS, COMPANION, endCompanion } from '../lib/clubNpc';

/* STEP 3 of the club companion flow: she comes home with you.
   City: she walks a step behind you on foot, and rides along (hidden) while you drive; when you get out she is beside the car.
   Home: she walks in after you and follows you around the house. Walking out again takes her with you.
   The banner tells you where you are in the plan. Step 4 (bedroom) starts from phase 'home'. */
const useIdx = () => { const [i, setI] = useState(COMPANION.idx); useEffect(() => { const t = setInterval(() => setI(COMPANION.idx), 400); return () => clearInterval(t); }, []); return i; };
const lookOf = (i: number) => CLUB_LOOKS[i] || CLUB_LOOKS[5];

/** Follows a moving target at a polite distance. `free` lets the caller block steps (walls and furniture indoors). */
function follow(q: { x: number; z: number; rot: number; mv: boolean }, tx: number, tz: number, dt: number, gap: number, speed: (d: number) => number, free?: (x: number, z: number) => boolean) {
  const dx = tx - q.x, dz = tz - q.z, d = Math.hypot(dx, dz) || .001;
  q.mv = d > gap + .5 || (q.mv && d > gap + .1);
  let target = q.rot;
  if (q.mv) {
    const st = Math.min(d - gap, speed(d) * dt), nx = q.x + dx / d * st, nz = q.z + dz / d * st;
    if (!free || free(nx, nz)) { q.x = nx; q.z = nz; } else if (free(nx, q.z)) q.x = nx; else if (free(q.x, nz)) q.z = nz;
    target = Math.atan2(dx, dz);
  } else target = Math.atan2(dx, dz);   // standing: turn to face you
  let a = target - q.rot; a = Math.atan2(Math.sin(a), Math.cos(a)); q.rot += a * Math.min(1, dt * 7);
}

export function CityCompanion() {
  const g = useRef<THREE.Group>(null!), s = useRef({ x: 0, z: 0, rot: 0, mv: false, init: false }), idx = useIdx();
  useFrame((_, raw) => {
    if (!g.current) return;
    const dt = Math.min(raw, .05), q = s.current, on = COMPANION.phase === 'outside', P = GAME.player;
    if (!on) { q.init = false; g.current.visible = false; return; }
    if (!q.init || Math.hypot(P.x - q.x, P.z - q.z) > 45) { q.x = P.x - Math.sin(P.r) * 1.7; q.z = P.z - Math.cos(P.r) * 1.7; q.rot = P.r; q.init = true; }
    if (VEH.drv || GAME.ride) { q.x = VEH.drv ? VEH.x : P.x; q.z = VEH.drv ? VEH.z : P.z; q.mv = false; g.current.visible = false; return; }   // in the car with you
    g.current.visible = true;
    follow(q, P.x, P.z, dt, 1.7, d => (d > 9 ? 8 : d > 4 ? 4.2 : 1.9));
    g.current.position.set(q.x, 0, q.z); g.current.rotation.y = q.rot;
  });
  return <group ref={g} visible={false}><Human key={idx} look={lookOf(idx)} getState={() => (s.current.mv ? 'walk' : 'idle')} getSpeed={() => 1.3} /></group>;
}

export function HomeCompanion({ pos, free }: { pos: () => [number, number]; free: (x: number, z: number) => boolean }) {
  const g = useRef<THREE.Group>(null!), s = useRef({ x: 0, z: 0, rot: 0, mv: false, init: false }), idx = useIdx();
  useFrame((_, raw) => {
    if (!g.current) return;
    const dt = Math.min(raw, .05), q = s.current, on = COMPANION.phase === 'home', [px, pz] = pos();
    if (!on) { q.init = false; g.current.visible = false; return; }
    if (!q.init) { q.x = px; q.z = Math.min(pz + 1.4, 3.7); q.rot = Math.PI; q.init = true; }   // she steps in through the door behind you
    g.current.visible = true;
    follow(q, px, pz, dt, 1.5, () => 1.8, free);
    g.current.position.set(q.x, 0, q.z); g.current.rotation.y = q.rot;
  });
  return <group ref={g} visible={false}><Human key={idx} look={lookOf(idx)} getState={() => (s.current.mv ? 'walk' : 'idle')} getSpeed={() => 1.2} /></group>;
}

export function CompanionHud({ outside }: { outside: boolean }) {
  const [phase, setPhase] = useState<string>(COMPANION.phase), name = COMPANION.name;
  // city <-> house follows you: leaving the house takes her along, coming home brings her in
  useEffect(() => { if (outside && COMPANION.phase === 'home') COMPANION.phase = 'outside'; else if (!outside && COMPANION.phase === 'outside') COMPANION.phase = 'home'; setPhase(COMPANION.phase); }, [outside]);
  useEffect(() => {
    const t = setInterval(() => { if (COMPANION.phase !== 'none' && GAME.jailed) endCompanion(); setPhase(COMPANION.phase); }, 300);
    const ko = () => endCompanion(); window.addEventListener('arl-respawn-home', ko);
    return () => { clearInterval(t); window.removeEventListener('arl-respawn-home', ko); };
  }, []);
  if (phase !== 'outside' && phase !== 'home') return null;
  return <div className="ccBar"><span>💋</span><div><b>{name} is with you</b><small>{phase === 'outside' ? 'Walk or drive her to your house. At your front door press E.' : 'You are home together. (The bedroom comes in the next step.)'}</small></div>
    <button onClick={() => { endCompanion(); setPhase('none'); }}>{phase === 'outside' ? 'Call it off' : 'Send her home'}</button>
    <RuntimeStyle id="arl-companion-hud" css={`.ccBar{position:fixed;left:50%;transform:translateX(-50%);top:calc(64px + env(safe-area-inset-top,0px));z-index:44;display:flex;gap:10px;align-items:center;background:#100b1cf7;border:1px solid #e879f9aa;border-radius:14px;padding:8px 12px;color:#fff;box-shadow:0 8px 24px #000a;max-width:calc(100vw - 20px)}.ccBar span{font-size:24px}.ccBar b{display:block;font-size:13px;color:#f0abfc}.ccBar small{color:#c9bde0;font-size:11px;display:block;max-width:230px}.ccBar button{background:none;border:1px solid #ffffff33;color:#cdbfe6;border-radius:8px;padding:5px 8px;font:700 11px system-ui;cursor:pointer;flex:none}`} />
  </div>;
}
