'use client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Text } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import Human from './Human';
import { CITY } from '../lib/cityData';
import { MGR_TASK_PAY, fmtClock } from '../lib/work';
import { makeNav } from '../lib/nav';
import { GAME_LABEL_CSS, INTERIOR_UI_CSS } from '../lib/gameLabels';
import StoreModal from './StoreModal';
import { sfx } from '../lib/audio';
import { openSettings } from '../lib/settings';
import { buildInterior, staffLook, type Interior as Room, type Item, type Office, type Opt, type Post, type Spot } from '../lib/interiors';
import { ROOM, useRoomNet } from '../lib/roomNet';
import { CRIMES, POLICE_ARREST_RANGE, QUESTS, type Profile } from '../lib/profile';
import type { Look } from '../lib/characterModels';

type Go = { path: [number, number][]; i: number; stuck: number; open?: { kind: 'spot'; id: string } | { kind: 'npc'; idx: number } };
type Cam = { yaw: number; pitch: number; dist: number };
const STAFF_POS: Record<number, { x: number; z: number }> = {}; // where each NPC is right now, so you can walk up to them
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
function DecorSet({ kind, items }: { kind: 'box' | 'cyl' | 'sph'; items: Item[] }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  useLayoutEffect(() => {
    const m = ref.current, o = new THREE.Object3D(), c = new THREE.Color();
    items.forEach((i, k) => { o.position.set(i.x, (i.y ?? 0) + (i.lay ? i.w / 2 : i.h / 2), i.z); o.rotation.set(i.lay ? Math.PI / 2 : 0, 0, 0); o.scale.set(i.w, i.h, i.d); o.updateMatrix(); m.setMatrixAt(k, o.matrix); m.setColorAt(k, c.set(i.c)); });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [items]);
  return <instancedMesh ref={ref} args={[undefined, undefined, items.length]} castShadow>
    {kind === 'box' ? <boxGeometry args={[1, 1, 1]} /> : kind === 'cyl' ? <cylinderGeometry args={[.5, .5, 1, 14]} /> : <sphereGeometry args={[.5, 12, 10]} />}
    <meshStandardMaterial roughness={.7} /></instancedMesh>;
}
// Everything on display (products, plates, monitors, plants, signs...) is drawn with 3 instanced meshes, so it stays cheap on phones.
function Decor({ room }: { room: Room }) {
  const g = useMemo(() => ({ box: room.decor.filter(i => !i.round && !i.sphere), cyl: room.decor.filter(i => i.round), sph: room.decor.filter(i => i.sphere) }), [room]);
  return <group>{(['box', 'cyl', 'sph'] as const).map(k => g[k].length ? <DecorSet key={k + g[k].length} kind={k} items={g[k]} /> : null)}</group>;
}
// An NPC employee at their post: desk staff work in place, others walk their rounds. If a player on a shift is standing at the post, the NPC steps aside.
function Staff({ post, look, onTalk }: { post: Post; look: Look; onTalk: (idx: number) => void }) {
  const g = useRef<THREE.Group>(null!), tag = useRef<HTMLDivElement>(null), hid = useRef(false), [occ, setOcc] = useState(false), hx = post.stand?.[0] ?? post.x, hz = post.stand?.[1] ?? post.z;
  const s = useRef({ x: post.patrol ? post.patrol[0][0] : post.x, z: post.patrol ? post.patrol[0][1] : post.z, r: post.r, seg: 1, wait: 1 + (post.idx % 3), mv: false });
  useEffect(() => {
    const here = (x: number, z: number, w: number) => Math.abs(w) === post.idx + 1 && Math.hypot(x - hx, z - hz) < 1.8;
    const i = setInterval(() => setOcc(here(ROOM.me.x, ROOM.me.z, ROOM.me.w) || Object.values(ROOM.peers).some(p => here(p.x, p.z, p.w))), 300); return () => clearInterval(i);
  }, [post, hx, hz]);
  useFrame((_, dtRaw) => {
    const q = s.current, dt = Math.min(dtRaw, .05); if (!g.current) return;
    if (post.patrol) {
      if (q.wait > 0) { q.wait -= dt; q.mv = false; }
      else { const t = post.patrol[q.seg % post.patrol.length], dx = t[0] - q.x, dz = t[1] - q.z, d = Math.hypot(dx, dz);
        if (d < .08) { q.seg = (q.seg + 1) % post.patrol.length; q.wait = 2.5 + ((post.idx + q.seg) % 3); q.mv = false; }
        else { const st = Math.min(d, 1.15 * dt); q.x += dx / d * st; q.z += dz / d * st; q.mv = true; let dr = Math.atan2(dx, dz) - q.r; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); q.r += dr * Math.min(1, dt * 8); } }
    }
    g.current.position.set(q.x, post.y ?? 0, q.z); g.current.rotation.y = q.r; STAFF_POS[post.idx] = { x: q.x, z: q.z };
    const nr = Math.hypot(ROOM.me.x - q.x, ROOM.me.z - q.z) < 1.9; if (nr !== hid.current && tag.current) { hid.current = nr; tag.current.classList.toggle('near', nr); } // name plate steps out of the way when you are close
  });
  if (occ) return null;
  const anim = () => { const near = Math.hypot(ROOM.me.x - s.current.x, ROOM.me.z - s.current.z) < 2.4; return post.anim === 'work' && near && (performance.now() / 1000) % 8 < 3 ? 'wave' : post.anim; };
  return <group ref={g} position={[s.current.x, post.y ?? 0, s.current.z]} rotation-y={post.r} onClick={e => { if (e.delta > 6) return; e.stopPropagation(); onTalk(post.idx); }}>
    <mesh position={[0, 1, 0]}><cylinderGeometry args={[.6, .6, 2, 8]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
    <Human look={look} getState={() => (s.current.mv ? 'walk' : 'idle')} getAnim={post.patrol ? undefined : anim} />
    <Html position={[0, 2.75, 0]} center zIndexRange={[5, 0]}><div className="inTag" ref={tag}><button className="glPlate" onClick={() => onTalk(post.idx)}><b>{look.name}</b><em>{post.title}</em><i>💬</i></button></div></Html></group>;
}
type Mgr = { seat: boolean; title: string; needed: number; daily: number; tasks: { id: string; label: string; mins: number }[]; holder: { name: string; look: Look; until: number } | null;
  me: { isHolder: boolean; holdsSeat: boolean; progress: number; salaryInMs: number; otherSeat: boolean }; active: { label: string; secs: number; left: number } | null };
// The manager's desk. Vacant until someone applies. If the manager is not in the room right now, their character still sits at the desk.
function ManagerSeat({ office, mgr, meName, onTap }: { office: Office; mgr: Mgr | null; meName: string; onTap: () => void }) {
  const [absent, setAbsent] = useState(true), h = mgr?.holder || null, tag = useRef<HTMLDivElement>(null), hid = useRef(false);
  useFrame(() => { const nr = Math.hypot(ROOM.me.x - office.x, ROOM.me.z - office.z) < 2.3; if (nr !== hid.current && tag.current) { hid.current = nr; tag.current.classList.toggle('near', nr); } });
  useEffect(() => { const i = setInterval(() => setAbsent(!h || !(h.name === meName || mgr?.me.isHolder || ROOM.peers[h.name])), 500); return () => clearInterval(i); }, [h, meName, mgr]);
  if (!mgr?.seat) return null; const sitting = !!h && absent;
  return <group>
    <mesh position={[office.x, .6, office.z]} onClick={e => { if (e.delta > 6) return; e.stopPropagation(); onTap(); }}><boxGeometry args={[2.6, 1.2, 1.1]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
    {sitting && <group position={[office.sx, 0, office.sz]}><Human look={h!.look} getState={() => 'idle'} getAnim={() => 'work'} /></group>}
    <Html position={[office.x, sitting ? 2.75 : 2.35, sitting ? office.sz : office.z]} center zIndexRange={[5, 0]}><div className="inTag" ref={tag}><button className={'glPlate ' + (h ? 'boss' : 'vacant')} onClick={onTap}>{h ? <><b>{h.name}</b><em>👔 {office.title}</em></> : <><b>{office.title}</b><em>Vacant · apply!</em><i>!</i></>}</button></div></Html>
  </group>;
}
function SpotMark({ s, active, onTap }: { s: Spot; active: boolean; onTap: (s: Spot) => void }) {
  return <group position={[s.x, 0, s.z]} onClick={e => { if (e.delta > 6) return; e.stopPropagation(); onTap(s); }}><mesh position={[0, .6, 0]}><cylinderGeometry args={[1.1, 1.1, 1.2, 16]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh><mesh rotation-x={-Math.PI / 2} position={[0, .03, 0]}><ringGeometry args={[.7, .95, 32]} /><meshBasicMaterial color={active ? '#ffd166' : '#3fb98a'} /></mesh>
    <Html position={[0, 2.05, 0]} center zIndexRange={[5, 0]}><button className={'inLbl gl-' + s.id + (active ? ' on' : '')} aria-label={s.label} onClick={() => onTap(s)}><span className="glIco">{s.e}</span><span className="glTx">{s.label}</span></button></Html></group>;
}
function Remote({ name, bub }: { name: string; bub?: string }) {
  const g = useRef<THREE.Group>(null!), p = ROOM.peers[name]; if (!p) return null;
  useFrame((_, dt) => { const q = ROOM.peers[name]; if (!q) return; const k = 1 - Math.exp(-10 * dt); q.x += (q.tx - q.x) * k; q.z += (q.tz - q.z) * k; let dr = q.tr - q.r; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); q.r += dr * k; g.current.position.set(q.x, 0, q.z); g.current.rotation.y = q.r; });
  return <group ref={g}><Human look={p.look} getState={() => (ROOM.peers[name]?.mv ? 'walk' : 'idle')} getAnim={() => { const q = ROOM.peers[name]; return q && q.w > 0 && !q.mv ? 'work' : undefined; }} />
    <Html position={[0, 2.5, 0]} center zIndexRange={[5, 0]}><div className="inTag">{bub && <div className="inSay">{bub}</div>}<b className={'glName' + (isCop(p.look) ? ' cop' : '')}>{isCop(p.look) ? '👮 ' : ''}{name}</b></div></Html></group>;
}
function Player({ look, room, ctl, onSpot, onExit, frozen, snap, lock, onBlocked, cam, go, onArrive }: { look: Look; room: Room; ctl: React.MutableRefObject<Ctl>; onSpot: (s: Spot | null) => void; onExit: () => void; frozen: boolean; snap: React.MutableRefObject<{ x: number; z: number; r: number } | null>; lock: React.MutableRefObject<boolean>; onBlocked: () => void; cam: React.MutableRefObject<Cam>; go: React.MutableRefObject<Go | null>; onArrive: (o: NonNullable<Go['open']>) => void }) {
  const g = useRef<THREE.Group>(null!), p = useRef({ x: 0, z: room.d / 2 - 1.8, r: Math.PI }), mv = useRef(false), cur = useRef<string | null>(null), out = useRef(false), { camera } = useThree();
  const solids = useMemo(() => room.items.filter(i => i.solid).map(i => ({ x0: i.x - i.w / 2, x1: i.x + i.w / 2, z0: i.z - i.d / 2, z1: i.z + i.d / 2 })), [room]);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, .05), c = ctl.current, k = c.keys, q = p.current;
    if (snap.current) { q.x = snap.current.x; q.z = snap.current.z; q.r = snap.current.r; snap.current = null; } // starting a shift puts you at your post; you can still walk away
    const rx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0) + c.joy.x, rz = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0) + c.joy.y, cm = cam.current;
    if (k.has('q')) cm.yaw -= 1.8 * dt; if (k.has('r')) cm.yaw += 1.8 * dt;
    const cy = Math.cos(cm.yaw), sy = Math.sin(cm.yaw); let ix = rx * cy + rz * sy, iz = -rx * sy + rz * cy; // stick and keys are relative to where the camera looks
    const manual = Math.hypot(rx, rz) > .15; if (manual && go.current) go.current = null; // touching the stick cancels tap-to-walk
    if (!manual && go.current && !frozen) { const gg = go.current, t = gg.path[gg.i];
      if (!t) go.current = null; else { const dx = t[0] - q.x, dz = t[1] - q.z, d = Math.hypot(dx, dz);
        if (d < .12) { gg.i++; if (gg.i >= gg.path.length) { const o = gg.open; go.current = null; if (o) onArrive(o); } } else { ix = dx / d; iz = dz / d; } } }
    const len = Math.hypot(ix, iz), lx0 = q.x, lz0 = q.z;
    mv.current = len > .15 && !frozen;
    if (mv.current) { const sp = c.run || k.has('shift') ? 5.6 : 3.4; q.x += ix / len * sp * dt; q.z += iz / len * sp * dt; q.r = Math.atan2(ix, iz); }
    const hx = room.w / 2 - .45, door = Math.abs(q.x) < 1;
    q.x = THREE.MathUtils.clamp(q.x, -hx, hx); q.z = Math.max(q.z, -room.d / 2 + .4); if (!door) q.z = Math.min(q.z, room.d / 2 - .45); else q.z = Math.min(q.z, room.d / 2 + 1.4);
    if (lock.current && door && q.z > room.d / 2 - .6) { q.z = room.d / 2 - .6; if (iz > 0) onBlocked(); } // on shift: the door is closed to you
    for (const s of solids) { const cx = THREE.MathUtils.clamp(q.x, s.x0, s.x1), cz = THREE.MathUtils.clamp(q.z, s.z0, s.z1), dx = q.x - cx, dz = q.z - cz, d = Math.hypot(dx, dz);
      if (d < .38) { if (d > 1e-4) { q.x = cx + dx / d * .38; q.z = cz + dz / d * .38; } else { const l = q.x - s.x0, r = s.x1 - q.x, t = q.z - s.z0, b = s.z1 - q.z, m = Math.min(l, r, t, b); if (m === l) q.x = s.x0 - .38; else if (m === r) q.x = s.x1 + .38; else if (m === t) q.z = s.z0 - .38; else q.z = s.z1 + .38; } } }
    if (go.current && !manual) { go.current.stuck = Math.hypot(q.x - lx0, q.z - lz0) < .15 * dt * 3.4 ? go.current.stuck + dt : 0; if (go.current.stuck > .9) go.current = null; }
    if (q.z > room.d / 2 + .55 && !out.current) { out.current = true; onExit(); }
    g.current.position.set(q.x, 0, q.z); g.current.rotation.y = q.r; ROOM.me.x = q.x; ROOM.me.z = q.z; ROOM.me.r = q.r; ROOM.me.mv = mv.current ? 1 : 0;
    const hp = Math.cos(cm.pitch) * cm.dist; camera.position.lerp(new THREE.Vector3(q.x + Math.sin(cm.yaw) * hp, .8 + Math.sin(cm.pitch) * cm.dist, q.z + Math.cos(cm.yaw) * hp), 1 - Math.exp(-10 * dt)); camera.lookAt(q.x, .8, q.z);
    let best: Spot | null = null, bd = 1.9; for (const s of room.spots) { const d = Math.hypot(s.x - q.x, s.z - q.z); if (d < bd) { bd = d; best = s; } }
    if ((best?.id ?? null) !== cur.current) { cur.current = best?.id ?? null; onSpot(best); }
  });
  return <group ref={g}><Human look={look} getState={() => (mv.current ? 'walk' : 'idle')} getAnim={() => (ROOM.me.w > 0 && !mv.current ? 'work' : undefined)} /></group>;
}

