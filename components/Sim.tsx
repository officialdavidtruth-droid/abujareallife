 'use client';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, RoundedBox, Html } from '@react-three/drei';
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import Human from './Human';
import Creator from './Creator';
import Account, { type AccountUser } from './Account';
import AuthScreen from './AuthScreen';
import Loader from './Loader';
import AssetLoader from './AssetLoader';
import City from './City';
import { DEFAULT_LOOK, OUTFITS, type Look } from '../lib/characterModels';
import { findPath, blocked, inside, HARD, type Blk, type Box, type P } from '../lib/collision';

type N = 'hunger' | 'energy' | 'hygiene' | 'bladder' | 'fun' | 'social';
type Pose = 'stand' | 'sit' | 'sleep';
type Act = { k: string; label: string; e: string; dur: number; fx: Partial<Record<N, number>>; pose: Pose; cost?: number; pay?: number; pow?: boolean; anim?: string };
type Obj = { id: string; name: string; p: [number, number]; rot: number; spot: [number, number]; face: number; acts: Act[]; boxes?: Box[]; appr?: [number, number] }; // boxes = solid footprint, appr = free spot in front of a seat/bed/shower where the walk starts and ends
type Task = { t: 'walk'; x: number; z: number; own?: string } | { t: 'act'; a: Act; o: Obj };

const NEEDS: [N, string, string][] = [['hunger', 'Hunger', '🍲'], ['energy', 'Energy', '😴'], ['hygiene', 'Hygiene', '🚿'], ['bladder', 'Bladder', '🚽'], ['fun', 'Fun', '🎮'], ['social', 'Social', '💬']];
const DECAY: Record<N, number> = { hunger: .07, energy: .045, hygiene: .05, bladder: .09, fun: .06, social: .04 };
const cl = (n: number) => Math.max(0, Math.min(100, n));
const naira = (n: number) => '₦' + Math.round(n).toLocaleString();

const OBJ: Obj[] = [
  { id: 'bed', name: 'Bed', p: [-4.6, -3.3], rot: 0, spot: [-3.3, -1.9], face: 0, boxes: [[-5.5, -3.7, -4.6, -2], [-3.7, -3.2, -4.55, -4.05]], acts: [
    { k: 'sleep', label: 'Sleep', e: '💤', dur: 360, fx: { energy: 100, hunger: -10 }, pose: 'sleep' },
    { k: 'nap', label: 'Nap', e: '😴', dur: 90, fx: { energy: 35 }, pose: 'sleep' }] },
  { id: 'wardrobe', name: 'Wardrobe & mirror', p: [-2.25, -4.3], rot: 0, spot: [-2.25, -3.4], face: Math.PI, boxes: [[-2.95, -1.55, -4.6, -4]], acts: [
    { k: 'outfit', label: 'Change outfit', e: '👕', dur: 8, fx: { fun: 8 }, pose: 'stand', anim: 'wardrobe' },
    { k: 'mirror', label: 'Check the mirror', e: '🪞', dur: 10, fx: { fun: 10, social: 4 }, pose: 'stand', anim: 'groom' }] },
  { id: 'fridge', name: 'Kitchen', p: [-1, -4.1], rot: 0, spot: [0, -3.35], face: Math.PI, boxes: [[-1.4, 1.3, -4.6, -3.8]], acts: [
    { k: 'cook', label: 'Cook jollof', e: '🍛', dur: 30, fx: { hunger: 60, fun: 6 }, pose: 'stand', cost: 1500, anim: 'cook' },
    { k: 'snack', label: 'Snack', e: '🥜', dur: 10, fx: { hunger: 25 }, pose: 'stand', cost: 500, anim: 'eat' },
    { k: 'water', label: 'Drink water', e: '💧', dur: 5, fx: { hunger: 3, bladder: -6 }, pose: 'stand', anim: 'eat' }] },
  { id: 'dining', name: 'Dining table', p: [-.3, -2.3], rot: 0, spot: [-.3, -1.5], face: Math.PI, boxes: [[-1.05, .45, -2.725, -1.875], [-.55, -.05, -1.75, -1.25], [-1.55, -1.05, -2.55, -2.05], [.45, .95, -2.55, -2.05]], appr: [-.3, -.8], acts: [
    { k: 'meal', label: 'Sit down & eat', e: '🍽️', dur: 25, fx: { hunger: 55, fun: 8, social: 3 }, pose: 'sit', cost: 1000, anim: 'eatsit' }] },
  { id: 'shower', name: 'Shower', p: [5.3, -3.7], rot: 0, spot: [5.3, -3.75], face: Math.PI, boxes: [[4.65, 5.95, -4.6, -3.2]], appr: [5.3, -2.7], acts: [
    { k: 'shower', label: 'Take a shower', e: '🚿', dur: 25, fx: { hygiene: 100, fun: 5 }, pose: 'stand', anim: 'wash' }] },
  { id: 'toilet', name: 'Toilet', p: [3.2, -4.1], rot: 0, spot: [3.2, -4.1], face: 0, boxes: [[2.95, 3.45, -4.6, -3.78], [3.8, 4.3, -4.6, -4.15]], appr: [3.2, -3.2], acts: [
    { k: 'wc', label: 'Use toilet', e: '🚽', dur: 8, fx: { bladder: 100 }, pose: 'sit', anim: 'wc' }] },
  { id: 'tv', name: 'Sofa & TV', p: [-3, 1.2], rot: -Math.PI / 2, spot: [-3, 1.2], face: -Math.PI / 2, boxes: [[-3.5, -2.5, .1, 2.3], [-5.9, -5.3, .4, 2], [-3.3, -2.7, 2.4, 3]], appr: [-4, 1.2], acts: [
    { k: 'tv', label: 'Watch Nollywood', e: '📺', dur: 90, fx: { fun: 45, energy: -5 }, pose: 'sit', pow: true, anim: 'tv' },
    { k: 'game', label: 'Play video games', e: '🎮', dur: 80, fx: { fun: 55, energy: -8, hunger: -6 }, pose: 'sit', pow: true, anim: 'game' },
    { k: 'chill', label: 'Relax on sofa', e: '🛋️', dur: 45, fx: { fun: 15, energy: 10 }, pose: 'sit', anim: 'chill' }] },
  { id: 'desk', name: 'Computer', p: [3.4, 2], rot: 0, spot: [3.4, 2.85], face: Math.PI, boxes: [[2.55, 4.25, 1.6, 2.4], [3.15, 3.65, 2.55, 3.1]], appr: [3.4, 3.6], acts: [
    { k: 'work', label: 'Freelance gig', e: '💻', dur: 180, fx: { energy: -25, fun: -15, hunger: -10 }, pose: 'sit', pay: 6000, pow: true, anim: 'work' },
    { k: 'hustle', label: 'Side hustle', e: '🧾', dur: 150, fx: { energy: -18, fun: -8, hunger: -7 }, pose: 'sit', pay: 3500, pow: true, anim: 'work' },
    { k: 'browse', label: 'Scroll social media', e: '📱', dur: 40, fx: { fun: 25, social: 10, energy: -4 }, pose: 'sit', pow: true, anim: 'browse' }] },
  { id: 'phone', name: 'Phone', p: [-1.2, 3.2], rot: 0, spot: [-1.2, 2.4], face: 0, boxes: [[-1.5, -.9, 2.9, 3.5]], acts: [
    { k: 'call', label: 'Call Ada', e: '📞', dur: 40, fx: { social: 45, fun: 10 }, pose: 'stand', anim: 'phone' },
    { k: 'chat', label: 'Chat on WhatsApp', e: '💬', dur: 20, fx: { social: 22 }, pose: 'stand', anim: 'chat' },
    { k: 'order', label: 'Order food delivery', e: '🛵', dur: 25, fx: { hunger: 45, fun: 5 }, pose: 'stand', cost: 2500, anim: 'phone' }] },
  { id: 'mat', name: 'Workout mat', p: [1.4, -.9], rot: 0, spot: [1.4, -.9], face: 0, acts: [
    { k: 'squat', label: 'Squats workout', e: '🏋️', dur: 45, fx: { energy: -22, hunger: -12, hygiene: -15, fun: 15 }, pose: 'stand', anim: 'squat' },
    { k: 'yoga', label: 'Yoga', e: '🧘', dur: 40, fx: { energy: 8, fun: 12 }, pose: 'stand', anim: 'yoga' }] },
  { id: 'radio', name: 'Speaker', p: [4.2, -1.3], rot: 0, spot: [3.5, -1.3], face: Math.PI / 2, boxes: [[4, 4.4, -1.55, -1.05]], acts: [
    { k: 'music', label: 'Play Afrobeats', e: '🎵', dur: 40, fx: { fun: 25 }, pose: 'stand', pow: true, anim: 'music' },
    { k: 'dance', label: 'Dance party', e: '💃', dur: 35, fx: { fun: 40, energy: -12, social: 5, hygiene: -8 }, pose: 'stand', pow: true, anim: 'dance' }] },
  { id: 'shelf', name: 'Bookshelf', p: [-6.05, -.45], rot: 0, spot: [-5.2, -.45], face: -Math.PI / 2, boxes: [[-6.25, -5.8, -1, .1]], acts: [
    { k: 'read', label: 'Read a book', e: '📖', dur: 60, fx: { fun: 20, energy: -4 }, pose: 'stand', anim: 'read' }] },
  { id: 'plant', name: 'Plant', p: [5.5, 3.4], rot: 0, spot: [4.6, 3.4], face: Math.PI / 2, boxes: [[5.2, 5.8, 3.1, 3.7]], acts: [
    { k: 'plant', label: 'Water the plant', e: '🌿', dur: 10, fx: { fun: 8 }, pose: 'stand', anim: 'water' }] },
  { id: 'door', name: 'Front door', p: [-6.2, 3.5], rot: 0, spot: [-5.3, 3.5], face: -Math.PI / 2, acts: [
    { k: 'door', label: 'Go outside', e: '🚪', dur: 4, fx: {}, pose: 'stand', anim: 'door' }] },
  { id: 'gen', name: 'Generator', p: [5.3, .4], rot: 0, spot: [4.4, .4], face: Math.PI / 2, boxes: [[4.85, 5.75, .1, .7]], acts: [
    { k: 'gen', label: 'Fuel generator', e: '⛽', dur: 15, fx: {}, pose: 'stand', cost: 2000, anim: 'fuel' }] },
];
const EMOTES: Act[] = [
  { k: 'wave', label: 'Wave', e: '👋', dur: 6, fx: { social: 8 }, pose: 'stand', anim: 'wave' },
  { k: 'edance', label: 'Dance', e: '🕺', dur: 20, fx: { fun: 22, energy: -6 }, pose: 'stand', anim: 'dance' },
  { k: 'cheer', label: 'Cheer', e: '🙌', dur: 8, fx: { fun: 10 }, pose: 'stand', anim: 'cheer' },
  { k: 'stretch', label: 'Stretch', e: '🤸', dur: 10, fx: { energy: 4, fun: 4 }, pose: 'stand', anim: 'stretch' },
  { k: 'think', label: 'Think', e: '🤔', dur: 8, fx: { fun: 3 }, pose: 'stand', anim: 'think' },
];
const DECOR: { id: string; p: [number, number]; rot: number; boxes: Box[]; vis: string }[] = [
  { id: 'coffee', p: [-4.75, 1.2], rot: 0, boxes: [[-5, -4.5, .75, 1.65]], vis: 'coffee' },
  { id: 'fan', p: [5.5, -1.8], rot: -Math.PI / 2, boxes: [[5.3, 5.7, -2, -1.6]], vis: 'fan' },
];

