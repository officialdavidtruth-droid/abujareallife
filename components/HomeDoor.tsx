'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GAME } from './CityWorld';
import RuntimeStyle from './RuntimeStyle';
import { NET } from '../lib/cityNet';
import { HOUSES, nearDoor } from '../lib/houses';
import { ROOM } from '../lib/roomNet';

/* The front door (server: app/api/visit, see HOME-DOOR.md).
   Outside: stand at a stranger's door and tap 🚪 Knock. Inside: whoever is home (owner or housemate) gets "X is at the door" with Let in / Turn away,
   and the 🚪 Door panel invites players in and asks guests to leave. A guest who is let in (or invited) gets a "Come in" card and walks into the house. */
type Card = { owner: string; slot: number | null; invited: boolean };
type Poll = { knocks: string[]; cards: Card[]; knock: { owner: string; status: string } | null; welcome?: boolean };
const post = async (body: object) => { const r = await fetch('/api/visit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { ok: r.ok, d: await r.json().catch(() => ({})) as any }; }; // eslint-disable-line @typescript-eslint/no-explicit-any

export default function HomeDoor({ outside, visiting, panel, onClosePanel, onVisit, onLeaveVisit, say }: {
  outside: boolean; visiting: string | null; panel: boolean; onClosePanel: () => void;
  onVisit: (owner: string, slot: number | null) => void; onLeaveVisit: (why: string) => void; say: (m: string) => void;
}) {
  const [poll, setPoll] = useState<Poll>({ knocks: [], cards: [], knock: null }), [near, setNear] = useState<{ slot: number; u: string } | null>(null);
  const [waiting, setWaiting] = useState<{ owner: string; t0: number } | null>(null), [dismissed, setDismissed] = useState<string[]>([]), [inside, setInside] = useState<string[]>([]), [name, setName] = useState(''), [busy, setBusy] = useState(false);
  const blocked = () => !!GAME.jailed || !!GAME.ride || NET.me.drv || NET.me.ko > Date.now();
  const live = useRef({ outside, visiting, waiting, onVisit, onLeaveVisit, say }); live.current = { outside, visiting, waiting, onVisit, onLeaveVisit, say };

  useEffect(() => {   // whose door am I standing at?
    if (!outside) { setNear(null); return; }
    const i = setInterval(() => { const h = !blocked() ? nearDoor(NET.me.x, NET.me.z) : null; const n = h && !h.mine ? { slot: h.slot, u: h.u } : null; setNear(p => (p?.slot === n?.slot ? p : n)); }, 300);
    return () => clearInterval(i);
  }, [outside]);

  const enter = useCallback(async (owner: string) => {
    if (busy) return; setBusy(true);
    const r = await post({ action: 'enter', name: owner }).finally(() => setBusy(false));
    if (!r.ok) return live.current.say(r.d.error || 'The door is shut.');
    setWaiting(null); live.current.onVisit(String(r.d.owner), typeof r.d.slot === 'number' ? r.d.slot : null);
  }, [busy]);

  const load = useCallback(async () => {
    try {
      const v = live.current.visiting, r = await fetch('/api/visit' + (v ? '?visit=' + encodeURIComponent(v) : ''), { cache: 'no-store' }); if (!r.ok) return;
      const d = await r.json() as Poll; setPoll(d);
      if (v && d.welcome === false) { live.current.onLeaveVisit('🚪 You were asked to leave.'); return; }
      const w = live.current.waiting;
      if (w) {
        const c = d.cards.find(x => x.owner === w.owner);
        if (c) { live.current.say(`🚪 ${w.owner} let you in!`); const h = HOUSES.list.find(x => x.slot === c.slot); if (live.current.outside && h && Math.hypot(NET.me.x - h.door.x, NET.me.z - h.door.z) < 9) enter(w.owner); }
        else if (!d.knock) { live.current.say(Date.now() - w.t0 > 60_000 ? `🚪 Nobody answers at ${w.owner}'s door.` : `🚪 ${w.owner} turned you away.`); setWaiting(null); }
      }
    } catch { /* offline */ }
  }, [enter]);
  useEffect(() => { load(); const i = setInterval(() => { if (!document.hidden) load(); }, 4000); return () => clearInterval(i); }, [load, visiting]);
  useEffect(() => { if (!panel) return; const i = setInterval(() => setInside(Object.keys(ROOM.peers)), 1000); setInside(Object.keys(ROOM.peers)); return () => clearInterval(i); }, [panel]);

  const knock = async (n: { slot: number; u: string }) => {
    if (busy || waiting || blocked()) return; setBusy(true);
    const r = await post({ action: 'knock', slot: n.slot }).finally(() => setBusy(false));
    if (!r.ok) return say(r.d.error || 'Nobody hears you.');
    if (r.d.status === 'allowed') return enter(String(r.d.owner));
    setWaiting({ owner: String(r.d.owner), t0: Date.now() }); say(`🚪 Knock knock… waiting for ${r.d.owner} to answer.`);
  };
  const answer = async (guest: string, allow: boolean) => { const r = await post({ action: 'answer', name: guest, allow }); if (!r.ok) say(r.d.error || 'Could not answer.'); else say(allow ? `🚪 ${guest} is coming in.` : `🚪 You turned ${guest} away.`); setPoll(p => ({ ...p, knocks: p.knocks.filter(k => k !== guest) })); };
  const invite = async () => { const n = name.trim(); if (!n || busy) return; setBusy(true); const r = await post({ action: 'invite', name: n }).finally(() => setBusy(false)); if (!r.ok) say(r.d.error || 'Could not invite.'); else { say(`🚪 ${n} is invited in.`); setName(''); } };
  const kick = async (g: string) => { if (!confirm(`Ask ${g} to leave?`)) return; const r = await post({ action: 'kick', name: g }); say(r.ok ? `🚪 ${g} was asked to leave.` : r.d.error || 'Could not do that.'); };

  const cards = poll.cards.filter(c => !dismissed.includes(c.owner) && c.owner !== visiting);
  return <>
    <RuntimeStyle id="arl-homedoor" css={CSS} />
    {outside && !visiting && near && !waiting && <button className="hdKnock" aria-label={`Knock on ${near.u}'s door`} disabled={busy} onPointerDown={e => { e.preventDefault(); knock(near); }}><span>🚪</span><small>Knock</small></button>}
    {waiting && <div className="hdWait"><b>🚪 Waiting for {waiting.owner}…</b><button onClick={() => setWaiting(null)}>Cancel</button></div>}
    <div className="hdStack">
      {!outside && !visiting && poll.knocks.map(k => <div key={k} className="hdCard"><span>🚪 <b>{k}</b> is at the door</span><button className="go" onClick={() => answer(k, true)}>Let in</button><button onClick={() => answer(k, false)}>Turn away</button></div>)}
      {cards.map(c => <div key={c.owner} className="hdCard"><span>{c.invited ? '💌' : '🚪'} <b>{c.owner}</b> {c.invited ? 'invited you in' : 'let you in'}</span><button className="go" disabled={busy} onClick={() => enter(c.owner)}>Come in</button><button onClick={() => setDismissed(d => [...d, c.owner])}>×</button></div>)}
    </div>
    {panel && !outside && !visiting && <div className="hdWrap" onClick={onClosePanel}><div className="hdBox" onClick={e => e.stopPropagation()}>
      <div className="hdHead"><h3>🚪 Front door</h3><button onClick={onClosePanel} aria-label="Close">×</button></div>
      <div className="hdSec"><b>Invite someone in</b><div className="hdAdd"><input value={name} maxLength={30} placeholder="Player name" onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') invite(); }} /><button className="go" disabled={busy || !name.trim()} onClick={invite}>Invite</button></div>
        <small>They get a message and a Come in button. Anyone who knocks while you are home shows up as a card you can answer.</small></div>
      <div className="hdSec"><b>In the house now</b>{!inside.length && <small>Nobody else is here.</small>}{inside.map(g => <div key={g} className="hdRow"><span>🧍 {g}</span><button className="bad" onClick={() => kick(g)}>Ask to leave</button></div>)}</div>
    </div></div>}
  </>;
}
const CSS = `.hdKnock{position:fixed;right:96px;bottom:calc(252px + env(safe-area-inset-bottom,0px));z-index:30;width:70px;height:70px;border-radius:50%;background:#1e3a5fef;border:2px solid #93c5fdaa;color:#fff;box-shadow:0 4px 14px #0009;display:flex;flex-direction:column;align-items:center;justify-content:center;touch-action:manipulation}.hdKnock span{font-size:24px;line-height:1}.hdKnock small{font:800 10px system-ui}.hdKnock:disabled{opacity:.5}
.hdWait{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(200px + env(safe-area-inset-bottom,0px));z-index:40;background:#101a15ee;border:1px solid #ffffff2a;border-radius:12px;padding:8px 12px;display:flex;gap:10px;align-items:center;color:#fff;font:700 12px system-ui}.hdWait button{background:#20372d;color:#fff;border:0;border-radius:8px;padding:5px 10px;font-weight:800}
.hdStack{position:fixed;top:64px;left:50%;transform:translateX(-50%);z-index:70;display:flex;flex-direction:column;gap:6px;width:min(420px,calc(100vw - 20px));pointer-events:none}
.hdCard{pointer-events:auto;display:flex;align-items:center;gap:8px;background:#0f1b16f2;border:1px solid #d99a42;border-radius:14px;padding:8px 10px;color:#fff;font:600 12px system-ui;box-shadow:0 6px 18px #0008}.hdCard>span{flex:1;min-width:0}.hdCard button{flex:none;background:#20372d;color:#fff;border:0;border-radius:10px;padding:7px 11px;font-weight:800;font-size:12px}.hdCard button.go{background:#d99a42;color:#1a1208}
.hdWrap{position:fixed;inset:0;z-index:80;background:#000a;display:grid;place-items:center;padding:10px;backdrop-filter:blur(3px)}
.hdBox{width:min(460px,100%);max-height:calc(100dvh - 24px);overflow:auto;display:flex;flex-direction:column;gap:9px;background:#0f1b16;color:#fff;border:1px solid #ffffff22;border-radius:18px;padding:14px;font-family:Inter,system-ui,sans-serif}
.hdHead{display:flex;justify-content:space-between;align-items:center}.hdHead h3{margin:0;font-size:18px}.hdHead button{background:#20372d;border:0;color:#fff;border-radius:50%;width:32px;height:32px;font-size:18px}
.hdSec{display:flex;flex-direction:column;gap:7px;background:#10201a;border:1px solid #ffffff14;border-radius:14px;padding:10px}.hdSec>b{font-size:13px}.hdSec small{color:#9fb5aa;font-size:11px;line-height:1.35}
.hdRow{display:flex;align-items:center;gap:8px;font-size:12px}.hdRow>span{flex:1}.hdRow button,.hdAdd button{background:#20372d;color:#fff;border:0;border-radius:10px;padding:7px 12px;font-weight:800;font-size:12px}.hdRow button.bad{background:#4a1f22}.hdAdd button.go{background:#d99a42;color:#1a1208}.hdAdd button:disabled{opacity:.5}
.hdAdd{display:flex;gap:8px}.hdAdd input{flex:1;min-width:0;background:#0b1511;color:#fff;border:1px solid #ffffff22;border-radius:10px;padding:8px 10px;font-size:13px}`;
