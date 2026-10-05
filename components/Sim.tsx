'use client';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, RoundedBox, Html } from '@react-three/drei';
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import Human from './Human';
import Creator from './Creator';
import Account, { type AccountUser } from './Account';
import AuthScreen from './AuthScreen';
import Loader from './Loader';
import AssetLoader from './AssetLoader';
import Neighborhood from './Neighborhood';
import { DEFAULT_LOOK, OUTFITS, type Look } from '../lib/characterModels';

type N = 'hunger' | 'energy' | 'hygiene' | 'bladder' | 'fun' | 'social';
type Pose = 'stand' | 'sit' | 'sleep';
type Act = { k: string; label: string; e: string; dur: number; fx: Partial<Record<N, number>>; pose: Pose; cost?: number; pay?: number; pow?: boolean; anim?: string };
type Obj = { id: string; name: string; p: [number, number]; rot: number; spot: [number, number]; face: number; acts: Act[] };
type Task = { t: 'walk'; x: number; z: number } | { t: 'act'; a: Act; o: Obj };

const NEEDS: [N, string, string][] = [['hunger', 'Hunger', '🍲'], ['energy', 'Energy', '😴'], ['hygiene', 'Hygiene', '🚿'], ['bladder', 'Bladder', '🚽'], ['fun', 'Fun', '🎮'], ['social', 'Social', '💬']];
const DECAY: Record<N, number> = { hunger: .07, energy: .045, hygiene: .05, bladder: .09, fun: .06, social: .04 };
const cl = (n: number) => Math.max(0, Math.min(100, n));
const naira = (n: number) => '₦' + Math.round(n).toLocaleString();