// Every solid footprint in the flat. Walking is planned around these (see lib/collision.ts) and re-checked every frame.
const BL: Blk[] = [...OBJ.flatMap(o => (o.boxes || []).map(b => ({ id: o.id, b }))), ...DECOR.flatMap(d => d.boxes.map(b => ({ id: d.id, b })))];
const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const W = (p: P, own?: string): Task => ({ t: 'walk', x: p[0], z: p[1], own });
const within = (p: P) => OBJ.find(o => o.appr && o.boxes?.some(b => inside(p, b)));
// Route that first steps OUT of whatever you are sitting/standing in, walks around furniture, then steps INTO the target seat/shower.
function route(from: P, to: P, tgt?: Obj): Task[] {
  const so = within(from), out: Task[] = []; let a = from;
  if (so && so === tgt) return [];
  if (so) { out.push(W(so.appr!, so.id)); a = so.appr!; }
  if (tgt?.appr) { out.push(...findPath(BL, a, tgt.appr).map(p => W(p))); out.push(W(to, tgt.id)); } else out.push(...findPath(BL, a, to).map(p => W(p)));
  return out;
}
// Lets the React shell react to things that happen inside the sim (leave the house, change clothes).
const H: { door?: () => void; outfit?: () => void } = {};
const find = (id: string) => OBJ.find(o => o.id === id)!;

const NEW = () => ({ pos: [0, .5] as [number, number], rot: 0, pose: 'stand' as Pose, needs: { hunger: 78, energy: 72, hygiene: 70, bladder: 70, fun: 55, social: 50 } as Record<N, number>,
  min: 8 * 60, cash: 20000, power: true, speed: 1, free: true, q: [] as Task[], cur: null as Task | null, prog: 0, toast: '', toastT: 0, cool: 0, stuck: 0 });
const S = NEW();
const say = (m: string) => { S.toast = m; S.toastT = Date.now(); };
const walk = (x: number, z: number) => { S.cur = null; S.q = route(S.pos as P, [x, z]); };
const tail = (): P => { let p: P = [S.pos[0], S.pos[1]]; if (S.cur?.t === 'walk') p = [S.cur.x, S.cur.z]; for (const t of S.q) if (t.t === 'walk') p = [t.x, t.z]; return p; };
const enq = (o: Obj, a: Act) => { if (S.q.length > 12) return; S.q.push(...route(tail(), o.spot, o), { t: 'act', a, o }); };
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
    let nx = S.pos[0] + dx / d * st, nz = S.pos[1] + dz / d * st;
    if (blocked(BL, [nx, nz], c.own, HARD)) { // never step into furniture: slide along it, or stop
      if (!blocked(BL, [nx, S.pos[1]], c.own, HARD)) nz = S.pos[1]; else if (!blocked(BL, [S.pos[0], nz], c.own, HARD)) nx = S.pos[0]; else { nx = S.pos[0]; nz = S.pos[1]; }
    }
    S.stuck = Math.hypot(nx - S.pos[0], nz - S.pos[1]) < st * .3 ? S.stuck + dt : 0;
    if (S.stuck > .7) { S.stuck = 0; S.cur = null; S.q = []; say('Something is in the way.'); return; }
    S.pos[0] = nx; S.pos[1] = nz; S.rot = turn(S.rot, Math.atan2(dx, dz), Math.min(1, dt * 12));
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

type V3 = [number, number, number];
// Rounded box / cylinder / ellipsoid primitives used to build the furniture.
const B = ({ p, s, c, r = .03, ro = .7, m = 0, rot, op }: { p: V3; s: V3; c: string; r?: number; ro?: number; m?: number; rot?: V3; op?: number }) =>
  <RoundedBox args={s} radius={Math.max(.002, Math.min(r, Math.min(...s) / 2 - .002))} smoothness={2} position={p} rotation={rot} castShadow={op === undefined} receiveShadow>
    <meshStandardMaterial color={c} roughness={ro} metalness={m} transparent={op !== undefined} opacity={op ?? 1} depthWrite={op === undefined} /></RoundedBox>;
const Bx = ({ p, s, c, ro = .8, rot }: { p: V3; s: V3; c: string; ro?: number; rot?: V3 }) =>
  <mesh position={p} rotation={rot} castShadow receiveShadow><boxGeometry args={s} /><meshStandardMaterial color={c} roughness={ro} /></mesh>;
