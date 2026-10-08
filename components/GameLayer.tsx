'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GAME } from './CityWorld';
import { VEHICLE_CATALOG } from '../lib/vehicles';
import { NET } from '../lib/cityNet';
import { businessStatus } from '../lib/businessHours';
import { CRIMES, FAME_TIERS, checkAccess, HELP_FAME, HELP_TIP, JAIL_CELL_POS, POLICE_ARREST_RANGE, POLICE_STATION_POS, PROFESSIONS, QUESTS, RELATIONSHIPS, SKILLS, skillLevel, type CrimeId, type Origin, type Profile } from '../lib/profile';

import RuntimeStyle from './RuntimeStyle';
import Market from './Market';
import Messages from './Messages';
type Tier = { id: string; label: string; e: string; at: number; next: { label: string; at: number } | null; pct: number };
type St = { cash: number; heat: number; wanted: boolean; jailLeft: number; rank: number; profile: Profile; origin: Origin | null; hasCar: boolean; fame: number; tier: Tier };
type Row = { rank: number; name: string; fame: number; origin: string | null; tier: string; you: boolean };
type CityTab = 'map' | 'jobs' | 'businesses' | null;
const post = async (url: string, body?: object) => { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) }); return { ok: r.ok, d: await r.json().catch(() => ({})) as any }; };
const naira = (n: number) => '₦' + Math.round(n).toLocaleString();