const OBJ: Obj[] = [
  { id: 'bed', name: 'Bed', p: [-4.6, -2.6], rot: 0, spot: [-3.4, -1.9], face: 0, acts: [
    { k: 'sleep', label: 'Sleep', e: '💤', dur: 360, fx: { energy: 100, hunger: -10 }, pose: 'sleep' },
    { k: 'nap', label: 'Nap', e: '😴', dur: 90, fx: { energy: 35 }, pose: 'sleep' }] },
  { id: 'wardrobe', name: 'Wardrobe & mirror', p: [-2.55, -4.15], rot: 0, spot: [-2.55, -3.25], face: Math.PI, acts: [
    { k: 'outfit', label: 'Change outfit', e: '👕', dur: 8, fx: { fun: 8 }, pose: 'stand', anim: 'wardrobe' },
    { k: 'mirror', label: 'Check the mirror', e: '🪞', dur: 10, fx: { fun: 10, social: 4 }, pose: 'stand', anim: 'groom' }] },
  { id: 'fridge', name: 'Kitchen', p: [-1, -4.1], rot: 0, spot: [-1, -3.2], face: Math.PI, acts: [
    { k: 'cook', label: 'Cook jollof', e: '🍛', dur: 30, fx: { hunger: 60, fun: 6 }, pose: 'stand', cost: 1500, anim: 'cook' },
    { k: 'snack', label: 'Snack', e: '🥜', dur: 10, fx: { hunger: 25 }, pose: 'stand', cost: 500, anim: 'eat' },
    { k: 'water', label: 'Drink water', e: '💧', dur: 5, fx: { hunger: 3, bladder: -6 }, pose: 'stand', anim: 'eat' }] },
  { id: 'dining', name: 'Dining table', p: [-.3, -2.3], rot: 0, spot: [-.3, -1.5], face: Math.PI, acts: [
    { k: 'meal', label: 'Sit down & eat', e: '🍽️', dur: 25, fx: { hunger: 55, fun: 8, social: 3 }, pose: 'sit', cost: 1000, anim: 'eatsit' }] },
  { id: 'shower', name: 'Shower', p: [5.3, -3.7], rot: 0, spot: [5.3, -3.5], face: Math.PI, acts: [
    { k: 'shower', label: 'Take a shower', e: '🚿', dur: 25, fx: { hygiene: 100, fun: 5 }, pose: 'stand', anim: 'wash' }] },
  { id: 'toilet', name: 'Toilet', p: [3.3, -4.1], rot: 0, spot: [3.3, -4.0], face: 0, acts: [
    { k: 'wc', label: 'Use toilet', e: '🚽', dur: 8, fx: { bladder: 100 }, pose: 'sit', anim: 'wc' }] },
  { id: 'tv', name: 'Sofa & TV', p: [-3, 1.2], rot: -Math.PI / 2, spot: [-3, 1.2], face: -Math.PI / 2, acts: [
    { k: 'tv', label: 'Watch Nollywood', e: '📺', dur: 90, fx: { fun: 45, energy: -5 }, pose: 'sit', pow: true, anim: 'tv' },
    { k: 'game', label: 'Play video games', e: '🎮', dur: 80, fx: { fun: 55, energy: -8, hunger: -6 }, pose: 'sit', pow: true, anim: 'game' },
    { k: 'chill', label: 'Relax on sofa', e: '🛋️', dur: 45, fx: { fun: 15, energy: 10 }, pose: 'sit', anim: 'chill' }] },
  { id: 'desk', name: 'Computer', p: [3.4, 2], rot: 0, spot: [3.4, 2.85], face: Math.PI, acts: [
    { k: 'work', label: 'Freelance gig', e: '💻', dur: 180, fx: { energy: -25, fun: -15, hunger: -10 }, pose: 'sit', pay: 6000, pow: true, anim: 'work' },
    { k: 'hustle', label: 'Side hustle', e: '🧾', dur: 150, fx: { energy: -18, fun: -8, hunger: -7 }, pose: 'sit', pay: 3500, pow: true, anim: 'work' },
    { k: 'browse', label: 'Scroll social media', e: '📱', dur: 40, fx: { fun: 25, social: 10, energy: -4 }, pose: 'sit', pow: true, anim: 'browse' }] },
  { id: 'phone', name: 'Phone', p: [-1.2, 3.2], rot: 0, spot: [-1.2, 2.5], face: 0, acts: [
    { k: 'call', label: 'Call Ada', e: '📞', dur: 40, fx: { social: 45, fun: 10 }, pose: 'stand', anim: 'phone' },
    { k: 'chat', label: 'Chat on WhatsApp', e: '💬', dur: 20, fx: { social: 22 }, pose: 'stand', anim: 'chat' },
    { k: 'order', label: 'Order food delivery', e: '🛵', dur: 25, fx: { hunger: 45, fun: 5 }, pose: 'stand', cost: 2500, anim: 'phone' }] },
  { id: 'mat', name: 'Workout mat', p: [1.4, -.9], rot: 0, spot: [1.4, -.9], face: 0, acts: [
    { k: 'squat', label: 'Squats workout', e: '🏋️', dur: 45, fx: { energy: -22, hunger: -12, hygiene: -15, fun: 15 }, pose: 'stand', anim: 'squat' },
    { k: 'yoga', label: 'Yoga', e: '🧘', dur: 40, fx: { energy: 8, fun: 12 }, pose: 'stand', anim: 'yoga' }] },
  { id: 'radio', name: 'Speaker', p: [4.2, -1.3], rot: 0, spot: [3.5, -1.3], face: Math.PI / 2, acts: [
    { k: 'music', label: 'Play Afrobeats', e: '🎵', dur: 40, fx: { fun: 25 }, pose: 'stand', pow: true, anim: 'music' },
    { k: 'dance', label: 'Dance party', e: '💃', dur: 35, fx: { fun: 40, energy: -12, social: 5, hygiene: -8 }, pose: 'stand', pow: true, anim: 'dance' }] },
  { id: 'shelf', name: 'Bookshelf', p: [-6.05, -.45], rot: 0, spot: [-5.2, -.45], face: -Math.PI / 2, acts: [
    { k: 'read', label: 'Read a book', e: '📖', dur: 60, fx: { fun: 20, energy: -4 }, pose: 'stand', anim: 'read' }] },
  { id: 'plant', name: 'Plant', p: [5.5, 3.4], rot: 0, spot: [4.6, 3.4], face: Math.PI / 2, acts: [
    { k: 'plant', label: 'Water the plant', e: '🌿', dur: 10, fx: { fun: 8 }, pose: 'stand', anim: 'water' }] },
  { id: 'door', name: 'Front door', p: [-6.2, 3.5], rot: 0, spot: [-5.3, 3.5], face: -Math.PI / 2, acts: [
    { k: 'door', label: 'Go outside', e: '🚪', dur: 4, fx: {}, pose: 'stand', anim: 'door' }] },
  { id: 'gen', name: 'Generator', p: [5.3, .4], rot: 0, spot: [4.4, .4], face: Math.PI / 2, acts: [
    { k: 'gen', label: 'Fuel generator', e: '⛽', dur: 15, fx: {}, pose: 'stand', cost: 2000, anim: 'fuel' }] },
];
const EMOTES: Act[] = [
  { k: 'wave', label: 'Wave', e: '👋', dur: 6, fx: { social: 8 }, pose: 'stand', anim: 'wave' },
  { k: 'edance', label: 'Dance', e: '🕺', dur: 20, fx: { fun: 22, energy: -6 }, pose: 'stand', anim: 'dance' },
  { k: 'cheer', label: 'Cheer', e: '🙌', dur: 8, fx: { fun: 10 }, pose: 'stand', anim: 'cheer' },
  { k: 'stretch', label: 'Stretch', e: '🤸', dur: 10, fx: { energy: 4, fun: 4 }, pose: 'stand', anim: 'stretch' },
  { k: 'think', label: 'Think', e: '🤔', dur: 8, fx: { fun: 3 }, pose: 'stand', anim: 'think' },
];
// Furniture footprints [x0, x1, z0, z1]: characters walk around these instead of through them.
const BLOCK: [number, number, number, number][] = [[-5.5, -3.7, -3.9, -1.3], [-3.3, -1.8, -4.7, -3.85], [-1.5, .8, -4.7, -3.7], [-1.1, .5, -2.75, -1.85], [2.5, 4.3, 1.55, 2.45], [-6.1, -5.1, .45, 1.95], [-3.5, -2.5, .1, 2.3], [4.85, 5.75, .1, .7], [-1.5, -.9, 2.9, 3.5], [5.2, 5.8, 3.1, 3.7], [4.0, 4.5, -1.6, -1.0], [-6.3, -5.85, -1, .1], [4.6, 6, -4.4, -3], [3.0, 3.6, -4.5, -3.8]];
const MARGIN = .3;
type P = [number, number];
const inBlock = (p: P, r: number[]) => p[0] > r[0] - MARGIN && p[0] < r[1] + MARGIN && p[1] > r[2] - MARGIN && p[1] < r[3] + MARGIN;
function crosses(a: P, b: P, r: number[]) { // Liang–Barsky segment vs expanded rectangle
  let t0 = 0, t1 = 1; const dx = b[0] - a[0], dz = b[1] - a[1];
  for (const [pp, q] of [[-dx, a[0] - (r[0] - MARGIN)], [dx, r[1] + MARGIN - a[0]], [-dz, a[1] - (r[2] - MARGIN)], [dz, r[3] + MARGIN - a[1]]]) {
    if (pp === 0) { if (q < 0) return false; } else { const t = q / pp; if (pp < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } }
  }
  return true;
}
function path(from: P, to: P): P[] {
  const route: P[] = [from, to];
  for (let n = 0; n < 8; n++) {
    let fixed = false;
    for (let i = 0; i < route.length - 1 && !fixed; i++) {
      const a = route[i], b = route[i + 1];
      const r = BLOCK.find(r => !inBlock(a, r) && !inBlock(b, r) && crosses(a, b, r));
      if (!r) continue;
      const cs: P[] = [[r[0] - MARGIN - .02, r[2] - MARGIN - .02], [r[1] + MARGIN + .02, r[2] - MARGIN - .02], [r[0] - MARGIN - .02, r[3] + MARGIN + .02], [r[1] + MARGIN + .02, r[3] + MARGIN + .02]];
      const ok = cs.filter(c => !crosses(a, c, r) && !crosses(c, b, r)).sort((c1, c2) => Math.hypot(c1[0] - a[0], c1[1] - a[1]) + Math.hypot(c1[0] - b[0], c1[1] - b[1]) - Math.hypot(c2[0] - a[0], c2[1] - a[1]) - Math.hypot(c2[0] - b[0], c2[1] - b[1]));
      if (ok[0]) { route.splice(i + 1, 0, [THREE.MathUtils.clamp(ok[0][0], -5.9, 5.9), THREE.MathUtils.clamp(ok[0][1], -4.3, 4.3)]); fixed = true; }
    }
    if (!fixed) break;
  }
  return route.slice(1);
}
// Lets the React shell react to things that happen inside the sim (leave the house, change clothes).
const H: { door?: () => void; outfit?: () => void } = {};
const find = (id: string) => OBJ.find(o => o.id === id)!;

