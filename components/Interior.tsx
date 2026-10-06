'use client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Text } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import Human from './Human';
import { CITY } from '../lib/cityData';
import { buildInterior, type Interior as Room, type Opt, type Spot } from '../lib/interiors';
import { ROOM, useRoomNet } from '../lib/roomNet';
import { CRIMES, POLICE_ARREST_RANGE, QUESTS, type Profile } from '../lib/profile';
import type { Look } from '../lib/characterModels';

type Ctl = { keys: Set<string>; joy: { x: number; y: number }; run: boolean; act: boolean };
const naira = (n: number) => '₦' + Math.round(n).toLocaleString();
const post = async (url: string, body?: object) => { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) }); return { ok: r.ok, d: await r.json().catch(() => ({})) as any }; };
const isCop = (l: Look) => l.outfitModel === 'uniform';

function Walls({ room }: { room: Room }) {
  const { w, d } = room, t = .3, H = 2.8, c = room.wall;
  const m = <meshStandardMaterial color={c} />;
  return <group>
    <mesh position={[0, H / 2, -d / 2]}><boxGeometry args={[w, H, t]} />{m}</mesh>
    <mesh position={[-w / 2, H / 2, 0]}><boxGeometry args={[t, H, d]} />{m}</mesh><mesh position={[w / 2, H / 2, 0]}><boxGeometry args={[t, H, d]} />{m}</mesh>
    <mesh position={[-(w / 2 + 1) / 2, .5, d / 2]}><boxGeometry args={[w / 2 - 1, 1, t]} />{m}</mesh><mesh position={[(w / 2 + 1) / 2, .5, d / 2]}><boxGeometry args={[w / 2 - 1, 1, t]} />{m}</mesh>
    <mesh rotation-x={-Math.PI / 2} position={[0, 0, d / 2 + .9]}><planeGeometry args={[2.2, 2]} /><meshStandardMaterial color="#d99a42" /></mesh>
  </group>;
}
function Furniture({ room }: { room: Room }) {
  return <group>{room.items.map((i, k) => <mesh key={k} position={[i.x, (i.y ?? 0) + i.h / 2, i.z]} castShadow>
    {i.round ? <cylinderGeometry args={[i.w / 2, i.w / 2, i.h, 20]} /> : <boxGeometry args={[i.w, i.h, i.d]} />}
    <meshStandardMaterial color={i.c} emissive={i.glow ? i.c : '#000'} emissiveIntensity={i.glow ? .7 : 0} roughness={.8} /></mesh>)}</group>;
}
function SpotMark({ s, active }: { s: Spot; active: boolean }) {
  return <group position={[s.x, 0, s.z]}><mesh rotation-x={-Math.PI / 2} position={[0, .03, 0]}><ringGeometry args={[.7, .95, 32]} /><meshBasicMaterial color={active ? '#ffd166' : '#3fb98a'} /></mesh>
    <Html position={[0, 1.7, 0]} center zIndexRange={[5, 0]}><div className="inLbl">{s.e} {s.label}</div></Html></group>;
}
function Remote({ name, bub }: { name: string; bub?: string }) {
  const g = useRef<THREE.Group>(null!), p = ROOM.peers[name]; if (!p) return null;
  useFrame((_, dt) => { const q = ROOM.peers[name]; if (!q) return; const k = 1 - Math.exp(-10 * dt); q.x += (q.tx - q.x) * k; q.z += (q.tz - q.z) * k; let dr = q.tr - q.r; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); q.r += dr * k; g.current.position.set(q.x, 0, q.z); g.current.rotation.y = q.r; });
  return <group ref={g}><Human look={p.look} getState={() => (ROOM.peers[name]?.mv ? 'walk' : 'idle')} />
    <Html position={[0, 2.5, 0]} center zIndexRange={[5, 0]}><div className="inTag">{bub && <div className="inSay">{bub}</div>}<span>{isCop(p.look) ? '👮 ' : ''}{name}</span></div></Html></group>;
}
function Player({ look, room, ctl, onSpot, onExit, frozen }: { look: Look; room: Room; ctl: React.MutableRefObject<Ctl>; onSpot: (s: Spot | null) => void; onExit: () => void; frozen: boolean }) {
  const g = useRef<THREE.Group>(null!), p = useRef({ x: 0, z: room.d / 2 - 1.8, r: Math.PI }), mv = useRef(false), cur = useRef<string | null>(null), out = useRef(false), { camera } = useThree();
  const solids = useMemo(() => room.items.filter(i => i.solid).map(i => ({ x0: i.x - i.w / 2, x1: i.x + i.w / 2, z0: i.z - i.d / 2, z1: i.z + i.d / 2 })), [room]);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, .05), c = ctl.current, k = c.keys, q = p.current;
    const ix = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0) + c.joy.x, iz = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0) + c.joy.y, len = Math.hypot(ix, iz);
    mv.current = len > .15 && !frozen;
    if (mv.current) { const sp = c.run || k.has('shift') ? 5.6 : 3.4; q.x += ix / len * sp * dt; q.z += iz / len * sp * dt; q.r = Math.atan2(ix, iz); }
    const hx = room.w / 2 - .45, door = Math.abs(q.x) < 1;
    q.x = THREE.MathUtils.clamp(q.x, -hx, hx); q.z = Math.max(q.z, -room.d / 2 + .4); if (!door) q.z = Math.min(q.z, room.d / 2 - .45); else q.z = Math.min(q.z, room.d / 2 + 1.4);
    for (const s of solids) { const cx = THREE.MathUtils.clamp(q.x, s.x0, s.x1), cz = THREE.MathUtils.clamp(q.z, s.z0, s.z1), dx = q.x - cx, dz = q.z - cz, d = Math.hypot(dx, dz);
      if (d < .38) { if (d > 1e-4) { q.x = cx + dx / d * .38; q.z = cz + dz / d * .38; } else { const l = q.x - s.x0, r = s.x1 - q.x, t = q.z - s.z0, b = s.z1 - q.z, m = Math.min(l, r, t, b); if (m === l) q.x = s.x0 - .38; else if (m === r) q.x = s.x1 + .38; else if (m === t) q.z = s.z0 - .38; else q.z = s.z1 + .38; } } }
    if (q.z > room.d / 2 + .55 && !out.current) { out.current = true; onExit(); }
    g.current.position.set(q.x, 0, q.z); g.current.rotation.y = q.r; ROOM.me.x = q.x; ROOM.me.z = q.z; ROOM.me.r = q.r; ROOM.me.mv = mv.current ? 1 : 0;
    const tx = q.x, tz = q.z + 7.5; camera.position.lerp(new THREE.Vector3(tx, 8.5, tz), 1 - Math.exp(-6 * dt)); camera.lookAt(q.x, .8, q.z - .5);
    let best: Spot | null = null, bd = 1.9; for (const s of room.spots) { const d = Math.hypot(s.x - q.x, s.z - q.z); if (d < bd) { bd = d; best = s; } }
    if ((best?.id ?? null) !== cur.current) { cur.current = best?.id ?? null; onSpot(best); }
  });
  return <group ref={g}><Human look={look} getState={() => (mv.current ? 'walk' : 'idle')} /></group>;
}