/* Everything "no rules, real consequences": quests, crime, wanted level, real police arrests, jail, building access, relationships. */
export default function GameLayer({ username, onCash, near, role, onEnter, onDenied, open, onToggle, onCityTab, cityTab, getMinute }: { username: string; onCash: (n: number) => void; near: { name: string; type: string; id: string } | null; role: 'player' | 'police'; onEnter: (id: string) => void; onDenied?: (reason: string) => void; open: boolean; onToggle: () => void; onCityTab: (t: CityTab) => void; cityTab: CityTab; getMinute?: () => number }) {
  const [st, setSt] = useState<St | null>(null), [entering, setEntering] = useState(false), [tab, setTab] = useState<'quests' | 'crime' | 'police' | 'love' | 'me' | 'fame' | 'players' | 'phone' | null>(null), [board, setBoard] = useState<{ top: Row[]; me: { rank: number | null; fame: number; tier: string } | null } | null>(null), [msg, setMsg] = useState(''), [wanted, setWanted] = useState<{ name: string; heat: number }[]>([]);
  const [quest, setQuest] = useState<{ id: string; end: number } | null>(null), [, tick] = useState(0), [bail, setBail] = useState(0), [enter, setEnter] = useState<{ ok: boolean; reason: string; name: string } | null>(null);
  const [reqs, setReqs] = useState<any[]>([]), [to, setTo] = useState(''), wasJailed = useRef(false), [market, setMarket] = useState<{ seller?: string } | null>(null), [chatWith, setChatWith] = useState<string | null>(null), [unread, setUnread] = useState(0), seenMsg = useRef('');
  useEffect(() => { const f = (e: Event) => setMarket({ seller: String((e as CustomEvent).detail || '') || undefined }); window.addEventListener('arl-open-market', f); return () => window.removeEventListener('arl-open-market', f); }, []);
  useEffect(() => { const f = (e: Event) => { const n = String((e as CustomEvent).detail || ''); if (n) { setChatWith(n); setTab('phone'); } }; window.addEventListener('arl-open-chat', f); return () => window.removeEventListener('arl-open-chat', f); }, []);
  useEffect(() => { // unread badge + a pop-up when a new text arrives
    let dead = false;
    const poll = async () => { try { const r = await fetch('/api/messages?count=1', { cache: 'no-store' }); if (!r.ok || dead) return; const d = await r.json(); setUnread(d.unread || 0); const l = d.latest; if (l && l.id !== seenMsg.current) { const first = seenMsg.current === ''; seenMsg.current = l.id; if (!first) say(`💬 ${l.from}: ${l.kind === 'loc' ? '📍 shared a location' : l.kind === 'cash' ? '💸 sent you money' : String(l.body).slice(0, 60)}`); } else if (!l) seenMsg.current = seenMsg.current || '-'; } catch { /* offline */ } };
    poll(); const id = setInterval(poll, 6000); return () => { dead = true; clearInterval(id); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const say = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 4500); };
  const refresh = useCallback(async () => { const r = await fetch('/api/status'); if (r.ok) { const d = await r.json(); setSt(d); GAME.hasCar = !!d.hasCar; onCash(d.cash); } }, [onCash]);
  useEffect(() => { refresh(); const a = setInterval(refresh, 5000), b = setInterval(() => { if (GAME.notice) { say(GAME.notice); GAME.notice = ''; } tick(x => x + 1); }, 500); return () => { clearInterval(a); clearInterval(b); }; }, [refresh]);
  // Jail: lock the player inside the real cell, free them at the police station when time is up.
  useEffect(() => {
    const j = !!st?.jailLeft; GAME.jailed = j;
    if (j && !wasJailed.current) { GAME.tp = JAIL_CELL_POS; say('🚔 You were arrested. You are in the cell.'); }
    if (!j && wasJailed.current) { GAME.tp = { x: POLICE_STATION_POS.x, z: POLICE_STATION_POS.z + 6 }; say('You are free. Stay out of trouble.'); }
    wasJailed.current = j;
  }, [st?.jailLeft]);
  useEffect(() => { if (tab === 'police' && role === 'police') { const f = async () => { const r = await fetch('/api/wanted'); if (r.ok) setWanted((await r.json()).wanted); }; f(); const i = setInterval(f, 4000); return () => clearInterval(i); } }, [tab, role]);
  useEffect(() => { if (tab === 'fame') { const f = () => fetch('/api/leaderboard').then(r => r.json()).then(d => { if (d.top) setBoard(d); }).catch(() => {}); f(); const i = setInterval(f, 15000); return () => clearInterval(i); } }, [tab]);
  useEffect(() => { if (tab === 'love') fetch('/api/relationship').then(r => r.json()).then(d => setReqs(d.requests || [])).catch(() => {}); }, [tab]);
  useEffect(() => { if (st?.jailLeft) fetch('/api/jail').then(r => r.json()).then(d => setBail(d.bail || 0)); }, [st?.jailLeft]);

  const startQuest = async (id: string, secs: number) => { const r = await post('/api/quest', { action: 'start', id }); if (!r.ok) return say(r.d.error); setQuest({ id, end: Date.now() + secs * 1000 }); };
  const left = quest ? Math.max(0, Math.ceil((quest.end - Date.now()) / 1000)) : 0;
  useEffect(() => { if (quest && left === 0) (async () => { const r = await post('/api/quest', { action: 'finish', id: quest.id }); setQuest(null); say(r.ok ? `Quest done: +${naira(r.d.reward)}${r.d.heatAdded ? ' · heat up 🔥' : ''}` : r.d.error); refresh(); })(); }, [left, quest]); // eslint-disable-line react-hooks/exhaustive-deps
  const copsNear = () => Object.values(NET.peers).filter(p => p.look.outfitModel === 'uniform' && Math.hypot(p.x - NET.me.x, p.z - NET.me.z) < 25).length;
  const crime = async (k: CrimeId) => { const r = await post('/api/crime', { kind: k, policeNearby: copsNear() }); if (!r.ok) return say(r.d.error); say(r.d.caught ? (r.d.jailSecs ? '🚔 Caught red-handed! Straight to jail.' : '😬 It went wrong. You are WANTED. Police can arrest you.') : `💰 You got away with ${naira(r.d.loot)}${r.d.wanted ? ' · you are WANTED' : ''}`); refresh(); };
  const arrest = async (name: string) => { const p = NET.peers[name]; if (!p || Math.hypot(p.x - NET.me.x, p.z - NET.me.z) > POLICE_ARREST_RANGE) return say(`Get within ${POLICE_ARREST_RANGE} m of ${name} first.`); const r = await post('/api/arrest', { target: name }); say(r.ok ? `🚔 ${name} arrested. +${naira(r.d.reward)}` : r.d.error); refresh(); };
  const tryEnter = async () => { if (!near || entering) return; const type = near.type as any; const status = businessStatus(type, getMinute ? getMinute() : 0); if (!status.open) { setEnter({ ok: false, reason: `Closed now · Opens ${status.hours.split('–')[0]}`, name: near.name }); return; } const body = { building: near.id, minute: getMinute ? getMinute() : 0 };
    // Fast path: if the rules we already know say you can walk in, go in NOW and let the server confirm in the background (it still charges fees and records where you are). A rare refusal sends you back out with a message.
    if (st && checkAccess(type, { rank: st.rank, profession: st.profile.profession, cash: st.cash, invited: false, jailed: !!st.jailLeft }).ok) {
      const id = near.id; onEnter(id);
      post('/api/access', body).then(r => { if (!r.d.ok) { GAME.notice = '⛔ ' + (r.d.reason || 'You cannot enter.'); onDenied?.(r.d.reason || ''); } }).catch(() => {});
      return;
    }
    setEntering(true); try { const r = await post('/api/access', body); if (r.d.ok) { onEnter(near.id); return; } setEnter({ ...r.d, name: near.name }); refresh(); } finally { setEntering(false); } };
  const enterRef = useRef(tryEnter); enterRef.current = tryEnter;
  useEffect(() => { const f = (e: Event) => { if (near && (e as CustomEvent).detail === near.id) enterRef.current(); }; window.addEventListener('arl-enter', f); return () => window.removeEventListener('arl-enter', f); }, [near]); // the city cards can ask to enter the building you are standing next to
  const helpNear = () => { let best: string | null = null, bd = 7; for (const [n, p] of Object.entries(NET.peers)) { const d = Math.hypot(p.x - NET.me.x, p.z - NET.me.z); if (d < bd) { bd = d; best = n; } } return best; };
  const help = async (name: string) => { const r = await post('/api/help', { target: name }); say(r.ok ? `🤝 You helped ${name}: -${naira(r.d.tip)} · +${r.d.fame} fame` : r.d.error); refresh(); };
  const love = async (body: object) => { const r = await post('/api/relationship', body); say(r.ok ? 'Done.' : r.d.error); refresh(); setTab('love'); };
  if (!st) return null;
  const items: [string, string, () => void][] = [
    ['🗺️', 'Map', () => onCityTab(cityTab === 'map' ? null : 'map')], ['🛒', 'Market', () => setMarket({})], ['👥', 'Players', () => setTab('players')], ['💼', 'Jobs', () => onCityTab(cityTab === 'jobs' ? null : 'jobs')], ['🏪', 'Shops', () => onCityTab(cityTab === 'businesses' ? null : 'businesses')],
    ['📜', 'Quests', () => setTab('quests')], ['🏆', 'Fame', () => setTab('fame')], ['🧍', 'My Life', () => setTab('me')],
    ['❤️', 'Love', () => setTab('love')], ['📱', 'Phone', () => setTab('phone')], ['🕶️', 'Crime', () => setTab('crime')],
  ];
  if (role === 'police') items.push(['👮', 'Police', () => setTab('police')]);
  const p = st.profile, prof = PROFESSIONS.find(x => x.id === p.profession);

  return <>
    <div className="glBar"><div className="glRow"><span>{prof?.e} {prof?.label} · R{st.rank}</span><span className={st.wanted ? 'hot' : ''}>{st.wanted ? '🚨 WANTED' : st.heat > 0 ? `🔥 ${st.heat}` : '✅ Clean'}</span></div>
      <button className="glFame" onClick={() => setTab(tab === 'fame' ? null : 'fame')} aria-label="Popularity">
        <span>{st.tier.e} {st.tier.label}</span><div className="fbar"><i style={{ width: st.tier.pct + '%' }} /></div><small>{st.tier.next ? `${st.fame}/${st.tier.next.at}` : `${st.fame} · MAX`}</small></button></div>
    <div className="dock">
      <button className="dockToggle" onClick={onToggle} aria-label="Menu">{open ? '✕' : '☰'}{!open && unread > 0 && <i className="dockBadge">{unread > 9 ? '9+' : unread}</i>}</button>
      {near && !st.jailLeft && <button className="enter" disabled={entering} onClick={tryEnter}>{entering ? '⏳ Entering…' : businessStatus(near.type as any, getMinute ? getMinute() : 0).open ? '🚪 Enter' : '🔒 Closed'}</button>}
      {(() => { const h = !st.jailLeft && helpNear(); return h ? <button className="help" onClick={() => help(h)}>🤝 Help {h}</button> : null; })()}
      {open && <div className="dockGrid">{items.map(([e, l, f]) => <button key={l} onClick={() => { f(); onToggle(); }}><span>{e}</span><small>{l}</small>{l === 'Phone' && unread > 0 && <i className="dockBadge">{unread > 9 ? '9+' : unread}</i>}</button>)}</div>}
    </div>
    <RuntimeStyle id="arl-badge" css=".dockBadge{position:absolute;top:2px;right:2px;background:#e5484d;color:#fff;border-radius:999px;font-size:10px;font-weight:900;font-style:normal;padding:1px 6px;pointer-events:none;line-height:1.3}.dockGrid button,.dockToggle{position:relative}" />
    {msg && <div className="glToast">{msg}</div>}
    {quest && <div className="glToast">⏳ {QUESTS.find(q => q.id === quest.id)?.title}: {left}s</div>}
    {enter && <div className="glModal" onClick={() => setEnter(null)}><div className="glBox" onClick={e => e.stopPropagation()}><h3>{enter.name}</h3><p>{enter.ok ? '✅ ' : '⛔ '}{enter.reason}</p><button onClick={() => setEnter(null)}>Close</button></div></div>}
    {tab === 'phone' && <PhonePanel start={chatWith} unread={unread} onUnread={setUnread} onCash={n => { onCash(n); refresh(); }} onClose={() => { setTab(null); setChatWith(null); }} onCityTab={onCityTab} cityTab={cityTab} onMarket={() => { setTab(null); setMarket({}); }} />}
    {market && <Market seller={market.seller} onClose={() => setMarket(null)} onCash={onCash} />}
    {st.jailLeft > 0 && <div className="glJail"><h2>🚔 In jail</h2><p>{Math.floor(st.jailLeft / 60)}:{String(st.jailLeft % 60).padStart(2, '0')} left</p><button disabled={st.cash < bail} onClick={async () => { const r = await post('/api/jail'); say(r.ok ? 'Bail paid.' : r.d.error); refresh(); }}>Pay bail {naira(bail)}</button></div>}
    {tab && tab !== 'phone' && <div className="glPanel"><button className="x" onClick={() => setTab(null)}>×</button>
      {tab === 'quests' && <><h3>Quests</h3>{QUESTS.filter(q => !q.profession || q.profession.includes(p.profession)).map(q => <button key={q.id} disabled={!!quest || !!st.jailLeft || !!q.at || (!!q.minSkill && skillLevel(p.skills[q.skill]) < q.minSkill)} onClick={() => startQuest(q.id, q.secs)}><b>{q.title}</b> {!q.legal && '🔥'}<small>{q.at ? `📍 inside: ${q.at.join(' / ')} · ` : ''}{q.blurb} · {naira(q.reward)} · {q.secs}s · {q.skill} +{q.xp}{q.minSkill ? ` · needs Lv ${q.minSkill}` : ''}</small></button>)}</>}
      {tab === 'crime' && <><h3>No rules. Only consequences.</h3><p className="m">Do what you want. Heat ≥ 40 makes you WANTED: real police players can chase and arrest you, and you do jail time.</p><p className="m">Tills and vaults: go inside the shop or bank.</p>{(Object.keys(CRIMES) as CrimeId[]).filter(k => !CRIMES[k].at).map(k => <button key={k} disabled={!!st.jailLeft || p.profession === 'police'} onClick={() => crime(k)}><b>{CRIMES[k].label}</b><small>{naira(CRIMES[k].loot[0])}–{naira(CRIMES[k].loot[1])} · +{CRIMES[k].heat} heat</small></button>)}</>}
      {tab === 'police' && <><h3>Wanted (real players)</h3><p className="m">Get within {POLICE_ARREST_RANGE} m, then arrest.</p>{wanted.length === 0 && <p>Nobody is wanted right now.</p>}{wanted.map(w => <button key={w.name} onClick={() => arrest(w.name)}><b>{w.name}</b><small>heat {w.heat}</small></button>)}</>}
      {tab === 'love' && <><h3>❤️ Real-player relationships</h3><p className="muted">Meet another player in Abuja, connect, date, get engaged, then both choose marriage.</p>{reqs.map(r => <div key={r.id} className="row"><span>{r.aName} wants to be {r.status}</span><button onClick={() => love({ action: 'accept', from: r.aName })}>Accept</button></div>)}<input placeholder="Player name" value={to} onChange={e => setTo(e.target.value)} />{p.relationship === 'single' && <button disabled={!to} onClick={() => love({ action: 'propose', to, status: 'dating' })}>❤️ Ask to date</button>}{p.relationship === 'dating' && p.partner && <button disabled={!to || to !== p.partner} onClick={() => love({ action: 'propose', to, status: 'engaged' })}>💍 Ask to get engaged</button>}{p.relationship === 'engaged' && p.partner && <button disabled={!to || to !== p.partner} onClick={() => love({ action: 'propose', to, status: 'married' })}>💒 Ask to get married</button>}{p.partner && <button onClick={() => love({ action: 'end' })}>End relationship</button>}{near && <button disabled={!to} onClick={async () => { const r = await post('/api/invite', { to, building: near.id }); say(r.ok ? `Invited ${to} to ${near.name}` : r.d.error); }}>Invite {to || 'player'} to {near.name}</button>}</>}
      {tab === 'fame' && <FamePanel st={st} board={board} />}
      {tab === 'players' && <PlayersPanel username={username} onClose={() => setTab(null)} />}
      {tab === 'me' && <MyLifePanel username={username} st={st} prof={prof} profile={p} />}
    </div>}
    <RuntimeStyle css={`.glToast{position:absolute;left:50%;transform:translateX(-50%);top:calc(64px + var(--sat,0px));z-index:30;background:#000c;color:#fff;border-radius:12px;padding:9px 14px;font-size:13px;max-width:90vw;text-align:center}
.glPanel{position:absolute;z-index:25;left:12px;right:12px;top:calc(56px + var(--sat,0px));max-width:420px;max-height:calc(100vh - 80px);overflow:auto;background:#09130ff7;border:1px solid #ffffff22;border-radius:16px;padding:16px;color:#fff;display:flex;flex-direction:column;gap:7px}.glPanel h3{margin:0}.glPanel .x{position:absolute;right:8px;top:4px;background:none;border:0;color:#fff;font-size:24px}
.glPanel button:not(.x){text-align:left;background:#13231d;color:#fff;border:1px solid #ffffff18;border-radius:10px;padding:9px}.glPanel button:disabled{opacity:.4}.glPanel small{display:block;color:#9fb5aa;margin-top:2px}.glPanel input{background:#0a1511;border:1px solid #2a4337;border-radius:9px;padding:9px;color:#fff}.m{color:#9fb5aa;font-size:12px;margin:0}.row{display:flex;justify-content:space-between;align-items:center;gap:8px}
.sk{position:relative;display:flex;justify-content:space-between;font-size:12px;padding:5px 0;border-bottom:1px solid #ffffff12}.sk i{position:absolute;left:0;bottom:0;height:2px;background:#3fb98a}
.glModal{position:absolute;inset:0;z-index:40;background:#0008;display:grid;place-items:center}.glBox{background:#0c1713;color:#fff;border:1px solid #ffffff25;border-radius:16px;padding:20px;max-width:320px}.glBox button{background:#d99a42;border:0;border-radius:9px;padding:9px 14px;font-weight:800}
.glJail{position:absolute;inset:0;z-index:35;background:#000a;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#fff;pointer-events:none}.glJail button{pointer-events:auto;background:#d99a42;border:0;border-radius:10px;padding:10px 16px;font-weight:800}.glJail button:disabled{opacity:.4}
.panelTitleRow{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.panelTitleRow h3{margin:0}.miniClose{background:#13231d!important;border:1px solid #ffffff18!important;width:36px;height:36px!important;padding:0!important;text-align:center!important;font-size:20px!important}.playerCount{display:grid;grid-template-columns:auto 1fr;column-gap:10px;align-items:center;background:#10201a;border:1px solid #ffffff14;border-radius:12px;padding:10px}.playerCount b{font-size:24px;color:#f0b94a}.playerCount span{font-weight:800}.playerCount small{grid-column:2;color:#7f968b}.playerList{display:flex;flex-direction:column;gap:7px}.playerCard{display:grid;grid-template-columns:44px 1fr auto;gap:9px;align-items:center;background:#10201a;border:1px solid #ffffff14;border-radius:12px;padding:9px}.playerAvatar{position:relative;width:42px;height:42px;border-radius:12px;background:#193227;display:grid;place-items:center;font-size:23px}.playerAvatar i{position:absolute;width:8px;height:8px;border-radius:50%;right:3px;bottom:3px;background:#66756d;border:2px solid #193227}.playerAvatar i.near{background:#3fb98a}.playerInfo{min-width:0;display:flex;flex-direction:column;gap:2px}.playerInfo b{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.playerInfo span,.playerInfo small{font-size:10px;color:#9fb5aa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.playerActions{display:flex;gap:5px}.playerActions button{width:38px!important;height:38px;padding:0!important;text-align:center!important;font-size:17px!important}.emptyPlayer{text-align:center;padding:22px 12px;background:#10201a;border-radius:14px}.emptyPlayer div{font-size:32px}.emptyPlayer b{display:block;margin-top:7px}.emptyPlayer p{color:#9fb5aa;font-size:11px}.lifeHero{display:grid;grid-template-columns:1.3fr 1fr;gap:8px}.lifeMoney,.lifeRank{background:#10201a;border:1px solid #ffffff14;border-radius:12px;padding:11px}.lifeMoney small,.lifeRank span{display:block;color:#9fb5aa;font-size:10px}.lifeMoney b{display:block;color:#f3c56f;font-size:20px;margin-top:2px}.lifeRank b{display:block;margin-top:8px}.lifeGrid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.lifeGrid>div{background:#10201a;border:1px solid #ffffff14;border-radius:11px;padding:9px}.lifeGrid span{display:block;color:#9fb5aa;font-size:10px}.lifeGrid b{display:block;margin-top:4px;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lifeSection{background:#10201a;border:1px solid #ffffff14;border-radius:12px;padding:10px}.lifeSection h4{margin:0 0 7px;font-size:12px;color:#f0b94a}.skillRow{display:grid;grid-template-columns:1fr auto;gap:2px;font-size:11px;padding:5px 0;border-bottom:1px solid #ffffff0c}.skillTrack{grid-column:1/-1;height:4px;background:#ffffff12;border-radius:5px;overflow:hidden}.skillTrack i{display:block;height:100%;background:#3fb98a;border-radius:5px}.identityLine{display:flex;justify-content:space-between;gap:10px;font-size:11px;padding:5px 0}.identityLine span{color:#9fb5aa}.identityLine b{text-align:right}
.phoneWrap{position:absolute;inset:0;z-index:90;background:rgba(0,0,0,.55);display:grid;place-items:center;padding:20px}.phoneDevice{width:min(390px,calc(100vw - 32px));max-height:min(760px,calc(100vh - 32px));overflow:hidden;background:linear-gradient(160deg,#15231e,#07100d);border:7px solid #111;border-radius:34px;box-shadow:0 24px 70px #000b;color:#fff;display:flex;flex-direction:column}.phoneStatus{display:flex;justify-content:space-between;padding:11px 18px 5px;font-size:10px;color:#a9bbb2}.phoneHead{display:flex;justify-content:space-between;align-items:center;padding:8px 18px 14px}.phoneHead small{color:#d99a42;font-weight:900;letter-spacing:.14em}.phoneHead h2{margin:2px 0 0;font-size:22px}.phoneHead button{border:0;background:#20372d;color:#fff;border-radius:50%;width:34px;height:34px;font-size:22px}.phoneApps{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:8px 16px 18px}.phoneApps button{border:1px solid #ffffff16;background:#10201a;color:#fff;border-radius:18px;padding:13px 4px;min-height:82px}.phoneApps b{display:block;font-size:25px}.phoneApps span{font-size:10px;font-weight:800}.phonePage{padding:0 14px 12px;overflow:auto;min-height:0}.phoneEmpty{padding:35px 15px;text-align:center;color:#9fb5aa}.phoneEmpty b{display:block;color:#fff;margin:8px}.phoneEmpty small{display:block}.phoneSectionTitle{display:flex;justify-content:space-between;align-items:center;padding:8px 4px;color:#fff}.phoneSectionTitle span{font-size:10px;color:#8fa59a}.carCard{display:grid;grid-template-columns:46px minmax(0,1fr) auto;gap:9px;align-items:center;background:#10201a;border:1px solid #ffffff12;border-radius:13px;padding:9px;margin-bottom:7px}.carThumb{width:42px;height:42px;border-radius:11px;background:#1b3328;display:grid;place-items:center;font-size:23px}.carCard>div:nth-child(2){min-width:0}.carCard b,.carCard small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.carCard small{font-size:9px;color:#8fa59a;margin-top:3px}.carOwned{font-size:8px;color:#3fb98a;font-weight:900}.carBuy{background:#d99a42;color:#171008;border:0;border-radius:9px;padding:8px;font-size:9px;font-weight:900;max-width:92px}.carBuy:disabled{opacity:.5}.phoneBack{width:100%;border:0;background:#183025;color:#fff;border-radius:11px;padding:10px;margin-top:3px}.phoneNav{display:grid;grid-template-columns:repeat(3,1fr);padding:9px 12px 12px;border-top:1px solid #ffffff12;background:#09140f}.phoneNav button{background:none;border:0;color:#fff;font-size:18px}.phoneNav small{display:block;font-size:8px;color:#8fa59a}
`} />
  </>;
}

function PlayersPanel({ username, onClose }: { username: string; onClose: () => void }) {
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick(v => v + 1), 500); return () => clearInterval(id); }, []);
  const players = Object.entries(NET.peers).map(([name, q]) => ({ name, q, d: Math.hypot(q.x - NET.me.x, q.z - NET.me.z) })).sort((a, b) => a.d - b.d);
  return <>
    <div className="panelTitleRow"><div><h3>👥 Players in Abuja</h3><p className="m">Real users in your city instance · you are <b>@{username}</b></p></div><button className="miniClose" onClick={onClose}>×</button></div>
    <div className="playerCount"><b>{players.length + 1}</b><span>players in this instance</span><small>NPCs stay in the background.</small></div>
    {players.length === 0 ? <div className="emptyPlayer"><div>👤</div><b>No other players nearby yet</b><p>Invite friends to join your Abuja instance. Your city is built around real players.</p></div> : <div className="playerList">
      {players.map(({ name, q, d }) => { const police = q.look.outfitModel === 'uniform'; return <div className="playerCard" key={name}>
        <div className="playerAvatar"><span>{q.look.gender === 'f' ? '👩🏽' : '👨🏽'}</span><i className={d < 20 ? 'near' : ''} /></div>
        <div className="playerInfo"><b>{name}</b><span>{police ? '👮 Police officer' : '🎮 Real player'} · {Math.round(d)}m away</span><small>{q.drv ? '🚗 Driving' : q.mv > 0 ? '🚶 Moving' : '🧍 Standing'}{q.cp ? ' · Own car' : ''}</small></div>
        <div className="playerActions"><button onClick={() => { GAME.nav = { x: q.x, z: q.z, name }; onClose(); }}>📍</button><button onClick={() => window.dispatchEvent(new CustomEvent('arl-player-select', { detail: name }))}>👤</button></div>
      </div>; })}
    </div>}
  </>;
}