const NEW = () => ({ pos: [0, .5] as [number, number], rot: 0, pose: 'stand' as Pose, needs: { hunger: 78, energy: 72, hygiene: 70, bladder: 70, fun: 55, social: 50 } as Record<N, number>,
  min: 8 * 60, cash: 20000, power: true, speed: 1, free: true, q: [] as Task[], cur: null as Task | null, prog: 0, toast: '', toastT: 0, cool: 0 });
const S = NEW();
const say = (m: string) => { S.toast = m; S.toastT = Date.now(); };
const walk = (x: number, z: number) => { S.cur = null; S.q = path(S.pos as P, [THREE.MathUtils.clamp(x, -5.8, 5.8), THREE.MathUtils.clamp(z, -4.2, 4.2)]).map(p => ({ t: 'walk' as const, x: p[0], z: p[1] })); };
const tail = (): P => { let p: P = [S.pos[0], S.pos[1]]; if (S.cur?.t === 'walk') p = [S.cur.x, S.cur.z]; for (const t of S.q) if (t.t === 'walk') p = [t.x, t.z]; return p; };
const enq = (o: Obj, a: Act) => { if (S.q.length > 10) return; S.q.push(...path(tail(), o.spot).map(p => ({ t: 'walk' as const, x: p[0], z: p[1] })), { t: 'act', a, o }); };
// Emotes play right where you stand, no furniture needed.
const emote = (a: Act) => { S.q = []; S.prog = 0; S.cur = { t: 'act', a, o: { id: 'self', name: 'You', p: [0, 0], rot: 0, spot: [S.pos[0], S.pos[1]], face: S.rot, acts: [] } }; };
const turn = (r: number, t: number, f: number) => r + ((((t - r + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) * f;

function auto() {
  if (Date.now() < S.cool) return; S.cool = Date.now() + 2500;
  const [k, v] = (Object.entries(S.needs) as [N, number][]).sort((a, b) => a[1] - b[1])[0];
  if (v > 25) return;
  const m: Record<N, [string, string]> = { hunger: ['fridge', S.cash >= 1500 ? 'cook' : 'snack'], energy: ['bed', 'sleep'], hygiene: ['shower', 'shower'], bladder: ['toilet', 'wc'], fun: ['tv', S.power ? 'tv' : 'chill'], social: ['phone', 'call'] };
  const o = find(m[k][0]); enq(o, o.acts.find(a => a.k === m[k][1])!);
}

function tick(dt: number) {
  if (!S.speed) return;
  const gm = dt * 6 * S.speed; S.min += gm;
  (Object.keys(S.needs) as N[]).forEach(k => { S.needs[k] = cl(S.needs[k] - DECAY[k] * gm); });
  if (S.power && Math.random() < gm / 2200) say('⚡ NEPA took light! Fuel the generator.'), S.power = false;
  if (!S.cur) {
    const t = S.q.shift();
    if (t?.t === 'act') {
      if (t.a.pow && !S.power) { say('No light — fuel the generator first.'); S.q = []; }
      else if ((t.a.cost || 0) > S.cash) { say("You can't afford that."); S.q = []; }
      else { S.cash -= t.a.cost || 0; S.cur = t; S.prog = 0; if (t.a.cost || t.a.pay) econ('start', t.a); }
    } else if (t) S.cur = t; else if (S.free) auto();
  }
  const c = S.cur;
  if (!c) { S.pose = 'stand'; return; }
  if (c.t === 'walk') {
    S.pose = 'stand';
    const dx = c.x - S.pos[0], dz = c.z - S.pos[1], d = Math.hypot(dx, dz);
    if (d < .1) { S.cur = null; return; }
    const st = Math.min(d, 3 * dt * S.speed);
    S.pos[0] += dx / d * st; S.pos[1] += dz / d * st; S.rot = turn(S.rot, Math.atan2(dx, dz), Math.min(1, dt * 12));
  } else {
    S.pose = c.a.pose; S.rot = turn(S.rot, c.o.face, Math.min(1, dt * 10));
    const f = Math.min(gm, c.a.dur - S.prog) / c.a.dur; S.prog += gm;
    (Object.entries(c.a.fx) as [N, number][]).forEach(([k, v]) => { S.needs[k] = cl(S.needs[k] + v * f); });
    if (S.prog >= c.a.dur) {
      if (c.a.pay) econ('finish', c.a);
      if (c.a.k === 'gen') { S.power = true; say('💡 Light is back!'); }
      if (c.a.k === 'door') H.door?.();
      if (c.a.k === 'outfit') H.outfit?.();
      S.cur = null;
    }
  }
}
const econ = async (kind: 'start' | 'finish', a: Act) => {
  try {
    const r = await fetch('/api/economy/' + kind, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ act: a.k }) }), d = await r.json();
    if (typeof d.cash === 'number') S.cash = d.cash;
    if (!r.ok) { say(d.error || 'Payment problem.'); if (kind === 'start' && S.cur?.t === 'act' && S.cur.a.k === a.k) S.cur = null; }
    else if (kind === 'finish' && d.paid) say(`Gig done: +${naira(d.paid)}`);
  } catch { say('Offline — payment not recorded.'); }
};
const saveNow = (look: Look) => fetch('/api/save', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ look, state: { needs: S.needs, min: S.min } }) }).catch(() => {});
const mood = () => Object.values(S.needs).reduce((a, b) => a + b, 0) / 6;
const moodFace = (m: number) => m > 75 ? '😄' : m > 55 ? '🙂' : m > 35 ? '😐' : '😫';
const snap = () => ({ needs: { ...S.needs }, min: S.min, cash: S.cash, power: S.power, speed: S.speed, free: S.free, q: S.q.flatMap(t => t.t === 'act' ? [t.a.e] : []),
  cur: S.cur?.t === 'act' ? S.cur.a : null, prog: S.cur?.t === 'act' ? S.prog / S.cur.a.dur : 0, toast: Date.now() - S.toastT < 3500 ? S.toast : '', mood: mood() });
