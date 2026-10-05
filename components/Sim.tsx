'use client';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, RoundedBox, Html } from '@react-three/drei';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';

type N = 'hunger' | 'energy' | 'hygiene' | 'bladder' | 'fun' | 'social';
type Pose = 'stand' | 'sit' | 'sleep';
type Act = { k: string; label: string; e: string; dur: number; fx: Partial<Record<N, number>>; pose: Pose; cost?: number; pay?: number; pow?: boolean };
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
  { id: 'fridge', name: 'Kitchen', p: [-1, -4.1], rot: 0, spot: [-1, -3.2], face: Math.PI, acts: [
    { k: 'cook', label: 'Cook jollof', e: '🍛', dur: 30, fx: { hunger: 60, fun: 6 }, pose: 'stand', cost: 1500 },
    { k: 'snack', label: 'Snack', e: '🥜', dur: 10, fx: { hunger: 25 }, pose: 'stand', cost: 500 }] },
  { id: 'shower', name: 'Shower', p: [5.3, -3.7], rot: 0, spot: [5.3, -3.5], face: Math.PI, acts: [
    { k: 'shower', label: 'Take a shower', e: '🚿', dur: 25, fx: { hygiene: 100, fun: 5 }, pose: 'stand' }] },
  { id: 'toilet', name: 'Toilet', p: [3.3, -4.1], rot: 0, spot: [3.3, -3.3], face: Math.PI, acts: [
    { k: 'wc', label: 'Use toilet', e: '🚽', dur: 8, fx: { bladder: 100 }, pose: 'stand' }] },
  { id: 'tv', name: 'Sofa & TV', p: [-3, 1.2], rot: -Math.PI / 2, spot: [-3, 1.2], face: -Math.PI / 2, acts: [
    { k: 'tv', label: 'Watch Nollywood', e: '📺', dur: 90, fx: { fun: 45, energy: -5 }, pose: 'sit', pow: true },
    { k: 'chill', label: 'Relax on sofa', e: '🛋️', dur: 45, fx: { fun: 15, energy: 10 }, pose: 'sit' }] },
  { id: 'desk', name: 'Computer', p: [3.4, 2], rot: 0, spot: [3.4, 2.85], face: Math.PI, acts: [
    { k: 'work', label: 'Freelance gig', e: '💻', dur: 180, fx: { energy: -25, fun: -15, hunger: -10 }, pose: 'sit', pay: 6000, pow: true }] },
  { id: 'phone', name: 'Phone', p: [-1.2, 3.2], rot: 0, spot: [-1.2, 2.5], face: 0, acts: [
    { k: 'call', label: 'Call Ada', e: '📞', dur: 40, fx: { social: 45, fun: 10 }, pose: 'stand' },
    { k: 'chat', label: 'Chat on WhatsApp', e: '💬', dur: 20, fx: { social: 22 }, pose: 'stand' }] },
  { id: 'gen', name: 'Generator', p: [5.3, .4], rot: 0, spot: [4.4, .4], face: Math.PI / 2, acts: [
    { k: 'gen', label: 'Fuel generator', e: '⛽', dur: 15, fx: {}, pose: 'stand', cost: 2000 }] },
];
const find = (id: string) => OBJ.find(o => o.id === id)!;

const NEW = () => ({ pos: [0, .5] as [number, number], rot: 0, pose: 'stand' as Pose, needs: { hunger: 78, energy: 72, hygiene: 70, bladder: 70, fun: 55, social: 50 } as Record<N, number>,
  min: 8 * 60, cash: 20000, power: true, speed: 1, free: true, q: [] as Task[], cur: null as Task | null, prog: 0, toast: '', toastT: 0, cool: 0 });
