'use client';
import { useEffect, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import type * as THREE from 'three';
import Human from './Human';
import RuntimeStyle from './RuntimeStyle';
import { GAME } from './cityShared';
import { playScene } from './StreetEscort';
import { MAX_PER_DEAL } from '../lib/dealers';
import { NPC_RANGE, STREET_NPCS, type StreetNpc } from '../lib/streetNpc';

/* Step 9: street NPCs. <StreetNpcScene/> goes inside the 3D city; <StreetNpcUI/> goes in the HUD. /api/street-npc decides everything. */
const naira = (n: number) => '₦' + Math.round(n).toLocaleString();
const SHOW_R = 60;   // the 3D figure is only built while you are this close (a rig is ~100 meshes)

function Figure({ n }: { n: StreetNpc }) {
  const [on, setOn] = useState(false), g = useRef<THREE.Group>(null);
  useEffect(() => { const i = setInterval(() => setOn(Math.hypot(GAME.player.x - n.x, GAME.player.z - n.z) < SHOW_R), 700); return () => clearInterval(i); }, [n.x, n.z]);
  if (!on) return null;
  return <group ref={g} position={[n.x, 0, n.z]} rotation={[0, Math.PI, 0]}>
    <Human look={n.look} getState={() => 'idle'} />
    <Html position={[0, 2.35, 0]} center distanceFactor={14} zIndexRange={[4, 0]}><div className="snTag">{n.e} {n.name}</div></Html>
    <RuntimeStyle id="arl-sn-tag" css={`.snTag{background:#111d;color:#fff;border:1px solid #ffffff33;border-radius:999px;padding:3px 9px;font:800 11px system-ui;white-space:nowrap;pointer-events:none}`} />
  </group>;
}
export function StreetNpcScene() { return <>{STREET_NPCS.map(n => <Figure key={n.id} n={n} />)}</>; }

type Info = { adult: boolean; cash: number; heat: number; cop: boolean; dealerPrice: number };
const post = async (body: object) => { try { const r = await fetch('/api/street-npc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { ok: r.ok, d: await r.json().catch(() => ({})) as any }; } catch { return { ok: false, d: { error: 'No connection.' } }; } }; // eslint-disable-line @typescript-eslint/no-explicit-any

export function StreetNpcUI({ say, refresh }: { say: (m: string) => void; refresh: () => void }) {
  const [near, setNear] = useState<StreetNpc | null>(null), [open, setOpen] = useState(false), [info, setInfo] = useState<Info | null>(null), [qty, setQty] = useState(1), [busy, setBusy] = useState(false);
  const [dob, setDob] = useState(''), [ok18, setOk18] = useState(false);
  useEffect(() => {
    const i = setInterval(() => {
      let best: StreetNpc | null = null, bd = NPC_RANGE;
      for (const n of STREET_NPCS) { const d = Math.hypot(GAME.player.x - n.x, GAME.player.z - n.z); if (d < bd) { bd = d; best = n; } }
      setNear(p => (p?.id === best?.id ? p : best));
    }, 300);
    return () => clearInterval(i);
  }, []);
  useEffect(() => { if (!near) setOpen(false); }, [near]);
  const load = async () => { const r = await post({ action: 'poll' }); if (r.ok) setInfo(r.d); };
  useEffect(() => { if (open) load(); }, [open]);
  const pos = () => ({ sx: GAME.player.x, sz: GAME.player.z });
  const finish = (d: any) => { if (typeof d.cash === 'number') window.dispatchEvent(new CustomEvent('arl-cash-update', { detail: { cash: d.cash } })); if (typeof d.heat === 'number') GAME.heat = d.heat; load(); refresh(); }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const buy = async () => {
    if (!near || busy) return; setBusy(true); const r = await post({ action: 'buy', npc: near.id, qty, ...pos() }); setBusy(false);
    if (!r.ok) return say(r.d.error || 'Nope.');
    say(`🌿 Bought ${r.d.qty} for ${naira(r.d.spent)}${r.d.wanted ? ' · you are WANTED' : ''}`); finish(r.d);
  };
  const hire = async () => {
    if (!near || busy) return; setBusy(true); const r = await post({ action: 'hire', npc: near.id, ...pos() }); setBusy(false);
    if (!r.ok) return say(r.d.error || 'Nope.');
    setOpen(false); playScene(`🌙 You and ${near.name} head home… Later…`);
    window.dispatchEvent(new CustomEvent('arl-apply-fx', { detail: r.d.fx || {} }));
    say(`💃 ${naira(r.d.spent)} well spent.${r.d.wanted ? ' You are WANTED.' : ''}`); finish(r.d);
  };
  const confirm18 = async () => {
    if (busy) return; setBusy(true); const r = await post({ action: 'adult', dateOfBirth: dob, accept: ok18 }); setBusy(false);
    if (!r.ok) return say(r.d.error || 'Could not confirm.'); load();
  };
  if (!near) return null;
  return <>
    {!open && <button className="snBtn" onClick={() => setOpen(true)}>{near.e} Talk to {near.name}</button>}
    {open && <div className="snSheet"><button className="x" aria-label="Close" onClick={() => setOpen(false)}>✕</button>
      <h3>{near.e} {near.name}</h3><p className="snLine">“{near.line}”</p>
      {!info ? <p>…</p> : info.cop ? <p>Officers cannot do this.</p> : !info.adult ? <>
        <p className="snNote">This part of the game has mature fictional themes (drugs, adult nightlife). Confirm you are 18 or older to continue. Nothing explicit is shown.</p>
        <label className="snRow">Date of birth <input type="date" value={dob} max={new Date().toISOString().slice(0, 10)} onChange={e => setDob(e.target.value)} onKeyDown={e => e.stopPropagation()} onKeyUp={e => e.stopPropagation()} /></label>
        <label className="snChk"><input type="checkbox" checked={ok18} onChange={e => setOk18(e.target.checked)} /> I am 18 or older and understand this content is fictional.</label>
        <button className="snGo" disabled={busy || !dob || !ok18} onClick={confirm18}>Confirm</button>
      </> : near.role === 'dealer' ? <>
        <p className="snRow"><span>Price per unit</span><b>{naira(info.dealerPrice)}</b></p><p className="snRow"><span>Your cash</span><b>{naira(info.cash)}</b></p><p className="snRow"><span>Your heat</span><b>{info.heat}</b></p>
        <div className="snQty"><button onClick={() => setQty(q => Math.max(1, q - 1))}>−</button><b>{qty}</b><button onClick={() => setQty(q => Math.min(MAX_PER_DEAL, q + 1))}>+</button></div>
        <button className="snGo" disabled={busy} onClick={buy}>Buy {qty} 🌿 · {naira(info.dealerPrice * qty)}</button>
        <p className="snNote">Street prices are higher and every buy adds heat. Smoke it from the bar menu.</p>
      </> : <>
        <p className="snRow"><span>Price</span><b>{naira(near.price)}</b></p><p className="snRow"><span>Your cash</span><b>{naira(info.cash)}</b></p>
        <button className="snGo" disabled={busy || info.cash < near.price} onClick={hire}>🏠 Take {near.name} home · {naira(near.price)}</button>
        <p className="snNote">The scene fades to black. It raises your fun and social, costs energy, and adds heat.</p>
      </>}
    </div>}
    <RuntimeStyle id="arl-street-npc" css={`.snBtn{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(150px + env(safe-area-inset-bottom,0px));z-index:30;background:#14532df2;color:#fff;border:1px solid #86efacaa;border-radius:999px;min-height:44px;padding:11px 18px;font-size:14px;font-weight:900}
.snSheet{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:60;width:min(320px,calc(100vw - 24px));background:#0d1511f7;color:#fff;border:1px solid #86efac66;border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:8px;max-height:86vh;overflow:auto}
.snSheet h3{margin:0;font-size:18px}.snSheet .x{position:absolute;right:10px;top:10px;background:none;border:0;color:#fff;font-size:18px}.snLine{margin:0;color:#cfe;font-style:italic;font-size:13px}.snNote{margin:0;color:#9db;font-size:11px}
.snRow{display:flex;justify-content:space-between;gap:8px;margin:0;font-size:13px}.snQty{display:flex;align-items:center;justify-content:center;gap:14px}.snQty button{width:36px;height:36px;border-radius:50%;background:#1f3a2c;color:#fff;border:1px solid #ffffff33;font-size:18px}.snQty b{min-width:24px;text-align:center}
.snChk{display:flex;gap:8px;font-size:12px;align-items:flex-start}.snGo{background:#16a34a;color:#fff;border:0;border-radius:12px;min-height:44px;font-weight:900;font-size:14px}.snGo:disabled{opacity:.5}`} />
  </>;
}