type UI = ReturnType<typeof snap>;

const B = ({ p, s, c, r = .04 }: { p: [number, number, number]; s: [number, number, number]; c: string; r?: number }) =>
  <RoundedBox args={s} radius={r} smoothness={3} position={p} castShadow receiveShadow><meshStandardMaterial color={c} roughness={.75} /></RoundedBox>;
const Zone = ({ x, z, w, d, c, y = .02 }: { x: number; z: number; w: number; d: number; c: string; y?: number }) =>
  <mesh rotation-x={-Math.PI / 2} position={[x, y, z]} receiveShadow><planeGeometry args={[w, d]} /><meshStandardMaterial color={c} roughness={.9} /></mesh>;

function Avatar({ bubble, look }: { bubble: string; look: Look }) {
  const g = useRef<THREE.Group>(null!), inner = useRef<THREE.Group>(null!), plumb = useRef<THREE.Mesh>(null!), pg = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    const sleep = S.pose === 'sleep', sit = S.pose === 'sit';
    g.current.position.set(sleep ? -4.6 : S.pos[0], sleep ? .8 : 0, sleep ? -1.75 : S.pos[1]); g.current.rotation.y = sleep ? 0 : S.rot;
    inner.current.rotation.x = sleep ? -Math.PI / 2 : 0; inner.current.position.y = 0; void sit;
    pg.current.position.set(0, sleep ? 1.1 : 2.45 * look.height + Math.sin(clock.elapsedTime * 2) * .06, sleep ? -1.9 : 0); plumb.current.rotation.y = clock.elapsedTime * 1.6;
    const m = mood(), col = m > 60 ? '#35e07a' : m > 35 ? '#f2c230' : '#ef4b4b';
    const mat = plumb.current.material as THREE.MeshStandardMaterial; mat.color.set(col); mat.emissive.set(col);
  });
  return <group ref={g}>
    <group ref={inner}><Human look={look} getState={() => S.pose !== 'stand' ? S.pose : S.cur?.t === 'walk' && S.speed > 0 ? 'walk' : 'idle'} getAnim={() => (S.speed && S.cur?.t === 'act' ? S.cur.a.anim : undefined)} getSpeed={() => S.speed} /></group>
    <group ref={pg}><mesh ref={plumb}><octahedronGeometry args={[.14]} /><meshStandardMaterial emissiveIntensity={.8} /></mesh></group>
    <Html position={[0, 2.9 * look.height + .2, 0]} center zIndexRange={[5, 0]}><div className="bubble">{bubble}</div></Html>
  </group>;
}