const S = NEW();
const say = (m: string) => { S.toast = m; S.toastT = Date.now(); };
const walk = (x: number, z: number) => { S.cur = null; S.q = [{ t: 'walk', x: THREE.MathUtils.clamp(x, -5.8, 5.8), z: THREE.MathUtils.clamp(z, -4.2, 4.2) }]; };
const enq = (o: Obj, a: Act) => { if (S.q.length > 8) return; S.q.push({ t: 'walk', x: o.spot[0], z: o.spot[1] }, { t: 'act', a, o }); };
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
      else { S.cash -= t.a.cost || 0; S.cur = t; S.prog = 0; }
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
      if (c.a.pay) { S.cash += c.a.pay; say(`Gig done: +${naira(c.a.pay)}`); }
      if (c.a.k === 'gen') { S.power = true; say('💡 Light is back!'); }
      S.cur = null;
    }
  }
}
const mood = () => Object.values(S.needs).reduce((a, b) => a + b, 0) / 6;
const moodFace = (m: number) => m > 75 ? '😄' : m > 55 ? '🙂' : m > 35 ? '😐' : '😫';
const snap = () => ({ needs: { ...S.needs }, min: S.min, cash: S.cash, power: S.power, speed: S.speed, free: S.free, q: S.q.flatMap(t => t.t === 'act' ? [t.a.e] : []),
  cur: S.cur?.t === 'act' ? S.cur.a : null, prog: S.cur?.t === 'act' ? S.prog / S.cur.a.dur : 0, toast: Date.now() - S.toastT < 3500 ? S.toast : '', mood: mood() });
type UI = ReturnType<typeof snap>;

const B = ({ p, s, c, r = .04 }: { p: [number, number, number]; s: [number, number, number]; c: string; r?: number }) =>
  <RoundedBox args={s} radius={r} smoothness={3} position={p} castShadow receiveShadow><meshStandardMaterial color={c} roughness={.75} /></RoundedBox>;
const Zone = ({ x, z, w, d, c, y = .02 }: { x: number; z: number; w: number; d: number; c: string; y?: number }) =>
  <mesh rotation-x={-Math.PI / 2} position={[x, y, z]} receiveShadow><planeGeometry args={[w, d]} /><meshStandardMaterial color={c} roughness={.9} /></mesh>;

function Avatar({ bubble }: { bubble: string }) {
  const g = useRef<THREE.Group>(null!), inner = useRef<THREE.Group>(null!), plumb = useRef<THREE.Mesh>(null!), pg = useRef<THREE.Group>(null!);
  const L = useRef<THREE.Group>(null!), R = useRef<THREE.Group>(null!), AL = useRef<THREE.Group>(null!), AR = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    const sleep = S.pose === 'sleep', sit = S.pose === 'sit', walking = S.cur?.t === 'walk' && S.speed > 0;
    g.current.position.set(sleep ? -4.6 : S.pos[0], sleep ? .64 : 0, sleep ? -1.75 : S.pos[1]); g.current.rotation.y = sleep ? 0 : S.rot;
    inner.current.rotation.x = sleep ? -Math.PI / 2 : 0; inner.current.position.y = sit ? -.3 : 0;
    const sw = walking ? Math.sin(clock.elapsedTime * 9) * .7 : 0;
    L.current.rotation.x = sit ? -1.45 : sw; R.current.rotation.x = sit ? -1.45 : -sw; AL.current.rotation.x = -sw * .8; AR.current.rotation.x = sw * .8;
    pg.current.position.set(0, sleep ? 1.1 : 2.45 + Math.sin(clock.elapsedTime * 2) * .06, sleep ? -1.9 : 0); plumb.current.rotation.y = clock.elapsedTime * 1.6;
    const m = mood(), col = m > 60 ? '#35e07a' : m > 35 ? '#f2c230' : '#ef4b4b';
    const mat = plumb.current.material as THREE.MeshStandardMaterial; mat.color.set(col); mat.emissive.set(col);
  });
  const skin = '#8b552f';
  return <group ref={g}>
    <group ref={inner}>
      <mesh position={[0, 1.15, 0]} castShadow><capsuleGeometry args={[.26, .5, 8, 16]} /><meshStandardMaterial color="#126c4b" /></mesh>
      <mesh position={[0, 1.72, 0]} castShadow><sphereGeometry args={[.27, 24, 18]} /><meshStandardMaterial color={skin} /></mesh>
      <mesh position={[0, 1.77, -.03]}><sphereGeometry args={[.285, 24, 14, 0, Math.PI * 2, 0, Math.PI * .55]} /><meshStandardMaterial color="#151515" /></mesh>
      {[-.09, .09].map(x => <mesh key={x} position={[x, 1.74, .24]}><sphereGeometry args={[.03, 8, 8]} /><meshBasicMaterial color="#111" /></mesh>)}
      <group ref={L} position={[-.13, .8, 0]}><mesh position={[0, -.36, 0]} castShadow><capsuleGeometry args={[.1, .5, 6, 10]} /><meshStandardMaterial color="#222831" /></mesh></group>
      <group ref={R} position={[.13, .8, 0]}><mesh position={[0, -.36, 0]} castShadow><capsuleGeometry args={[.1, .5, 6, 10]} /><meshStandardMaterial color="#222831" /></mesh></group>
      <group ref={AL} position={[-.36, 1.42, 0]}><mesh position={[0, -.28, 0]} castShadow><capsuleGeometry args={[.08, .45, 6, 10]} /><meshStandardMaterial color={skin} /></mesh></group>
      <group ref={AR} position={[.36, 1.42, 0]}><mesh position={[0, -.28, 0]} castShadow><capsuleGeometry args={[.08, .45, 6, 10]} /><meshStandardMaterial color={skin} /></mesh></group>
    </group>
    <group ref={pg}><mesh ref={plumb}><octahedronGeometry args={[.14]} /><meshStandardMaterial emissiveIntensity={.8} /></mesh></group>
    <Html position={[0, 3, 0]} center zIndexRange={[5, 0]}><div className="bubble">{bubble}</div></Html>
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