export default function Interior({ bizId, look, profile, onExit, onFx, onCash }: { bizId: string; look: Look; profile: Profile; onExit: (jailed?: boolean) => void; onFx: (fx: Record<string, number>) => void; onCash: (n: number) => void }) {
  const biz = CITY.businesses.find(b => b.id === bizId)!, room = useMemo(() => buildInterior(biz), [biz]), net = useRoomNet(bizId, look);
  const ctl = useRef<Ctl>({ keys: new Set(), joy: { x: 0, y: 0 }, run: false, act: false });
  const [spot, setSpot] = useState<Spot | null>(null), [menu, setMenu] = useState<Spot | null>(null), [msg, setMsg] = useState(''), [txt, setTxt] = useState('');
  const [job, setJob] = useState<{ kind: 'shift' | 'quest'; id: string | number; end: number; label: string } | null>(null), [, tick] = useState(0), [near, setNear] = useState<string | null>(null);
  const toast = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 4500); };
  const left = job ? Math.max(0, Math.ceil((job.end - Date.now()) / 1000)) : 0;
  useEffect(() => { const i = setInterval(() => { tick(x => x + 1); let b: string | null = null, bd = POLICE_ARREST_RANGE; Object.entries(ROOM.peers).forEach(([n, q]) => { const d = Math.hypot(q.x - ROOM.me.x, q.z - ROOM.me.z); if (d < bd) { bd = d; b = n; } }); setNear(b); }, 400); return () => clearInterval(i); }, []);
  useEffect(() => { // someone may have arrested me while I was inside
    const f = async () => { const r = await fetch('/api/status'); if (!r.ok) return; const d = await r.json(); onCash(d.cash); if (d.jailLeft > 0) onExit(true); }; const i = setInterval(f, 4000); return () => clearInterval(i);
  }, [onCash, onExit]);
  useEffect(() => {
    const typing = (e: Event) => { const t = e.target as HTMLElement | null; return !!t && (t.tagName === 'INPUT' || t.isContentEditable); };
    const dn = (e: KeyboardEvent) => { if (typing(e)) return; const k = e.key.toLowerCase(); if (k === 'e' && !e.repeat) ctl.current.act = true; ctl.current.keys.add(k); }, up = (e: KeyboardEvent) => ctl.current.keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', dn); window.addEventListener('keyup', up); return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
  }, []);
  useEffect(() => { if (ctl.current.act) { ctl.current.act = false; } }, []);
  useEffect(() => { const i = setInterval(() => { if (ctl.current.act) { ctl.current.act = false; if (spot) setMenu(spot); } }, 100); return () => clearInterval(i); }, [spot]);
  useEffect(() => { if (!spot) setMenu(null); }, [spot]);

  const cops = () => Object.values(ROOM.peers).filter(q => isCop(q.look) && Math.hypot(q.x - ROOM.me.x, q.z - ROOM.me.z) < 25).length;
  useEffect(() => { if (job && left === 0) (async () => {
    const r = job.kind === 'shift' ? await post('/api/shift', { action: 'finish' }) : await post('/api/quest', { action: 'finish', id: job.id }); setJob(null);
    if (r.ok) { onCash(r.d.cash); toast(`Done: +${naira(r.d.pay ?? r.d.reward)}${r.d.heatAdded ? ' · heat up 🔥' : ''}`); } else toast(r.d.error);
  })(); }, [left, job]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (o: Opt) => {
    if (job) return toast('Finish what you are doing first.');
    if (o.t === 'shift') { const r = await post('/api/shift', { action: 'start', idx: o.idx }); if (!r.ok) return toast(r.d.error); setJob({ kind: 'shift', id: o.idx, end: Date.now() + r.d.secs * 1000, label: o.label }); setMenu(null); }
    else if (o.t === 'quest') { const q = QUESTS.find(x => x.id === o.id)!, r = await post('/api/quest', { action: 'start', id: o.id }); if (!r.ok) return toast(r.d.error); setJob({ kind: 'quest', id: o.id, end: Date.now() + r.d.secs * 1000, label: q.title }); setMenu(null); }
    else if (o.t === 'shop') { const r = await post('/api/shop', { item: o.id }); if (!r.ok) return toast(r.d.error); onCash(r.d.cash); onFx(r.d.fx); toast(`Bought: ${o.label}`); }
    else if (o.t === 'crime') { const r = await post('/api/crime', { kind: o.id, policeNearby: cops() }); if (!r.ok) return toast(r.d.error); onCash(r.d.cash);
      if (r.d.jailSecs) { toast('🚔 Caught by an officer!'); setTimeout(() => onExit(true), 1200); } else toast(r.d.caught ? '😬 It went wrong. You are WANTED.' : `💰 You got away with ${naira(r.d.loot)}${r.d.wanted ? ' · WANTED' : ''}`); setMenu(null); }
  };
  const arrest = async () => { if (!near) return; const r = await post('/api/arrest', { target: near }); toast(r.ok ? `🚔 ${near} arrested. +${naira(r.d.reward)}` : r.d.error); };
  const qName = (id: string) => QUESTS.find(q => q.id === id)!;
  const stick = useRef<HTMLDivElement>(null), knob = useRef<HTMLElement>(null);
  const joy = (e: React.PointerEvent, on: boolean) => { const r = stick.current!.getBoundingClientRect(); let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2); const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } ctl.current.joy = on ? { x, y } : { x: 0, y: 0 }; if (knob.current) knob.current.style.transform = `translate(calc(-50% + ${on ? x * 30 : 0}px),calc(-50% + ${on ? y * 30 : 0}px))`; };

  return <div className="inWrap">
    <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0, 8.5, room.d / 2 + 6], fov: 50 }}>
      <color attach="background" args={['#0b1210']} /><hemisphereLight args={['#ffffff', '#555566', 1.1]} /><directionalLight position={[4, 9, 5]} intensity={1.6} castShadow />
      <pointLight position={[0, 2.6, 0]} intensity={14} distance={20} color={biz.type === 'Nightclub' ? '#a855f7' : '#fff1d6'} />
      <mesh rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[room.w, room.d]} /><meshStandardMaterial color={room.floor} roughness={.9} /></mesh>
      <Walls room={room} /><Furniture room={room} />
      {room.spots.map(s => <SpotMark key={s.id} s={s} active={spot?.id === s.id} />)}
      <Text position={[0, 2.2, -room.d / 2 + .25]} fontSize={.55} color="#fff" anchorX="center">{biz.name}</Text>
      <Player look={look} room={room} ctl={ctl} onSpot={setSpot} onExit={() => onExit()} frozen={!!menu} />
      {net.roster.map(n => ROOM.peers[n] && <Remote key={n + net.ver} name={n} bub={net.bub[n]} />)}
    </Canvas>
    <div className="inTop"><b>{biz.name}</b><span>{biz.type} · {net.enabled ? `${net.roster.length + 1} inside` : 'solo'}</span><button onClick={() => onExit()}>🚪 Leave</button></div>
    {job && <div className="inToast">⏳ {job.label}: {left}s</div>}{msg && <div className="inToast">{msg}</div>}
    {spot && !menu && !job && <button className="inAct" onClick={() => setMenu(spot)}>{spot.e} {spot.label} <small>(E)</small></button>}
    {profile.profession === 'police' && near && <button className="inAct cop" onClick={arrest}>👮 Arrest {near}</button>}
    {menu && <div className="inMenu"><button className="x" onClick={() => setMenu(null)}>×</button><h3>{menu.e} {menu.label}</h3>
      {menu.opts.map((o, i) => o.t === 'info' ? <p key={i}>{o.text}</p> : <button key={i} onClick={() => run(o)}>
        {o.t === 'shift' && <><b>{o.label}</b><small>+{naira(o.pay)} · 25s{o.idx >= 2 ? ' · rank 2' : ''}</small></>}
        {o.t === 'shop' && <><b>{o.label}</b><small>-{naira(o.cost)}</small></>}
        {o.t === 'quest' && <><b>{qName(o.id).title}</b><small>{qName(o.id).blurb} · +{naira(qName(o.id).reward)} · {qName(o.id).secs}s{qName(o.id).legal ? '' : ' · 🔥 illegal'}</small></>}
        {o.t === 'crime' && <><b>{CRIMES[o.id].label}</b><small>{naira(CRIMES[o.id].loot[0])}–{naira(CRIMES[o.id].loot[1])} · +{CRIMES[o.id].heat} heat · officers inside make it riskier</small></>}</button>)}</div>}
    {net.enabled && <div className="inChat">{net.log.slice(-3).map(m => <div key={m.id}><b>{m.u}</b> {m.t}</div>)}<input placeholder="Say something…" maxLength={120} value={txt} onChange={e => setTxt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && net.send(txt)) setTxt(''); }} /></div>}
    <div className="inStick" ref={stick} onPointerDown={e => { (e.target as Element).setPointerCapture(e.pointerId); joy(e, true); }} onPointerMove={e => e.buttons && joy(e, true)} onPointerUp={e => joy(e, false)} onPointerCancel={e => joy(e, false)}><i ref={knob as React.RefObject<HTMLElement>} /></div>
    <style>{`.inWrap{position:absolute;inset:0;z-index:8;background:#0b1210}.inWrap canvas{display:block}.inTop{position:absolute;left:12px;top:56px;display:flex;gap:10px;align-items:center;background:#10201ae6;border:1px solid #ffffff20;border-radius:12px;padding:8px 12px;color:#fff;font-size:12px}.inTop span{color:#a8bbb2}.inTop button{background:#d99a42;border:0;border-radius:8px;padding:6px 10px;font-weight:800}
.inToast{position:absolute;left:50%;transform:translateX(-50%);top:110px;background:#000c;color:#fff;border-radius:12px;padding:9px 14px;font-size:13px;max-width:90vw;text-align:center}
.inAct{position:absolute;left:50%;transform:translateX(-50%);bottom:150px;background:#d99a42;color:#111;border:0;border-radius:14px;padding:12px 18px;font-weight:900;font-size:14px}.inAct.cop{bottom:100px;background:#2563eb;color:#fff}
.inMenu{position:absolute;left:50%;transform:translateX(-50%);bottom:90px;width:min(380px,calc(100vw - 24px));max-height:55vh;overflow:auto;background:#09130ff7;border:1px solid #ffffff22;border-radius:16px;padding:14px;color:#fff;display:flex;flex-direction:column;gap:7px}.inMenu h3{margin:0}.inMenu .x{position:absolute;right:8px;top:2px;background:none;border:0;color:#fff;font-size:24px}.inMenu button:not(.x){text-align:left;background:#13231d;color:#fff;border:1px solid #ffffff18;border-radius:10px;padding:9px}.inMenu small{display:block;color:#9fb5aa;margin-top:2px}.inMenu p{margin:0;color:#9fb5aa;font-size:12px}
.inChat{position:absolute;left:12px;bottom:14px;width:min(260px,50vw);font-size:11px;color:#fff;display:flex;flex-direction:column;gap:3px}.inChat div{background:#000a;border-radius:8px;padding:3px 7px}.inChat input{background:#0a1511;border:1px solid #2a4337;border-radius:9px;padding:8px;color:#fff;font-size:12px}
.inStick{position:absolute;right:18px;bottom:18px;width:110px;height:110px;border-radius:50%;background:#0005;border:2px solid #ffffff33;touch-action:none}.inStick i{position:absolute;left:50%;top:50%;width:46px;height:46px;border-radius:50%;background:#ffffffaa;transform:translate(-50%,-50%)}
.inLbl{background:#09130fe8;color:#fff;border:1px solid #ffffff22;border-radius:8px;padding:3px 7px;font-size:10px;white-space:nowrap}.inTag{display:flex;flex-direction:column;align-items:center;gap:3px}.inTag span{background:#09130fe8;color:#fff;border-radius:8px;padding:2px 6px;font-size:10px}.inSay{background:#fff;color:#111;border-radius:10px;padding:4px 8px;font-size:11px;max-width:160px;text-align:center}
@media(min-width:900px){.inStick{display:none}}`}</style>
  </div>;
}