const C = ({ p, r, h, c, rt, ro = .6, m = 0, rot, e, ei = .6 }: { p: V3; r: number; h: number; c: string; rt?: number; ro?: number; m?: number; rot?: V3; e?: string; ei?: number }) =>
  <mesh position={p} rotation={rot} castShadow receiveShadow><cylinderGeometry args={[rt ?? r, r, h, 24]} /><meshStandardMaterial color={c} roughness={ro} metalness={m} emissive={e ?? '#000'} emissiveIntensity={e ? ei : 0} /></mesh>;
const Sp = ({ p, r, c, sc = [1, 1, 1], ro = .85, rot }: { p: V3; r: number; c: string; sc?: V3; ro?: number; rot?: V3 }) =>
  <mesh position={p} rotation={rot} scale={sc} castShadow receiveShadow><sphereGeometry args={[r, 18, 14]} /><meshStandardMaterial color={c} roughness={ro} /></mesh>;
const Screen = ({ p, w, h, on, col, ry = 0 }: { p: V3; w: number; h: number; on: boolean; col: string; ry?: number }) =>
  <mesh position={p} rotation-y={ry}><planeGeometry args={[w, h]} /><meshStandardMaterial color="#05070a" emissive={on ? col : '#000'} emissiveIntensity={on ? .9 : 0} roughness={.2} /></mesh>;
const Chair = ({ p, ry = 0, c = '#6b4a2f', pad = '#8c3a2f' }: { p: V3; ry?: number; c?: string; pad?: string }) => <group position={p} rotation-y={ry}>
  <B p={[0, .4, 0]} s={[.44, .05, .44]} c={c} /><B p={[0, .445, 0]} s={[.4, .04, .4]} c={pad} ro={.95} r={.02} />
  {[[-.19, -.19], [.19, -.19], [-.19, .19], [.19, .19]].map(([x, z]) => <B key={x + '' + z} p={[x, .19, z]} s={[.04, .38, .04]} c={c} r={.01} />)}
  {[-.19, .19].map(x => <B key={x} p={[x, .68, .2]} s={[.04, .5, .04]} c={c} r={.01} />)}
  <B p={[0, .86, .2]} s={[.4, .09, .03]} c={c} r={.01} /><B p={[0, .7, .2]} s={[.38, .07, .03]} c={c} r={.01} /><B p={[0, .56, .2]} s={[.38, .06, .03]} c={c} r={.01} /></group>;
const Zone = ({ x, z, w, d, c, y = .02 }: { x: number; z: number; w: number; d: number; c: string; y?: number }) =>
  <mesh rotation-x={-Math.PI / 2} position={[x, y, z]} receiveShadow><planeGeometry args={[w, d]} /><meshStandardMaterial color={c} roughness={.9} /></mesh>;
const Rug = ({ x, z, w, d, c1, c2, y = .015 }: { x: number; z: number; w: number; d: number; c1: string; c2: string; y?: number }) => <group position={[x, y, z]}>
  <mesh rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[w, d]} /><meshStandardMaterial color={c1} roughness={1} /></mesh>
  <mesh rotation-x={-Math.PI / 2} position-y={.003} receiveShadow><planeGeometry args={[w - .36, d - .36]} /><meshStandardMaterial color={c2} roughness={1} /></mesh>
  <mesh rotation-x={-Math.PI / 2} position-y={.006} receiveShadow><planeGeometry args={[w - .7, d - .7]} /><meshStandardMaterial color={c1} roughness={1} /></mesh></group>;
function rng(seed: number) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function mkTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, rx: number, ry: number) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const woodTex = (rx: number, ry: number) => mkTex(512, 512, g => { // oak planks, 20cm wide, joints staggered row by row
  const r = rng(11), rows = 10, h = 512 / rows;
  for (let i = 0; i < rows; i++) {
    const o1 = r() * 512, o2 = (o1 + 170 + r() * 170) % 512, js = [o1, o2].sort((a, b) => a - b);
    for (let k = 0; k < 2; k++) {
      const a = js[k], b = k === 0 ? js[1] : js[0] + 512, shade = r(), col = `hsl(${27 + shade * 5},${38 + shade * 8}%,${44 + shade * 12}%)`;
      for (const [x0, x1] of [[a, Math.min(b, 512)], [0, b - 512]] as [number, number][]) if (x1 > x0) {
        g.fillStyle = col; g.fillRect(x0, i * h, x1 - x0, h);
        for (let n = 0; n < 7; n++) { g.fillStyle = `rgba(70,40,15,${.05 + r() * .09})`; g.fillRect(x0, i * h + r() * h, x1 - x0, 1 + r() * 1.5); }
        g.fillStyle = 'rgba(30,15,5,.5)'; g.fillRect(x0, i * h, 2, h);
      }
    }
    g.fillStyle = 'rgba(30,15,5,.45)'; g.fillRect(0, i * h, 512, 2);
  }
}, rx, ry);
const tileTex = (rx: number, ry: number, a: string, b: string) => mkTex(256, 256, g => {
  g.fillStyle = a; g.fillRect(0, 0, 256, 256); g.fillStyle = b; g.fillRect(0, 0, 128, 128); g.fillRect(128, 128, 128, 128);
  g.strokeStyle = 'rgba(90,86,76,.7)'; g.lineWidth = 3; for (const v of [0, 128, 256]) { g.beginPath(); g.moveTo(v, 0); g.lineTo(v, 256); g.moveTo(0, v); g.lineTo(256, v); g.stroke(); }
}, rx, ry);
const Tiles = ({ x, z, w, d, a, b }: { x: number; z: number; w: number; d: number; a: string; b: string }) => {
  const t = useMemo(() => tileTex(w / .7, d / .7, a, b), [w, d, a, b]);
  return <mesh rotation-x={-Math.PI / 2} position={[x, .02, z]} receiveShadow><planeGeometry args={[w, d]} /><meshStandardMaterial map={t} roughness={.35} /></mesh>;
};
const Win = ({ p, ry = 0, w, h }: { p: V3; ry?: number; w: number; h: number }) => <group position={p} rotation-y={ry}>
  <mesh><planeGeometry args={[w, h]} /><meshStandardMaterial color="#a9d6f2" emissive="#a9d6f2" emissiveIntensity={.5} /></mesh>
  <B p={[0, h / 2, .02]} s={[w + .12, .07, .07]} c="#f2f0ea" ro={.5} /><B p={[0, -h / 2, .02]} s={[w + .12, .07, .07]} c="#f2f0ea" ro={.5} />
  <B p={[-w / 2, 0, .02]} s={[.07, h, .07]} c="#f2f0ea" ro={.5} /><B p={[w / 2, 0, .02]} s={[.07, h, .07]} c="#f2f0ea" ro={.5} />
  <B p={[0, 0, .02]} s={[.035, h, .04]} c="#f2f0ea" ro={.5} /><B p={[0, 0, .02]} s={[w, .035, .04]} c="#f2f0ea" ro={.5} />
  <B p={[0, -h / 2 - .045, .08]} s={[w + .28, .04, .2]} c="#f6f4ee" ro={.5} />
  <C p={[0, h / 2 + .22, .14]} r={.014} h={w + .7} c="#4a4038" m={.6} rot={[0, 0, Math.PI / 2]} />
  {[-1, 1].map(s => <group key={s}><B p={[s * (w / 2 + .2), -.02, .15]} s={[.38, h + .5, .07]} c="#d8c7a4" ro={1} r={.03} />{[-.1, 0, .1].map(f => <B key={f} p={[s * (w / 2 + .2) + f, -.02, .19]} s={[.05, h + .46, .03]} c="#cdb88f" ro={1} r={.015} />)}</group>)}</group>;