function World({ ui, sel, setSel }: { ui: UI; sel: Obj | null; setSel: (o: Obj | null) => void }) {
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
      onPointerOver={() => { document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = 'auto'; }}>{VIS[o.id](ui)}</group>)}
    <Avatar bubble={ui.cur ? ui.cur.e : moodFace(ui.mood)} />
    {sel && <Html position={[sel.p[0], 2.6, sel.p[1]]} center zIndexRange={[20, 10]}><div className="pie"><b>{sel.name}</b>
      {sel.acts.map(a => <button key={a.k} disabled={(!!a.pow && !ui.power) || (a.cost || 0) > ui.cash} onClick={() => { enq(sel, a); setSel(null); }}>{a.e} {a.label}<small>{a.cost ? `-${naira(a.cost)}` : a.pay ? `+${naira(a.pay)}` : `${a.dur} min`}</small></button>)}</div></Html>}
    <OrbitControls enablePan={false} target={[0, 0, 0]} minDistance={7} maxDistance={20} minPolarAngle={.5} maxPolarAngle={1.25} minAzimuthAngle={-.6} maxAzimuthAngle={.9} />
  </>;
}

export default function Sim() {
  const [ui, setUi] = useState<UI>(snap), [sel, setSel] = useState<Obj | null>(null);
  useEffect(() => {
    Object.assign(S, NEW());
    try { const s = JSON.parse(localStorage.getItem('abuja-sims-v2') || 'null'); if (s) Object.assign(S, { needs: s.needs, min: s.min, cash: s.cash }); } catch { /* fresh game */ }
    const a = setInterval(() => setUi(snap()), 200), b = setInterval(() => localStorage.setItem('abuja-sims-v2', JSON.stringify({ needs: S.needs, min: S.min, cash: S.cash })), 3000);
    return () => { clearInterval(a); clearInterval(b); };
  }, []);
  const h = Math.floor(ui.min / 60) % 24, m = Math.floor(ui.min % 60), hr = (ui.min / 60) % 24;
  return <div className="sim">
    <Canvas shadows dpr={[1, 1.75]} camera={{ position: [3, 11, 13], fov: 42 }}><World ui={ui} sel={sel} setSel={setSel} /></Canvas>
    <div className="top"><div className="pill">Day {Math.floor(ui.min / 1440) + 1} · {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')} {hr > 6 && hr < 18 ? '☀️' : '🌙'}</div>
      <div className="pill">{[0, 1, 2, 3].map(s => <button key={s} className={ui.speed === s ? 'on' : ''} onClick={() => { S.speed = s; }}>{s === 0 ? '⏸' : '▶'.repeat(s)}</button>)}</div>
      <div className="pill gold">{naira(ui.cash)}</div><div className="pill">{ui.power ? '💡 Power on' : '🕯️ NEPA off'}</div>
      <button className={'pill ' + (ui.free ? 'on' : '')} onClick={() => { S.free = !S.free; }}>🧠 Free will {ui.free ? 'ON' : 'OFF'}</button></div>
    <div className="needs"><div className="mood">{moodFace(ui.mood)} <b>David</b><span>Mood {Math.round(ui.mood)}%</span></div>
      {NEEDS.map(([k, l, e]) => <div key={k} className="nrow"><span>{e} {l}</span><div className="bar"><i style={{ width: ui.needs[k] + '%', background: `hsl(${ui.needs[k] * 1.25},70%,48%)` }} /></div></div>)}</div>
    <div className="queue">{ui.cur && <div className="cur"><span>{ui.cur.e} {ui.cur.label}</span><div className="bar"><i style={{ width: ui.prog * 100 + '%', background: '#f0b94a' }} /></div></div>}{ui.q.map((e, i) => <span key={i} className="chip">{e}</span>)}</div>
    {ui.toast && <div className="toast">{ui.toast}</div>}
    <div className="hint">Click the floor to walk · Click any object for actions · Drag to rotate · Scroll to zoom</div>
    <style>{CSS}</style>
  </div>;
}

const CSS = `.sim{position:fixed;inset:0;font-family:Inter,system-ui,sans-serif;color:#fff;user-select:none}.sim canvas{display:block}
.top{position:absolute;top:10px;left:10px;right:10px;display:flex;gap:8px;flex-wrap:wrap;pointer-events:none}.top>*{pointer-events:auto}
.pill{background:#10201ad9;border:1px solid #ffffff2a;border-radius:999px;padding:7px 12px;font-size:12px;color:#fff;backdrop-filter:blur(8px);cursor:default}button.pill{cursor:pointer}
.pill button{background:none;border:0;color:#9fb;font-size:11px;padding:0 6px;cursor:pointer}.pill button.on{color:#f0b94a;font-weight:800}.pill.on{background:#1d7654}.gold{color:#f3c56f;font-weight:800}
.needs{position:absolute;left:10px;bottom:10px;width:220px;background:#10201ae6;border:1px solid #ffffff2a;border-radius:16px;padding:12px;backdrop-filter:blur(8px)}
.mood{display:flex;align-items:center;gap:8px;font-size:22px;margin-bottom:8px}.mood b{font-size:14px}.mood span{margin-left:auto;font-size:11px;color:#9fb5aa}
.nrow{display:flex;align-items:center;gap:8px;font-size:11px;margin:5px 0}.nrow>span{width:86px}.bar{flex:1;height:8px;background:#ffffff1f;border-radius:9px;overflow:hidden}.bar i{display:block;height:100%;border-radius:9px;transition:width .2s}
.queue{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);display:flex;gap:6px;align-items:center}.cur{background:#10201af0;border:1px solid #f0b94a88;border-radius:12px;padding:8px 12px;font-size:12px;min-width:170px}.cur .bar{margin-top:6px}
.chip{background:#10201ad9;border:1px solid #ffffff2a;border-radius:10px;padding:7px 9px;font-size:16px}
.toast{position:absolute;top:60px;left:50%;transform:translateX(-50%);background:#f0b94a;color:#1a1208;font-weight:700;font-size:13px;padding:9px 16px;border-radius:12px}
.hint{position:absolute;right:12px;bottom:12px;font-size:10px;color:#ffffffaa;text-shadow:0 1px 3px #000;max-width:200px;text-align:right}
.bubble{background:#fff;color:#000;border-radius:14px;padding:3px 9px;font-size:20px;box-shadow:0 2px 8px #0005}
.pie{background:#10201af5;border:1px solid #ffffff33;border-radius:14px;padding:8px;display:flex;flex-direction:column;gap:5px;min-width:170px}.pie b{font-size:11px;color:#f0b94a;text-transform:uppercase;letter-spacing:.1em;padding:0 4px}
.pie button{display:flex;justify-content:space-between;gap:12px;background:#1b3329;border:1px solid #2f5143;color:#fff;border-radius:9px;padding:8px 10px;font-size:12px;cursor:pointer;text-align:left}.pie button:hover:not(:disabled){background:#27503f}.pie button:disabled{opacity:.4;cursor:not-allowed}.pie small{color:#9fb5aa}
@media(max-width:620px){.needs{width:170px;padding:8px}.hint{display:none}.nrow>span{width:70px}}`;