const VIS: Record<string, (ui: UI) => ReactNode> = {
  bed: () => <><B p={[0, .25, 0]} s={[1.7, .5, 2.4]} c="#6b4a2f" /><B p={[0, .58, 0]} s={[1.6, .2, 2.3]} c="#ece6d8" /><B p={[0, .72, -.9]} s={[1.1, .16, .4]} c="#fff" /><B p={[0, .7, .35]} s={[1.62, .14, 1.3]} c="#1d7654" /></>,
  fridge: () => <><B p={[0, .95, 0]} s={[.9, 1.9, .8]} c="#e9eef0" r={.08} /><B p={[.3, 1.1, .42]} s={[.05, .5, .04]} c="#888" /><B p={[1.1, .45, 0]} s={[1.3, .9, .8]} c="#8a6a4a" /><B p={[1.1, .93, 0]} s={[1.35, .06, .85]} c="#d8d2c6" /></>,
  shower: () => <><B p={[0, .05, 0]} s={[1.3, .1, 1.3]} c="#cfd8dc" /><B p={[.5, 1.1, -.5]} s={[.06, 2.2, .06]} c="#aab" /><B p={[.3, 2.1, -.4]} s={[.4, .08, .2]} c="#aab" /></>,
  toilet: () => <><B p={[0, .25, 0]} s={[.5, .5, .6]} c="#f4f4f4" r={.12} /><B p={[0, .6, -.3]} s={[.5, .6, .18]} c="#f4f4f4" /></>,
  tv: ui => <><B p={[0, .3, 0]} s={[2.2, .5, .9]} c="#3d5a80" r={.1} /><B p={[0, .8, -.4]} s={[2.2, .7, .2]} c="#34506f" r={.1} /><B p={[0, .3, 2.6]} s={[1.4, .6, .5]} c="#5a3a22" /><B p={[0, 1.05, 2.6]} s={[1.1, .65, .08]} c="#111" /><mesh position={[0, 1.05, 2.55]}><planeGeometry args={[1, .55]} /><meshStandardMaterial color="#000" emissive={ui.power ? '#4aa3ff' : '#000'} emissiveIntensity={.9} /></mesh></>,
  desk: ui => <><B p={[0, .75, 0]} s={[1.6, .1, .8]} c="#7a5a3a" />{[-.7, .7].map(x => <B key={x} p={[x, .37, 0]} s={[.08, .74, .7]} c="#5a4028" />)}<B p={[0, 1.1, -.15]} s={[.7, .45, .05]} c="#111" /><mesh position={[0, 1.1, -.12]}><planeGeometry args={[.62, .38]} /><meshStandardMaterial color="#000" emissive={ui.power ? '#7fd0ff' : '#000'} emissiveIntensity={.8} /></mesh><B p={[0, .45, .85]} s={[.5, .1, .5]} c="#333" /><B p={[0, .75, 1.08]} s={[.5, .6, .08]} c="#333" /></>,
  phone: () => <><B p={[0, .4, 0]} s={[.6, .8, .6]} c="#8a6a4a" /><B p={[0, .83, 0]} s={[.2, .03, .35]} c="#222" /></>,
  wardrobe: () => <><B p={[0, 1.05, 0]} s={[1.4, 2.1, .6]} c="#7a5a3a" r={.05} /><B p={[-.35, 1.05, .32]} s={[.62, 1.9, .03]} c="#8a6644" /><B p={[.35, 1.05, .32]} s={[.62, 1.9, .03]} c="#cfe3ee" /><B p={[0, 1.05, .34]} s={[.04, .3, .03]} c="#d9a22b" /></>,
  dining: () => <><B p={[0, .75, 0]} s={[1.5, .08, .85]} c="#8a6a4a" />{[[-.65, -.35], [.65, -.35], [-.65, .35], [.65, .35]].map(([x, z]) => <B key={x + '' + z} p={[x, .37, z]} s={[.07, .74, .07]} c="#5a4028" />)}<B p={[0, .22, .8]} s={[.42, .44, .42]} c="#5a3a22" r={.06} /><B p={[0, .81, .1]} s={[.36, .03, .36]} c="#f4f4f4" r={.01} /><B p={[0, .86, .1]} s={[.22, .08, .22]} c="#e0742a" r={.04} /></>,
  mat: () => <B p={[0, .025, 0]} s={[.9, .05, 1.9]} c="#8d4f9a" r={.02} />,
  radio: ui => <><B p={[0, .55, 0]} s={[.5, 1.1, .45]} c="#222831" r={.06} /><mesh position={[-.256, .85, 0]} rotation-y={-Math.PI / 2}><circleGeometry args={[.12, 24]} /><meshStandardMaterial color="#111" emissive={ui.power ? '#d99a42' : '#000'} emissiveIntensity={.5} /></mesh><mesh position={[-.256, .42, 0]} rotation-y={-Math.PI / 2}><circleGeometry args={[.17, 24]} /><meshStandardMaterial color="#111" emissive={ui.power ? '#3fb98a' : '#000'} emissiveIntensity={.4} /></mesh></>,
  shelf: () => <><B p={[0, 1, 0]} s={[.4, 2, 1.1]} c="#6b4a2f" r={.02} />{[.35, .8, 1.25, 1.7].map((y, i) => [-.4, -.2, 0, .2, .4].map((z, j) => <B key={i + '-' + j} p={[.12, y, z]} s={[.14, .3 - ((i + j) % 3) * .03, .12]} c={['#b43c35', '#3d5a80', '#d18a22', '#1d7654', '#6b4a8a'][(i * 2 + j) % 5]} r={.01} />))}</>,
  plant: () => <><B p={[0, .25, 0]} s={[.5, .5, .5]} c="#b5651d" r={.1} /><mesh position={[0, .95, 0]} castShadow><sphereGeometry args={[.5, 14, 10]} /><meshStandardMaterial color="#2f8a3a" roughness={.9} /></mesh><mesh position={[.22, 1.3, .1]} castShadow><sphereGeometry args={[.3, 12, 10]} /><meshStandardMaterial color="#3fa84b" roughness={.9} /></mesh></>,
  door: () => <><B p={[0, 1, 0]} s={[.12, 2, 1.05]} c="#6b4a2f" r={.02} /><B p={[.08, 1, .38]} s={[.06, .1, .1]} c="#d9a22b" r={.03} /><B p={[0, 2.06, 0]} s={[.14, .1, 1.25]} c="#4a3220" /></>,
  gen: () => <><B p={[0, .4, 0]} s={[.9, .8, .6]} c="#d9a22b" r={.08} /><B p={[.3, .95, 0]} s={[.1, .3, .1]} c="#444" /></>,
};

