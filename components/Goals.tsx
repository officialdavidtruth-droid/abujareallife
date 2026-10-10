'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import RuntimeStyle from './RuntimeStyle';
import { sfx } from '../lib/audio';

/* Goals: guided starter chain, daily missions + login streak, achievements.
   Display only: the server (/api/progress) decides progress and pays every reward. */

type Item = { id: string; e: string; title: string; how: string; reward: number; have: number; need: number; done: boolean; claimed: boolean };
type Daily = { id: string; e: string; title: string; reward: number; have: number; need: number; claimed: boolean };
export type Progress = {
  day: string; cash: number;
  next: { kind: string; id: string; e: string; title: string; how?: string; ready: boolean } | null;
  starter: Item[]; starterBonus: { id: string; reward: number; title: string; ready: boolean; claimed: boolean; locked: boolean };
  dailies: Daily[]; dailyBonus: { reward: number; claimed: boolean; ready: boolean };
  streak: { current: number; best: number; claimedToday: boolean; reward: number; cycle: number[]; day: number };
  achievements: Item[];
};
const naira = (n: number) => '₦' + Math.round(n).toLocaleString();
const REFRESH = 'arl-goals-refresh';

async function load(): Promise<Progress | null> {
  try { const r = await fetch('/api/progress', { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; }
}

/* ───────── the floating "what to do next" chip ───────── */
export function GuideChip({ cash, fame, hidden, onOpen }: { cash: number; fame: number; hidden: boolean; onOpen: () => void }) {
  const [p, setP] = useState<Progress | null>(null), [gone, setGone] = useState<string>(''), [welcome, setWelcome] = useState(false), seen = useRef(false);
  const refetch = useCallback(async () => { const d = await load(); if (d) setP(d); }, []);
  useEffect(() => { refetch(); const t = setInterval(refetch, 120_000); const h = (e: Event) => { const d = (e as CustomEvent).detail; if (d) setP(d); else refetch(); }; window.addEventListener(REFRESH, h); return () => { clearInterval(t); window.removeEventListener(REFRESH, h); }; }, [refetch]);
  // progress moves when money or fame moves: re-check shortly after (debounced), so "ready to claim" shows up quickly
  useEffect(() => { const t = setTimeout(refetch, 2500); return () => clearTimeout(t); }, [cash, fame, refetch]);
  // one friendly welcome the very first time a new player opens the game
  useEffect(() => {
    if (!p || seen.current) return; seen.current = true;
    try { if (!localStorage.getItem('arl-goals-welcome') && p.starter.every(s => !s.claimed)) setWelcome(true); } catch { /* storage blocked: skip the welcome */ }
  }, [p]);
  const closeWelcome = (open: boolean) => { setWelcome(false); try { localStorage.setItem('arl-goals-welcome', '1'); } catch { /* ignore */ } if (open) onOpen(); };
  const n = p?.next, tag = n ? n.kind + n.id + (n.ready ? '!' : '') : '';
  return <>
    {welcome && !hidden && <div className="gcWelcome" role="dialog"><b>👋 Welcome to Abuja!</b><p>Not sure what to do? Follow the <b>Goals</b>: short steps that teach you the city and pay you cash as you go. Come back every day for rewards and a streak bonus.</p><div><button onClick={() => closeWelcome(true)}>Show me my goals</button><button className="alt" onClick={() => closeWelcome(false)}>Later</button></div></div>}
    {n && !hidden && !welcome && gone !== tag && <div className={'gcChip' + (n.ready ? ' ready' : '')}><button onClick={() => { sfx('open'); onOpen(); }} title={n.how || ''}><i>{n.ready ? '🎁' : n.e}</i><span><small>{n.ready ? 'Ready to claim' : 'Next goal'}</small><b>{n.title}</b></span></button><button className="gcX" aria-label="Hide" onClick={() => setGone(tag)}>×</button></div>}
    <RuntimeStyle id="arl-goals-chip" css={CHIP_CSS} />
  </>;
}

/* ───────── the Goals panel ───────── */
export function GoalsPanel({ onCash, say }: { onCash: (n: number) => void; say: (m: string) => void }) {
  const [p, setP] = useState<Progress | null>(null), [sub, setSub] = useState<'today' | 'guide' | 'badges' | null>(null), [busy, setBusy] = useState(''), [failed, setFailed] = useState(false);
  useEffect(() => { let dead = false; load().then(d => { if (dead) return; if (d) setP(d); else setFailed(true); }); return () => { dead = true; }; }, []);
  useEffect(() => { if (p && !sub) setSub(p.starter.every(s => s.claimed) ? 'today' : 'guide'); }, [p, sub]);
  const claim = async (kind: string, id: string) => {
    const k = kind + id; if (busy) return; setBusy(k);
    try {
      const r = await fetch('/api/progress', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, id }) }), d = await r.json().catch(() => ({}));
      if (!r.ok) { sfx('error'); say(d.error || 'Could not claim that.'); const f = await load(); if (f) setP(f); return; }
      sfx('success'); if (typeof d.cash === 'number') onCash(d.cash);
      say(`🎁 +${naira(d.reward)} · ${d.label}`);
      if (d.progress) { setP(d.progress); window.dispatchEvent(new CustomEvent(REFRESH, { detail: d.progress })); }
    } finally { setBusy(''); }
  };
  if (failed) return <><h3>🎯 Goals</h3><p className="gcMuted">Goals could not load. Check your connection and open this again.</p></>;
  if (!p) return <><h3>🎯 Goals</h3><p className="gcMuted">Loading…</p></>;
  const guideReady = p.starter.some(s => s.done && !s.claimed) || p.starterBonus.ready;
  const todayReady = !p.streak.claimedToday || p.dailies.some(d => d.have >= d.need && !d.claimed) || p.dailyBonus.ready;
  const badgeReady = p.achievements.some(a => a.done && !a.claimed);
  const doneCount = p.starter.filter(s => s.claimed).length;
  const Btn = ({ k, kind, id, text }: { k?: string; kind: string; id: string; text: string }) => <button className="gcClaim" disabled={!!busy} onClick={() => claim(kind, id)}>{busy === (k || kind + id) ? '…' : text}</button>;
  const Bar = ({ a, b }: { a: number; b: number }) => <div className="gcBar"><i style={{ width: Math.min(100, Math.round((a / Math.max(1, b)) * 100)) + '%' }} /></div>;
  return <div className="gcPanel">
    <h3>🎯 Goals</h3>
    <div className="gcTabs">
      <button className={sub === 'today' ? 'on' : ''} onClick={() => setSub('today')}>Today{todayReady && <u />}</button>
      <button className={sub === 'guide' ? 'on' : ''} onClick={() => setSub('guide')}>Guide {doneCount}/{p.starter.length}{guideReady && <u />}</button>
      <button className={sub === 'badges' ? 'on' : ''} onClick={() => setSub('badges')}>Badges{badgeReady && <u />}</button>
    </div>

    {sub === 'today' && <>
      <div className="gcCard gcStreak">
        <div className="gcRow"><b>🔥 {p.streak.current}-day streak</b><small>best {p.streak.best}</small></div>
        <div className="gcDots">{p.streak.cycle.map((r, i) => { const dayNo = i + 1, done = p.streak.claimedToday ? dayNo <= p.streak.day : dayNo < p.streak.day, now = !p.streak.claimedToday && dayNo === p.streak.day; return <span key={i} className={(done ? 'done ' : '') + (now ? 'now' : '')}><small>D{dayNo}</small><b>{r >= 1000 ? r / 1000 + 'k' : r}</b></span>; })}</div>
        {p.streak.claimedToday ? <p className="gcMuted">✅ Checked in today. Come back tomorrow for {naira(p.streak.reward)}.</p> : <Btn kind="checkin" id="checkin" text={`🎁 Check in · ${naira(p.streak.reward)}`} />}
      </div>
      <h4>Daily missions <small>reset at midnight</small></h4>
      {p.dailies.map(d => { const ok = d.have >= d.need; return <div key={d.id} className={'gcCard' + (d.claimed ? ' off' : '')}>
        <div className="gcRow"><span><i>{d.e}</i> <b>{d.title}</b></span><em>{naira(d.reward)}</em></div>
        <Bar a={d.have} b={d.need} />
        <div className="gcRow"><small>{d.claimed ? 'Claimed ✅' : `${d.have >= 1000 ? naira(d.have) : d.have} / ${d.need >= 1000 ? naira(d.need) : d.need}`}</small>{!d.claimed && ok && <Btn kind="daily" id={d.id} text="Claim" />}</div>
      </div>; })}
      <div className={'gcCard gcBonus' + (p.dailyBonus.claimed ? ' off' : '')}>
        <div className="gcRow"><span><i>🎁</i> <b>Finish all 3 missions</b></span><em>{naira(p.dailyBonus.reward)}</em></div>
        {p.dailyBonus.claimed ? <small>Claimed ✅</small> : p.dailyBonus.ready ? <Btn kind="bonus" id="bonus" text="Claim bonus" /> : <small>Claim each mission above first.</small>}
      </div>
    </>}

    {sub === 'guide' && <>
      <p className="gcMuted">Finish these in any order. Each one pays you and teaches a part of the game.</p>
      {p.starter.map(s => <div key={s.id} className={'gcCard' + (s.claimed ? ' off' : '')}>
        <div className="gcRow"><span><i>{s.e}</i> <b>{s.title}</b></span><em>{naira(s.reward)}</em></div>
        {!s.claimed && <small className="gcHow">{s.how}</small>}
        {!s.claimed && s.need > 1 && <Bar a={s.have} b={s.need} />}
        <div className="gcRow"><small>{s.claimed ? 'Done ✅' : s.done ? 'Finished!' : s.need > 1 ? `${s.have >= 1000 ? naira(s.have) : s.have} / ${s.need >= 1000 ? naira(s.need) : s.need}` : 'Not yet'}</small>{!s.claimed && s.done && <Btn kind="starter" id={s.id} text="Claim" />}</div>
      </div>)}
      <div className={'gcCard gcBonus' + (p.starterBonus.claimed ? ' off' : '')}>
        <div className="gcRow"><span><i>🏅</i> <b>{p.starterBonus.title}</b></span><em>{naira(p.starterBonus.reward)}</em></div>
        {p.starterBonus.claimed ? <small>Completed ✅</small> : p.starterBonus.ready ? <Btn kind="starter" id={p.starterBonus.id} text="Claim badge" /> : <small>Claim every goal above to earn this.</small>}
      </div>
    </>}

    {sub === 'badges' && <>
      <p className="gcMuted">Long-term milestones. Each badge pays once.</p>
      <div className="gcGrid">{p.achievements.map(a => <div key={a.id} className={'gcBadge' + (a.claimed ? ' got' : a.done ? ' rdy' : '')}>
        <i>{a.e}</i><b>{a.title}</b><small>{a.how}</small>
        {a.claimed ? <em>✅ {naira(a.reward)}</em> : a.done ? <Btn kind="ach" id={a.id} text={`Claim ${naira(a.reward)}`} /> : <><Bar a={a.have} b={a.need} /><em>{naira(a.reward)}</em></>}
      </div>)}</div>
    </>}
    <RuntimeStyle id="arl-goals-panel" css={PANEL_CSS} />
  </div>;
}

