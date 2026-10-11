'use client';
import { useCallback, useEffect, useState } from 'react';
import RuntimeStyle from './RuntimeStyle';

/* Housemates: invite other players to live in your house (server: app/api/housemates, see HOUSEMATES.md).
   Owner: invite by name, cancel invites, ask someone to move out. Invited player: accept or decline. Housemate: leave.
   Whenever your home changes, onChanged() reloads the house (rooms, furniture, layout) and the street. */
type Snap = { livesAt: string | null; mates: { name: string; status: string }[]; invites: string[]; max: number };
const post = async (body: object) => { const r = await fetch('/api/housemates', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { ok: r.ok, d: await r.json().catch(() => ({})) as any }; }; // eslint-disable-line @typescript-eslint/no-explicit-any

export default function Housemates({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [s, setS] = useState<Snap | null>(null), [name, setName] = useState(''), [busy, setBusy] = useState(false), [note, setNote] = useState<{ t: string; bad?: boolean } | null>(null);
  const say = (t: string, bad = false) => { setNote({ t, bad }); setTimeout(() => setNote(n => (n && n.t === t ? null : n)), 3500); };
  const load = useCallback(async () => { try { const r = await fetch('/api/housemates', { cache: 'no-store' }); if (r.ok) setS(await r.json()); } catch { /* offline */ } }, []);
  useEffect(() => { load(); const i = setInterval(() => { if (!document.hidden) load(); }, 8000); return () => clearInterval(i); }, [load]);
  async function act(body: object, ok: string, moved = false) {
    if (busy) return; setBusy(true);
    try { const r = await post(body); if (!r.ok) say(r.d.error || 'Something went wrong.', true); else { setS(r.d); say(ok); if (moved) onChanged(); } } catch { say('No connection.', true); } finally { setBusy(false); }
  }
  const full = !!s && s.mates.length >= s.max;
  return <div className="hmWrap" onClick={onClose}><div className="hmBox" onClick={e => e.stopPropagation()}>
    <RuntimeStyle css={CSS} id="arl-housemates" />
    <div className="hmHead"><div><h3>🏠 Housemates</h3><small>{s?.livesAt ? `You live in ${s.livesAt}'s house` : 'Live together in one house'}</small></div><button onClick={onClose} aria-label="Close">×</button></div>
    {note && <div className={'hmNote' + (note.bad ? ' bad' : '')}>{note.t}</div>}
    {!s && <p className="hmInfo">Loading…</p>}
    {s && s.invites.length > 0 && <div className="hmSec"><b>Invites for you</b>{s.invites.map(o => <div key={o} className="hmRow"><span>🏠 <b>{o}</b> invited you to live in their house</span>
      <button className="go" disabled={busy} onClick={() => act({ action: 'accept', name: o }, `You moved into ${o}'s house!`, true)}>Move in</button><button disabled={busy} onClick={() => act({ action: 'decline', name: o }, 'Invite declined.')}>No</button></div>)}
      <small>Moving in means you use their rooms and furniture. Your own house stays empty on the street.</small></div>}
    {s?.livesAt && <div className="hmSec"><b>Your home</b><div className="hmRow"><span>You live in <b>{s.livesAt}</b>&apos;s house. You can rearrange it and place your own furniture; only the owner builds rooms or sells fixtures.</span>
      <button className="bad" disabled={busy} onClick={() => { if (confirm(`Move out of ${s.livesAt}'s house? You go back to your own.`)) act({ action: 'leave' }, 'You moved out.', true); }}>Move out</button></div></div>}
    {s && !s.livesAt && <div className="hmSec"><b>Your housemates ({s.mates.length}/{s.max})</b>
      {!s.mates.length && <p className="hmInfo">Nobody yet. Invite a friend: they accept, then they live in your house, use your rooms and furniture, and can come and go through your front door.</p>}
      {s.mates.map(m => <div key={m.name} className="hmRow"><span>{m.status === 'live' ? '🛏️' : '⏳'} <b>{m.name}</b> <em>{m.status === 'live' ? 'lives here' : 'invited'}</em></span>
        <button className="bad" disabled={busy} onClick={() => { if (m.status !== 'live' || confirm(`Ask ${m.name} to move out?`)) act({ action: m.status === 'live' ? 'remove' : 'cancel', name: m.name }, m.status === 'live' ? `${m.name} moved out.` : 'Invite cancelled.'); }}>{m.status === 'live' ? 'Move out' : 'Cancel'}</button></div>)}
      <div className="hmAdd"><input value={name} maxLength={30} placeholder="Player name" disabled={full} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && name.trim() && !full) { act({ action: 'invite', name: name.trim() }, `Invite sent to ${name.trim()}.`); setName(''); } }} />
        <button className="go" disabled={busy || full || !name.trim()} onClick={() => { act({ action: 'invite', name: name.trim() }, `Invite sent to ${name.trim()}.`); setName(''); }}>{full ? 'House full' : 'Invite'}</button></div></div>}
    <small className="hmFoot">Housemates share the house&apos;s furniture, layout and rooms. A burglar who breaks in takes cash from the owner only.</small>
  </div></div>;
}
const CSS = `.hmWrap{position:fixed;inset:0;z-index:80;background:#000a;display:grid;place-items:center;padding:10px;backdrop-filter:blur(3px)}
.hmBox{width:min(520px,100%);max-height:calc(100dvh - 24px);overflow:auto;display:flex;flex-direction:column;gap:9px;background:#0f1b16;color:#fff;border:1px solid #ffffff22;border-radius:18px;padding:14px;font-family:Inter,system-ui,sans-serif}
.hmHead{display:flex;justify-content:space-between;align-items:flex-start}.hmHead h3{margin:0;font-size:18px}.hmHead small{color:#9fb5aa;font-size:11px}.hmHead button{background:#20372d;border:0;color:#fff;border-radius:50%;width:32px;height:32px;font-size:18px}
.hmNote{background:#1f3a2e;border:1px solid #ffffff22;border-radius:10px;padding:7px 10px;font-size:12px}.hmNote.bad{background:#4a1f22;border-color:#e5484d66}
.hmInfo{margin:0;color:#c3d6cb;font-size:12px;line-height:1.4}
.hmSec{display:flex;flex-direction:column;gap:7px;background:#10201a;border:1px solid #ffffff14;border-radius:14px;padding:10px}.hmSec>b{font-size:13px}.hmSec>small{color:#9fb5aa;font-size:10px}
.hmRow{display:flex;align-items:center;gap:8px;font-size:12px;color:#d5e4db}.hmRow>span{flex:1;min-width:0;line-height:1.35}.hmRow em{color:#9fb5aa;font-style:normal;font-size:11px}
.hmRow button,.hmAdd button{flex:none;background:#20372d;color:#fff;border:0;border-radius:10px;padding:7px 12px;font-weight:800;font-size:12px}.hmRow button.go,.hmAdd button.go{background:#d99a42;color:#1a1208}.hmRow button.bad{background:#4a1f22}.hmRow button:disabled,.hmAdd button:disabled{opacity:.5}
.hmAdd{display:flex;gap:8px}.hmAdd input{flex:1;min-width:0;background:#0b1511;color:#fff;border:1px solid #ffffff22;border-radius:10px;padding:8px 10px;font-size:13px}
.hmFoot{color:#7f968b;font-size:10px;text-align:center}`;