const FanHead = ({ on }: { on: boolean }) => { const g = useRef<THREE.Group>(null!); useFrame((_, dt) => { if (on) g.current.rotation.z -= dt * 14; }); return <group ref={g}><C p={[0, 0, .01]} r={.035} h={.05} c="#2a2a2a" rot={[Math.PI / 2, 0, 0]} />{[0, 1, 2].map(i => <group key={i} rotation-z={i * 2.094}><B p={[0, .1, 0]} s={[.09, .17, .008]} c="#bcd3de" r={.004} op={.9} /></group>)}</group>; };

function Avatar({ bubble, look }: { bubble: string; look: Look }) {
  const g = useRef<THREE.Group>(null!), inner = useRef<THREE.Group>(null!), plumb = useRef<THREE.Mesh>(null!), pg = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    const sleep = S.pose === 'sleep', sit = S.pose === 'sit';
    g.current.position.set(sleep ? -4.6 : S.pos[0], sleep ? .86 : 0, sleep ? -2.45 : S.pos[1]); g.current.rotation.y = sleep ? 0 : S.rot;
    inner.current.rotation.x = sleep ? -Math.PI / 2 : 0; inner.current.position.y = 0; void sit;
    pg.current.position.set(0, sleep ? 1.1 : 2.45 * look.height + Math.sin(clock.elapsedTime * 2) * .06, sleep ? -1.7 : 0); plumb.current.rotation.y = clock.elapsedTime * 1.6;
    const m = mood(), col = m > 60 ? '#35e07a' : m > 35 ? '#f2c230' : '#ef4b4b';
    const mat = plumb.current.material as THREE.MeshStandardMaterial; mat.color.set(col); mat.emissive.set(col);
  });
  return <group ref={g}>
    <group ref={inner}><Human look={look} getState={() => S.pose !== 'stand' ? S.pose : S.cur?.t === 'walk' && S.speed > 0 ? 'walk' : 'idle'} getAnim={() => (S.speed && S.cur?.t === 'act' ? S.cur.a.anim : undefined)} getSpeed={() => S.speed} /></group>
    <group ref={pg}><mesh ref={plumb}><octahedronGeometry args={[.14]} /><meshStandardMaterial emissiveIntensity={.8} /></mesh></group>
    <Html position={[0, 2.9 * look.height + .2, 0]} center zIndexRange={[5, 0]}><div className="bubble">{bubble}</div></Html>
  </group>;
}

const books = (seed: number, levels: number[]) => { const r = rng(seed), cols = ['#b43c35', '#3d5a80', '#d18a22', '#1d7654', '#6b4a8a', '#8a5a3a', '#2b2f36', '#c9b98a'], out: ReactNode[] = [];
  levels.forEach((y, i) => { let z = -.48; while (z < .46) { const w = .035 + r() * .05, h = .2 + r() * .13; if (r() < .1) { z += .09; continue; } out.push(<Bx key={i + '-' + z} p={[.03, y + h / 2, z + w / 2]} s={[.2, h, w]} c={cols[Math.floor(r() * cols.length)]} rot={[0, 0, r() < .12 ? .12 : 0]} />); z += w + .004; } }); return out; };

