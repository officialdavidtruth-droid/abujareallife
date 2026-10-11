'use client';
import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import RuntimeStyle from './RuntimeStyle';
import { MAX_SIDE, MIN_SIDE, ROOM_TYPES, isStarter, refundFor, roomCost, suggestPlacement, type Room, type RoomType } from '../lib/homeRooms';

/* Build mode, step 3 (BUILD-MODE.md): tap "Build rooms" in the menu, pick a room type and size, tap the ground beside your house and the room ghost snaps flush against the nearest wall
   (green = allowed, red = not, with the reason). Tap a room to select it for demolishing. The server decides everything (/api/home/rooms); this file only asks. */
export const BUILDST = { on: false, type: 'bedroom' as RoomType, w: 4, d: 4, px: 0, pz: 0, hasTap: false, rooms: [] as Room[], ghost: null as null | { x: number; z: number; ok: boolean; why: string | null }, sel: null as string | null };
const emit = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event('arl-build')); };
const naira = (n: number) => '₦' + Math.round(n).toLocaleString('en-NG');

function recompute() {
  const B = BUILDST;
  if (!B.rooms.length || B.sel) { B.ghost = null; return; }
  if (!B.hasTap) { const x1 = Math.max(...B.rooms.map(r => r.x + r.w)), z0 = Math.min(...B.rooms.map(r => r.z)), z1 = Math.max(...B.rooms.map(r => r.z + r.d)); B.px = x1 + B.w / 2; B.pz = (z0 + z1) / 2; }
  const p = suggestPlacement(B.rooms, B.type, B.w, B.d, B.px, B.pz);
  B.ghost = p ? { x: p.x, z: p.z, ok: p.why === null, why: p.why } : null;
}
/** The player tapped the ground at (x, z) in build mode. */
export function buildTap(x: number, z: number) {
  const B = BUILDST, hit = B.rooms.find(r => x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.d);
  B.px = x; B.pz = z; B.hasTap = true; B.sel = hit ? hit.id : null; recompute(); emit();
}

/** Inside the 3D scene: the ghost of the room to be built, and the outline of the selected room. Neither blocks taps. */
export function BuildGhost() {
  const g = useRef<THREE.Mesh>(null!), gm = useRef<THREE.MeshBasicMaterial>(null!), s = useRef<THREE.Mesh>(null!);
  useFrame(() => {
    const B = BUILDST, gh = B.ghost, sel = B.sel ? B.rooms.find(r => r.id === B.sel) : null;
    g.current.visible = B.on && !!gh; if (gh) { g.current.position.set(gh.x + B.w / 2, .08, gh.z + B.d / 2); g.current.scale.set(B.w, .14, B.d); gm.current.color.set(gh.ok ? '#3ddc84' : '#ff5a5f'); }
    s.current.visible = B.on && !!sel; if (sel) { s.current.position.set(sel.x + sel.w / 2, .09, sel.z + sel.d / 2); s.current.scale.set(sel.w, .16, sel.d); }
  });
  return <>
    <mesh ref={g} raycast={() => null} visible={false}><boxGeometry args={[1, 1, 1]} /><meshBasicMaterial ref={gm} color="#3ddc84" transparent opacity={.5} depthWrite={false} /></mesh>
    <mesh ref={s} raycast={() => null} visible={false}><boxGeometry args={[1, 1, 1]} /><meshBasicMaterial color="#f0b94a" transparent opacity={.35} depthWrite={false} /></mesh>
  </>;
}