const CHIP_CSS = `.gcChip{position:fixed;left:50%;transform:translateX(-50%);top:calc(76px + env(safe-area-inset-top,0px));z-index:40;display:flex;align-items:stretch;max-width:min(330px,calc(100vw - 150px));background:#0d1a14ee;border:1px solid #ffffff2a;border-radius:14px;box-shadow:0 6px 18px #0008;overflow:hidden;animation:gcIn .3s both}
.gcChip>button:first-child{all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:9px;padding:7px 10px;color:#fff;min-width:0}
.gcChip i{font-style:normal;font-size:20px;flex:none}.gcChip span{display:flex;flex-direction:column;min-width:0}
.gcChip small{font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:#9fb5aa}.gcChip b{font-size:12px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gcChip.ready{border-color:#f0b94a;animation:gcIn .3s both,gcPulse 1.4s ease-in-out infinite}.gcChip.ready small{color:#f0b94a}
.gcX{all:unset;cursor:pointer;padding:0 9px;color:#9fb5aa;font-size:16px;display:flex;align-items:center}.gcX:hover{color:#fff}
.gcWelcome{position:fixed;left:50%;transform:translateX(-50%);top:calc(84px + env(safe-area-inset-top,0px));z-index:60;width:min(340px,calc(100vw - 24px));background:#0d1a14f6;border:2px solid #f0b94a;border-radius:16px;padding:14px;color:#fff;box-shadow:0 12px 34px #000a;animation:gcIn .35s both}
.gcWelcome b{font-size:15px}.gcWelcome p{margin:7px 0 11px;font-size:12.5px;line-height:1.4;color:#d7e4dc}.gcWelcome div{display:flex;gap:8px}
.gcWelcome button{all:unset;cursor:pointer;flex:1;text-align:center;padding:9px 10px;border-radius:10px;background:#d99a42;color:#1a1208;font-weight:900;font-size:12.5px}.gcWelcome button.alt{background:#1f332a;color:#d7e4dc}
@keyframes gcIn{from{opacity:0;transform:translate(-50%,-6px)}to{opacity:1;transform:translate(-50%,0)}}
@keyframes gcPulse{0%,100%{box-shadow:0 6px 18px #0008,0 0 0 0 #f0b94a66}50%{box-shadow:0 6px 18px #0008,0 0 0 6px #f0b94a00}}`;

