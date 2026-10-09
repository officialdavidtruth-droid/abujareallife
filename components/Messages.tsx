'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GAME } from './CityWorld';
import RuntimeStyle from './RuntimeStyle';
import { phoneOf } from '../lib/phone';

/* The phone's Messages app: a chat list, a thread per player, and phone-grade features (location, money, read receipts, maps). */
type Msg = { id: string; mine: boolean; kind: string; body: string; data: any; at: number; read: boolean; pending?: boolean; failed?: boolean };
type Conv = { name: string; last: Msg; unread: number };
const naira = (n: number) => '₦' + Math.round(n).toLocaleString();
const ago = (t: number) => { const s = Math.max(0, (Date.now() - t) / 1000); return s < 60 ? 'now' : s < 3600 ? Math.floor(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : Math.floor(s / 86400) + 'd'; };
const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const j = async (url: string, body?: object) => { try { const r = await fetch(url, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' }); return { ok: r.ok, status: r.status, d: await r.json().catch(() => ({})) as any }; } catch { return { ok: false, status: 0, d: { error: 'No connection.' } as any }; } };
const FAILED: Record<string, Msg[]> = {}; // unsent texts survive closing the chat or the phone
const preview = (m: Msg) => (m.mine ? 'You: ' : '') + (m.kind === 'loc' ? '📍 Location' : m.kind === 'cash' ? '💸 ' + naira(m.data?.amount || 0) : m.body);

export default function Messages({ start, onCash, onClose, onUnread }: { start: string | null; onCash: (n: number) => void; onClose: () => void; onUnread: (n: number) => void }) {
  const [convs, setConvs] = useState<Conv[]>([]), [tier] = useState(3), [cash, setCash] = useState(0), [open, setOpen] = useState<string | null>(start);
  const [thread, setThread] = useState<Msg[]>([]), [text, setText] = useState(''), [menu, setMenu] = useState<'' | 'attach' | 'cash'>(''), [amount, setAmount] = useState(''), [newName, setNewName] = useState('');
  const [note, setNote] = useState<{ t: string; bad?: boolean } | null>(null), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false), box = useRef<HTMLDivElement>(null), stick = useRef(true), local = useRef<Msg[]>([]);
  const ph = phoneOf(tier);
  const say = (t: string, bad = false) => { setNote({ t, bad }); setTimeout(() => setNote(n => (n && n.t === t ? null : n)), 4500); };
  useEffect(() => { if (start) setOpen(start); }, [start]);

  const loadList = useCallback(async () => { const r = await j('/api/messages'); if (r.ok) { setConvs(r.d.convs || []); setCash(r.d.cash || 0); onUnread(r.d.unread || 0); setLoaded(true); } else if (!loaded) { say(r.d.error || 'Messages are unavailable.', true); setLoaded(true); } }, [onUnread]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadThread = useCallback(async (name: string) => { const r = await j('/api/messages?with=' + encodeURIComponent(name)); if (r.ok) { const srv: Msg[] = r.d.messages || []; const ids = new Set(srv.map(m => m.id)); local.current = local.current.filter(m => m.pending || m.failed || (!ids.has(m.id) && Date.now() - m.at < 15000)); setThread([...srv, ...local.current.filter(m => !ids.has(m.id))].sort((a, b) => a.at - b.at)); if (r.d.name && r.d.name !== name) setOpen(r.d.name); } else { say(r.d.error || 'Could not open that chat.', true); if (r.status === 404) setOpen(null); } }, []);
  useEffect(() => { loadList(); const id = setInterval(() => { if (!document.hidden) loadList(); }, open ? 6000 : 3500); return () => clearInterval(id); }, [loadList, open]);
  useEffect(() => { local.current = open ? (FAILED[open.toLowerCase()] || []).slice() : []; if (!open) { setThread([]); return; } loadThread(open); const id = setInterval(() => { if (!document.hidden) loadThread(open); }, 2000); return () => clearInterval(id); }, [open, loadThread]);
  useEffect(() => { if (stick.current) box.current?.scrollTo(0, 1e9); }, [thread.length, open]);

  async function send(kind: 'text' | 'loc' | 'cash' = 'text', extra: object = {}) {
    if (!open) return; const body = kind === 'text' ? text.trim() : '';
    if (kind === 'text' && !body) return;
    if (kind === 'text') { // instant: show the bubble and clear the box right now, send in the background
      const tmp: Msg = { id: 'tmp-' + Date.now() + Math.random().toString(36).slice(2, 6), mine: true, kind: 'text', body, data: null, at: Date.now(), read: false, pending: true };
      local.current = [...local.current, tmp]; stick.current = true; setThread(t => [...t, tmp]); setText('');
      const to = open, r = await j('/api/messages', { to, kind, body });
      if (r.ok) { window.dispatchEvent(new CustomEvent('arl-dm-sent', { detail: to })); const real: Msg = r.d.message; local.current = local.current.map(m => (m.id === tmp.id ? real : m)); setThread(t => t.map(m => (m.id === tmp.id ? real : m))); }
      else { local.current = local.current.map(m => (m.id === tmp.id ? { ...m, pending: false, failed: true } : m)); FAILED[to.toLowerCase()] = local.current.filter(m => m.failed); setThread(t => t.map(m => (m.id === tmp.id ? { ...m, pending: false, failed: true } : m))); say(r.d.error || 'Could not send.', true); }
      return;
    }
    if (busy) return;
    setBusy(true); const r = await j('/api/messages', { to: open, kind, body: kind === 'cash' ? text.trim() : body, ...extra }); setBusy(false);
    if (!r.ok) { say(r.d.error || 'Could not send.', true); return; }
    window.dispatchEvent(new CustomEvent('arl-dm-sent', { detail: String(open) })); stick.current = true; local.current = [...local.current, r.d.message]; setThread(t => [...t, r.d.message]); setText(''); setMenu('');
    if (kind === 'cash') { setCash(r.d.cash); onCash(r.d.cash); setAmount(''); say(`💸 Sent ${naira(r.d.message.data?.amount || 0)} to ${open}`); }
    loadList();
  }
  const retry = (m: Msg) => { local.current = local.current.filter(x => x.id !== m.id); if (open) FAILED[open.toLowerCase()] = local.current.filter(x => x.failed); setThread(t => t.filter(x => x.id !== m.id)); setText(m.body); };
  const navigate = (m: Msg, from: string) => { GAME.nav = { x: m.data.x, z: m.data.z, name: `${from}'s location` }; GAME.notice = '🗺️ Following the map…'; onClose(); };
  const startNew = () => { const n = newName.trim(); if (n) { setNewName(''); setOpen(n); } };

  if (open) return <div className="msThreadWrap">
    <RuntimeStyle css={CSS} id="arl-messages" />
    <div className="msBar"><button onClick={() => { setOpen(null); loadList(); }} aria-label="Back">←</button><div><b>{open}</b></div></div>
    {note && <div className={'msNote' + (note.bad ? ' bad' : '')}>{note.t}</div>}
    <>
      <div className="msThread" ref={box} onScroll={e => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}>
        {thread.length === 0 && <div className="msEmpty">👋 Say hi to {open}</div>}
        {thread.map((m, i) => <div key={m.id} className={'msRow ' + (m.mine ? 'me' : 'them')}>
          {(i === 0 || m.at - thread[i - 1].at > 600000) && <div className="msDay">{clock(m.at)}</div>}
          <div className={'msBub ' + m.kind}>
            {m.kind === 'text' && m.body}
            {m.kind === 'loc' && <><b>📍 {m.mine ? 'You shared your location' : `${open} shared a location`}</b>{!m.mine && <button className="msGo" onClick={() => navigate(m, open)}>🗺️ Navigate</button>}</>}
            {m.kind === 'cash' && <><b>💸 {m.mine ? 'You sent' : `${open} sent you`} {naira(m.data?.amount || 0)}</b>{m.body && <span>{m.body}</span>}</>}
            <small>{m.failed ? <button className="msRetry" onClick={() => retry(m)}>⚠ Not sent · tap to retry</button> : <>{clock(m.at)}{m.mine ? (m.pending ? ' …' : m.read ? ' ✓✓' : ' ✓') : ''}</>}</small>
          </div></div>)}
      </div>
      {menu === 'attach' && <div className="msAttach">
        <button onClick={() => send('loc', { x: GAME.player.x, z: GAME.player.z, body: '📍 My location' })}><b>📍</b><span>Location</span></button>
        <button onClick={() => setMenu('cash')}><b>💸</b><span>Send money</span></button></div>}
      {menu === 'cash' && <div className="msCashBox"><small>Cash: {naira(cash)}</small>
        <div><input inputMode="numeric" placeholder="Amount (₦)" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))} /><button disabled={busy || !Number(amount)} onClick={() => send('cash', { amount: Number(amount) })}>Send {Number(amount) ? naira(Number(amount)) : ''}</button></div>
        <input placeholder="Add a note (optional)" maxLength={80} value={text} onChange={e => setText(e.target.value)} /></div>}
      <div className="msIn"><button className="msPlus" onClick={() => setMenu(menu === 'attach' || menu === 'cash' ? '' : 'attach')} aria-label="More">＋</button>
        <input value={menu === 'cash' ? '' : text} disabled={menu === 'cash'} maxLength={ph.maxLen} placeholder={menu === 'cash' ? 'Sending money…' : 'Message…'} enterKeyHint="send" onChange={e => setText(e.target.value)} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') send(); }} onKeyUp={e => e.stopPropagation()} />
        <button className="msSend" disabled={menu === 'cash' || !text.trim()} onClick={() => send()}>Send</button></div>
      {text.length > ph.maxLen - 30 && menu !== 'cash' && <small className="msCount">{text.length}/{ph.maxLen}</small>}
    </>
  </div>;

  return <div className="msList">
    <RuntimeStyle css={CSS} id="arl-messages" />
    {note && <div className={'msNote' + (note.bad ? ' bad' : '')}>{note.t}</div>}
    <>
      <div className="msNew"><input placeholder="Text a player: type their name" value={newName} maxLength={24} onChange={e => setNewName(e.target.value)} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') startNew(); }} onKeyUp={e => e.stopPropagation()} /><button disabled={!newName.trim()} onClick={startNew}>Chat</button></div>
      {convs.length === 0 ? <div className="phoneEmpty">💬<b>{loaded ? 'No chats yet' : 'Loading…'}</b><small>Tap a player in the city and choose 💬 Message, or type a name above.</small></div>
        : convs.map(c => <button key={c.name} className={'msConv' + (c.unread ? ' un' : '')} onClick={() => setOpen(c.name)}><i>{c.name.slice(0, 1).toUpperCase()}</i><div><b>{c.name}</b><small>{preview(c.last)}</small></div><span>{ago(c.last.at)}{c.unread > 0 && <u>{c.unread > 9 ? '9+' : c.unread}</u>}</span></button>)}
    </>
  </div>;
}

const CSS = `
.msList,.msThreadWrap{display:flex;flex-direction:column;min-height:0;color:#fff}.msList{padding:0 14px 12px;overflow:auto;gap:8px}.msThreadWrap{height:min(520px,calc(100vh - 250px));min-height:300px;padding:0 10px 8px}
.msPhoneCard{display:flex;align-items:center;gap:10px;text-align:left;background:linear-gradient(135deg,#1c3a2d,#142a21);border:1px solid #ffffff1c;border-radius:14px;padding:10px 12px;color:#fff}.msPhoneCard span{font-size:26px}.msPhoneCard div{flex:1;min-width:0}.msPhoneCard b{display:block;font-size:13px}.msPhoneCard small{display:block;color:#a9c2b5;font-size:10px;line-height:1.3}.msPhoneCard em{font-style:normal;background:#d99a42;color:#1a1208;font-weight:900;font-size:11px;border-radius:999px;padding:5px 10px}
.msNew{display:flex;gap:6px}.msNew input,.msIn input,.msCashBox input{flex:1;min-width:0;background:#0a1511;border:1px solid #2a4337;border-radius:12px;padding:10px 12px;color:#fff;font-size:16px}.msNew button,.msCashBox button{background:#d99a42;color:#1a1208;border:0;border-radius:12px;padding:0 14px;font-weight:900}.msNew button:disabled,.msCashBox button:disabled,.msSend:disabled{opacity:.45}
.msConv{display:flex;align-items:center;gap:10px;text-align:left;background:#10201a;border:1px solid #ffffff14;border-radius:14px;padding:10px;color:#fff}.msConv i{flex:none;width:38px;height:38px;border-radius:50%;background:#2a5a45;display:grid;place-items:center;font-style:normal;font-weight:900}.msConv div{flex:1;min-width:0}.msConv b{display:block;font-size:14px}.msConv small{display:block;color:#9fb5aa;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.msConv span{flex:none;font-size:10px;color:#8fa59a;display:flex;flex-direction:column;align-items:flex-end;gap:4px}.msConv u{text-decoration:none;background:#e5484d;color:#fff;border-radius:999px;font-weight:900;padding:1px 6px;font-size:10px}.msConv.un{border-color:#d99a42}.msConv.un b{color:#ffd9a0}
.msBar{display:flex;align-items:center;gap:8px;padding:2px 2px 8px}.msBar>button{flex:none;width:34px;height:34px;border-radius:50%;border:0;background:#20372d;color:#fff;font-size:18px}.msBar div{flex:1;min-width:0}.msBar b{display:block;font-size:15px}.msBar small{color:#9fb5aa;font-size:10px}
.msThread{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:5px;padding:6px 2px;background:#0a1511;border-radius:14px}.msEmpty{margin:auto;color:#9fb5aa;font-size:13px}.msDay{text-align:center;font-size:10px;color:#7f968b;margin:6px 0 2px}
.msRow{display:flex;flex-direction:column}.msRow.me{align-items:flex-end}.msRow.them{align-items:flex-start}.msBub{max-width:80%;padding:7px 11px;border-radius:16px;font-size:14px;line-height:1.3;word-break:break-word;display:flex;flex-direction:column;gap:3px}.msRow.me .msBub{background:#d99a42;color:#1a1208;border-bottom-right-radius:5px}.msRow.them .msBub{background:#1d3329;color:#fff;border-bottom-left-radius:5px}.msBub small{font-size:9px;opacity:.65;align-self:flex-end}.msBub.cash{background:#1f6b43!important;color:#fff!important}.msBub.loc{background:#24527a!important;color:#fff!important}.msGo{background:#fff;color:#111;border:0;border-radius:10px;padding:6px 10px;font-weight:800;font-size:12px}
.msIn{display:flex;gap:6px;align-items:center;padding-top:8px}.msPlus{flex:none;width:38px;height:38px;border-radius:50%;border:0;background:#20372d;color:#fff;font-size:20px}.msSend{flex:none;height:38px;border:0;border-radius:12px;background:#d99a42;color:#1a1208;font-weight:900;padding:0 14px}.msCount{color:#8fa59a;font-size:10px;text-align:right}
.msAttach{display:flex;gap:8px;padding-top:8px}.msAttach button{flex:1;background:#10201a;border:1px solid #ffffff1c;border-radius:12px;color:#fff;padding:8px 2px}.msAttach b{display:block;font-size:20px}.msAttach span{font-size:10px;font-weight:800}
.msCashBox{display:flex;flex-direction:column;gap:6px;padding-top:8px}.msCashBox div{display:flex;gap:6px}.msCashBox small{color:#9fb5aa;font-size:10px}
.msRetry{background:none;border:0;color:#7a1015;font-weight:800;font-size:10px;padding:0}.msNote{background:#1f3a2e;border:1px solid #ffffff22;border-radius:10px;padding:7px 10px;font-size:12px;margin-bottom:6px}.msNote.bad{background:#4a1f22;border-color:#e5484d66}
.msPhones{flex:1;overflow:auto;display:flex;flex-direction:column;gap:8px}.msPhonesTop{display:flex;justify-content:space-between;align-items:center}.msPhonesTop button{background:#20372d;border:0;color:#fff;border-radius:10px;padding:6px 12px}.msCash{color:#9fb5aa;font-size:11px}
.msPh{background:#10201a;border:1px solid #ffffff14;border-radius:14px;padding:10px 12px}.msPh.own{border-color:#d99a42;background:#1b2a1f}.msPhHead{display:flex;justify-content:space-between;align-items:center;gap:8px}.msPhHead button{background:#d99a42;color:#1a1208;border:0;border-radius:999px;font-weight:900;padding:6px 12px;font-size:12px}.msPhHead button:disabled{opacity:.45}.msPhHead em{font-style:normal;font-size:10px;font-weight:900;color:#d99a42}.msPhHead em.dim{color:#7f968b}.msPh ul{margin:6px 0 0;padding-left:18px;font-size:11px;color:#c3d6cb;line-height:1.5}
.dockBadge{position:absolute;top:2px;right:2px;background:#e5484d;color:#fff;border-radius:999px;font-size:10px;font-weight:900;padding:1px 6px;pointer-events:none}.dockGrid button,.dockToggle{position:relative}
`;