export default function Interior({ bizId, look, profile, onExit, onFx, onCash }: { bizId: string; look: Look; profile: Profile; onExit: (jailed?: boolean) => void; onFx: (fx: Record<string, number>) => void; onCash: (n: number) => void }) {
  const biz = CITY.businesses.find(b => b.id === bizId)!, room = useMemo(() => buildInterior(biz), [biz]), net = useRoomNet(bizId, look);
  const ctl = useRef<Ctl>({ keys: new Set(), joy: { x: 0, y: 0 }, run: false, act: false }), snap = useRef<{ x: number; z: number; r: number } | null>(null), staff = useMemo(() => room.posts.map(p => staffLook(biz, p)), [room, biz]);
  const [store, setStore] = useState(false), [spot, setSpot] = useState<Spot | null>(null), [menu, setMenu] = useState<Spot | null>(null), [msg, setMsg] = useState(''), [txt, setTxt] = useState('');
  const [job, setJob] = useState<{ kind: 'shift' | 'quest' | 'mtask'; id: string | number; end: number; label: string } | null>(null), [, tick] = useState(0), [near, setNear] = useState<string | null>(null);
  const toast = (m: string, bad = false) => { setMsg(m); setTimeout(() => setMsg(''), 4500); sfx(bad ? 'error' : /^(Done|💰|🎉|🚔 .* arrested)/.test(m) ? 'success' : 'pop'); };
  useEffect(() => { sfx('door'); }, []);
  const [mgr, setMgr] = useState<Mgr | null>(null), lock = useRef(false), restored = useRef(false), snappedMgr = useRef(false), blockedAt = useRef(0);
  const cam = useRef<Cam>({ yaw: 0, pitch: .85, dist: 10.5 }), go = useRef<Go | null>(null), nav = useMemo(() => makeNav(room), [room]), pts = useRef(new Map<number, { x: number; y: number }>()), pinch = useRef(0);
  const walk = (x: number, z: number, open?: Go['open']) => { const p = nav.path([ROOM.me.x, ROOM.me.z], [x, z]); if (!p || !p.length) return open ? undefined : toast("Can't walk there.", true); go.current = { path: p, i: 0, stuck: 0, open }; };
  const npcSpot = (idx: number): Spot | null => { const po = room.posts.find(x => x.idx === idx); if (!po) return null; const sp = STAFF_POS[idx] || po, nm = staff[idx]?.name || 'Staff', jobOpt = (room.spots.find(x => x.id === 'work')?.opts || []).filter(o => o.t === 'shift' && o.idx === idx);
    return { id: 'npc' + idx, x: sp.x, z: sp.z, e: '💬', label: `${nm} · ${po.title}`, opts: [{ t: 'info', text: `"Hi, I'm ${nm}, the ${po.title} here.${jobOpt.length ? ' Want this job? Apply below and you will be given a task for the shift.' : ''}"` }, ...jobOpt] }; };
  const talk = (idx: number) => { const sp = STAFF_POS[idx]; if (!sp) return; const dx = ROOM.me.x - sp.x, dz = ROOM.me.z - sp.z, d = Math.hypot(dx, dz); if (d < 3.2) { setMenu(npcSpot(idx)); return; } setMenu(null); walk(sp.x + dx / d * 1.4, sp.z + dz / d * 1.4, { kind: 'npc', idx }); };
  const goSpot = (sp: Spot) => { if (Math.hypot(sp.x - ROOM.me.x, sp.z - ROOM.me.z) < 1.5) { setMenu(sp); return; } setMenu(null); walk(sp.x, sp.z, { kind: 'spot', id: sp.id }); };
  const arrive = (o: NonNullable<Go['open']>) => { if (o.kind === 'spot') { const sp = room.spots.find(x => x.id === o.id); if (sp) setMenu(sp); } else setMenu(npcSpot(o.idx)); };
  const dist2 = () => { const a = [...pts.current.values()]; return a.length < 2 ? 1 : Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1; };
  const gDown = (e: React.PointerEvent) => { pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.current.size === 2) pinch.current = dist2(); };
  const gMove = (e: React.PointerEvent) => { const q = pts.current.get(e.pointerId); if (!q) return; const dx = e.clientX - q.x, dy = e.clientY - q.y; q.x = e.clientX; q.y = e.clientY; const c = cam.current;
    if (pts.current.size === 1) { c.yaw -= dx * .008; c.pitch = Math.min(1.3, Math.max(.35, c.pitch + dy * .005)); } else if (pts.current.size === 2) { const d = dist2(); c.dist = Math.min(17, Math.max(5, c.dist * pinch.current / d)); pinch.current = d; } };
  const gUp = (e: React.PointerEvent) => { pts.current.delete(e.pointerId); };
  const stand = (po: { x: number; z: number; r: number; stand?: [number, number] }) => ({ x: po.stand?.[0] ?? po.x, z: po.stand?.[1] ?? po.z, r: po.r });
  useEffect(() => { lock.current = !!job && job.kind !== 'quest'; }, [job]); // shifts and management tasks keep you inside until they end
  useEffect(() => { // manager seat info (refreshed so you see it change if someone takes the seat) + restore a running task after a refresh
    const load = async () => { const r = await fetch('/api/manager?biz=' + bizId); if (!r.ok) return; const d: Mgr = await r.json(); setMgr(d.seat ? d : null);
      if (!restored.current && d.seat && d.active) { restored.current = true; setJob(j => j || { kind: 'mtask', id: 'mtask', end: Date.now() + d.active!.left * 1000, label: `Management: ${d.active!.label}` }); } };
    load(); const i = setInterval(load, 20000); return () => clearInterval(i);
  }, [bizId]);
  useEffect(() => { (async () => { const r = await post('/api/shift', { action: 'status' }); if (r.ok && r.d.active && !restored.current) { restored.current = true;
    setJob(j => j || { kind: 'shift', id: r.d.idx, end: Date.now() + r.d.left * 1000, label: `${r.d.label} · ${r.d.task}` }); const po = room.posts.find(x => x.idx === r.d.idx); if (po) snap.current = stand(po); } })(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mgr?.me.isHolder && room.office && !snappedMgr.current) { snappedMgr.current = true; if (!snap.current) snap.current = { x: room.office.sx, z: room.office.sz, r: 0 }; } }, [mgr, room]); // the manager starts the day at their desk
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
  useEffect(() => { // tell everyone in the room that I'm working a post (they see me at the desk, animated, and the NPC there steps aside)
    const p = job?.kind === 'shift' ? room.posts.find(x => x.idx === job.id) : undefined; ROOM.me.w = p ? (p.anim ? 1 : -1) * (p.idx + 1) : 0; return () => { ROOM.me.w = 0; };
  }, [job, room]);

  const cops = () => Object.values(ROOM.peers).filter(q => isCop(q.look) && Math.hypot(q.x - ROOM.me.x, q.z - ROOM.me.z) < 25).length;
  useEffect(() => { if (job && left === 0) (async () => {
    const r = job.kind === 'shift' ? await post('/api/shift', { action: 'finish' }) : job.kind === 'mtask' ? await post('/api/manager', { action: 'task_finish' }) : await post('/api/quest', { action: 'finish', id: job.id }); setJob(null);
    if (r.ok && r.d.info) setMgr(r.d.info);
    if (r.ok) { onCash(r.d.cash); toast(`Done: +${naira(r.d.pay ?? r.d.reward)}${r.d.heatAdded ? ' · heat up 🔥' : ''}`); } else toast(r.d.error, true);
  })(); }, [left, job]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (o: Opt) => {
    if (job && (o.t === 'shift' || o.t === 'quest' || o.t === 'crime')) return toast('Finish what you are doing first.', true);
    if (o.t === 'shift') { const r = await post('/api/shift', { action: 'start', idx: o.idx }); if (!r.ok) return toast(r.d.error, true); setJob({ kind: 'shift', id: o.idx, end: Date.now() + r.d.secs * 1000, label: `${o.label} · ${r.d.task}` }); setMenu(null); const po = room.posts.find(x => x.idx === o.idx); if (po) snap.current = stand(po); toast(`📍 ${o.label}: ${r.d.task} (${Math.round(r.d.secs / 60)} min). Stay in the building, walk around if you like - the shift keeps running.`); }
    else if (o.t === 'quest') { const q = QUESTS.find(x => x.id === o.id)!, r = await post('/api/quest', { action: 'start', id: o.id }); if (!r.ok) return toast(r.d.error, true); setJob({ kind: 'quest', id: o.id, end: Date.now() + r.d.secs * 1000, label: q.title }); setMenu(null); }
    else if (o.t === 'store') { setStore(true); setMenu(null); }
    else if (o.t === 'shop') { const r = await post('/api/shop', { item: o.id }); if (!r.ok) return toast(r.d.error, true); onCash(r.d.cash); onFx(r.d.fx); sfx('buy'); toast(`Bought: ${o.label}`); }
    else if (o.t === 'crime') { const r = await post('/api/crime', { kind: o.id, policeNearby: cops() }); if (!r.ok) return toast(r.d.error, true); onCash(r.d.cash);
      if (r.d.jailSecs) { toast('🚔 Caught by an officer!'); setTimeout(() => onExit(true), 1200); } else toast(r.d.caught ? '😬 It went wrong. You are WANTED.' : `💰 You got away with ${naira(r.d.loot)}${r.d.wanted ? ' · WANTED' : ''}`); setMenu(null); }
  };
  const mgrAct = async (action: string, extra: object = {}) => {
    if (action === 'task_start' && job) return toast('Finish what you are doing first.', true);
    const r = await post('/api/manager', { action, ...extra }); if (!r.ok) return toast(r.d.error, true); if (r.d.cash != null) onCash(r.d.cash); if (r.d.info) setMgr(r.d.info);
    if (action === 'task_start') { setJob({ kind: 'mtask', id: 'mtask', end: Date.now() + r.d.secs * 1000, label: `Management: ${r.d.label}` }); setMenu(null); toast(`📋 ${r.d.label} (${Math.round(r.d.secs / 60)} min). Stay in the building.`); }
    else if (action === 'apply') { toast('🎉 You are the manager here for 7 days!'); setMenu(null); if (room.office) snap.current = { x: room.office.sx, z: room.office.sz, r: 0 }; }
    else if (action === 'salary') toast(`💰 +${naira(r.d.pay)} salary collected`);
  };
  const dateOf = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const mgmtMenu = (key: number) => { if (!mgr) return <p key={key}>Loading…</p>; const me = mgr.me;
    return <div key={key}>
      <p><b>{mgr.title}</b> · {mgr.holder ? `${mgr.holder.name} until ${dateOf(mgr.holder.until)}` : 'vacant'}</p>
      {me.isHolder ? <><p>You run this place until {dateOf(mgr.holder!.until)}. After that the seat opens to everyone and you must complete {mgr.needed} management tasks again to be appointed.</p>
        <button onClick={() => mgrAct('salary')}><span className="tx"><b>💰 Collect daily salary</b><small>{me.salaryInMs > 0 ? `ready in ${Math.ceil(me.salaryInMs / 3600_000)}h` : `+${naira(mgr.daily)}`}</small></span><em className="pill">Collect</em></button></>
      : <><p>Management tasks: {me.progress}/{mgr.needed}{me.otherSeat ? ' · you already manage another business' : ''}</p>
        {!mgr.holder && me.progress >= mgr.needed && !me.otherSeat && <button onClick={() => mgrAct('apply')}><span className="tx"><b>📝 Apply for {mgr.title}</b><small>first to apply gets it · 7-day term</small></span><em className="pill">Apply</em></button>}
        {!mgr.holder && me.progress < mgr.needed && <p>Complete {mgr.needed - me.progress} more task(s), then apply. First applicant gets the seat.</p>}
        {mgr.holder && <p>The seat opens when this term ends. Keep earning tasks to be first in line.</p>}
        {!me.otherSeat && mgr.tasks.map(t => <button key={t.id} onClick={() => mgrAct('task_start', { task: t.id })}><span className="tx"><b>{t.label}</b><small>+{naira(MGR_TASK_PAY)} · {t.mins} min · counts toward promotion</small></span><em className="pill">Start</em></button>)}</>}
    </div>; };
  const leave = () => { if (job && job.kind !== 'quest' && !window.confirm('Leaving now forfeits this and its pay. Leave anyway?')) return; onExit(); };
  const arrest = async () => { if (!near) return; const r = await post('/api/arrest', { target: near }); toast(r.ok ? `🚔 ${near} arrested. +${naira(r.d.reward)}` : r.d.error); };
  const qName = (id: string) => QUESTS.find(q => q.id === id)!;
  const stick = useRef<HTMLDivElement>(null), knob = useRef<HTMLElement>(null);
  const joy = (e: React.PointerEvent, on: boolean) => { const r = stick.current!.getBoundingClientRect(); let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2); const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } ctl.current.joy = on ? { x, y } : { x: 0, y: 0 }; if (knob.current) knob.current.style.transform = `translate(calc(-50% + ${on ? x * 30 : 0}px),calc(-50% + ${on ? y * 30 : 0}px))`; };

  return <div className={'inWrap' + (menu || store ? ' menuOpen' : '')}>
    <div className="inCanvas" onPointerDown={gDown} onPointerMove={gMove} onPointerUp={gUp} onPointerCancel={gUp} onPointerLeave={gUp} onWheel={e => { cam.current.dist = Math.min(17, Math.max(5, cam.current.dist + e.deltaY * .01)); }}>
    <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0, 8.5, room.d / 2 + 6], fov: 50 }}>
      <color attach="background" args={['#0b1210']} /><hemisphereLight args={['#ffffff', '#555566', 1.1]} /><directionalLight position={[4, 9, 5]} intensity={1.6} castShadow />
      <pointLight position={[0, 2.6, 0]} intensity={14} distance={20} color={biz.type === 'Nightclub' ? '#a855f7' : '#fff1d6'} />
      <mesh rotation-x={-Math.PI / 2} receiveShadow onClick={e => { if (e.delta > 6) return; setMenu(null); walk(e.point.x, e.point.z); }}><planeGeometry args={[room.w, room.d]} /><meshStandardMaterial color={room.floor} roughness={.9} /></mesh>
      <Walls room={room} /><Furniture room={room} /><Decor room={room} />
      {room.posts.map(p => <Staff key={p.idx} post={p} look={staff[p.idx]} onTalk={talk} />)}
      {room.office && <ManagerSeat office={room.office} mgr={mgr} meName={look.name} onTap={() => { const sp = room.spots.find(x => x.id === 'mgmt'); if (sp) goSpot(sp); }} />}
      {room.spots.map(s => <SpotMark key={s.id} s={s} active={spot?.id === s.id} onTap={goSpot} />)}
      <Text position={[0, 2.2, -room.d / 2 + .25]} fontSize={.55} color="#fff" outlineWidth={.05} outlineColor="#1a1410" anchorX="center">{biz.name}</Text>
      <Player look={look} room={room} ctl={ctl} onSpot={setSpot} onExit={() => onExit()} frozen={!!menu || store} snap={snap} cam={cam} go={go} onArrive={arrive} lock={lock} onBlocked={() => { if (Date.now() - blockedAt.current > 3000) { blockedAt.current = Date.now(); toast('🔒 You are on the clock. Tap Leave to forfeit.'); } }} />
      {net.roster.map(n => ROOM.peers[n] && <Remote key={n + net.ver} name={n} bub={net.bub[n]} />)}
    </Canvas></div>
    <div className="inTop"><b>{biz.name}</b><span>{biz.type} · {net.enabled ? `${net.roster.length + 1} inside` : 'solo'}</span><button onClick={leave}>🚪 Leave</button><button className="inGear" aria-label="Settings" onClick={openSettings}>⚙️</button></div>
    {job && <div className="inToast">⏳ {job.label}: {job.kind === 'quest' ? `${left}s` : fmtClock(left)}</div>}{msg && <div className="inToast">{msg}</div>}
    {spot && !menu && <button className="inAct" onClick={() => setMenu(spot)}>{spot.e} {spot.label} <small>(tap or E)</small></button>}
    <div className="inDock"><i>What can I do here?</i>{room.spots.map(sp => <button key={sp.id} className={'gd-' + sp.id + (spot?.id === sp.id ? ' on' : '')} onClick={() => goSpot(sp)}><span className="glIco">{sp.e}</span><span className="glTx">{sp.label}</span></button>)}</div>
    <div className="inCam"><button aria-label="Rotate left" onClick={() => { cam.current.yaw -= .6; }}>⟲</button><button aria-label="Reset camera" onClick={() => { cam.current.yaw = 0; cam.current.pitch = .85; cam.current.dist = 10.5; }}>🧭</button><button aria-label="Rotate right" onClick={() => { cam.current.yaw += .6; }}>⟳</button><button aria-label="Zoom in" onClick={() => { cam.current.dist = Math.max(5, cam.current.dist - 1.5); }}>＋</button><button aria-label="Zoom out" onClick={() => { cam.current.dist = Math.min(17, cam.current.dist + 1.5); }}>－</button></div>
    {profile.profession === 'police' && near && <button className="inAct cop" onClick={arrest}>👮 Arrest {near}</button>}
    {store && <StoreModal bizName={biz.name} bizType={biz.type} onClose={() => setStore(false)} onCash={onCash} onFx={onFx} />}
    {menu && <div className={'inMenu k-' + (menu.id.startsWith('npc') ? 'npc' : menu.id)} style={{ ['--e' as string]: `"${menu.e}"` }}><button className="x" aria-label="Close" onClick={() => setMenu(null)}>✕</button><h3><span>{menu.e} {menu.label}</span></h3><div className="inBody">
      {menu.opts.map((o, i) => o.t === 'info' ? <p key={i}>{o.text}</p> : o.t === 'mgmt' ? mgmtMenu(i) : <button key={i} onClick={() => run(o)}>
        {o.t === 'shift' && <><span className="tx"><b>{o.label}</b><small>+{naira(o.pay)} · 45–60 min · task assigned{o.senior ? ' · needs rank 2' : ''}</small></span><em className="pill">Apply</em></>}
        {o.t === 'store' && <><span className="tx"><b>🛍️ Browse the store</b><small>{o.count} items · household, kitchen, furniture, tech, style &amp; more</small></span><em className="pill">Open</em></>}
        {o.t === 'shop' && <><span className="tx"><b>{o.label}</b><small>{naira(o.cost)}</small></span><em className="pill">Buy</em></>}
        {o.t === 'quest' && <><span className="tx"><b>{qName(o.id).title}</b><small>{qName(o.id).blurb} · +{naira(qName(o.id).reward)} · {qName(o.id).secs}s{qName(o.id).legal ? '' : ' · 🔥 illegal'}</small></span><em className="pill">Start</em></>}
        {o.t === 'crime' && <><span className="tx"><b>{CRIMES[o.id].label}</b><small>{naira(CRIMES[o.id].loot[0])}–{naira(CRIMES[o.id].loot[1])} · +{CRIMES[o.id].heat} heat · officers inside make it riskier</small></span><em className="pill">Try</em></>}</button>)}</div></div>}
    {net.enabled && <div className="inChat">{net.log.slice(-3).map(m => <div key={m.id}><b>{m.u}</b> {m.t}</div>)}<input placeholder="Say something…" maxLength={120} value={txt} onChange={e => setTxt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && net.send(txt)) setTxt(''); }} /></div>}
    <div className="inStick" ref={stick} onPointerDown={e => { (e.target as Element).setPointerCapture(e.pointerId); joy(e, true); }} onPointerMove={e => (e.buttons || e.pointerType === 'touch') && joy(e, true)} onPointerUp={e => joy(e, false)} onPointerCancel={e => joy(e, false)}><i ref={knob as React.RefObject<HTMLElement>} /></div>
    <style>{`.inWrap{position:absolute;inset:0;z-index:8;background:#0b1210}.inWrap canvas{display:block}.inTop{position:absolute;left:12px;top:56px;display:flex;gap:10px;align-items:center;background:#10201ae6;border:1px solid #ffffff20;border-radius:12px;padding:8px 12px;color:#fff;font-size:12px}.inTop span{color:#a8bbb2}.inTop button{background:#d99a42;border:0;border-radius:8px;padding:6px 10px;font-weight:800}
.inToast{position:absolute;left:50%;transform:translateX(-50%);top:110px;background:#000c;color:#fff;border-radius:12px;padding:9px 14px;font-size:13px;max-width:90vw;text-align:center}
.inAct{position:absolute;left:50%;transform:translateX(-50%);bottom:150px;background:#d99a42;color:#111;border:0;border-radius:14px;padding:12px 18px;font-weight:900;font-size:14px}.inAct.cop{bottom:100px;background:#2563eb;color:#fff}
.inChat{position:absolute;left:12px;bottom:14px;width:min(260px,50vw);z-index:12;font-size:11px;color:#fff;display:flex;flex-direction:column;gap:3px}.inChat div{background:#000a;border-radius:8px;padding:3px 7px}.inChat input{background:#0a1511;border:1px solid #2a4337;border-radius:9px;padding:8px;color:#fff;font-size:12px}
.inStick{position:absolute;left:calc(20px + env(safe-area-inset-left,0px));bottom:calc(18px + env(safe-area-inset-bottom,0px));width:116px;height:116px;border-radius:50%;background:#0005;border:2px solid #ffffff33;touch-action:none;z-index:12;display:none}.inStick i{position:absolute;left:50%;top:50%;width:46px;height:46px;border-radius:50%;background:#ffffffaa;transform:translate(-50%,-50%)}
.inLbl{background:#09130fe8;color:#fff;border:1px solid #ffffff22;border-radius:8px;padding:3px 7px;font-size:10px;white-space:nowrap}.inTag{display:flex;flex-direction:column;align-items:center;gap:3px}.inTag span{background:#09130fe8;color:#fff;border-radius:8px;padding:2px 6px;font-size:10px}.inStaff{border:1px solid #d99a4288}.inSay{background:#fff;color:#111;border-radius:10px;padding:4px 8px;font-size:11px;max-width:160px;text-align:center}
.inCanvas{position:absolute;inset:0;touch-action:none}
.inLbl{cursor:pointer;font:inherit}.inStaff{cursor:pointer;font:inherit}
.inDock{position:absolute;right:calc(12px + env(safe-area-inset-right,0px));top:56px;display:flex;flex-direction:column;align-items:flex-end;gap:6px;z-index:9}.inDock i{font-style:normal;font-size:10px;color:#a8bbb2}
.inDock button{background:#10201af0;border:1px solid #ffffff2a;color:#fff;border-radius:999px;padding:8px 14px;font-size:13px;font-weight:700}.inDock button.on{background:#d99a42;color:#111;border-color:#d99a42}
.inCam{position:absolute;left:12px;top:104px;display:flex;gap:6px;z-index:9}.inCam button{width:38px;height:38px;border-radius:50%;background:#10201af0;border:1px solid #ffffff2a;color:#fff;font-size:17px}
@media (pointer:coarse),(max-width:900px){.inStick{display:block}.inChat{left:calc(152px + env(safe-area-inset-left,0px));bottom:calc(14px + env(safe-area-inset-bottom,0px));width:min(250px,30vw)}}`}</style>
    <style>{GAME_LABEL_CSS}</style>
    <style>{INTERIOR_UI_CSS}</style>
  </div>;
}