export default function BuildPanel({ rooms, cash, onRooms, onCash, onClose }: { rooms: Room[]; cash: number; onRooms: (rooms: Room[]) => void; onCash: (delta: number) => void; onClose: () => void }) {
  const [, tick] = useState(0), [busy, setBusy] = useState(false), [sure, setSure] = useState(false), [note, setNote] = useState<{ t: string; bad?: boolean } | null>(null);
  const key = JSON.stringify(rooms);
  useEffect(() => { const f = () => { setSure(false); tick(n => n + 1); }; window.addEventListener('arl-build', f); return () => window.removeEventListener('arl-build', f); }, []);
  useEffect(() => { BUILDST.rooms = rooms; if (BUILDST.sel && !rooms.some(r => r.id === BUILDST.sel)) BUILDST.sel = null; recompute(); emit(); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { BUILDST.on = false; BUILDST.sel = null; BUILDST.ghost = null; BUILDST.hasTap = false; }, []);
  const say = (t: string, bad = false) => { setNote({ t, bad }); setTimeout(() => setNote(n => (n && n.t === t ? null : n)), 4000); };
  const B = BUILDST, sel = B.sel ? rooms.find(r => r.id === B.sel) ?? null : null, gh = B.ghost, cost = roomCost(B.type, B.w, B.d);
  const setType = (t: RoomType) => { const [mw, md] = ROOM_TYPES[t].min; B.type = t; if (!((B.w >= mw && B.d >= md) || (B.w >= md && B.d >= mw))) { B.w = Math.max(B.w, mw); B.d = Math.max(B.d, md); } recompute(); emit(); };
  const size = (dw: number, dd: number) => { B.w = Math.min(MAX_SIDE, Math.max(MIN_SIDE, B.w + dw)); B.d = Math.min(MAX_SIDE, Math.max(MIN_SIDE, B.d + dd)); recompute(); emit(); };
  async function call(body: object) {
    if (busy) return null; setBusy(true);
    try { const r = await fetch('/api/home/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), d = await r.json().catch(() => ({})); if (!r.ok) { say(d.error || 'Could not do that.', true); return null; } return d as { rooms: Room[]; charged?: number; refunded?: number }; }
    catch { say('No connection.', true); return null; } finally { setBusy(false); setSure(false); }
  }
  async function build() { if (!gh?.ok) return; const d = await call({ action: 'build', type: B.type, x: gh.x, z: gh.z, w: B.w, d: B.d }); if (d) { onRooms(d.rooms); onCash(-(d.charged ?? 0)); say(`✨ ${ROOM_TYPES[B.type].name} built!`); } }
  async function demolish() { if (!sel) return; if (!sure) { setSure(true); return; } const d = await call({ action: 'demolish', id: sel.id }); if (d) { B.sel = null; onRooms(d.rooms); onCash(d.refunded ?? 0); say(`🔨 Demolished. You got ${naira(d.refunded ?? 0)} back.`); } }
  const poor = cost > cash;
  return <div className="bmBox">
    <RuntimeStyle css={CSS} id="arl-buildmode" />
    <div className="bmHead"><b>🧱 Build rooms</b><small>Cash {naira(cash)}</small><button onClick={onClose}>Done</button></div>
    {note && <div className={'bmNote' + (note.bad ? ' bad' : '')}>{note.t}</div>}
    {sel ? <div className="bmSel">
      <div><b>{ROOM_TYPES[sel.type].e} {isStarter(sel) ? 'Original home' : ROOM_TYPES[sel.type].name}</b><small>{Math.round(sel.w * 10) / 10} × {Math.round(sel.d * 10) / 10} m</small></div>
      {isStarter(sel) ? <small>This part of your home can't be demolished. Tap the ground outside to build next to it.</small>
        : <button className="bad" disabled={busy} onClick={demolish}>{sure ? `Tap again: demolish (+${naira(refundFor(sel.cost ?? 0))})` : `🔨 Demolish (+${naira(refundFor(sel.cost ?? 0))})`}</button>}
      <button onClick={() => { B.sel = null; recompute(); emit(); }}>Back to building</button>
    </div> : <>
      <div className="bmTypes">{(Object.keys(ROOM_TYPES) as RoomType[]).map(t => <button key={t} className={B.type === t ? 'on' : ''} onClick={() => setType(t)}><i>{ROOM_TYPES[t].e}</i>{ROOM_TYPES[t].name}</button>)}</div>
      <div className="bmSize">
        <span>Width<button onClick={() => size(-1, 0)}>−</button><b>{B.w}</b><button onClick={() => size(1, 0)}>+</button></span>
        <span>Depth<button onClick={() => size(0, -1)}>−</button><b>{B.d}</b><button onClick={() => size(0, 1)}>+</button></span>
        <button title="Turn it 90°" onClick={() => { const w = B.w; B.w = B.d; B.d = w; recompute(); emit(); }}>⟳</button>
      </div>
      <div className={'bmInfo' + (gh && !gh.ok ? ' bad' : '')}>{gh ? (gh.ok ? 'Tap another spot beside your home to move it.' : gh.why) : 'Tap the ground beside your home to place it.'}</div>
      <button className="bmGo" disabled={busy || !gh?.ok || poor} onClick={build}>{poor ? `Need ${naira(cost)}` : `Build for ${naira(cost)}`}</button>
      <small className="bmFoot">Tap a room to select it for demolishing. Rooms must touch an existing room.</small>
    </>}
  </div>;
}
const CSS = `.bmBox{position:absolute;z-index:40;left:50%;bottom:10px;transform:translateX(-50%);width:min(440px,calc(100vw - 16px));display:flex;flex-direction:column;gap:7px;background:#0f1b16ee;color:#fff;border:1px solid #ffffff22;border-radius:16px;padding:10px 12px;font-family:Inter,system-ui,sans-serif;backdrop-filter:blur(4px)}
.bmHead{display:flex;align-items:center;gap:8px}.bmHead b{font-size:15px}.bmHead small{flex:1;color:#9fb5aa;font-size:11px}.bmHead button,.bmSel button,.bmSize button{background:#20372d;color:#fff;border:0;border-radius:10px;padding:7px 12px;font-weight:600}
.bmNote{background:#1f3a2e;border:1px solid #ffffff22;border-radius:10px;padding:6px 9px;font-size:12px}.bmNote.bad{background:#4a1f22;border-color:#e5484d66}
.bmTypes{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px}.bmTypes button{flex:none;display:flex;flex-direction:column;align-items:center;gap:2px;background:#10201a;color:#fff;border:1px solid #ffffff1a;border-radius:12px;padding:6px 9px;font-size:11px}.bmTypes button i{font-style:normal;font-size:20px}.bmTypes button.on{border-color:#d99a42;background:#2a2a1c}
.bmSize{display:flex;align-items:center;gap:10px;font-size:12px;color:#cfe0d6}.bmSize span{display:flex;align-items:center;gap:6px}.bmSize b{min-width:18px;text-align:center;font-size:15px;color:#fff}.bmSize>button{margin-left:auto;font-size:16px}
.bmInfo{font-size:12px;color:#9fe0b8}.bmInfo.bad{color:#ff9a9d}
.bmGo{background:#d99a42;color:#1a1208;border:0;border-radius:12px;padding:11px;font-weight:800;font-size:14px}.bmGo:disabled{opacity:.45}
.bmSel{display:flex;flex-direction:column;gap:7px}.bmSel>div{display:flex;flex-direction:column;gap:2px}.bmSel small,.bmFoot{color:#9fb5aa;font-size:11px}.bmSel button.bad{background:#7a2328}
`;
