'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import RuntimeStyle from './RuntimeStyle';
import { CREW, CREW_KINDS, canManage, kindOf } from '../lib/crews';

/* Crews, gangs and companies: members, shared chat, turf, wars and the leaderboard. Everything is enforced by /api/crew; this panel only shows it. Phone-first: big tap targets, 16px inputs. */
const naira = (n: number) => '₦' + Math.round(n).toLocaleString();
const j = async (url: string, body?: object) => { try { const r = await fetch(url, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' }); return { ok: r.ok, d: await r.json().catch(() => ({})) as any }; } catch { return { ok: false, d: { error: 'No connection.' } as any }; } };
const clock = (s: number) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`; };
const keys = (e: React.KeyboardEvent) => e.stopPropagation(); // typing must not walk the character around
type Tab = 'home' | 'chat' | 'turf' | 'wars' | 'board';
type Chat = { id: string; from: string; sys: boolean; body: string; at: number; mine: boolean };

export default function CrewPanel({ onCash, say }: { onCash: (n: number) => void; say: (m: string) => void }) {
  const [d, setD] = useState<any>(null), [tab, setTab] = useState<Tab>('home'), [busy, setBusy] = useState(false), [, tick] = useState(0), got = useRef(Date.now());
  const [f, setF] = useState({ name: '', tag: '', kind: 'crew', motto: '', open: false }), [mode, setMode] = useState<'join' | 'create'>('join');
  const [inv, setInv] = useState(''), [amt, setAmt] = useState(''), [motto, setMotto] = useState<string | null>(null);
  const load = useCallback(async () => { const r = await j('/api/crew'); if (r.ok) { setD(r.d); got.current = Date.now(); } else say(r.d.error || 'Crews are unavailable.'); }, [say]);
  useEffect(() => { load(); const i = setInterval(() => { if (!document.hidden) load(); }, 8000); return () => clearInterval(i); }, [load]);
  useEffect(() => { const i = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(i); }, []);
  const left = (s: number) => s - (Date.now() - got.current) / 1000; // seconds the server sent, counted down locally between refreshes

  async function act(body: object, ok?: string) {
    if (busy) return; setBusy(true); const r = await j('/api/crew', body); setBusy(false);
    if (!r.ok) { say(r.d.error || 'That did not work.'); return false; }
    if (typeof r.d.cash === 'number') onCash(r.d.cash);
    if (ok) say(ok); await load(); return true;
  }
  if (!d) return <div className="crw"><RuntimeStyle css={CSS} id="arl-crew" /><p className="m">Loading…</p></div>;

  // ── not in a crew ──
  if (!d.crew) return <div className="crw"><RuntimeStyle css={CSS} id="arl-crew" />
    <h3>🛡️ Crews, gangs &amp; companies</h3>
    <p className="m">Team up for shared turf, a private chat, daily cups and wars against other crews.</p>
    <div className="crwTabs"><button className={mode === 'join' ? 'on' : ''} onClick={() => setMode('join')}>Join{d.invites.length ? ` (${d.invites.length})` : ''}</button><button className={mode === 'create' ? 'on' : ''} onClick={() => setMode('create')}>Start one</button></div>
    {mode === 'join' && <>
      {d.invites.length > 0 && <><h4>Invites</h4>{d.invites.map((i: any) => <div key={i.crewId} className="crwRow"><span>{kindOf(i.kind).e}</span><div><b>[{i.tag}] {i.name}</b><small>{i.members} members · from {i.from}</small></div><button disabled={busy} onClick={() => act({ action: 'join', crewId: i.crewId }, 'Welcome!')}>Join</button><button className="ghost" disabled={busy} onClick={() => act({ action: 'decline', crewId: i.crewId })}>✕</button></div>)}</>}
      <h4>Open crews</h4>
      {d.open.length === 0 && <p className="m">No open crews yet. Start the first one, or ask a leader to invite you.</p>}
      {d.open.map((c: any) => <div key={c.crewId} className="crwRow"><span>{kindOf(c.kind).e}</span><div><b>[{c.tag}] {c.name}</b><small>{c.members}/{CREW.maxMembers} · rating {c.rating}{c.motto ? ' · ' + c.motto : ''}</small></div><button disabled={busy || c.members >= CREW.maxMembers} onClick={() => act({ action: 'join', crewId: c.crewId }, 'Welcome!')}>Join</button></div>)}
    </>}
    {mode === 'create' && <>
      <div className="crwKinds">{CREW_KINDS.map(k => <button key={k.id} className={f.kind === k.id ? 'on' : ''} onClick={() => setF({ ...f, kind: k.id })}><b>{k.e} {k.label}</b><small>{k.blurb}</small></button>)}</div>
      <input placeholder="Name" maxLength={CREW.nameMax} value={f.name} onKeyDown={keys} onKeyUp={keys} onChange={e => setF({ ...f, name: e.target.value })} />
      <input placeholder={`Tag (${CREW.tagMin}-${CREW.tagMax} letters)`} maxLength={CREW.tagMax} value={f.tag} onKeyDown={keys} onKeyUp={keys} onChange={e => setF({ ...f, tag: e.target.value.toUpperCase() })} />
      <input placeholder="Motto (optional)" maxLength={CREW.mottoMax} value={f.motto} onKeyDown={keys} onKeyUp={keys} onChange={e => setF({ ...f, motto: e.target.value })} />
      <label className="crwChk"><input type="checkbox" checked={f.open} onChange={e => setF({ ...f, open: e.target.checked })} /> Anyone can join (otherwise invite-only)</label>
      <button className="crwGo" disabled={busy || !f.name.trim() || !f.tag.trim()} onClick={() => act({ action: 'create', ...f }, 'Founded!')}>Found it · {naira(CREW.createCost)}</button>
      <small>You have {naira(d.cash)}. Claiming turf and starting wars needs {CREW.minToClaim}+ members.</small>
    </>}
  </div>;

  // ── in a crew ──
  const c = d.crew, k = kindOf(c.kind), mgr = canManage(c.role), boss = c.role === 'leader';
  const Tabs = <div className="crwTabs">{([['home', '👥', 'Crew'], ['chat', '💬', 'Chat'], ['turf', '🏴', 'Turf'], ['wars', '⚔️', 'Events'], ['board', '🏆', 'Board']] as [Tab, string, string][]).map(([id, e, l]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{e}<span>{l}</span>{id === 'chat' && d.unread > 0 && tab !== 'chat' ? <i>{d.unread > 9 ? '9+' : d.unread}</i> : null}</button>)}</div>;
  return <div className="crw"><RuntimeStyle css={CSS} id="arl-crew" />
    <div className="crwHead"><span>{k.e}</span><div><b>[{c.tag}] {c.name}</b><small>{k.label} · {c.motto || 'no motto yet'}</small></div></div>
    <div className="crwChips"><span>💰 {naira(c.treasury)}</span><span>⭐ {c.rating}</span><span>🏴 {c.turfCount}/{CREW.maxTurf}</span><span>👥 {c.members.length}/{CREW.maxMembers}</span></div>
    {d.wars.some((w: any) => left(w.endsIn) > 0) && tab !== 'wars' && <button className="crwAlert" onClick={() => setTab('wars')}>⚔️ War over {d.wars[0].district} is {left(d.wars[0].startsIn) > 0 ? 'starting soon' : 'on'}: tap to see the score</button>}
    {Tabs}
    {tab === 'home' && <>
      <h4>Members</h4>
      {c.members.map((m: any) => <div key={m.name} className="crwMem"><i className={m.active ? 'on' : ''} /><div><b>{m.name}{m.you ? ' (you)' : ''}</b><small>{m.role === 'leader' ? '👑 leader' : m.role === 'officer' ? '⭐ officer' : 'member'}</small></div>
        {!m.you && boss && m.role !== 'leader' && <button disabled={busy} onClick={() => act({ action: m.role === 'officer' ? 'demote' : 'promote', name: m.name })}>{m.role === 'officer' ? 'Demote' : 'Promote'}</button>}
        {!m.you && boss && <button disabled={busy} onClick={() => confirm(`Make ${m.name} the leader? You become an officer.`) && act({ action: 'transfer', name: m.name })}>👑</button>}
        {!m.you && mgr && m.role !== 'leader' && !(m.role === 'officer' && !boss) && <button className="ghost" disabled={busy} onClick={() => confirm(`Remove ${m.name}?`) && act({ action: 'kick', name: m.name })}>Kick</button>}
      </div>)}
      <small>Green dot = seen in the last 24 h. Turf income is shared between those members.</small>
      {mgr && <><h4>Invite a player</h4><div className="crwIn"><input placeholder="Player name" maxLength={24} value={inv} onKeyDown={keys} onKeyUp={keys} onChange={e => setInv(e.target.value)} /><button disabled={busy || !inv.trim()} onClick={async () => { if (await act({ action: 'invite', name: inv }, `Invite sent to ${inv.trim()}.`)) setInv(''); }}>Invite</button></div></>}
      <h4>Treasury</h4><p className="m">Pays for turf ({naira(CREW.claimCost)}) and wars ({naira(CREW.warFee)}). Nobody can withdraw from it.</p>
      <div className="crwIn"><input inputMode="numeric" placeholder="Amount to donate" value={amt} onKeyDown={keys} onKeyUp={keys} onChange={e => setAmt(e.target.value.replace(/\D/g, ''))} /><button disabled={busy || !amt} onClick={async () => { if (await act({ action: 'donate', amount: Number(amt) }, `Donated ${naira(Number(amt))}.`)) setAmt(''); }}>Donate</button></div>
      {mgr && <><h4>Settings</h4><div className="crwIn"><input value={motto ?? c.motto} maxLength={CREW.mottoMax} placeholder="Motto" onKeyDown={keys} onKeyUp={keys} onChange={e => setMotto(e.target.value)} /><button disabled={busy || motto === null} onClick={async () => { if (await act({ action: 'settings', motto: motto || '' }, 'Saved.')) setMotto(null); }}>Save</button></div>
        <label className="crwChk"><input type="checkbox" checked={c.open} onChange={e => act({ action: 'settings', open: e.target.checked })} /> Anyone can join</label></>}
      <button className="crwDanger" disabled={busy} onClick={() => confirm(c.members.length === 1 ? 'You are the last member: this closes the crew and releases its turf. Continue?' : 'Leave this crew?') && act({ action: 'leave' }, 'You left the crew.')}>Leave crew</button>
    </>}
    {tab === 'chat' && <ChatView say={say} />}
    {tab === 'turf' && <>
      <p className="m">Hold a district to earn {naira(CREW.turfHourly)}/hour: half goes to the treasury, half is split between members who were active. Claiming costs {naira(CREW.claimCost)} from the treasury and needs {CREW.minToClaim}+ members. New turf is shielded for {CREW.newTurfShieldMs / 3600_000} h.</p>
      {d.districts.map((x: any) => { const cool = x.coolIn !== 0, shield = left(x.shieldIn) > 0; return <div key={x.name} className={'crwRow' + (x.mine ? ' mine' : '')}><span>{x.mine ? '🏴' : x.holder ? '🚩' : '⬜'}</span><div><b>{x.name}</b><small>{x.mine ? 'Yours' : x.holder ? `[${x.holder.tag}] ${x.holder.name}` : 'Unclaimed'}{x.holder && shield ? ` · shielded ${clock(left(x.shieldIn))}` : ''}{cool && x.holder && !shield ? (x.coolIn < 0 ? ' · war on' : ` · cooling ${clock(left(x.coolIn))}`) : ''}</small></div>
        {mgr && !x.holder && <button disabled={busy || c.treasury < CREW.claimCost || c.members.length < CREW.minToClaim || c.turfCount >= CREW.maxTurf} onClick={() => act({ action: 'claim', district: x.name }, `${x.name} is yours.`)}>Claim</button>}
        {mgr && x.holder && !x.mine && <button className="war" disabled={busy || shield || cool || x.holderBusy || c.busy || c.treasury < CREW.warFee || c.members.length < CREW.minToClaim} onClick={() => confirm(`Declare war on [${x.holder.tag}] for ${x.name}? It costs ${naira(CREW.warFee)} and is not refunded.`) && act({ action: 'war', district: x.name }, 'War declared!')}>⚔️ War</button>}
        {boss && x.mine && <button className="ghost" disabled={busy} onClick={() => confirm(`Give up ${x.name}? No refund.`) && act({ action: 'abandon', district: x.name })}>Drop</button>}
      </div>; })}
    </>}
    {tab === 'wars' && <>
      <h4>Turf wars</h4>
      {d.wars.length === 0 && <p className="m">No war right now. Pick a rival's district on the Turf tab to attack it. Both crews are scored on money earned during the {CREW.warMs / 60_000}-minute window.</p>}
      {d.wars.map((w: any) => { const pre = left(w.startsIn) > 0, over = left(w.endsIn) <= 0; return <div key={w.id} className="crwWar"><b>{w.district}</b><small>{pre ? `Starts in ${clock(left(w.startsIn))}` : over ? 'Settling…' : `Ends in ${clock(left(w.endsIn))}`}</small>
        <div className="crwVs"><div className={w.mine === 'attacker' ? 'me' : ''}><small>Attackers</small><b>{w.attackerScore}</b><small>{w.attacker}</small></div><em>vs</em><div className={w.mine === 'defender' ? 'me' : ''}><small>Defenders (+{Math.round((CREW.warDefenderBonus - 1) * 100)}%)</small><b>{w.defenderScore}</b><small>{w.defender}</small></div></div>
        <small>Attackers need {CREW.warMinScore}+ points and a higher score to take the district. Max {CREW.memberCap} points per member.</small></div>; })}
      <h4>🏆 Crew Cup (today, UTC)</h4>
      <p className="m">Every crew with 2+ members who joined before today competes. Ends in {clock(left(d.cup.endsIn))}. Top three win {d.cup.prizes.map(naira).join(' / ')} for the treasury and rating.</p>
      {d.cup.mine !== null && <p className="m">Your crew: <b>{d.cup.mine}</b> pts</p>}
      <CupTable rows={d.cup.table} />
      <h4>Recent wars</h4>{d.history.length === 0 && <p className="m">None yet.</p>}
      {d.history.map((h: any, i: number) => <div key={i} className="crwRow"><span>{h.won ? '✅' : '❌'}</span><div><b>{h.district}</b><small>{h.attacker} {h.a} : {h.b} {h.defender}</small></div></div>)}
      <small>Points: money from shifts, quests, missions, races and uncaught crime ({k.label}: street ×{k.crime}, honest ×{k.legit}), {CREW.pointNaira.toLocaleString()} naira = 1 pt. Money moved between players does not count.</small>
    </>}
    {tab === 'board' && <Board />}
  </div>;
}

function CupTable({ rows }: { rows: { rank: number; name: string; tag: string; kind: string; score: number; mine: boolean }[] }) {
  if (!rows.length) return <p className="m">No crew has scored yet today.</p>;
  return <>{rows.map(r => <div key={r.rank} className={'crwLb' + (r.mine ? ' you' : '')}><em>#{r.rank}</em><b>{kindOf(r.kind).e} [{r.tag}] {r.name}</b><span>{r.score}</span></div>)}</>;
}
function Board() {
  const [b, setB] = useState<any>(null);
  useEffect(() => { let dead = false; const f = async () => { const r = await j('/api/crew/board'); if (r.ok && !dead) setB(r.d); }; f(); const i = setInterval(() => { if (!document.hidden) f(); }, 15000); return () => { dead = true; clearInterval(i); }; }, []);
  if (!b) return <p className="m">Loading ranking…</p>;
  return <><h4>🏆 Crew leaderboard</h4><p className="m">Rating comes from Crew Cup placings and turf wars.</p>
    {b.top.length === 0 && <p className="m">No crews yet.</p>}
    {b.top.map((r: any) => <div key={r.rank} className={'crwLb' + (r.mine ? ' you' : '')}><em>#{r.rank}</em><b>{kindOf(r.kind).e} [{r.tag}] {r.name}<small>{r.members} members · {r.turf} districts</small></b><span>{r.rating}</span></div>)}
    <h4>Today's cup</h4><CupTable rows={b.cup} /></>;
}
function ChatView({ say }: { say: (m: string) => void }) {
  const [msgs, setMsgs] = useState<Chat[]>([]), [text, setText] = useState(''), box = useRef<HTMLDivElement>(null), stick = useRef(true), last = useRef(0);
  const pull = useCallback(async () => {
    const r = await j('/api/crew/chat' + (last.current ? '?after=' + (last.current - 1000) : '')); if (!r.ok) return;
    const fresh: Chat[] = r.d.messages || []; if (!fresh.length) return;
    setMsgs(cur => { const have = new Set(cur.map(m => m.id)), add = fresh.filter(m => !have.has(m.id)); return add.length ? [...cur.filter(m => !m.id.startsWith('tmp')), ...add].slice(-200) : cur; });
    last.current = Math.max(last.current, ...fresh.map(m => m.at));
  }, []);
  useEffect(() => { pull(); const i = setInterval(() => { if (!document.hidden) pull(); }, 2500); return () => clearInterval(i); }, [pull]);
  useEffect(() => { if (stick.current) box.current?.scrollTo(0, 1e9); }, [msgs.length]);
  async function send() {
    const body = text.trim(); if (!body) return; setText(''); stick.current = true;
    const tmp: Chat = { id: 'tmp' + Date.now(), from: 'you', sys: false, body, at: Date.now(), mine: true }; setMsgs(c => [...c, tmp]);
    const r = await j('/api/crew/chat', { body });
    if (!r.ok) { setMsgs(c => c.filter(m => m.id !== tmp.id)); setText(body); say(r.d.error || 'Could not send.'); return; }
    setMsgs(c => [...c.filter(m => m.id !== tmp.id), r.d.message]); last.current = Math.max(last.current, r.d.message.at);
  }
  return <div className="crwChat"><div className="crwThread" ref={box} onScroll={e => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}>
    {msgs.length === 0 && <p className="m">Say something to your crew.</p>}
    {msgs.map(m => m.sys ? <div key={m.id} className="crwSys">{m.body}</div> : <div key={m.id} className={'crwMsg ' + (m.mine ? 'me' : 'them')}>{!m.mine && <small>{m.from}</small>}<span>{m.body}</span></div>)}
  </div>
  <div className="crwIn"><input placeholder="Message your crew" maxLength={CREW.chatMax} value={text} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') send(); }} onKeyUp={keys} onChange={e => setText(e.target.value)} /><button onClick={send} disabled={!text.trim()}>Send</button></div></div>;
}

const CSS = `
.crw{display:flex;flex-direction:column;gap:7px;color:#fff}.crw h3{margin:0}.crw h4{margin:8px 0 0;font-size:13px;color:#9fb5aa;text-transform:uppercase;letter-spacing:.04em}.crw .m{margin:0;font-size:12px;color:#b9cbc1}
.crw input[type=text],.crw input:not([type]),.crw input[inputmode]{flex:1;min-width:0;background:#0a1511;border:1px solid #2a4337;border-radius:12px;padding:10px 12px;color:#fff;font-size:16px}
.crwHead{display:flex;gap:10px;align-items:center}.crwHead>span{font-size:28px}.crwHead b{font-size:16px}
.crwChips{display:flex;flex-wrap:wrap;gap:6px}.crwChips span{background:#10201a;border:1px solid #ffffff14;border-radius:999px;padding:4px 10px;font-size:12px}
.crwTabs{display:flex;gap:4px}.crwTabs button{flex:1;position:relative;display:flex;flex-direction:column;align-items:center;gap:1px;text-align:center!important;padding:7px 2px!important;font-size:16px;min-height:44px}.crwTabs button span{font-size:10px;color:#b9cbc1}.crwTabs button.on{background:#1f5a42!important;border-color:#3fb98a!important}
.crwTabs i{position:absolute;top:2px;right:4px;background:#e5484d;border-radius:999px;font-size:10px;font-style:normal;font-weight:900;padding:0 5px}
.crwRow,.crwMem{display:flex;align-items:center;gap:8px;background:#10201a;border:1px solid #ffffff14;border-radius:12px;padding:8px 10px}.crwRow.mine{border-color:#d99a42;background:#1b2a1f}.crwRow>span{font-size:20px}.crwRow>div,.crwMem>div{flex:1;min-width:0}.crwRow b,.crwMem b{font-size:14px}
.crwRow button,.crwMem button,.crwIn button{flex:none;min-height:40px;padding:6px 12px!important;text-align:center!important}.crw .ghost{background:transparent!important}.crw .war{background:#5a1f1f!important;border-color:#e5484d!important}
.crwMem i{flex:none;width:9px;height:9px;border-radius:50%;background:#44524b}.crwMem i.on{background:#3fb98a}
.crwIn{display:flex;gap:6px}.crwKinds{display:flex;flex-direction:column;gap:6px}.crwKinds button.on{border-color:#3fb98a!important;background:#1f5a42!important}.crwChk{display:flex;gap:8px;align-items:center;font-size:13px}.crwChk input{width:20px;height:20px}
.crwGo{background:#1f5a42!important;border-color:#3fb98a!important;font-weight:800;text-align:center!important;min-height:44px}.crwDanger{margin-top:10px;background:#3a1517!important;border-color:#7a1015!important;text-align:center!important}
.crwAlert{background:#5a1f1f!important;border-color:#e5484d!important;font-weight:700}
.crwWar{background:#1a1414;border:1px solid #6b2b2b;border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:5px}.crwVs{display:flex;align-items:center;gap:8px;text-align:center}.crwVs>div{flex:1;border-radius:10px;padding:6px;background:#10201a}.crwVs>div.me{outline:2px solid #3fb98a}.crwVs b{display:block;font-size:24px}.crwVs em{color:#9fb5aa;font-style:normal}
.crwLb{display:flex;align-items:center;gap:8px;background:#10201a;border-radius:10px;padding:7px 10px;font-size:13px}.crwLb.you{outline:2px solid #3fb98a}.crwLb em{flex:none;width:30px;color:#9fb5aa;font-style:normal}.crwLb b{flex:1;min-width:0}.crwLb span{font-weight:800}
.crwChat{display:flex;flex-direction:column;gap:6px}.crwThread{height:min(300px,calc(100dvh - 380px));min-height:160px;overflow:auto;background:#0a1511;border-radius:12px;padding:8px;display:flex;flex-direction:column;gap:4px}
.crwMsg{display:flex;flex-direction:column;max-width:82%}.crwMsg.me{align-self:flex-end;align-items:flex-end}.crwMsg span{padding:6px 11px;border-radius:15px;font-size:14px;line-height:1.3;word-break:break-word}.crwMsg.me span{background:#1f5a42}.crwMsg.them span{background:#20372d}.crwMsg small{margin:0 6px 1px}
.crwSys{align-self:center;text-align:center;font-size:11px;color:#9fb5aa;padding:2px 8px}
`;
