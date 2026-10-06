'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GAME } from './CityWorld';
import { NET } from '../lib/cityNet';
import { CRIMES, JAIL_CELL_POS, POLICE_ARREST_RANGE, POLICE_STATION_POS, PROFESSIONS, QUESTS, RELATIONSHIPS, SKILLS, skillLevel, type CrimeId, type Profile } from '../lib/profile';

type St = { cash: number; heat: number; wanted: boolean; jailLeft: number; rank: number; profile: Profile };
const post = async (url: string, body?: object) => { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) }); return { ok: r.ok, d: await r.json().catch(() => ({})) as any }; };
const naira = (n: number) => '₦' + Math.round(n).toLocaleString();

/* Everything "no rules, real consequences": quests, crime, wanted level, real police arrests, jail, building access, relationships. */
export default function GameLayer({ username, onCash, near, role, onEnter }: { username: string; onCash: (n: number) => void; near: { name: string; type: string; id: string } | null; role: 'player' | 'police'; onEnter: (id: string) => void }) {
  const [st, setSt] = useState<St | null>(null), [tab, setTab] = useState<'quests' | 'crime' | 'police' | 'love' | 'me' | null>(null), [msg, setMsg] = useState(''), [wanted, setWanted] = useState<{ name: string; heat: number }[]>([]);
  const [quest, setQuest] = useState<{ id: string; end: number } | null>(null), [, tick] = useState(0), [bail, setBail] = useState(0), [enter, setEnter] = useState<{ ok: boolean; reason: string; name: string } | null>(null);
  const [reqs, setReqs] = useState<any[]>([]), [to, setTo] = useState(''), wasJailed = useRef(false);
  const say = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 4500); };
  const refresh = useCallback(async () => { const r = await fetch('/api/status'); if (r.ok) { const d = await r.json(); setSt(d); onCash(d.cash); } }, [onCash]);
  useEffect(() => { refresh(); const a = setInterval(refresh, 5000), b = setInterval(() => tick(x => x + 1), 500); return () => { clearInterval(a); clearInterval(b); }; }, [refresh]);
  // Jail: lock the player inside the real cell, free them at the police station when time is up.
  useEffect(() => {
    const j = !!st?.jailLeft; GAME.jailed = j;
    if (j && !wasJailed.current) { GAME.tp = JAIL_CELL_POS; say('🚔 You were arrested. You are in the cell.'); }
    if (!j && wasJailed.current) { GAME.tp = { x: POLICE_STATION_POS.x, z: POLICE_STATION_POS.z + 6 }; say('You are free. Stay out of trouble.'); }
    wasJailed.current = j;
  }, [st?.jailLeft]);
  useEffect(() => { if (tab === 'police' && role === 'police') { const f = async () => { const r = await fetch('/api/wanted'); if (r.ok) setWanted((await r.json()).wanted); }; f(); const i = setInterval(f, 4000); return () => clearInterval(i); } }, [tab, role]);
  useEffect(() => { if (tab === 'love') fetch('/api/relationship').then(r => r.json()).then(d => setReqs(d.requests || [])).catch(() => {}); }, [tab]);
  useEffect(() => { if (st?.jailLeft) fetch('/api/jail').then(r => r.json()).then(d => setBail(d.bail || 0)); }, [st?.jailLeft]);

  const startQuest = async (id: string, secs: number) => { const r = await post('/api/quest', { action: 'start', id }); if (!r.ok) return say(r.d.error); setQuest({ id, end: Date.now() + secs * 1000 }); };
  const left = quest ? Math.max(0, Math.ceil((quest.end - Date.now()) / 1000)) : 0;
  useEffect(() => { if (quest && left === 0) (async () => { const r = await post('/api/quest', { action: 'finish', id: quest.id }); setQuest(null); say(r.ok ? `Quest done: +${naira(r.d.reward)}${r.d.heatAdded ? ' · heat up 🔥' : ''}` : r.d.error); refresh(); })(); }, [left, quest]); // eslint-disable-line react-hooks/exhaustive-deps
  const copsNear = () => Object.values(NET.peers).filter(p => p.look.outfitModel === 'uniform' && Math.hypot(p.x - NET.me.x, p.z - NET.me.z) < 25).length;
  const crime = async (k: CrimeId) => { const r = await post('/api/crime', { kind: k, policeNearby: copsNear() }); if (!r.ok) return say(r.d.error); say(r.d.caught ? (r.d.jailSecs ? '🚔 Caught red-handed! Straight to jail.' : '😬 It went wrong. You are WANTED. Police can arrest you.') : `💰 You got away with ${naira(r.d.loot)}${r.d.wanted ? ' · you are WANTED' : ''}`); refresh(); };
  const arrest = async (name: string) => { const p = NET.peers[name]; if (!p || Math.hypot(p.x - NET.me.x, p.z - NET.me.z) > POLICE_ARREST_RANGE) return say(`Get within ${POLICE_ARREST_RANGE} m of ${name} first.`); const r = await post('/api/arrest', { target: name }); say(r.ok ? `🚔 ${name} arrested. +${naira(r.d.reward)}` : r.d.error); refresh(); };
  const tryEnter = async () => { if (!near) return; const r = await post('/api/access', { building: near.id }); if (r.d.ok) { onEnter(near.id); return; } setEnter({ ...r.d, name: near.name }); refresh(); };
  const love = async (body: object) => { const r = await post('/api/relationship', body); say(r.ok ? 'Done.' : r.d.error); refresh(); setTab('love'); };
  if (!st) return null;
  const p = st.profile, prof = PROFESSIONS.find(x => x.id === p.profession);

  return <>
    <div className="glBar"><span>{prof?.e} {prof?.label} · Rank {st.rank}</span><span className={st.wanted ? 'hot' : ''}>{st.wanted ? '🚨 WANTED' : st.heat > 0 ? `🔥 ${st.heat}` : '✅ Clean'}</span></div>
    <div className="glBtns">{(['quests', 'crime', ...(role === 'police' ? ['police'] : []), 'love', 'me'] as const).map(t => <button key={t} onClick={() => setTab(tab === t ? null : t as any)}>{{ quests: '📜', crime: '🕶️', police: '👮', love: '❤️', me: '🧍' }[t]}</button>)}{near && !st.jailLeft && <button className="enter" onClick={tryEnter}>🚪 Enter</button>}</div>
    {msg && <div className="glToast">{msg}</div>}
    {quest && <div className="glToast">⏳ {QUESTS.find(q => q.id === quest.id)?.title}: {left}s</div>}
    {enter && <div className="glModal" onClick={() => setEnter(null)}><div className="glBox" onClick={e => e.stopPropagation()}><h3>{enter.name}</h3><p>{enter.ok ? '✅ ' : '⛔ '}{enter.reason}</p><button onClick={() => setEnter(null)}>Close</button></div></div>}
    {st.jailLeft > 0 && <div className="glJail"><h2>🚔 In jail</h2><p>{Math.floor(st.jailLeft / 60)}:{String(st.jailLeft % 60).padStart(2, '0')} left</p><button disabled={st.cash < bail} onClick={async () => { const r = await post('/api/jail'); say(r.ok ? 'Bail paid.' : r.d.error); refresh(); }}>Pay bail {naira(bail)}</button></div>}
    {tab && <div className="glPanel"><button className="x" onClick={() => setTab(null)}>×</button>
      {tab === 'quests' && <><h3>Quests</h3>{QUESTS.filter(q => !q.profession || q.profession.includes(p.profession)).map(q => <button key={q.id} disabled={!!quest || !!st.jailLeft || !!q.at || (!!q.minSkill && skillLevel(p.skills[q.skill]) < q.minSkill)} onClick={() => startQuest(q.id, q.secs)}><b>{q.title}</b> {!q.legal && '🔥'}<small>{q.at ? `📍 inside: ${q.at.join(' / ')} · ` : ''}{q.blurb} · {naira(q.reward)} · {q.secs}s · {q.skill} +{q.xp}{q.minSkill ? ` · needs Lv ${q.minSkill}` : ''}</small></button>)}</>}
      {tab === 'crime' && <><h3>No rules. Only consequences.</h3><p className="m">Do what you want. Heat ≥ 40 makes you WANTED: real police players can chase and arrest you, and you do jail time.</p><p className="m">Tills and vaults: go inside the shop or bank.</p>{(Object.keys(CRIMES) as CrimeId[]).filter(k => !CRIMES[k].at).map(k => <button key={k} disabled={!!st.jailLeft || p.profession === 'police'} onClick={() => crime(k)}><b>{CRIMES[k].label}</b><small>{naira(CRIMES[k].loot[0])}–{naira(CRIMES[k].loot[1])} · +{CRIMES[k].heat} heat</small></button>)}</>}
      {tab === 'police' && <><h3>Wanted (real players)</h3><p className="m">Get within {POLICE_ARREST_RANGE} m, then arrest.</p>{wanted.length === 0 && <p>Nobody is wanted right now.</p>}{wanted.map(w => <button key={w.name} onClick={() => arrest(w.name)}><b>{w.name}</b><small>heat {w.heat}</small></button>)}</>}
      {tab === 'love' && <><h3>Relationship: {p.relationship}{p.partner ? ` with ${p.partner}` : ''}</h3>{reqs.map(r => <div key={r.id} className="row"><span>{r.aName} wants to be {r.status}</span><button onClick={() => love({ action: 'accept', from: r.aName })}>Accept</button></div>)}<input placeholder="Player name" value={to} onChange={e => setTo(e.target.value)} />{(RELATIONSHIPS.filter(r => ['dating', 'engaged', 'married'].includes(r)) as string[]).map(r => <button key={r} disabled={!to} onClick={() => love({ action: 'propose', to, status: r })}>Propose: {r}</button>)}{p.partner && <button onClick={() => love({ action: 'end' })}>End relationship</button>}{near && <button disabled={!to} onClick={async () => { const r = await post('/api/invite', { to, building: near.id }); say(r.ok ? `Invited ${to} to ${near.name}` : r.d.error); }}>Invite {to || 'player'} to {near.name}</button>}</>}
      {tab === 'me' && <><h3>@{username}</h3><p>{prof?.e} {prof?.label} · {p.style} · {p.outfitModel} · Rank {st.rank}</p><p>{naira(st.cash)}</p>{SKILLS.map(s => <div key={s.id} className="sk"><span>{s.e} {s.label}{p.focus === s.id ? ' ⭐' : ''}</span><b>Lv {skillLevel(p.skills[s.id])}</b><i style={{ width: `${Math.min(100, (p.skills[s.id] % 10) * 10)}%` }} /></div>)}<p className="m">Edit profession, style and outfit from ☰ → Character.</p></>}
    </div>}
    <style>{`.glBar{position:absolute;left:12px;top:100px;z-index:6;display:flex;gap:10px;background:#10201ae6;border:1px solid #ffffff20;border-radius:10px;padding:6px 10px;color:#fff;font-size:11px}.glBar .hot{color:#ff5a4d;font-weight:900;animation:p 1s infinite}@keyframes p{50%{opacity:.4}}
.glBtns{position:absolute;right:12px;top:100px;z-index:6;display:flex;flex-direction:column;gap:6px}.glBtns button{background:#10201ae6;color:#fff;border:1px solid #ffffff25;border-radius:10px;padding:8px 10px;font-size:15px}.glBtns .enter{background:#d99a42;color:#111;font-weight:800;font-size:12px}
.glToast{position:absolute;left:50%;transform:translateX(-50%);top:140px;z-index:30;background:#000c;color:#fff;border-radius:12px;padding:9px 14px;font-size:13px;max-width:90vw;text-align:center}
.glPanel{position:absolute;z-index:25;left:12px;right:12px;top:140px;max-width:420px;max-height:62vh;overflow:auto;background:#09130ff7;border:1px solid #ffffff22;border-radius:16px;padding:16px;color:#fff;display:flex;flex-direction:column;gap:7px}.glPanel h3{margin:0}.glPanel .x{position:absolute;right:8px;top:4px;background:none;border:0;color:#fff;font-size:24px}
.glPanel button:not(.x){text-align:left;background:#13231d;color:#fff;border:1px solid #ffffff18;border-radius:10px;padding:9px}.glPanel button:disabled{opacity:.4}.glPanel small{display:block;color:#9fb5aa;margin-top:2px}.glPanel input{background:#0a1511;border:1px solid #2a4337;border-radius:9px;padding:9px;color:#fff}.m{color:#9fb5aa;font-size:12px;margin:0}.row{display:flex;justify-content:space-between;align-items:center;gap:8px}
.sk{position:relative;display:flex;justify-content:space-between;font-size:12px;padding:5px 0;border-bottom:1px solid #ffffff12}.sk i{position:absolute;left:0;bottom:0;height:2px;background:#3fb98a}
.glModal{position:absolute;inset:0;z-index:40;background:#0008;display:grid;place-items:center}.glBox{background:#0c1713;color:#fff;border:1px solid #ffffff25;border-radius:16px;padding:20px;max-width:320px}.glBox button{background:#d99a42;border:0;border-radius:9px;padding:9px 14px;font-weight:800}
.glJail{position:absolute;inset:0;z-index:35;background:#000a;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#fff;pointer-events:none}.glJail button{pointer-events:auto;background:#d99a42;border:0;border-radius:10px;padding:10px 16px;font-weight:800}.glJail button:disabled{opacity:.4}`}</style>
  </>;
}