const VIS: Record<string, (ui: UI) => ReactNode> = {
  bed: ui => <>
    <B p={[0, .2, 0]} s={[1.8, .26, 2.45]} c="#4a2f1d" ro={.55} /><B p={[0, .66, -1.22]} s={[1.88, 1.32, .12]} c="#4a2f1d" ro={.5} />
    <B p={[-.45, .72, -1.15]} s={[.7, .8, .05]} c="#5d3b25" ro={.6} /><B p={[.45, .72, -1.15]} s={[.7, .8, .05]} c="#5d3b25" ro={.6} />
    <B p={[0, .36, 1.22]} s={[1.88, .52, .1]} c="#4a2f1d" ro={.5} />
    {[[-.88, -1.22], [.88, -1.22], [-.88, 1.22], [.88, 1.22]].map(([x, z]) => <B key={x + '' + z} p={[x, .04, z]} s={[.1, .08, .1]} c="#2a1a10" />)}
    <B p={[0, .48, .02]} s={[1.68, .27, 2.3]} c="#f4f0e6" ro={.95} r={.07} />
    <B p={[0, .66, .56]} s={[1.74, .12, 1.4]} c="#0f5c45" ro={1} r={.05} /><B p={[0, .67, -.18]} s={[1.74, .14, .3]} c="#ece6d6" ro={1} r={.05} />
    {[-.5, .5, 1.1].map(z => <B key={z} p={[0, .735, z + .08]} s={[1.5, .01, .02]} c="#0c4d3a" />)}
    <B p={[0, .72, -.84]} s={[.95, .17, .44]} c="#fbfaf6" ro={1} r={.08} rot={[-.08, 0, 0]} /><B p={[0, .84, -1.0]} s={[.85, .19, .34]} c="#f1eee6" ro={1} r={.08} rot={[-.35, 0, 0]} />
    <B p={[.54, .76, .1]} s={[.34, .13, .3]} c="#d99a42" ro={1} r={.05} rot={[0, .3, 0]} />
    <B p={[1.15, .26, -1.0]} s={[.5, .52, .5]} c="#5d3b25" ro={.55} /><B p={[1.15, .38, -.74]} s={[.42, .2, .02]} c="#4a2f1d" /><B p={[1.15, .14, -.74]} s={[.42, .2, .02]} c="#4a2f1d" />
    <C p={[1.15, .38, -.73]} r={.015} h={.03} c="#d9a22b" m={.8} rot={[Math.PI / 2, 0, 0]} /><C p={[1.15, .14, -.73]} r={.015} h={.03} c="#d9a22b" m={.8} rot={[Math.PI / 2, 0, 0]} />
    <C p={[1.15, .55, -1.0]} r={.08} h={.03} c="#333" /><C p={[1.15, .67, -1.0]} r={.014} h={.22} c="#333" /><C p={[1.15, .86, -1.0]} r={.15} rt={.1} h={.2} c="#f2e6c9" ro={1} e={ui.power ? '#ffd9a0' : undefined} ei={.45} /></>,
  fridge: ui => <>
    <B p={[0, .93, -.125]} s={[.75, 1.86, .75]} c="#e8ecee" ro={.3} m={.15} r={.05} /><B p={[0, 1.2, .255]} s={[.76, .012, .02]} c="#8c9499" />
    <B p={[.29, 1.5, .27]} s={[.03, .42, .04]} c="#9aa3a8" m={.8} ro={.25} /><B p={[.29, .9, .27]} s={[.03, .55, .04]} c="#9aa3a8" m={.8} ro={.25} />
    <B p={[-.15, 1.7, .26]} s={[.14, .05, .01]} c="#2b3a42" /><B p={[0, .03, .15]} s={[.7, .06, .05]} c="#555" />
    <B p={[.2, 1.88, -.05]} s={[.3, .1, .3]} c="#c9a56b" ro={1} />
    <B p={[1.34, .4, -.19]} s={[1.93, .8, .62]} c="#6b4a30" ro={.8} />
    {[.6, 1.08, 1.56, 2.04].map(x => <group key={x}><B p={[x, .42, .135]} s={[.46, .7, .025]} c="#8a6240" ro={.6} /><B p={[x, .42, .15]} s={[.34, .58, .01]} c="#7b563a" /><B p={[x + (x < 1.3 ? .17 : -.17), .72, .17]} s={[.02, .12, .025]} c="#c9ced1" m={.9} ro={.2} /></group>)}
    <B p={[1.34, .85, -.17]} s={[1.98, .05, .68]} c="#cfc9bd" ro={.3} m={.05} /><B p={[1.34, .96, -.485]} s={[1.93, .16, .03]} c="#ece5d3" ro={.4} />
    <B p={[1.75, .88, -.15]} s={[.5, .012, .36]} c="#aeb7bc" m={.9} ro={.25} /><B p={[1.75, .9, -.15]} s={[.4, .012, .28]} c="#8f999f" m={.9} ro={.3} />
    <C p={[1.75, 1.0, -.38]} r={.014} h={.2} c="#c9ced1" m={.9} ro={.2} /><B p={[1.75, 1.1, -.3]} s={[.02, .02, .16]} c="#c9ced1" m={.9} ro={.2} />
    <B p={[1.0, .875, -.1]} s={[.56, .02, .44]} c="#14171a" ro={.15} m={.3} />
    {[[.9, -.2], [1.12, -.2], [.9, .02], [1.12, .02]].map(([x, z]) => <C key={x + '' + z} p={[x, .89, z]} r={.075} h={.01} c="#3a3f45" />)}
    <C p={[.9, .98, .02]} r={.1} h={.16} c="#b9bec2" m={.8} ro={.3} /><C p={[.9, 1.07, .02]} r={.1} h={.015} c="#9aa0a4" m={.8} /><C p={[1.12, .93, -.2]} r={.12} rt={.14} h={.06} c="#2b2f33" m={.6} />
    <C p={[2.1, .93, -.3]} r={.12} h={.08} c="#8a5a3a" /><Sp p={[2.07, .99, -.3]} r={.05} c="#d9452b" /><Sp p={[2.15, .99, -.28]} r={.05} c="#f0b53a" /><Sp p={[2.1, .99, -.34]} r={.05} c="#6da944" />
    <B p={[2.15, .885, .03]} s={[.38, .025, .22]} c="#a9784a" ro={.7} />
    <B p={[.75, 1.8, -.31]} s={[.62, .72, .36]} c="#7b563a" ro={.7} /><B p={[.45, 1.8, -.13]} s={[.27, .66, .02]} c="#8a6240" /><B p={[1.05, 1.8, -.13]} s={[.27, .66, .02]} c="#8a6240" /><B p={[.62, 1.8, -.11]} s={[.02, .1, .02]} c="#c9ced1" m={.9} /><B p={[.88, 1.8, -.11]} s={[.02, .1, .02]} c="#c9ced1" m={.9} /></>,
  wardrobe: () => <>
    <B p={[0, 1.07, 0]} s={[1.4, 2.0, .6]} c="#5a3b25" ro={.55} r={.03} /><B p={[0, .05, .02]} s={[1.34, .1, .56]} c="#3b2616" /><B p={[0, 2.12, 0]} s={[1.46, .08, .66]} c="#4a2f1d" />
    <B p={[-.35, 1.07, .31]} s={[.66, 1.82, .03]} c="#6b4630" ro={.5} /><B p={[-.35, 1.07, .33]} s={[.5, 1.62, .015]} c="#5a3b25" />
    <B p={[.35, 1.07, .31]} s={[.66, 1.82, .03]} c="#4a2f1d" /><mesh position={[.35, 1.07, .33]}><planeGeometry args={[.54, 1.7]} /><meshStandardMaterial color="#cfe3ee" metalness={.9} roughness={.04} /></mesh>
    <B p={[-.05, 1.05, .35]} s={[.025, .3, .03]} c="#d9a22b" m={.8} ro={.3} /><B p={[.05, 1.05, .35]} s={[.025, .3, .03]} c="#d9a22b" m={.8} ro={.3} /></>,
  dining: () => <>
    <B p={[0, .75, 0]} s={[1.5, .06, .85]} c="#8a6240" ro={.45} r={.02} /><B p={[0, .68, 0]} s={[1.3, .08, .66]} c="#6b4a30" />
    {[[-.65, -.35], [.65, -.35], [-.65, .35], [.65, .35]].map(([x, z]) => <B key={x + '' + z} p={[x, .36, z]} s={[.07, .72, .07]} c="#6b4a30" r={.015} />)}
    <Chair p={[0, 0, .8]} ry={0} /><Chair p={[-1.0, 0, 0]} ry={-Math.PI / 2} /><Chair p={[1.0, 0, 0]} ry={Math.PI / 2} />
    <B p={[0, .785, .2]} s={[.5, .006, .36]} c="#c0392b" ro={1} r={.002} /><C p={[0, .8, .2]} r={.115} h={.015} c="#f6f4ee" ro={.2} /><C p={[0, .815, .2]} r={.07} rt={.085} h={.03} c="#f6f4ee" ro={.2} /><C p={[0, .82, .2]} r={.07} h={.012} c="#e0742a" ro={.9} />
    <C p={[.38, .83, .15]} r={.03} h={.08} c="#cfe6f2" ro={.1} /><B p={[-.45, .8, -.05]} s={[.3, .03, .2]} c="#f6f4ee" /><C p={[-.45, .87, -.05]} r={.1} rt={.13} h={.1} c="#e9e2d2" ro={.3} />
    <Sp p={[-.5, .95, -.05]} r={.045} c="#d9452b" /><Sp p={[-.4, .95, -.02]} r={.045} c="#f0b53a" /></>,
  shower: () => <>
    <B p={[0, .04, -.2]} s={[1.3, .08, 1.4]} c="#e8edf0" ro={.3} /><C p={[0, .085, -.2]} r={.055} h={.012} c="#c9ced1" m={.9} ro={.2} />
    <B p={[0, 1.2, -.885]} s={[1.3, 2.4, .03]} c="#cfe0e6" ro={.25} />{[.4, .8, 1.2, 1.6, 2.0].map(y => <B key={y} p={[0, y, -.865]} s={[1.3, .008, .01]} c="#9db4bd" />)}
    <B p={[-.66, 1.04, -.2]} s={[.03, 2.0, 1.4]} c="#bfe6f2" op={.22} ro={.05} /><B p={[.66, 1.04, -.2]} s={[.03, 2.0, 1.4]} c="#bfe6f2" op={.22} ro={.05} /><B p={[.33, 1.04, .5]} s={[.64, 2.0, .03]} c="#bfe6f2" op={.22} ro={.05} />
    <B p={[-.66, 2.05, -.2]} s={[.05, .05, 1.4]} c="#c9ced1" m={.9} ro={.2} /><B p={[.66, 2.05, -.2]} s={[.05, .05, 1.4]} c="#c9ced1" m={.9} ro={.2} /><B p={[.33, 2.05, .5]} s={[.64, .05, .05]} c="#c9ced1" m={.9} ro={.2} /><B p={[.02, 1.04, .5]} s={[.04, 2.0, .05]} c="#c9ced1" m={.9} ro={.2} />
    <C p={[0, 1.2, -.86]} r={.014} h={2} c="#c9ced1" m={.9} ro={.2} /><B p={[0, 2.12, -.6]} s={[.025, .025, .5]} c="#c9ced1" m={.9} ro={.2} /><C p={[0, 2.1, -.36]} r={.1} rt={.08} h={.03} c="#d7dcdf" m={.9} ro={.2} />
    <B p={[0, 1.0, -.86]} s={[.14, .06, .05]} c="#c9ced1" m={.9} ro={.2} /><B p={[-.45, 1.1, -.82]} s={[.34, .03, .12]} c="#c9ced1" m={.9} ro={.2} /><C p={[-.5, 1.19, -.82]} r={.03} h={.14} c="#e8742a" ro={.3} /><C p={[-.4, 1.17, -.82]} r={.028} h={.1} c="#3f9ad6" ro={.3} /></>,
  toilet: () => <>
    <B p={[0, .64, -.42]} s={[.44, .42, .16]} c="#f6f6f3" ro={.2} r={.05} /><B p={[0, .86, -.42]} s={[.46, .03, .18]} c="#eeeeea" ro={.2} /><C p={[.12, .89, -.42]} r={.03} h={.015} c="#c9ced1" m={.9} />
    <B p={[0, .17, -.15]} s={[.3, .34, .36]} c="#f6f6f3" ro={.2} r={.08} /><B p={[0, .4, -.02]} s={[.4, .22, .56]} c="#f6f6f3" ro={.2} r={.1} />
    <mesh position={[0, .52, .0]} rotation-x={Math.PI / 2} scale={[1, 1.22, 1]} castShadow><torusGeometry args={[.16, .028, 10, 28]} /><meshStandardMaterial color="#fbfbf8" roughness={.25} /></mesh>
    <mesh position={[0, .506, 0]} rotation-x={-Math.PI / 2} scale={[1, 1.22, 1]}><circleGeometry args={[.14, 24]} /><meshStandardMaterial color="#bfe0ee" roughness={.05} /></mesh>
    <B p={[0, .55, -.28]} s={[.36, .02, .08]} c="#fbfbf8" ro={.25} />
    <B p={[.85, .74, -.3]} s={[.52, .12, .4]} c="#f6f6f3" ro={.2} r={.05} /><B p={[.85, .81, -.3]} s={[.4, .02, .3]} c="#dfe5e8" ro={.1} /><B p={[.85, .38, -.4]} s={[.13, .72, .13]} c="#f2f2ee" ro={.25} />
    <C p={[.85, .9, -.42]} r={.014} h={.16} c="#c9ced1" m={.9} ro={.2} /><B p={[.85, .98, -.37]} s={[.02, .02, .1]} c="#c9ced1" m={.9} ro={.2} />
    <B p={[.85, 1.5, -.49]} s={[.52, .66, .02]} c="#444" ro={.4} /><mesh position={[.85, 1.5, -.478]}><planeGeometry args={[.46, .6]} /><meshStandardMaterial color="#cfe4ee" metalness={.9} roughness={.04} /></mesh>
    <B p={[1.25, 1.2, -.48]} s={[.26, .5, .02]} c="#2f6bb0" ro={1} /><C p={[1.25, 1.5, -.47]} r={.012} h={.32} c="#c9ced1" m={.9} rot={[0, 0, Math.PI / 2]} /></>,
  tv: ui => <>
    <B p={[0, .19, 0]} s={[2.2, .26, .9]} c="#243a5e" ro={.95} r={.05} />
    {[-.44, .44].map(x => <B key={x} p={[x, .395, .1]} s={[.86, .15, .62]} c="#2d4263" ro={.95} r={.06} />)}
    <B p={[0, .55, -.34]} s={[2.2, .62, .22]} c="#243a5e" ro={.95} r={.07} />
    {[-.44, .44].map(x => <B key={x} p={[x, .64, -.17]} s={[.84, .44, .2]} c="#2d4263" ro={.95} r={.07} rot={[-.12, 0, 0]} />)}
    {[-1, 1].map(s => <B key={s} p={[s * .99, .36, 0]} s={[.22, .6, .9]} c="#243a5e" ro={.95} r={.08} />)}
    {[[-1, -.38], [1, -.38], [-1, .38], [1, .38]].map(([x, z]) => <C key={x + '' + z} p={[x * .98, .04, z]} r={.04} rt={.03} h={.08} c="#3b2616" />)}
    <B p={[-.72, .63, .0]} s={[.36, .34, .12]} c="#d99a42" ro={1} r={.06} rot={[-.2, .3, .15]} /><B p={[.72, .63, .0]} s={[.36, .34, .12]} c="#b43c35" ro={1} r={.06} rot={[-.2, -.3, -.15]} />
    <B p={[1.5, .3, 0]} s={[.5, .6, .5]} c="#6b4a30" ro={.5} r={.02} /><B p={[1.5, .6, 0]} s={[.58, .03, .58]} c="#8a6240" ro={.4} /><B p={[1.5, .5, .26]} s={[.4, .22, .02]} c="#5a3b25" /><C p={[1.5, .64, 0]} r={.08} h={.02} c="#333" /><C p={[1.5, .78, 0]} r={.014} h={.28} c="#333" /><C p={[1.5, .98, 0]} r={.14} rt={.1} h={.2} c="#f2e6c9" ro={1} e={ui.power ? '#ffd9a0' : undefined} ei={.45} />
    <B p={[0, .3, 2.6]} s={[1.6, .6, .5]} c="#3a2a1e" ro={.5} /><B p={[-.4, .3, 2.34]} s={[.76, .5, .02]} c="#4a3626" /><B p={[.4, .3, 2.34]} s={[.76, .5, .02]} c="#4a3626" />
    <C p={[-.05, .3, 2.325]} r={.015} h={.03} c="#d9a22b" m={.8} rot={[Math.PI / 2, 0, 0]} /><C p={[.05, .3, 2.325]} r={.015} h={.03} c="#d9a22b" m={.8} rot={[Math.PI / 2, 0, 0]} />
    {[[-.7, -.2], [.7, -.2], [-.7, .2], [.7, .2]].map(([x, z]) => <B key={x + '' + z} p={[x, .03, 2.6 + z]} s={[.06, .06, .06]} c="#222" />)}
    <B p={[0, .67, 2.6]} s={[.7, .05, .12]} c="#15171a" m={.5} ro={.3} /><B p={[0, .98, 2.62]} s={[1.3, .74, .05]} c="#0d0e10" ro={.25} r={.015} />
    <Screen p={[0, .98, 2.59]} w={1.24} h={.68} on={ui.power} col="#4a9fe8" ry={Math.PI} /><B p={[0, .64, 2.6]} s={[.3, .04, .2]} c="#15171a" m={.5} />
    <C p={[.55, .74, 2.5]} r={.06} rt={.04} h={.14} c="#e8e2d2" ro={.4} /><Sp p={[.55, .86, 2.5]} r={.08} c="#2f8a3a" /></>,
  desk: ui => <>
    <B p={[0, .75, 0]} s={[1.6, .045, .8]} c="#8a6240" ro={.45} r={.015} />
    <B p={[-.75, .37, 0]} s={[.04, .74, .7]} c="#2b2b2e" m={.5} ro={.4} /><B p={[.52, .37, 0]} s={[.52, .72, .7]} c="#6b4a30" ro={.6} />
    {[.2, .37, .54].map(y => <group key={y}><B p={[.52, y, .36]} s={[.46, .14, .02]} c="#7a5638" ro={.55} /><B p={[.52, y + .04, .375]} s={[.14, .015, .02]} c="#c9ced1" m={.9} ro={.2} /></group>)}
    <B p={[0, .63, -.34]} s={[1.3, .3, .02]} c="#6b4a30" />
    <B p={[0, .79, -.15]} s={[.3, .012, .18]} c="#2b2b2e" m={.6} /><B p={[0, .9, -.2]} s={[.04, .2, .03]} c="#2b2b2e" m={.6} /><B p={[0, 1.2, -.22]} s={[.7, .4, .03]} c="#0d0e10" ro={.3} r={.01} />
    <Screen p={[0, 1.2, -.2]} w={.64} h={.35} on={ui.power} col="#7fd0ff" /><B p={[.02, .785, .14]} s={[.42, .016, .14]} c="#d8d8d8" ro={.5} /><B p={[.34, .785, .14]} s={[.06, .02, .1]} c="#2b2b2e" r={.02} />
    <C p={[-.62, .79, -.25]} r={.07} h={.02} c="#333" m={.6} /><B p={[-.62, .95, -.25]} s={[.02, .3, .02]} c="#333" /><B p={[-.62, 1.1, -.18]} s={[.03, .03, .2]} c="#333" rot={[.3, 0, 0]} />
    <C p={[.55, .82, 0]} r={.04} h={.09} c="#e8e2d2" ro={.4} /><B p={[-.45, .775, .2]} s={[.22, .012, .3]} c="#f6f4ee" rot={[0, .2, 0]} /><B p={[-.45, .79, .2]} s={[.2, .02, .27]} c="#d9d4c6" rot={[0, -.1, 0]} />
    <group position={[0, 0, .85]}><C p={[0, .04, 0]} r={.25} rt={.03} h={.03} c="#2b2b2e" /><C p={[0, .22, 0]} r={.025} h={.36} c="#555" m={.8} /><B p={[0, .43, 0]} s={[.48, .08, .46]} c="#2f3a4a" ro={.95} r={.04} />
      <B p={[0, .72, .22]} s={[.46, .5, .07]} c="#2f3a4a" ro={.95} r={.05} rot={[.08, 0, 0]} /><B p={[-.26, .6, 0]} s={[.04, .04, .3]} c="#2b2b2e" /><B p={[.26, .6, 0]} s={[.04, .04, .3]} c="#2b2b2e" /></group></>,
  phone: ui => <>
    <B p={[0, .77, 0]} s={[.62, .04, .62]} c="#8a6240" ro={.45} r={.015} /><B p={[0, .24, 0]} s={[.54, .025, .54]} c="#6b4a30" />
    {[[-.26, -.26], [.26, -.26], [-.26, .26], [.26, .26]].map(([x, z]) => <B key={x + '' + z} p={[x, .37, z]} s={[.04, .75, .04]} c="#5a3b25" r={.01} />)}
    <B p={[.1, .8, .12]} s={[.075, .012, .15]} c="#14161a" r={.01} rot={[0, .5, 0]} /><B p={[-.02, .8, .1]} s={[.16, .02, .22]} c="#c9b98a" ro={.9} rot={[0, -.2, 0]} />
    <C p={[-.2, .81, -.2]} r={.07} h={.02} c="#333" /><C p={[-.2, .93, -.2]} r={.014} h={.22} c="#333" /><C p={[-.2, 1.1, -.2]} r={.12} rt={.08} h={.16} c="#f2e6c9" ro={1} e={ui.power ? '#ffd9a0' : undefined} ei={.4} />
    <C p={[.2, .86, -.2]} r={.05} h={.12} c="#6bb7d9" ro={.1} /><Sp p={[.2, .96, -.2]} r={.05} c="#d9452b" /><Sp p={[.24, .98, -.17]} r={.04} c="#f0b53a" /></>,
  mat: () => <><B p={[0, .018, 0]} s={[.8, .035, 1.85]} c="#7b3f8a" ro={1} r={.015} /><B p={[0, .037, 0]} s={[.74, .004, 1.79]} c="#8d4f9a" ro={1} r={.002} /><C p={[0, .045, -.95]} r={.05} h={.78} c="#7b3f8a" ro={1} rot={[0, 0, Math.PI / 2]} /></>,
  radio: ui => <>
    <B p={[0, .56, 0]} s={[.38, 1.0, .34]} c="#1d2127" ro={.45} r={.04} /><B p={[0, .04, 0]} s={[.46, .05, .4]} c="#111" /><B p={[-.196, .56, 0]} s={[.015, .96, .3]} c="#14171a" />
    {[[.38, .13], [.7, .085], [.93, .045]].map(([y, r]) => <group key={y}><C p={[-.205, y, 0]} r={r + .02} h={.02} c="#0d0f12" rot={[0, 0, Math.PI / 2]} /><C p={[-.21, y, 0]} r={r} h={.03} c="#2b2f36" ro={.9} rot={[0, 0, Math.PI / 2]} /><C p={[-.225, y, 0]} r={r * .35} h={.02} c="#444a52" m={.6} rot={[0, 0, Math.PI / 2]} /></group>)}
    <C p={[-.2, .16, 0]} r={.012} h={.012} c="#3fb98a" e={ui.power ? '#3fb98a' : undefined} ei={1.2} rot={[0, 0, Math.PI / 2]} /></>,
  shelf: () => <>
    <B p={[-.165, 1, 0]} s={[.02, 2, 1.1]} c="#5a3b25" ro={.7} /><B p={[0, 1, -.53]} s={[.35, 2, .04]} c="#6b4630" ro={.6} /><B p={[0, 1, .53]} s={[.35, 2, .04]} c="#6b4630" ro={.6} />
    {[.03, .4, .78, 1.16, 1.54, 1.98].map(y => <B key={y} p={[0, y, 0]} s={[.35, .035, 1.06]} c="#6b4630" ro={.6} r={.01} />)}
    {books(5, [.05, .42, .8, 1.18])}
    <Sp p={[.04, 1.72, -.3]} r={.12} c="#2f6b8a" ro={.3} /><C p={[.04, 1.6, -.3]} r={.04} h={.04} c="#444" /><C p={[.03, 1.7, .25]} r={.06} rt={.04} h={.2} c="#c9a56b" ro={.4} /><B p={[.1, 1.7, .0]} s={[.03, .22, .16]} c="#2a1b10" rot={[0, 0, -.1]} />
    <C p={[.04, 1.6, .38]} r={.07} rt={.09} h={.12} c="#b5651d" /><Sp p={[.04, 1.72, .38]} r={.08} c="#2f8a3a" /></>,
  plant: () => <>
    <C p={[0, .25, 0]} r={.22} rt={.3} h={.5} c="#b5651d" ro={.8} /><C p={[0, .51, 0]} r={.27} h={.03} c="#3a2a1c" ro={1} /><C p={[0, .5, 0]} r={.31} h={.04} c="#9a5418" ro={.8} />
    <C p={[0, .9, 0]} r={.022} rt={.015} h={.8} c="#6a4a2a" />
    {Array.from({ length: 12 }, (_, i) => { const a = i * 2.4, up = .65 + (i % 4) * .22, t = .35 + (i % 3) * .22; return <Sp key={i} p={[Math.cos(a) * (.14 + t * .22), up, Math.sin(a) * (.14 + t * .22)]} r={.2} sc={[.8, .12, .5]} c={i % 2 ? '#2f8a3a' : '#3fa84b'} rot={[Math.sin(a) * t, -a, -Math.cos(a) * t]} />; })}</>,
  door: () => <>
    <B p={[.03, 1.025, 0]} s={[.06, 2.05, .95]} c="#5a3a24" ro={.55} r={.01} />
    {[1.55, .55].map(y => [-.2, .2].map(z => <B key={y + '' + z} p={[.066, y, z]} s={[.015, .8, .34]} c="#4a2f1d" ro={.6} r={.01} />))}
    <B p={[.045, 1.0, -.53]} s={[.09, 2.1, .07]} c="#3b2616" ro={.6} /><B p={[.045, 1.0, .53]} s={[.09, 2.1, .07]} c="#3b2616" ro={.6} /><B p={[.045, 2.1, 0]} s={[.09, .08, 1.14]} c="#3b2616" ro={.6} />
    <B p={[.085, 1.0, .36]} s={[.02, .035, .15]} c="#d9a22b" m={.9} ro={.25} /><C p={[.075, 1.0, .42]} r={.035} h={.025} c="#d9a22b" m={.9} ro={.25} rot={[0, 0, Math.PI / 2]} /><C p={[.075, 1.2, .38]} r={.025} h={.03} c="#d9a22b" m={.9} ro={.25} rot={[0, 0, Math.PI / 2]} />
    <B p={[.075, 1.72, 0]} s={[.01, .1, .16]} c="#d9a22b" m={.9} ro={.25} /><C p={[.075, 1.58, 0]} r={.012} h={.02} c="#111" rot={[0, 0, Math.PI / 2]} /></>,
  gen: ui => <>
    <B p={[0, .12, 0]} s={[.92, .05, .6]} c="#1c1c1e" m={.5} />{[[-.4, -.26], [.4, -.26], [-.4, .26], [.4, .26]].map(([x, z]) => <C key={x + '' + z} p={[x, .36, z]} r={.018} h={.46} c="#1c1c1e" m={.5} />)}
    <B p={[0, .62, .26]} s={[.9, .03, .03]} c="#1c1c1e" m={.5} /><B p={[0, .62, -.26]} s={[.9, .03, .03]} c="#1c1c1e" m={.5} />
    <B p={[.05, .42, 0]} s={[.62, .38, .46]} c="#c23a2b" ro={.45} r={.05} /><B p={[-.1, .74, 0]} s={[.5, .18, .36]} c="#e0a82b" ro={.4} r={.06} /><C p={[-.1, .85, .1]} r={.04} h={.03} c="#111" />
    <B p={[-.38, .42, 0]} s={[.04, .32, .4]} c="#1c1c1e" /><C p={[-.405, .5, -.1]} r={.035} h={.02} c="#eee" rot={[0, 0, Math.PI / 2]} /><C p={[-.405, .5, .1]} r={.035} h={.02} c="#eee" rot={[0, 0, Math.PI / 2]} />
    <C p={[-.405, .35, 0]} r={.02} h={.02} c="#3fb98a" e={ui.power ? undefined : '#e04a3a'} ei={1} rot={[0, 0, Math.PI / 2]} />
    <C p={[.32, .72, .17]} r={.03} h={.34} c="#555" m={.7} rot={[0, 0, -.5]} /><B p={[.38, .5, -.27]} s={[.06, .04, .26]} c="#111" /><C p={[.34, .1, 0]} r={.1} h={.06} c="#111" rot={[Math.PI / 2, 0, Math.PI / 2]} /></>,
  coffee: () => <>
    <B p={[0, .4, 0]} s={[.52, .04, .92]} c="#6b4a30" ro={.45} r={.015} /><B p={[0, .41, 0]} s={[.44, .01, .84]} c="#cfe3ee" op={.35} ro={.05} />
    {[[-.22, -.4], [.22, -.4], [-.22, .4], [.22, .4]].map(([x, z]) => <B key={x + '' + z} p={[x, .19, z]} s={[.04, .38, .04]} c="#4a2f1d" r={.01} />)}<B p={[0, .15, 0]} s={[.44, .02, .8]} c="#5a3b25" />
    <B p={[0, .44, -.2]} s={[.2, .035, .28]} c="#2f6bb0" ro={1} /><B p={[.02, .47, -.2]} s={[.18, .03, .25]} c="#b43c35" ro={1} rot={[0, .2, 0]} /><C p={[0, .46, .24]} r={.05} h={.07} c="#f6f4ee" ro={.3} /><Sp p={[.05, .5, .1]} r={.045} c="#d9452b" /></>,
  fan: ui => <>
    <C p={[0, .03, 0]} r={.2} h={.045} c="#2b2b2e" /><C p={[0, .5, 0]} r={.022} h={.95} c="#9aa3a8" m={.85} ro={.25} /><B p={[0, 1.02, 0]} s={[.2, .18, .22]} c="#d8dcde" ro={.4} />
    <mesh position={[0, 1.05, .14]} castShadow><torusGeometry args={[.21, .01, 8, 32]} /><meshStandardMaterial color="#9aa3a8" metalness={.8} roughness={.3} /></mesh>
    <mesh position={[0, 1.05, .16]}><circleGeometry args={[.21, 24]} /><meshStandardMaterial color="#cfe3ee" transparent opacity={.12} side={THREE.DoubleSide} /></mesh>
    <group position={[0, 1.05, .15]}><FanHead on={ui.power} /></group></>,
};