function Lights() {
  const sun = useRef<THREE.DirectionalLight>(null!), amb = useRef<THREE.HemisphereLight>(null!), lamp = useRef<THREE.PointLight>(null!);
  const day = new THREE.Color('#bfdcf2'), night = new THREE.Color('#0b1124');
  useFrame(({ scene }) => {
    const h = (S.min / 60) % 24, s = Math.max(0, Math.sin((h - 6) / 12 * Math.PI));
    sun.current.intensity = .15 + 2.4 * s; amb.current.intensity = .25 + 1 * s;
    sun.current.color.set(h < 8 || h > 17 ? '#ffb27a' : '#fff4e0');
    lamp.current.intensity = S.power ? (1 - s) * 70 : 0;
    (scene.background as THREE.Color).copy(night).lerp(day, s);
  });
  return <><color attach="background" args={['#bfdcf2']} /><hemisphereLight ref={amb} args={['#cfe6ff', '#6b5a48', 1]} />
    <directionalLight ref={sun} position={[7, 12, 8]} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-9} shadow-camera-right={9} shadow-camera-top={9} shadow-camera-bottom={-9} shadow-camera-far={40} />
    <pointLight ref={lamp} position={[0, 3.2, 0]} color="#ffd9a0" /></>;
}

function World({ ui, sel, setSel, look }: { ui: UI; sel: Obj | null; setSel: (o: Obj | null) => void; look: Look }) {
  const [hov, setHov] = useState<string | null>(null);
  useFrame((_, dt) => tick(Math.min(dt, .1)));
  return <>
    <Lights />
    <mesh rotation-x={-Math.PI / 2} position={[0, -.02, 0]} receiveShadow><planeGeometry args={[80, 80]} /><meshStandardMaterial color="#4f7a4a" /></mesh>
    <mesh rotation-x={-Math.PI / 2} position={[0, .01, 0]} receiveShadow onClick={e => { if (e.delta > 4) return; e.stopPropagation(); setSel(null); walk(e.point.x, e.point.z); }}>
      <planeGeometry args={[12.4, 9.2]} /><meshStandardMaterial color="#b58b5a" roughness={.8} /></mesh>
    <Zone x={4.2} z={-3.5} w={3.6} d={2.2} c="#cfd8dc" /><Zone x={-.4} z={-3.6} w={3} d={2} c="#ddd5c4" /><Zone x={-4.2} z={-2.4} w={3.4} d={4} c="#8d6a8a" y={.015} /><Zone x={-3} z={1.2} w={4.2} d={3.4} c="#c9a56b" y={.015} />
    <B p={[0, 1.3, -4.7]} s={[12.6, 2.6, .2]} c="#e0d6c6" /><B p={[-6.3, 1.3, 0]} s={[.2, 2.6, 9.4]} c="#d8cdbb" /><B p={[0, .08, -4.57]} s={[12.4, .16, .06]} c="#8a7a64" />
    <mesh position={[1.6, 1.6, -4.59]}><planeGeometry args={[2, 1.2]} /><meshStandardMaterial color="#9fd0f0" emissive="#9fd0f0" emissiveIntensity={.4} /></mesh>
    <mesh position={[-6.19, 1.6, -1]} rotation-y={Math.PI / 2}><planeGeometry args={[2, 1.2]} /><meshStandardMaterial color="#9fd0f0" emissive="#9fd0f0" emissiveIntensity={.4} /></mesh>
    <group position={[9, 0, -2]}><B p={[0, .9, 0]} s={[.3, 1.8, .3]} c="#5a3a22" /><mesh position={[0, 2.4, 0]} castShadow><sphereGeometry args={[1.3, 16, 12]} /><meshStandardMaterial color="#2f6b3a" /></mesh></group>
    {OBJ.map(o => <group key={o.id} position={[o.p[0], 0, o.p[1]]} rotation-y={o.rot}
      onClick={e => { if (e.delta > 4) return; e.stopPropagation(); setSel(o); }}
      onPointerOver={e => { e.stopPropagation(); document.body.style.cursor = 'pointer'; setHov(o.id); }} onPointerOut={() => { document.body.style.cursor = 'auto'; setHov(h => (h === o.id ? null : h)); }}>{VIS[o.id](ui)}</group>)}
    {hov && hov !== sel?.id && (() => { const o = find(hov); return <Html position={[o.p[0], 2.3, o.p[1]]} center zIndexRange={[15, 5]} style={{ pointerEvents: 'none' }}><div className="tag">{o.name}</div></Html>; })()}
    <Suspense fallback={null}><Avatar look={look} bubble={ui.cur ? ui.cur.e : moodFace(ui.mood)} /></Suspense>
    {sel && <Html position={[sel.p[0], 2.6, sel.p[1]]} center zIndexRange={[20, 10]}><div className="pie"><b>{sel.name}</b>
      {sel.acts.map(a => <button key={a.k} disabled={(!!a.pow && !ui.power) || (a.cost || 0) > ui.cash} onClick={() => { enq(sel, a); setSel(null); }}>{a.e} {a.label}<small>{a.cost ? `-${naira(a.cost)}` : a.pay ? `+${naira(a.pay)}` : `${a.dur} min`}</small></button>)}</div></Html>}
    <OrbitControls enablePan={false} target={[0, 0, 0]} minDistance={7} maxDistance={20} minPolarAngle={.5} maxPolarAngle={1.25} minAzimuthAngle={-.6} maxAzimuthAngle={.9} />
  </>;
}