function MyLifePanel({ username, st, prof, profile }: { username: string; st: St; prof?: typeof PROFESSIONS[number]; profile: Profile }) {
  const relationship = profile.partner ? `${profile.relationship} with ${profile.partner}` : profile.relationship === 'single' ? 'Single' : profile.relationship;
  const [pub, setPub] = useState<any>(null), [bio, setBio] = useState(profile.bio || ''), [saved, setSaved] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { fetch('/api/player?name=' + encodeURIComponent(username)).then(r => r.ok ? r.json() : null).then(j => j && setPub(j)).catch(() => {}); }, [username]);
  const saveBio = async () => { setBusy(true); const r = await fetch('/api/profile', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profile: { ...profile, bio } }) }); setBusy(false); setSaved(r.ok ? 'Saved ✓' : 'Could not save'); setTimeout(() => setSaved(''), 2500); };
  const dirty = bio.trim() !== (profile.bio || '').trim();
  const skills = SKILLS.map(s => ({ s, lv: skillLevel(profile.skills[s.id]) })).sort((a, b) => b.lv - a.lv);
  return <>
    <div className="panelTitleRow"><div><h3>🧍 @{username}</h3><p className="m">{pub ? `${pub.tier.e} ${pub.tier.label} · Fame #${pub.fameRank} · Joined ${new Date(pub.since).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}` : 'Your life, progression and identity'}</p></div></div>
    <div className="lifeHero"><div className="lifeMoney"><small>Available cash</small><b>{naira(st.cash)}</b></div><div className="lifeRank"><span>{prof?.e || '🎮'} {prof?.label || 'Player'}</span><b>Rank {st.rank}</b></div></div>
    <div className="lifeGrid"><div><span>⭐ Fame</span><b>{st.fame}</b></div><div><span>🚗 Vehicle</span><b>{st.hasCar ? 'Owned' : 'None'}</b></div><div><span>❤️ Relationship</span><b>{relationship}</b></div><div><span>{st.wanted ? '🚨 Heat' : '🛡️ Status'}</span><b>{st.wanted ? 'WANTED' : st.heat ? `${st.heat} heat` : 'Clean'}</b></div>
      <div><span>🛒 Items sold</span><b>{pub ? pub.itemsSold : '–'}</b></div><div><span>🏷️ Active stalls</span><b>{pub ? pub.stalls : '–'}</b></div></div>
    <div className="lifeSection"><h4>About me</h4>
      <textarea className="bioBox" maxLength={120} value={bio} placeholder="Write a short bio other players will see on your profile card…" onChange={e => setBio(e.target.value)} />
      <div className="row"><small>{bio.length}/120 · shown to everyone who taps your name</small><button disabled={busy || !dirty} onClick={saveBio}>{saved || (busy ? 'Saving…' : 'Save bio')}</button></div></div>
    <div className="lifeSection"><h4>Skills</h4>{skills.map(({ s, lv }) => <div key={s.id} className="skillRow"><span>{s.e} {s.label}{profile.focus === s.id ? ' ⭐' : ''}</span><b>Lv {lv}</b><div className="skillTrack"><i style={{ width: `${Math.min(100, (profile.skills[s.id] % 10) * 10)}%` }} /></div></div>)}</div>
    <div className="lifeSection"><h4>Identity</h4><div className="identityLine"><span>Origin</span><b>{st.origin === 'NEPO' ? '👑 Nepo baby' : st.origin === 'LAPO' ? '🥣 Lapo baby' : '—'}</b></div><div className="identityLine"><span>Style</span><b>{profile.style}</b></div><div className="identityLine"><span>Focus</span><b>{profile.focus || 'Balanced'}</b></div></div>
    <p className="m">Edit your character from ☰ → Character. Your account, character and progress are saved to your player profile.</p>
    <RuntimeStyle css={`.bioBox{width:100%;min-height:64px;resize:none;background:#0a1511;border:1px solid #2a4337;border-radius:10px;padding:9px;color:#fff;font:inherit;font-size:13px;box-sizing:border-box}.lifeSection .row small{color:#8fa79b;font-size:10px}.lifeSection .row button{white-space:nowrap}`} />
  </>;
}

