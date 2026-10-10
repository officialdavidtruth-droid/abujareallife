'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import RuntimeStyle from './RuntimeStyle';
import { CITY } from '../lib/cityData';
import { goDown } from '../lib/cityNet';
import { PASSOUT_DOWN_MS } from '../lib/downed';
import { ASOEBI, GENRES, OCCASIONS, PARTY, PARTY_KINDS, kindDef, type PartyKind } from '../lib/parties';

/* Parties, hangouts, owambes and club nights: browse what friends and strangers are hosting, host your own, and (once inside) dance, spray, order, invite.
   Everything is decided by /api/party; this panel only shows it. Phone-first: big tap targets, 16px inputs. */
const naira = (n: number) => '₦' + Math.round(n).toLocaleString('en-NG');
const j = async (url: string, body?: object) => { try { const r = await fetch(url, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' }); return { ok: r.ok, d: await r.json().catch(() => ({})) }; } catch { return { ok: false, d: { error: 'No connection.' } }; } };
const clock = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`; };
const buzz = (ms = 25) => { try { navigator.vibrate?.(ms); } catch {} };
const keys = (e: React.KeyboardEvent) => e.stopPropagation(); // typing must not walk the character around
const genreEmote = (g: string) => (g === 'afrobeats' || g === 'fuji' ? 'shaku' : g === 'amapiano' ? 'azonto' : 'dance');
const clubs = CITY.businesses.filter(b => b.type === 'Nightclub');
type Tab = 'here' | 'live' | 'host' | 'friends';

export default function PartyPanel({ onCash, say }: { onCash: (n: number) => void; say: (m: string) => void }) {
  const [d, setD] = useState<any>(null), [bad, setBad] = useState(''), [armed, setArmed] = useState(''), [tab, setTab] = useState<Tab | null>(null), [busy, setBusy] = useState(false), [, tick] = useState(0), got = useRef(Date.now());
  const [f, setF] = useState({ kind: 'house' as PartyKind, title: '', genre: 'afrobeats', cover: '0', markup: '1', friendsOnly: false, occasion: 'Birthday', dress: 'No dress code', venueId: clubs[0]?.id || '' });
  const [amt, setAmt] = useState<number>(PARTY.sprayTiers[1]), [inv, setInv] = useState('');
  const load = useCallback(async () => { const r = await j('/api/party'); if (r.ok) { setD(r.d); setBad(''); got.current = Date.now(); } else setBad(r.d.error || 'Parties are unavailable.'); }, []);
  // poll gently (mobile data): quick while you are inside a party, slow otherwise, and not at all while the tab is hidden
  const inside = !!d?.party;
  useEffect(() => { load(); const i = setInterval(() => { if (!document.hidden) load(); }, inside ? 5000 : 12000); const v = () => { if (!document.hidden) load(); }; document.addEventListener('visibilitychange', v); return () => { clearInterval(i); document.removeEventListener('visibilitychange', v); }; }, [load, inside]);
  useEffect(() => { const i = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(i); }, []);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(''), 3500); return () => clearTimeout(t); }, [armed]);
  const left = (ms: number) => ms - (Date.now() - got.current); // the server sends "time left"; count it down between refreshes

  const fx = (v: Record<string, number>) => window.dispatchEvent(new CustomEvent('arl-need-fx', { detail: v }));
  const emote = (k: string, toName?: string) => window.dispatchEvent(new CustomEvent('arl-do-act', { detail: { k, to: toName } }));
  async function act(body: object, after?: (r: any) => void) {
    if (busy) return false; setBusy(true); const r = await j('/api/party', body); setBusy(false);
    if (!r.ok) { say(r.d.error || 'That did not work.'); buzz(80); return false; }
    buzz(); setD(r.d); got.current = Date.now();
    if (typeof r.d.cash === 'number') onCash(r.d.cash);
    if (r.d.fx) fx(r.d.fx);
    if (r.d.blackout) { fx(r.d.penalty || {}); goDown(r.d.downMs || PASSOUT_DOWN_MS, 'passout'); }
    if (r.d.pingTo) window.dispatchEvent(new CustomEvent('arl-dm-sent', { detail: r.d.pingTo }));
    if (r.d.msg) say(r.d.msg);
    after?.(r.d); return true;
  }
  if (!d) return <div className="pty"><RuntimeStyle css={CSS} id="arl-party" />{bad ? <><p className="m">⚠️ {bad}</p><button className="ptyGo" onClick={load}>Try again</button></> : <p className="m">Loading…</p>}</div>;

  const p = d.party, cur: Tab = tab || (p ? 'here' : 'live');
  const kd = kindDef(f.kind)!, setup = kd.setup, short = d.cash < setup;
  const Tabs = <div className="ptyTabs">{([['here', '🎉', p ? 'Now' : 'Inside'], ['live', '🔥', `Tonight${d.live.length ? ' (' + d.live.length + ')' : ''}`], ['host', '🎤', 'Host'], ['friends', '👥', 'Friends']] as [Tab, string, string][]).filter(([id]) => id !== 'here' || p).map(([id, e, l]) => <button key={id} className={cur === id ? 'on' : ''} onClick={() => setTab(id)}>{e} {l}</button>)}</div>;

  /* ───────── inside a party ───────── */
  const Here = () => {
    if (!p) return null; const kind = kindDef(p.kind)!, others = p.guests.filter((g: any) => !g.you);
    return <>
      <div className="ptyHero"><div><b>{kind.e} {p.title}</b><small>{p.occasion ? `${p.occasion} · ` : ''}{p.venueName} · {p.district}{p.dress ? ` · Asoebi: ${p.dress}` : ''}</small><small>Hosted by {p.hostName} · {p.count}/{p.cap} inside · ends in {clock(left(p.endsInMs))}</small></div>
        <div className="ptyVibe" title="Vibe"><i style={{ width: p.vibe + '%' }} /><span>{p.vibe < 25 ? '😴 Quiet' : p.vibe < 55 ? '🙂 Warming up' : p.vibe < 80 ? '🔥 Lit' : '🤯 On fire'} · {p.vibe}</span></div></div>
      <div className="ptyAct">
        <button className="big" disabled={busy || left(p.me.danceInMs) > 0} onClick={() => { emote(genreEmote(p.genre)); act({ action: 'dance' }); }}>💃 Dance{left(p.me.danceInMs) > 0 ? ` (${Math.ceil(left(p.me.danceInMs) / 1000)})` : ''}</button>
        <button disabled={busy} onClick={() => emote('circle', '*')}>🔥 Dance circle</button>
        <button disabled={busy} onClick={() => emote('clap')}>👏 Cheer</button>
      </div>
      <h4>🍽️ Food &amp; drinks</h4>
      <div className="ptyMenu">{p.menu.map((m: any) => <button key={m.id} disabled={busy} onClick={() => act({ action: 'order', item: m.id })}><span>{m.e}</span><b>{m.label}</b><small>{naira(m.price)}{m.drunk ? ` · 🍺${m.drunk}` : ''}</small></button>)}</div>
      <h4>💸 Spray money</h4>
      {others.length === 0 ? <p className="m">Nobody else is inside yet.</p> : <>
        <div className="ptyChips">{PARTY.sprayTiers.map(t => <button key={t} className={amt === t ? 'on' : ''} onClick={() => setAmt(t)}>{naira(t)}</button>)}</div>
        <div className="ptyGuests">{p.guests.map((g: any) => <div key={g.name} className={'ptyG' + (g.you ? ' you' : '')}>
          <span>{g.host ? '👑' : g.dancingNow ? '🕺' : '🧍'}</span><div><b>{g.name}{g.you ? ' (you)' : ''}</b><small>{g.host ? 'Host' : 'Guest'}{g.received ? ` · got ${naira(g.received)}` : ''}{g.dances ? ` · ${g.dances} dances` : ''}</small></div>
          {!g.you && <button disabled={busy} onClick={() => { act({ action: 'spray', to: g.name, amount: amt }, () => emote('spray')); }}>💸 {naira(amt)}</button>}
          {p.isHost && !g.you && <button className="ghost" disabled={busy} onClick={() => { if (armed !== 'k' + g.name) return setArmed('k' + g.name); setArmed(''); act({ action: 'kick', name: g.name }); }}>{armed === 'k' + g.name ? 'Sure?' : 'Kick'}</button>}
        </div>)}</div>
        <p className="m">The city keeps {Math.round(PARTY.sprayFee * 100)}% of every spray. Spraying lifts the vibe{kind.sprayMult > 1 ? ' even more at an owambe' : ''}.</p></>}
      <h4>📨 Invite</h4>
      <div className="ptyIn"><input placeholder="Player name" maxLength={24} value={inv} onKeyDown={keys} onKeyUp={keys} onChange={e => setInv(e.target.value)} /><button disabled={busy || !inv.trim()} onClick={() => act({ action: 'invite', to: inv }, () => setInv(''))}>Send</button></div>
      {d.friends.filter((x: any) => x.online && !x.party).length > 0 && <div className="ptyChips">{d.friends.filter((x: any) => x.online && !x.party).slice(0, 8).map((x: any) => <button key={x.name} disabled={busy} onClick={() => act({ action: 'invite', to: x.name })}>＋ {x.name}</button>)}</div>}
      {p.isHost && <><h4>🎧 Music</h4><div className="ptyChips">{GENRES.map(g => <button key={g.id} disabled={busy} className={p.genre === g.id ? 'on' : ''} onClick={() => act({ action: 'music', genre: g.id })}>{g.e} {g.label}</button>)}</div>
        <p className="m">{left(p.musicInMs) > 0 ? `Switching the vibe again in ${clock(left(p.musicInMs))} gets a cheer.` : 'Changing the music gets a cheer and lifts the vibe.'}</p>
        <div className="ptyTake"><b>{naira(p.hostEarned)}</b><small>your take so far (door + drinks + spray)</small><span>{p.guestsTotal} guest{p.guestsTotal === 1 ? '' : 's'} · {naira(p.sprayTotal)} sprayed</span></div>
        <button className="ptyDanger" disabled={busy} onClick={() => { if (armed !== 'end') return setArmed('end'); setArmed(''); act({ action: 'end' }); }}>{armed === 'end' ? 'Tap again to end it for everyone' : 'End the party'}</button></>}
      {!p.isHost && <><div className="ptyTake"><b>{naira(p.me.spent)}</b><small>you spent tonight</small><span>{p.me.dances} dances</span></div>
        <button className="ptyDanger" disabled={busy} onClick={() => act({ action: 'leave' }, () => setTab('live'))}>Leave the party</button></>}
    </>;
  };

  /* ───────── tonight: the live list ───────── */
  const Live = () => <>
    <p className="m">Real players host these. Walk into the party's district, then tap Join.{d.district ? ` You are in ${d.district}.` : ''}</p>
    {d.live.length === 0 && <p className="ptyEmpty">🌙 Nothing is happening yet. Be the first: tap Host.</p>}
    {d.live.map((x: any) => { const k = kindDef(x.kind)!; return <div key={x.id} className={'ptyCard' + (x.friend ? ' fr' : '')}>
      <span>{k.e}</span><div><b>{x.title}</b><small>{x.occasion ? `${x.occasion} · ` : ''}{k.label} · {x.venueName} · {x.district}</small><small>by {x.hostName}{x.friend ? ' (friend)' : ''} · {x.count}/{x.cap} · {x.cover ? 'door ' + naira(x.cover) : 'free'} · 🔥 {x.vibe} · {clock(left(x.endsInMs))} left</small></div>
      {x.joined ? <button className="ghost" onClick={() => setTab('here')}>Inside</button> : <button disabled={busy || !!p || x.count >= x.cap} onClick={() => act({ action: 'join', id: x.id }, () => setTab('here'))}>{p ? 'Busy' : x.count >= x.cap ? 'Full' : x.here ? 'Join' : 'Go there'}</button>}
      {!x.here && !x.joined && <em>{x.district}</em>}
    </div>; })}
  </>;

  /* ───────── host your own ───────── */
  const Host = () => <>
    {p?.isHost ? <p className="m">You are already hosting. Open “Now” to run it.</p> : p ? <p className="m">Leave the party you are at before hosting your own.</p> : <>
      <div className="ptyKinds">{Object.values(PARTY_KINDS).map(k => <button key={k.id} className={f.kind === k.id ? 'on' : ''} onClick={() => setF({ ...f, kind: k.id, friendsOnly: k.friendsOnly ? true : f.friendsOnly, cover: String(Math.min(Number(f.cover) || 0, k.coverMax)) })}><span>{k.e}</span><b>{k.label}</b><small>{k.setup ? naira(k.setup) : 'Free'} · up to {k.cap}</small></button>)}</div>
      <p className="m">{kd.blurb} Lasts {Math.round(kd.durationMs / 3600_000)}h. {kd.id === 'club' ? 'You must be in the club’s district to book it.' : `Held where you stand${d.district ? ' (' + d.district + ')' : ''}.`}</p>
      <input placeholder={kd.id === 'owambe' ? 'e.g. Tunde & Bisi’s wedding' : kd.id === 'club' ? 'e.g. Amapiano Fridays' : 'Name your party'} maxLength={PARTY.titleMax} value={f.title} onKeyDown={keys} onKeyUp={keys} onChange={e => setF({ ...f, title: e.target.value })} />
      {kd.needsClub && <select value={f.venueId} onChange={e => setF({ ...f, venueId: e.target.value })}>{clubs.map(c => <option key={c.id} value={c.id}>{c.name} · {c.district}{d.district === c.district ? ' ✔ you are here' : ''}</option>)}</select>}
      {kd.needsOccasion && <div className="ptyRow"><select value={f.occasion} onChange={e => setF({ ...f, occasion: e.target.value })}>{OCCASIONS.map(o => <option key={o}>{o}</option>)}</select><select value={f.dress} onChange={e => setF({ ...f, dress: e.target.value })}>{ASOEBI.map(o => <option key={o}>{o}</option>)}</select></div>}
      <div className="ptyRow"><select value={f.genre} onChange={e => setF({ ...f, genre: e.target.value })}>{GENRES.map(g => <option key={g.id} value={g.id}>{g.e} {g.label}</option>)}</select>
        {kd.coverMax > 0 && <input inputMode="numeric" placeholder={`Door fee (max ${naira(kd.coverMax)})`} value={f.cover} onKeyDown={keys} onKeyUp={keys} onChange={e => setF({ ...f, cover: e.target.value.replace(/\D/g, '') })} />}</div>
      <label className="ptyChk">Food &amp; drink prices <select value={f.markup} onChange={e => setF({ ...f, markup: e.target.value })}>{[0.5, 0.75, 1, 1.25, 1.5, 2].map(m => <option key={m} value={m}>{Math.round(m * 100)}% of list</option>)}</select></label>
      <label className="ptyChk"><input type="checkbox" disabled={kd.friendsOnly} checked={kd.friendsOnly || f.friendsOnly} onChange={e => setF({ ...f, friendsOnly: e.target.checked })} /> Friends only</label>
      <button className="ptyGo" disabled={busy || short || f.title.trim().length < PARTY.titleMin || (kd.needsClub && !f.venueId)} onClick={() => act({ action: 'host', kind: f.kind, title: f.title, genre: f.genre, cover: Number(f.cover) || 0, markup: Number(f.markup), friendsOnly: f.friendsOnly, occasion: f.occasion, dress: f.dress, venueId: f.venueId }, () => setTab('here'))}>{kd.e} Start it{setup ? ` · ${naira(setup)}` : ''}</button>
      {short && <p className="m">You need {naira(setup)} to set this up (you have {naira(d.cash)}).</p>}
      <p className="m">You earn the door fee, the margin on food and drinks, and every note sprayed on you. The setup cost is not refunded. A lively party with guests who stay earns you fame.</p></>}
  </>;

  /* ───────── friends ───────── */
  const Friends = () => <>
    <p className="m">Add friends from a player's card in the city (Players → profile) or in ❤️ Love. Friends can see your friends-only parties and hangouts.</p>
    {d.friends.length === 0 && <p className="ptyEmpty">No friends yet. Walk up to someone, tap them, and send a friend request.</p>}
    {d.friends.map((x: any) => <div key={x.name} className="ptyCard">
      <span>{x.party ? '🎉' : x.online ? '🟢' : '⚫'}</span><div><b>{x.name}</b><small>{x.bond.replace('_', ' ')} · {x.party ? `at “${x.party.title}”` : x.online ? `in ${x.district}` : 'offline'}</small></div>
      {x.party && !p && <button disabled={busy} onClick={() => act({ action: 'join', id: x.party.id }, () => setTab('here'))}>Join</button>}
      {p && !x.party && x.online && <button disabled={busy} onClick={() => act({ action: 'invite', to: x.name })}>Invite</button>}
      <button className="ghost" onClick={() => window.dispatchEvent(new CustomEvent('arl-open-chat', { detail: x.name }))}>💬</button>
    </div>)}
    {!p && <button className="ptyGo" onClick={() => { setF({ ...f, kind: 'hangout', friendsOnly: true, cover: '0' }); setTab('host'); }}>🛋️ Start a hangout with friends</button>}
  </>;

  return <div className="pty"><RuntimeStyle css={CSS} id="arl-party" />
    <h3>🎉 Parties &amp; hangouts</h3>{Tabs}{bad && <p className="ptyWarn">📶 Connection trouble. Showing the last update. <button onClick={load}>Retry</button></p>}
    {cur === 'here' && Here()}{cur === 'live' && Live()}{cur === 'host' && Host()}{cur === 'friends' && Friends()}
  </div>;
}

const CSS = `
div.pty{display:flex;flex-direction:column;gap:9px;color:#fff}div.pty h3{margin:0}div.pty h4{margin:8px 0 0;font-size:13px;color:#f0b94a}div.pty .m{margin:0;font-size:12px;color:#9fb5aa}div.pty .ptyTabs{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}div.pty .ptyTabs button,div.pty .ptyChips button{flex:0 0 auto;min-height:38px;padding:0 13px;border-radius:999px;border:1px solid #2d493b;background:#14261f;color:#fff;font-size:13px;font-weight:700}div.pty .ptyTabs button.on,div.pty .ptyChips button.on{background:#d99a42;border-color:#d99a42;color:#1a1208}div.pty input,div.pty select{background:#0a1511;border:1px solid #2a4337;border-radius:10px;padding:10px;color:#fff;font-size:16px;min-width:0;width:100%}div.pty .ptyRow{display:flex;gap:8px}div.pty .ptyRow>*{flex:1}div.pty .ptyIn{display:flex;gap:8px}div.pty .ptyIn button{flex:0 0 auto;padding:0 18px;border-radius:10px;border:0;background:#d99a42;color:#1a1208;font-weight:800;min-height:44px}div.pty .ptyChk{display:flex;align-items:center;gap:8px;font-size:13px}div.pty .ptyChk input{width:auto}div.pty .ptyChk select{width:auto;flex:1}div.pty .ptyKinds{display:grid;grid-template-columns:1fr 1fr;gap:8px}div.pty .ptyKinds button{display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 4px;border-radius:12px;border:1px solid #2d493b;background:#14261f;color:#fff}div.pty .ptyKinds button span{font-size:24px}div.pty .ptyKinds button small{font-size:10px;color:#9fb5aa}div.pty .ptyKinds button.on{border-color:#d99a42;background:#2a2113}div.pty .ptyGo{min-height:48px;border-radius:12px;border:0;background:#35c46b;color:#06210f;font-weight:900;font-size:15px}div.pty .ptyGo:disabled{opacity:.45}div.pty .ptyDanger{min-height:44px;border-radius:12px;border:1px solid #7d3a3a;background:#4a1f1f;color:#fff;font-weight:700}div.pty .ptyHero{display:flex;flex-direction:column;gap:8px;background:linear-gradient(135deg,#3a1d4d,#12261d);border:1px solid #ffffff22;border-radius:14px;padding:12px}div.pty .ptyHero div{display:flex;flex-direction:column;gap:2px}div.pty .ptyHero b{font-size:16px}div.pty .ptyHero small{font-size:11px;color:#c9d8d0}div.pty .ptyVibe{position:relative;height:26px;border-radius:999px;background:#0a1511;overflow:hidden;border:1px solid #ffffff22}div.pty .ptyVibe i{position:absolute;inset:0 auto 0 0;background:linear-gradient(90deg,#35c46b,#f0b94a,#e5484d);transition:width .6s}div.pty .ptyVibe span{position:relative;display:block;text-align:center;font-size:12px;font-weight:800;line-height:24px;text-shadow:0 1px 3px #000}div.pty .ptyAct{display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px}div.pty .ptyAct button{min-height:52px;border-radius:12px;border:1px solid #2d493b;background:#173126;color:#fff;font-weight:800;font-size:13px}div.pty .ptyAct button.big{background:#d99a42;border-color:#d99a42;color:#1a1208;font-size:16px}div.pty .ptyAct button:disabled{opacity:.5}div.pty .ptyMenu{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:8px}div.pty .ptyMenu button{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 4px;border-radius:12px;border:1px solid #2d493b;background:#14261f;color:#fff}div.pty .ptyMenu span{font-size:22px}div.pty .ptyMenu b{font-size:12px;text-align:center}div.pty .ptyMenu small{font-size:10px;color:#f0b94a}div.pty .ptyChips{display:flex;flex-wrap:wrap;gap:6px}div.pty .ptyGuests,div.pty>.ptyCard{display:flex;flex-direction:column;gap:6px}div.pty .ptyG,div.pty .ptyCard{display:flex;align-items:center;gap:9px;background:#10201a;border-radius:12px;padding:8px 10px}div.pty .ptyG.you{outline:2px solid #3fb98a}div.pty .ptyCard.fr{outline:1px solid #d99a42}div.pty .ptyG>span,div.pty .ptyCard>span{font-size:22px;flex:none}div.pty .ptyG>div,div.pty .ptyCard>div{display:flex;flex-direction:column;flex:1;min-width:0}div.pty .ptyG b,div.pty .ptyCard b{font-size:13px}div.pty .ptyG small,div.pty .ptyCard small{font-size:11px;color:#9fb5aa}div.pty .ptyG button,div.pty .ptyCard button{flex:none;min-height:38px;padding:0 12px;border-radius:10px;border:0;background:#35c46b;color:#06210f;font-weight:800;font-size:12px}div.pty .ptyG button.ghost,div.pty .ptyCard button.ghost{background:#1b2c25;color:#fff;border:1px solid #2d493b}div.pty .ptyCard em{font-style:normal;font-size:10px;color:#e5a04a}div.pty .ptyTake{display:flex;flex-direction:column;align-items:center;background:#10201a;border-radius:12px;padding:10px}div.pty .ptyTake b{font-size:20px;color:#f0b94a}div.pty .ptyTake small,div.pty .ptyTake span{font-size:11px;color:#9fb5aa}div.pty .ptyEmpty{text-align:center;color:#9fb5aa;font-size:13px;margin:12px 0}
div.pty.pty button,div.pty.pty select{touch-action:manipulation;-webkit-tap-highlight-color:transparent;text-align:center}
div.pty button:not(:disabled):active{transform:scale(.97)}
div.pty .ptyTabs{position:sticky;top:-1px;z-index:3;background:#09130f;padding:2px 0 6px}
div.pty .ptyTabs button,div.pty .ptyChips button{min-height:44px}
div.pty .ptyG button,div.pty .ptyCard button{min-height:44px;min-width:56px}
div.pty .ptyAct{position:sticky;top:50px;z-index:2;background:#09130f;padding:4px 0 6px}
div.pty .ptyWarn{margin:0;font-size:12px;background:#3a2a10;border:1px solid #d99a42;border-radius:10px;padding:6px 10px}div.pty .ptyWarn button{min-height:30px;padding:0 10px;border-radius:8px;border:1px solid #d99a42;background:none;color:#fff;margin-left:6px}
@media (max-height:480px){
  div.pty{gap:7px}div.pty .ptyHero{padding:9px}div.pty .ptyHero b{font-size:14px}div.pty .ptyAct button{min-height:46px}
  div.pty .ptyKinds{grid-template-columns:repeat(4,1fr)}div.pty .ptyKinds button{padding:7px 2px}div.pty .ptyKinds small{display:none}
  div.pty .ptyMenu{grid-template-columns:repeat(auto-fill,minmax(92px,1fr))}
}
@media (max-width:360px){div.pty .ptyRow{flex-direction:column}}

`;
