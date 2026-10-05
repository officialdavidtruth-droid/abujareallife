'use client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, RoundedBox } from '@react-three/drei';
import { Suspense, useEffect, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';
import type { RealtimeChannel } from '@supabase/supabase-js';
import Human from './Human';
import { supabase } from '../lib/supabaseClient';
import { MODELS, type Look } from '../lib/characterModels';

type Peer = { look: Look; x: number; z: number; tx: number; tz: number; walk: boolean; r: number; init: boolean };
type Peers = MutableRefObject<Record<string, Peer>>;
type Me = MutableRefObject<{ x: number; z: number; tx: number; tz: number; r: number; walk: boolean }>;
const hex = (c: unknown, d: string) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : d);
const num = (v: unknown, d = 0) => (typeof v === 'number' && isFinite(v) ? THREE.MathUtils.clamp(v, -28, 28) : d);
const cleanLook = (l: Partial<Look> | undefined, name: string): Look => ({ name, model: MODELS.some(m => m.id === l?.model) ? String(l?.model) : MODELS[0].id, skin: hex(l?.skin, '#8b552f'), outfit: hex(l?.outfit, '#126c4b'), height: THREE.MathUtils.clamp(Number(l?.height) || 1, .9, 1.1) });
const turn = (r: number, t: number, f: number) => r + ((((t - r + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) * f;
const cam = new THREE.Vector3();

function Tag({ name, say }: { name: string; say?: string }) {
  return <Html position={[0, 2.35, 0]} center zIndexRange={[5, 0]}><div className="nTag">{say && <div className="nSay">{say}</div>}<span>{name}</span></div></Html>;
}
function Remote({ name, peers, bub }: { name: string; peers: Peers; bub: Record<string, string> }) {
  const g = useRef<THREE.Group>(null!);
  useFrame((_, dt) => {
    const q = peers.current[name]; if (!q) return;
    const dx = q.tx - q.x, dz = q.tz - q.z, d = Math.hypot(dx, dz);
    q.walk = d > .15; q.x += dx * Math.min(1, dt * 8); q.z += dz * Math.min(1, dt * 8);
    if (q.walk) q.r = turn(q.r, Math.atan2(dx, dz), Math.min(1, dt * 10));
    g.current.position.set(q.x, 0, q.z); g.current.rotation.y = q.r;
  });
  const p = peers.current[name]; if (!p) return null;
  return <group ref={g}><Human look={p.look} getState={() => (peers.current[name]?.walk ? 'walk' : 'idle')} /><Tag name={name} say={bub[name]} /></group>;
}
function Scene({ me, peers, ch, look, roster, bub, onNear }: { me: Me; peers: Peers; ch: MutableRefObject<RealtimeChannel | null>; look: Look; roster: string[]; bub: Record<string, string>; onNear: (dt: number) => void }) {
  const { camera } = useThree(), g = useRef<THREE.Group>(null!), t = useRef(0), was = useRef(false);
  useFrame((_, dt) => {
    const m = me.current, dx = m.tx - m.x, dz = m.tz - m.z, d = Math.hypot(dx, dz);
    m.walk = d > .1;
    if (m.walk) { const st = Math.min(d, 3.2 * dt); m.x += dx / d * st; m.z += dz / d * st; m.r = Math.atan2(dx, dz); }
    g.current.position.set(m.x, 0, m.z); g.current.rotation.y = m.r;
    camera.position.lerp(cam.set(m.x + 7, 10, m.z + 9), .08); camera.lookAt(m.x, 0, m.z);
    t.current += dt;
    if (t.current > .12 && (m.walk || was.current)) { t.current = 0; was.current = m.walk; ch.current?.send({ type: 'broadcast', event: 'pos', payload: { u: look.name, x: m.x, z: m.z } }); }
    if (Object.values(peers.current).some(p => Math.hypot(p.x - m.x, p.z - m.z) < 3)) onNear(dt);
  });
  const houses: [number, number, string][] = [[-12, -10, '#c58b5a'], [-4, -12, '#7aa0b8'], [6, -11, '#d9b36a'], [14, -9, '#a56d78'], [-14, 10, '#8aa77c'], [14, 11, '#b98a5d']];
  return <>
    <hemisphereLight args={['#dff0ff', '#5a6b4a', 1.5]} /><directionalLight position={[10, 16, 8]} intensity={2.4} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-30} shadow-camera-right={30} shadow-camera-top={30} shadow-camera-bottom={-30} />
    <mesh rotation-x={-Math.PI / 2} receiveShadow onClick={e => { if (e.delta > 4) return; e.stopPropagation(); me.current.tx = num(e.point.x); me.current.tz = num(e.point.z); }}><planeGeometry args={[70, 70]} /><meshStandardMaterial color="#5b8a4f" /></mesh>
    {[[0, 0, 70, 4], [0, 0, 4, 70]].map(([x, z, w, d], i) => <mesh key={i} rotation-x={-Math.PI / 2} position={[x, .02, z]} receiveShadow><planeGeometry args={[w, d]} /><meshStandardMaterial color="#3a3f46" /></mesh>)}
    <mesh rotation-x={-Math.PI / 2} position={[0, .03, 0]}><circleGeometry args={[4, 32]} /><meshStandardMaterial color="#9a8f7a" /></mesh>
    {houses.map(([x, z, c], i) => <group key={i} position={[x, 0, z]}><RoundedBox args={[6, 3.2, 5]} radius={.1} position={[0, 1.6, 0]} castShadow receiveShadow><meshStandardMaterial color={c} /></RoundedBox><RoundedBox args={[6.6, .4, 5.6]} radius={.08} position={[0, 3.4, 0]} castShadow><meshStandardMaterial color="#6b3f2a" /></RoundedBox></group>)}
    {[[-8, 6], [8, 7], [-7, -5], [9, -4], [-20, 0], [20, 2]].map(([x, z], i) => <group key={i} position={[x, 0, z]}><mesh position={[0, .9, 0]} castShadow><cylinderGeometry args={[.18, .24, 1.8, 8]} /><meshStandardMaterial color="#5a3a22" /></mesh><mesh position={[0, 2.5, 0]} castShadow><sphereGeometry args={[1.4, 14, 10]} /><meshStandardMaterial color="#2f6b3a" /></mesh></group>)}
    <group ref={g}><Suspense fallback={null}><Human look={look} getState={() => (me.current.walk ? 'walk' : 'idle')} /></Suspense><Tag name={look.name} say={bub[look.name]} /></group>
    <Suspense fallback={null}>{roster.filter(n => n !== look.name).map(n => <Remote key={n} name={n} peers={peers} bub={bub} />)}</Suspense>
  </>;
}

export default function Neighborhood({ look, onNear }: { look: Look; onNear: (dt: number) => void }) {
  const peers = useRef<Record<string, Peer>>({}), me = useRef({ x: 0, z: 8, tx: 0, tz: 8, r: Math.PI, walk: false }), ch = useRef<RealtimeChannel | null>(null);
  const muted = useRef(new Set<string>()), lastSend = useRef(0);
  const [roster, setRoster] = useState<string[]>([]), [log, setLog] = useState<{ u: string; t: string }[]>([]), [bub, setBub] = useState<Record<string, string>>({});
  const [txt, setTxt] = useState(''), [status, setStatus] = useState(supabase ? 'Connecting…' : 'off'), [, force] = useState(0);

  const say = (u: string, t: string) => {
    setLog(l => [...l.slice(-30), { u, t }]); setBub(b => ({ ...b, [u]: t }));
    setTimeout(() => setBub(b => { if (b[u] !== t) return b; const n = { ...b }; delete n[u]; return n; }), 6000);
  };
  useEffect(() => {
    if (!supabase) return;
    const c = supabase.channel('neighborhood:abuja-1', { config: { presence: { key: look.name }, broadcast: { self: false } } });
    c.on('presence', { event: 'sync' }, () => {
      const st = c.presenceState() as Record<string, { look?: Partial<Look> }[]>, names = Object.keys(st);
      names.forEach(n => { if (n !== look.name && !peers.current[n]) peers.current[n] = { look: cleanLook(st[n][0]?.look, n), x: 0, z: 8, tx: 0, tz: 8, walk: false, r: 0, init: false }; });
      Object.keys(peers.current).forEach(n => { if (!names.includes(n)) delete peers.current[n]; });
      setRoster(names);
    })
      .on('broadcast', { event: 'pos' }, ({ payload }) => {
        const p = peers.current[String(payload?.u)]; if (!p) return;
        p.tx = num(payload.x); p.tz = num(payload.z, 8);
        if (!p.init) { p.x = p.tx; p.z = p.tz; p.init = true; }
      })
      .on('broadcast', { event: 'chat' }, ({ payload }) => {
        const u = String(payload?.u), t = String(payload?.t || '').trim().slice(0, 120);
        if (t && peers.current[u] && !muted.current.has(u)) say(u, t);
      })
      .subscribe(async s => {
        if (s === 'SUBSCRIBED') { await c.track({ look }); setStatus('online'); }
        else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') setStatus('Connection problem');
      });
    ch.current = c;
    return () => { supabase?.removeChannel(c); ch.current = null; peers.current = {}; };
  }, [look]);

  const send = () => {
    const t = txt.trim().slice(0, 120), now = Date.now();
    if (!t || now - lastSend.current < 1500) return;
    lastSend.current = now; setTxt(''); say(look.name, t);
    ch.current?.send({ type: 'broadcast', event: 'chat', payload: { u: look.name, t } });
  };
  if (status === 'off') return <div className="nOff"><b>Multiplayer isn’t set up yet.</b><span>Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your environment, then reload.</span></div>;
  return <div className="nWrap">
    <Canvas shadows dpr={[1, 1.75]} camera={{ position: [7, 10, 17], fov: 42 }}><color attach="background" args={['#bfdcf2']} />
      <Scene me={me} peers={peers} ch={ch} look={look} roster={roster} bub={bub} onNear={onNear} /></Canvas>
    <div className="nRoster"><b>🏙️ Abuja Neighborhood · {status}</b><span>{roster.length} online</span>
      {roster.filter(n => n !== look.name).map(n => <button key={n} onClick={() => { muted.current.has(n) ? muted.current.delete(n) : muted.current.add(n); force(x => x + 1); }}>{muted.current.has(n) ? '🔇' : '💬'} {n}</button>)}</div>
    <div className="nChat"><div className="nLog">{log.slice(-6).map((m, i) => <div key={i}><b>{m.u}:</b> {m.t}</div>)}</div>
      <div className="nIn"><input value={txt} maxLength={120} placeholder="Say something…" onChange={e => setTxt(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} /><button onClick={send}>Send</button></div></div>
    <div className="nHint">Click the ground to walk · Stand near others to fill Social · Tap a name to mute</div>
    <style>{`.nWrap{position:absolute;inset:0}.nWrap canvas{display:block}.nOff{position:absolute;inset:0;display:grid;place-content:center;gap:8px;text-align:center;background:#07100d;padding:24px}.nOff span{color:#9fb5aa;font-size:13px}
.nTag{display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none}.nTag span{background:#07100dcc;border:1px solid #ffffff33;border-radius:6px;padding:2px 7px;font-size:11px;color:#fff;white-space:nowrap}.nSay{background:#fff;color:#000;border-radius:12px;padding:5px 10px;font-size:12px;max-width:180px;text-align:center;box-shadow:0 2px 8px #0005}
.nRoster{position:absolute;right:10px;top:56px;width:190px;background:#10201ae6;border:1px solid #ffffff2a;border-radius:14px;padding:10px;display:flex;flex-direction:column;gap:5px;font-size:11px;max-height:40vh;overflow:auto}.nRoster span{color:#9fb5aa}.nRoster button{background:#14261f;border:1px solid #2a4337;color:#cfe;border-radius:8px;padding:6px;text-align:left;cursor:pointer;font-size:11px}
.nChat{position:absolute;right:10px;bottom:10px;width:min(320px,60vw);display:flex;flex-direction:column;gap:6px}.nLog{background:#10201acc;border-radius:12px;padding:8px 10px;font-size:12px;min-height:30px;display:flex;flex-direction:column;gap:3px}.nIn{display:flex;gap:6px}.nIn input{flex:1;background:#0a1511;border:1px solid #2a4337;border-radius:10px;padding:10px;color:#fff;font-size:13px}.nIn button{background:#d99a42;color:#1a1208;border:0;border-radius:10px;padding:0 14px;font-weight:800;cursor:pointer}
.nHint{position:absolute;left:12px;bottom:12px;font-size:10px;color:#fffc;text-shadow:0 1px 3px #000;max-width:210px}@media(max-width:620px){.nRoster{display:none}.nHint{display:none}}`}</style>
  </div>;
}