function PhonePanel({ start, unread, onUnread, onCash, onClose, onCityTab, cityTab, onMarket }: { start: string | null; unread: number; onUnread: (n: number) => void; onCash: (n: number) => void; onClose: () => void; onCityTab: (t: CityTab) => void; cityTab: CityTab; onMarket: () => void }) {
  const [app, setApp] = useState<'home' | 'garage' | 'messages'>(start ? 'messages' : 'home');
  useEffect(() => { if (start) setApp('messages'); }, [start]);
  const [vehicles, setVehicles] = useState<any[]>([]), [catalog, setCatalog] = useState(VEHICLE_CATALOG), [busy, setBusy] = useState('');
  const refreshVehicles = useCallback(async () => { const r = await fetch('/api/vehicles'); if (r.ok) { const d = await r.json(); setVehicles(d.vehicles || []); setCatalog(d.catalog || VEHICLE_CATALOG); } }, []);
  useEffect(() => { refreshVehicles(); window.dispatchEvent(new Event('arl-phone-use')); }, [refreshVehicles]);
  const buy = async (id: string) => { setBusy(id); const r = await post('/api/vehicles', { id }); setBusy(''); if (r.ok) { await refreshVehicles(); GAME.hasCar = true; } };
  return <div className="phoneWrap" onClick={onClose}><div className="phoneDevice" onClick={e => e.stopPropagation()}>
    <div className="phoneStatus"><span>ABUJA LIFE</span><span>● ● 🔋 87%</span></div>
    <div className="phoneHead"><div><small>PERSONAL DEVICE</small><h2>{app === 'home' ? 'Phone' : app === 'garage' ? 'Garage' : 'Messages'}</h2></div><button onClick={onClose}>×</button></div>
    {app === 'home' && <div className="phoneApps">
      <button onClick={() => onCityTab(cityTab === 'map' ? null : 'map')}><b>🗺️</b><span>Maps</span></button>
      <button onClick={() => onCityTab(cityTab === 'jobs' ? null : 'jobs')}><b>💼</b><span>Jobs</span></button>
      <button onClick={() => setApp('messages')} style={{ position: 'relative' }}><b>💬</b><span>Messages</span>{unread > 0 && <i className="dockBadge">{unread > 9 ? '9+' : unread}</i>}</button>
      <button onClick={() => setApp('garage')}><b>🚗</b><span>Garage</span></button>
      <button onClick={onMarket}><b>🛒</b><span>Market</span></button>
      <button onClick={() => setApp('garage')}><b>🏪</b><span>Dealership</span></button>
      <button onClick={() => onClose()}><b>🧍</b><span>My Life</span></button>
      <button onClick={() => onClose()}><b>🏦</b><span>Bank</span></button>
      <button onClick={() => onClose()}><b>🎯</b><span>Missions</span></button>
    </div>}
    {app === 'messages' && <Messages start={start} onCash={onCash} onClose={onClose} onUnread={onUnread} />}
    {app === 'garage' && <div className="phonePage"><div className="phoneSectionTitle"><b>My garage</b><span>{vehicles.length} owned</span></div>{vehicles.length === 0 ? <div className="phoneEmpty">🚗<b>No vehicle yet</b><small>Choose a licensed model below.</small></div> : vehicles.map(v => <div className="carCard" key={v.id}><div className="carThumb">🚘</div><div><b>{v.name}</b><small>{v.type} · {v.condition}% condition · {v.fuel}% fuel</small></div><span className="carOwned">OWNED</span></div>)}<div className="phoneSectionTitle"><b>Dealership</b><span>Licensed models</span></div>{catalog.map(v => <div className="carCard" key={v.id}><div className="carThumb">🚘</div><div><b>{v.brand} {v.model}</b><small>{v.year} · {v.type} · {v.topSpeed} km/h · handling {v.handling}</small></div><button className="carBuy" disabled={busy === v.id} onClick={() => buy(v.id)}>{busy === v.id ? '...' : naira(v.price)}</button></div>)}<button className="phoneBack" onClick={() => setApp('home')}>← Home</button></div>}
    <div className="phoneNav"><button onClick={() => setApp('home')}>⌂<small>Home</small></button><button onClick={() => setApp('messages')} style={{ position: 'relative' }}>💬<small>Messages</small>{unread > 0 && <i className="dockBadge">{unread > 9 ? '9+' : unread}</i>}</button><button onClick={() => setApp('garage')}>🚗<small>Garage</small></button></div>
  </div></div>;
}