const PANEL_CSS = `.gcPanel h3{margin:0 0 8px}.gcPanel h4{margin:14px 0 6px;font-size:13px}.gcPanel h4 small{color:#9fb5aa;font-weight:600;margin-left:6px}
.gcMuted{color:#9fb5aa;font-size:12px;margin:6px 0 8px}
.gcTabs{display:flex;gap:6px;margin-bottom:10px}.gcTabs button{all:unset;cursor:pointer;position:relative;flex:1;text-align:center;padding:8px 6px;border-radius:10px;background:#13231d;border:1px solid #ffffff16;color:#c9d8d0;font-size:12px;font-weight:800}
.gcTabs button.on{background:#d99a42;color:#1a1208;border-color:#d99a42}.gcTabs u{position:absolute;top:4px;right:6px;width:8px;height:8px;border-radius:50%;background:#ff5b52;border:1px solid #0b1511}
.gcCard{background:#13231d;border:1px solid #ffffff16;border-radius:12px;padding:9px 11px;margin-bottom:8px;display:flex;flex-direction:column;gap:6px}
.gcCard.off{opacity:.55}.gcCard i{font-style:normal}
.gcRow{display:flex;justify-content:space-between;align-items:center;gap:8px}.gcRow em{font-style:normal;color:#f0b94a;font-weight:800;font-size:12px;white-space:nowrap}.gcRow small{color:#9fb5aa}
.gcHow{color:#9fb5aa;font-size:11.5px;line-height:1.35}
.gcBar{height:7px;border-radius:99px;background:#0b1511;overflow:hidden}.gcBar i{display:block;height:100%;background:linear-gradient(90deg,#3fb98a,#8be0b5);border-radius:99px;transition:width .4s}
.gcClaim{all:unset;cursor:pointer;box-sizing:border-box;text-align:center;padding:8px 12px;border-radius:10px;background:#d99a42;color:#1a1208;font-weight:900;font-size:12.5px;white-space:nowrap}.gcClaim:disabled{opacity:.6;cursor:default}
.gcStreak .gcClaim{margin-top:2px}.gcBonus{border-color:#f0b94a55}
.gcDots{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}.gcDots span{display:flex;flex-direction:column;align-items:center;padding:5px 0;border-radius:8px;background:#0b1511;border:1px solid #ffffff12;color:#9fb5aa}
.gcDots span small{font-size:9px}.gcDots span b{font-size:11px;color:#c9d8d0}.gcDots span.done{background:#1f4a37;border-color:#3fb98a}.gcDots span.done b{color:#fff}.gcDots span.now{border-color:#f0b94a;box-shadow:0 0 0 2px #f0b94a44}.gcDots span.now b{color:#f0b94a}
.gcGrid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.gcBadge{background:#13231d;border:1px solid #ffffff16;border-radius:12px;padding:10px 8px;display:flex;flex-direction:column;align-items:center;gap:5px;text-align:center}
.gcBadge i{font-style:normal;font-size:26px;filter:grayscale(1);opacity:.55}.gcBadge b{font-size:12px}.gcBadge small{color:#9fb5aa;font-size:10.5px;line-height:1.3}.gcBadge em{font-style:normal;color:#f0b94a;font-weight:800;font-size:11px}
.gcBadge .gcBar{width:100%}.gcBadge.got i,.gcBadge.rdy i{filter:none;opacity:1}.gcBadge.rdy{border-color:#f0b94a}.gcBadge.got{border-color:#3fb98a66}`;