// Static shell of the flat: tiles, rugs, walls, windows, wall decor.
function Room() {
  return <>
    <Tiles x={-.05} z={-3.55} w={2.9} d={2.1} a="#ebe5d6" b="#a9b4b8" /><Tiles x={4.2} z={-3.5} w={3.6} d={2.2} a="#e9f0f2" b="#cfdde2" />
    <Rug x={-4.2} z={-2.6} w={3.4} d={3.6} c1="#6d3f66" c2="#8d5a86" /><Rug x={-4} z={1.2} w={3.4} d={3.2} c1="#a67c4a" c2="#c9a56b" />
    <B p={[0, 1.3, -4.7]} s={[12.6, 2.6, .2]} c="#e6dccb" ro={.95} r={.01} /><B p={[-6.3, 1.3, 0]} s={[.2, 2.6, 9.4]} c="#ddd2bf" ro={.95} r={.01} />
    <B p={[0, .07, -4.58]} s={[12.4, .14, .04]} c="#f4f0e6" ro={.5} r={.01} /><B p={[-6.18, .07, 0]} s={[.04, .14, 9.2]} c="#f4f0e6" ro={.5} r={.01} />
    <B p={[0, 2.57, -4.58]} s={[12.4, .06, .05]} c="#f4f0e6" ro={.5} r={.01} /><B p={[-6.18, 2.57, 0]} s={[.05, .06, 9.2]} c="#f4f0e6" ro={.5} r={.01} />
    <Win p={[.75, 1.6, -4.59]} w={1.4} h={1.2} /><Win p={[-6.19, 1.6, -2.9]} ry={Math.PI / 2} w={1.8} h={1.2} />
    <group position={[-4.6, 1.95, -4.57]}><B p={[0, 0, 0]} s={[1.0, .66, .04]} c="#2a1b10" ro={.5} /><B p={[0, 0, .02]} s={[.88, .54, .02]} c="#f1e3c0" ro={1} /><B p={[0, .12, .035]} s={[.88, .26, .005]} c="#e0742a" ro={1} /><B p={[0, -.06, .035]} s={[.88, .12, .005]} c="#d9a22b" ro={1} /><B p={[0, -.17, .035]} s={[.88, .2, .005]} c="#1d7654" ro={1} /><Sp p={[0, .1, .045]} r={.08} c="#f6d36b" sc={[1, 1, .1]} /></group>
    <group position={[2.0, 2.0, -4.57]}><C p={[0, 0, .02]} r={.2} h={.04} c="#2b2b2e" rot={[Math.PI / 2, 0, 0]} /><C p={[0, 0, .045]} r={.17} h={.01} c="#f6f2e6" ro={.4} rot={[Math.PI / 2, 0, 0]} /><B p={[0, .05, .06]} s={[.012, .1, .006]} c="#222" /><B p={[.04, 0, .06]} s={[.08, .012, .006]} c="#222" /></group>
    <B p={[-5.75, .02, 3.5]} s={[.55, .02, .85]} c="#5a4a38" ro={1} r={.008} /><B p={[-5.75, .032, 3.5]} s={[.45, .006, .75]} c="#7a6650" ro={1} r={.003} />
  </>;
}

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
  const [hov, setHov] = useState<string | null>(null), floorTex = useMemo(() => woodTex(6.2, 4.6), []);
  useFrame((_, dt) => tick(Math.min(dt, .1)));
  return <>
    <Lights />
    <mesh rotation-x={-Math.PI / 2} position={[0, -.02, 0]} receiveShadow><planeGeometry args={[80, 80]} /><meshStandardMaterial color="#4f7a4a" /></mesh>
    <mesh rotation-x={-Math.PI / 2} position={[0, .01, 0]} receiveShadow onClick={e => { if (e.delta > 4) return; e.stopPropagation(); setSel(null); walk(e.point.x, e.point.z); }}>
      <planeGeometry args={[12.4, 9.2]} /><meshStandardMaterial map={floorTex} roughness={.7} /></mesh>
    <Room />
    <group position={[9, 0, -2]}><B p={[0, .9, 0]} s={[.3, 1.8, .3]} c="#5a3a22" /><mesh position={[0, 2.4, 0]} castShadow><sphereGeometry args={[1.3, 16, 12]} /><meshStandardMaterial color="#2f6b3a" /></mesh></group>
    {OBJ.map(o => <group key={o.id} position={[o.p[0], 0, o.p[1]]} rotation-y={o.rot}
      onClick={e => { if (e.delta > 4) return; e.stopPropagation(); setSel(o); }}
      onPointerOver={e => { e.stopPropagation(); document.body.style.cursor = 'pointer'; setHov(o.id); }} onPointerOut={() => { document.body.style.cursor = 'auto'; setHov(h => (h === o.id ? null : h)); }}>{VIS[o.id](ui)}</group>)}
    {DECOR.map(d => <group key={d.id} position={[d.p[0], 0, d.p[1]]} rotation-y={d.rot}>{VIS[d.vis](ui)}</group>)}
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
    {user && look && outside && <City look={look} getMinute={() => S.min} onNear={b => { if (b) S.needs.social = cl(S.needs.social + 0.02); }} />}
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