export default function Sim() {
  const [ui, setUi] = useState<UI>(snap), [sel, setSel] = useState<Obj | null>(null), [look, setLook] = useState<Look | null>(null), [ready, setReady] = useState(false), [editing, setEditing] = useState(false), [user, setUser] = useState<AccountUser | null>(null), lookRef = useRef<Look | null>(null), [outside, setOutside] = useState(false);
  lookRef.current = look;
  async function enter(u: AccountUser) {
    const r = await (await fetch('/api/save')).json();
    if (r.save) { Object.assign(S, { needs: r.save.state.needs, min: r.save.state.min, cash: r.save.cash }); setLook({ ...r.save.look, name: u.username }); } else { setLook(null); setEditing(true); }
    setUser(u);
  }
  async function logout() {
    setOutside(false); await fetch('/api/auth/logout', { method: 'POST' }); Object.assign(S, NEW()); setLook(null); setEditing(false); setUser(null); }
  useEffect(() => {
    H.door = () => { setSel(null); setOutside(true); };
    H.outfit = () => setLook(l => { if (!l) return l; const i = OUTFITS.indexOf(l.outfit), n = { ...l, outfit: OUTFITS[(i + 1) % OUTFITS.length] }; saveNow(n); say('👕 New look!'); return n; });
    return () => { H.door = undefined; H.outfit = undefined; };
  }, []);
  useEffect(() => {
    Object.assign(S, NEW());
    (async () => { try { const me = await (await fetch('/api/auth/me')).json(); if (me.user) await enter(me.user); } catch { /* offline */ } setReady(true); })();
    const a = setInterval(() => setUi(snap()), 200), b = setInterval(() => { if (lookRef.current) saveNow(lookRef.current); }, 5000);
    return () => { clearInterval(a); clearInterval(b); };
  }, []);
  const h = Math.floor(ui.min / 60) % 24, m = Math.floor(ui.min % 60), hr = (ui.min / 60) % 24;
  return <div className="sim">
    {!ready && <Loader label="Checking your session" />}
    {ready && !user && <AuthScreen onAuth={enter} />}
    {user && look && outside && <Neighborhood look={look} onNear={dt => { S.needs.social = cl(S.needs.social + dt * 2); }} />}
    {user && look && <AssetLoader />}
    {user && look && !outside && <Canvas shadows dpr={[1, 1.75]} camera={{ position: [3, 11, 13], fov: 42 }}><World ui={ui} sel={sel} setSel={setSel} look={look} /></Canvas>}
    {ready && user && (editing || !look) && <Creator initial={look || { ...DEFAULT_LOOK, name: user.username }} onDone={l => { const n = { ...l, name: user.username }; setLook(n); saveNow(n); setEditing(false); }} />}
    <div className="top"><div className="pill">Day {Math.floor(ui.min / 1440) + 1} · {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')} {hr > 6 && hr < 18 ? '☀️' : '🌙'}</div>
      <div className="pill">{[0, 1, 2, 3].map(s => <button key={s} className={ui.speed === s ? 'on' : ''} onClick={() => { S.speed = s; }}>{s === 0 ? '⏸' : '▶'.repeat(s)}</button>)}</div>
      <div className="pill gold">{naira(ui.cash)}</div><div className="pill">{ui.power ? '💡 Power on' : '🕯️ NEPA off'}</div>
      {user && look && <button className="pill" onClick={() => { setSel(null); setOutside(o => !o); }}>{outside ? '🏠 Go home' : '🏙️ Neighborhood'}</button>}
      {user && <Account user={user} onUser={setUser} onLogout={logout} />}
      <button className="pill" onClick={() => setEditing(true)}>✏️ Character</button>
      <button className={'pill ' + (ui.free ? 'on' : '')} onClick={() => { S.free = !S.free; }}>🧠 Free will {ui.free ? 'ON' : 'OFF'}</button></div>
    <div className="needs"><div className="mood">{moodFace(ui.mood)} <b>{look?.name || 'You'}</b><span>Mood {Math.round(ui.mood)}%</span></div>
      {NEEDS.map(([k, l, e]) => <div key={k} className={'nrow' + (ui.needs[k] < 25 ? ' low' : '')}><span>{e} {l}</span><div className="bar"><i style={{ width: ui.needs[k] + '%', background: `hsl(${ui.needs[k] * 1.25},70%,48%)` }} /></div></div>)}</div>
    <div className="queue">{ui.cur && <div className="cur"><span>{ui.cur.e} {ui.cur.label}</span><div className="bar"><i style={{ width: ui.prog * 100 + '%', background: '#f0b94a' }} /></div></div>}{ui.q.map((e, i) => <span key={i} className="chip">{e}</span>)}</div>
    {ui.toast && <div key={ui.toast} className="toast">{ui.toast}</div>}
    {user && look && !outside && <div className="emotes">{EMOTES.map(a => <button key={a.k} title={a.label} onClick={() => emote(a)}>{a.e}</button>)}</div>}
    {!outside && <div className="hint">Click the floor to walk · Click any object for actions · Use the emote buttons on the right · Drag to rotate · Scroll to zoom</div>}
    <style>{CSS}</style>
  </div>;
}

const CSS = `.au{position:fixed;inset:0;z-index:60;display:grid;place-items:center;background:radial-gradient(circle at 40% 20%,#1c4a39,#07100d)}.card,.box{width:min(380px,92vw);background:#0c1713f5;border:1px solid #ffffff2a;border-radius:18px;padding:24px;display:flex;flex-direction:column;gap:10px}.card h1{margin:0;font-size:22px}.logo{width:44px;height:44px;border-radius:13px;background:linear-gradient(135deg,#d99a42,#6f4721);display:grid;place-items:center;font-weight:900}.muted{color:#9fb5aa;font-size:12px;margin:0}.card label{font-size:11px;color:#9fb5aa;display:flex;flex-direction:column;gap:6px}.card input,.box input,.vb input{background:#0a1511;border:1px solid #2a4337;border-radius:9px;padding:10px;color:#fff;font-size:14px}.tabs{display:flex;gap:6px}.tabs button,.row button{flex:1;background:#14261f;border:1px solid #2a4337;color:#cfe;border-radius:9px;padding:9px;cursor:pointer}.tabs .on{background:#1d7654}.pri{background:#d99a42;color:#1a1208;border:0;border-radius:11px;padding:12px;font-weight:800;cursor:pointer}.pri:disabled{opacity:.4}.bad{color:#ff8b8b;font-size:12px;margin:0}.vb{display:flex;flex-direction:column;gap:8px}.vb p,.box p{font-size:12px;margin:0}.row{display:flex;gap:6px}.modal{position:fixed;inset:0;z-index:55;background:#0008;display:grid;place-items:center}.box h3{margin:0}.box{color:#fff}
`+`.sim{position:fixed;inset:0;font-family:Inter,system-ui,sans-serif;color:#fff;user-select:none}.sim canvas{display:block}
.top{position:absolute;top:10px;left:10px;right:10px;display:flex;gap:8px;flex-wrap:wrap;pointer-events:none}.top>*{pointer-events:auto}
.pill{background:#10201ad9;border:1px solid #ffffff2a;border-radius:999px;padding:7px 12px;font-size:12px;color:#fff;backdrop-filter:blur(8px);cursor:default}button.pill{cursor:pointer}
.pill button{background:none;border:0;color:#9fb;font-size:11px;padding:0 6px;cursor:pointer}.pill button.on{color:#f0b94a;font-weight:800}.pill.on{background:#1d7654}.gold{color:#f3c56f;font-weight:800}
.needs{position:absolute;left:10px;bottom:10px;width:220px;background:#10201ae6;border:1px solid #ffffff2a;border-radius:16px;padding:12px;backdrop-filter:blur(8px)}
.mood{display:flex;align-items:center;gap:8px;font-size:22px;margin-bottom:8px}.mood b{font-size:14px}.mood span{margin-left:auto;font-size:11px;color:#9fb5aa}
.nrow{display:flex;align-items:center;gap:8px;font-size:11px;margin:5px 0}.nrow>span{width:86px}.bar{flex:1;height:8px;background:#ffffff1f;border-radius:9px;overflow:hidden}.bar i{display:block;height:100%;border-radius:9px;transition:width .2s}
.queue{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);display:flex;gap:6px;align-items:center}.cur{background:#10201af0;border:1px solid #f0b94a88;border-radius:12px;padding:8px 12px;font-size:12px;min-width:170px}.cur .bar{margin-top:6px}
.chip{background:#10201ad9;border:1px solid #ffffff2a;border-radius:10px;padding:7px 9px;font-size:16px}
.toast{position:absolute;top:60px;left:50%;transform:translateX(-50%);background:#f0b94a;color:#1a1208;font-weight:700;font-size:13px;padding:9px 16px;border-radius:12px}
.emotes{position:absolute;right:12px;top:64px;display:flex;flex-direction:column;gap:7px}.emotes button{width:42px;height:42px;border-radius:50%;border:1px solid #ffffff33;background:#10201ae6;font-size:20px;cursor:pointer;backdrop-filter:blur(8px);transition:transform .15s,background .2s}.emotes button:hover{transform:scale(1.12);background:#1d7654}.emotes button:active{transform:scale(.94)}
.tag{background:#10201af0;border:1px solid #ffffff33;border-radius:8px;padding:4px 9px;font-size:11px;color:#fff;white-space:nowrap;animation:popIn .15s both}
.hint{position:absolute;right:12px;bottom:12px;font-size:10px;color:#ffffffaa;text-shadow:0 1px 3px #000;max-width:200px;text-align:right}
.bubble{background:#fff;color:#000;border-radius:14px;padding:3px 9px;font-size:20px;box-shadow:0 2px 8px #0005}
.pie{background:#10201af5;border:1px solid #ffffff33;border-radius:14px;padding:8px;display:flex;flex-direction:column;gap:5px;min-width:170px}.pie b{font-size:11px;color:#f0b94a;text-transform:uppercase;letter-spacing:.1em;padding:0 4px}
.pie button{display:flex;justify-content:space-between;gap:12px;background:#1b3329;border:1px solid #2f5143;color:#fff;border-radius:9px;padding:8px 10px;font-size:12px;cursor:pointer;text-align:left}.pie button:hover:not(:disabled){background:#27503f}.pie button:disabled{opacity:.4;cursor:not-allowed}.pie small{color:#9fb5aa}
@media(max-width:620px){.needs{width:170px;padding:8px}.hint{display:none}.nrow>span{width:70px}}`;