function FamePanel({ st, board }: { st: St; board: { top: Row[]; me: { rank: number | null; fame: number; tier: string } | null } | null }) {
  const groups = [{ id: 'elite', title: '👑 Elites' }, { id: 'influencer', title: '📱 Influencers' }, { id: 'rest', title: '⭐ Rising' }];
  const rows = board?.top || [];
  return <>
    <h3>🏆 Popularity</h3>
    <div className="fameMe"><b>{st.tier.e} {st.tier.label}</b><span>{st.fame} fame{board?.me?.rank ? ` · #${board.me.rank}` : ''}</span>
      <div className="fbar big"><i style={{ width: st.tier.pct + '%' }} /></div>
      <small>{st.tier.next ? `${st.tier.next.at - st.fame} more to ${st.tier.next.label}` : 'You are at the top tier.'}</small></div>
    <p className="m"><b>Earn fame:</b> finish quests (+3) and shifts (+2) · help players nearby (+{HELP_FAME}, costs {naira(HELP_TIP)}) · stay active (+1 every 10 min). Capped per day.</p>
    <div className="tiers">{FAME_TIERS.map(t => <span key={t.id} className={st.fame >= t.at ? 'on' : ''}>{t.e} {t.at}</span>)}</div>
    {!board && <p className="m">Loading ranking…</p>}
    {groups.map(g => { const list = rows.filter(r => g.id === 'rest' ? r.tier !== 'elite' && r.tier !== 'influencer' : r.tier === g.id); return list.length ? <div key={g.id} className="lbGroup"><h4>{g.title}</h4>{list.map(r => <div key={r.rank} className={'lbRow' + (r.you ? ' you' : '')}><em>#{r.rank}</em><b>{r.name}</b><span>{r.fame}</span></div>)}</div> : null; })}
  </>;
}
