'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GAME } from './CityWorld';
import RuntimeStyle from './RuntimeStyle';
import { NET } from '../lib/cityNet';
import { CHOP, PARTS, YARDS, chopCash, chopPartCount, partById, yardById, type YardSite } from '../lib/chopData';

/* Step 6: chop shop (client side). The server owns everything that matters (see app/api/chop/route.ts); this file is the interface:
   - the "steal" action is started from the crime buttons (CrimeActions) through window.__arlChopSteal
   - a job HUD with the time left; the waypoint to the hidden yard is set only after a successful theft
   - polls the server while you drive so police checkpoints show up as they happen
   - at the yard gate (driving the stolen car) you pick cash or parts; on foot at a yard you can fit spare parts to your own car */
type Job = { ticket: string; yard: string; car: { name: string; price: number; condition: number }; startedAt: number; deadlineSecs: number };
type Win = { take: 'cash' | 'parts'; paid: number; parts: { id: string; qty: number; name: string; e: string }[] };
const KEY = 'arl-chop-job';
const naira = (n: number) => '₦' + Math.round(n).toLocaleString();
const post = async (body: object) => { try { const r = await fetch('/api/chop', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { ok: r.ok && (await r.clone().json().catch(() => ({}))).ok !== false, d: await r.json().catch(() => ({})) as any }; } catch { return { ok: false, d: { error: 'Network error.' } as any }; } }; // eslint-disable-line @typescript-eslint/no-explicit-any
const load = (): Job | null => { try { const j = JSON.parse(localStorage.getItem(KEY) || 'null') as Job | null; return j && j.ticket && yardById(j.yard) && Date.now() - j.startedAt < (j.deadlineSecs + 60) * 1000 ? j : null; } catch { return null; } };
const save = (j: Job | null) => { try { if (j) localStorage.setItem(KEY, JSON.stringify(j)); else localStorage.removeItem(KEY); } catch { /* private mode: the job still works for this session */ } };
/* The server judges the gate from the position it holds, which is only refreshed every 5 s. A car does ~25 m/s, so send a fresh fix right before asking. */
const pushPos = () => { const p = GAME.player; return fetch('/api/position', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ x: p.x, z: p.z, r: p.r, driving: NET.me.drv }) }).catch(() => {}); };
const near = (p: { x: number; z: number } | undefined, y: YardSite, r: number) => !!p && Math.hypot(p.x - y.x, p.z - y.z) <= r;

export default function ChopShop({ say, refresh }: { say: (m: string) => void; refresh: () => void }) {
  const [job, setJob] = useState<Job | null>(null), [left, setLeft] = useState(0), [cleared, setCleared] = useState(0), [atGate, setAtGate] = useState(false), [busy, setBusy] = useState(false), [win, setWin] = useState<Win | null>(null);
  const [yardHere, setYardHere] = useState<YardSite | null>(null), [owned, setOwned] = useState<Record<string, number>>({});
  const jobRef = useRef<Job | null>(null), seen = useRef(new Set<number>()), working = useRef(false);
  const setJ = useCallback((j: Job | null) => { jobRef.current = j; setJob(j); save(j); (window as any).__arlChop = j ? { active: true, yard: j.yard } : null; if (!j) { seen.current = new Set(); setCleared(0); setAtGate(false); } }, []); // eslint-disable-line @typescript-eslint/no-explicit-any
  const over = useCallback((msg: string) => { if (jobRef.current && (GAME.nav as any)?.name?.startsWith('🔧')) GAME.nav = null; setJ(null); if (msg) say(msg); refresh(); window.dispatchEvent(new Event('arl-inventory-changed')); }, [say, refresh, setJ]); // eslint-disable-line @typescript-eslint/no-explicit-any

  // pick the job back up after a reload
  useEffect(() => { const j = load(); if (j) { setJ(j); const y = yardById(j.yard); if (y) GAME.nav = { x: y.x, z: y.z, name: '🔧 ' + y.name }; } else save(null); }, [setJ]);

  // the steal action, called by the crime buttons
  useEffect(() => {
    (window as any).__arlChopSteal = async (policeNearby: number) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (working.current || jobRef.current) return say(jobRef.current ? 'Deliver the car you already have first.' : 'Hold on…');
      working.current = true; NET.me.anim = 'punch'; NET.me.animUntil = Date.now() + 450;
      const r = await post({ action: 'steal', policeNearby }); working.current = false;
      if (!r.ok) return say(r.d.error || 'It did not work.');
      if (r.d.stopped) { refresh(); return say(r.d.jailSecs ? '🚔 A patrol was right there. Straight to jail.' : '😱 The owner fought you off. You are WANTED.'); }
      const y = yardById(r.d.yard?.id); if (!y) return say('The job fell through.');
      setJ({ ticket: r.d.ticket, yard: y.id, car: r.d.car, startedAt: r.d.startedAt || Date.now(), deadlineSecs: r.d.deadlineSecs || CHOP.deadlineSecs });
      GAME.nav = { x: y.x, z: y.z, name: '🔧 ' + y.name }; GAME.hasCar = true; refresh();
      say(`🚗 You took a ${r.d.car.name}. Press E to get in. A fixer says: ${y.name}, ${CHOP.deadlineSecs / 60} minutes. Police checkpoints are up: be quick.`);
    };
    return () => { (window as any).__arlChopSteal = undefined; }; // eslint-disable-line @typescript-eslint/no-explicit-any
  }, [say, refresh, setJ]);

  // clock + checkpoints
  useEffect(() => {
    if (!job) return;
    const clock = setInterval(() => { const j = jobRef.current; if (!j) return; const s = Math.ceil(j.deadlineSecs - (Date.now() - j.startedAt) / 1000); setLeft(s); if (s <= -3) over('⌛ The yard gave up on you. The car is yours to keep, but only a chop shop will ever take it.'); }, 500);
    let stop = false;
    const poll = async () => {
      const j = jobRef.current; if (!j || stop) return;
      const r = await post({ action: 'poll', ticket: j.ticket }); if (stop || !jobRef.current) return;
      if (!r.ok && r.d.error) { if (/jail|valid/i.test(r.d.error)) over(''); return; }
      for (const e of (r.d.events || []) as { i: number; ok: boolean }[]) if (!seen.current.has(e.i)) {
        seen.current.add(e.i); if (e.ok) { setCleared(c => c + 1); say('🚧 Police checkpoint: you slipped through!'); }
      }
      if (r.d.state === 'caught') { over(`🚔 BUSTED at a checkpoint! The car is impounded, you are in jail${r.d.fine ? ` and fined ${naira(r.d.fine)}` : ''}.`); }
      else if (r.d.state === 'lost') over('💥 Someone took the car off you. The job is gone.');
      else if (r.d.state === 'done') over('');
      else if (r.d.state === 'expired') over('⌛ Too late. Nobody at the yard will take that car now.');
    };
    poll(); const t = setInterval(poll, 2500);
    return () => { stop = true; clearInterval(clock); clearInterval(t); };
  }, [job?.ticket]); // eslint-disable-line react-hooks/exhaustive-deps

  // are we at the gate (job) or at any yard on foot (fit parts)?
  useEffect(() => {
    const i = setInterval(() => {
      const pos = (window as any).__arlPos as { x: number; z: number } | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
      const j = jobRef.current, y = j ? yardById(j.yard) : null;
      setAtGate(!!(j && y && NET.me.drv && near(pos, y, CHOP.yardRadius)));
      setYardHere(!j && !NET.me.drv ? YARDS.find(a => near(pos, a, CHOP.yardRadius)) || null : null);
    }, 400);
    return () => clearInterval(i);
  }, []);
  useEffect(() => {
    if (!yardHere) return; let dead = false;
    const f = () => fetch('/api/inventory').then(r => r.json()).then(d => { if (!dead && Array.isArray(d?.items)) setOwned(Object.fromEntries(d.items.filter((x: { id: string }) => partById(x.id)).map((x: { id: string; qty: number }) => [x.id, x.qty]))); }).catch(() => {});
    f(); const i = setInterval(f, 6000); window.addEventListener('arl-inventory-changed', f);
    return () => { dead = true; clearInterval(i); window.removeEventListener('arl-inventory-changed', f); };
  }, [yardHere]);

  const deliver = async (take: 'cash' | 'parts') => {
    const j = jobRef.current; if (!j || busy) return; setBusy(true); await pushPos();
    const r = await post({ action: 'deliver', ticket: j.ticket, take }); setBusy(false);
    if (!r.ok) return say(r.d.error || 'The yard did not take it.');
    if (r.d.caught) return over(`🚔 BUSTED! The checkpoint you ran caught up with you. Car impounded, ${r.d.jailSecs}s in jail.`);
    if (typeof r.d.cash === 'number') window.dispatchEvent(new CustomEvent('arl-mission-paid', { detail: { cash: r.d.cash, reward: r.d.paid } }));
    if ((GAME.nav as any)?.name?.startsWith('🔧')) GAME.nav = null; // eslint-disable-line @typescript-eslint/no-explicit-any
    setJ(null); setWin({ take, paid: r.d.paid, parts: r.d.parts || [] }); refresh(); window.dispatchEvent(new Event('arl-inventory-changed'));
    setTimeout(() => setWin(null), 7000);
  };
  const fit = async (id: string) => {
    if (busy) return; setBusy(true); await pushPos(); const r = await fetch('/api/chop', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'fit', itemKey: id }) }); const d = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) return say(d.error || 'That did not fit.');
    say(`🔧 Fitted to your ${d.car}: condition +${d.gained} (now ${d.condition}%).`); window.dispatchEvent(new Event('arl-inventory-changed'));
  };

  const mins = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;
  const y = job ? yardById(job.yard) : null;
  return <>
    {job && y && <div className="chHud"><small>🔧 CHOP JOB · HOT CAR</small><b>{job.car.name} → {y.name}</b><span>⏱ {mins(left)} · 🚧 checkpoints cleared {cleared}</span>
      <i>{atGate ? 'You are at the gate.' : NET.me.drv ? 'Follow the 🔧 waypoint. Faster = fewer checkpoints.' : 'Get in the stolen car (E near it).'}</i></div>}
    {job && y && atGate && <div className="chGate"><b>🔧 {y.name}</b><small>Pick your payment. The car is gone either way.</small>
      <button disabled={busy} onClick={() => deliver('cash')}>💵 Cash · {naira(chopCash(job.car.price, job.car.condition))}</button>
      <button disabled={busy} className="alt" onClick={() => deliver('parts')}>🔩 Parts · {chopPartCount(job.car.price)} pieces<small>Sell, trade on the Market, or fit to your own car.</small></button></div>}
    {win && <div className="chWin">{win.take === 'cash' ? `💵 Paid ${naira(win.paid)}` : <>🔩 Parts: {win.parts.map(p => `${p.e} ${p.name} ×${p.qty}`).join(' · ')}</>}<small>You are still WANTED. Lose the heat.</small></div>}
    {yardHere && !job && <div className="chGate"><b>🔩 {yardHere.name}</b>
      {PARTS.some(p => owned[p.id]) ? <><small>Fit a spare part to your own car (it is stolen cars only that get chopped).</small>{PARTS.filter(p => owned[p.id]).map(p => <button key={p.id} disabled={busy} className="alt" onClick={() => fit(p.id)}>{p.e} Fit {p.name} (+{p.fit}% condition) · you have {owned[p.id]}</button>)}</>
        : <small>No spare parts on you. Steal a car, drive it here, and take parts instead of cash.</small>}</div>}
    <RuntimeStyle id="arl-chop" css={`.chHud{position:fixed;left:50%;transform:translateX(-50%);top:calc(96px + env(safe-area-inset-top,0px));z-index:34;width:min(320px,calc(100vw - 24px));background:#1c1208f2;color:#fff;border:1px solid #f59e0baa;border-radius:14px;padding:9px 12px;display:flex;flex-direction:column;gap:3px;text-align:center;box-shadow:0 10px 30px #000a}.chHud small{font-size:10px;color:#fbbf24;letter-spacing:.06em}.chHud b{font-size:13px}.chHud span{font-size:12px;color:#fde68a}.chHud i{font-size:11px;color:#d6d3d1;font-style:normal}
.chGate{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(150px + env(safe-area-inset-bottom,0px));z-index:36;width:min(300px,calc(100vw - 24px));background:#0f172af5;color:#fff;border:1px solid #f59e0b;border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:8px;text-align:center;box-shadow:0 10px 30px #000b}.chGate small{font-size:11px;color:#cbd5e1}.chGate button{min-height:46px;border:0;border-radius:12px;background:#f59e0b;color:#111;font-weight:900;font-size:14px;touch-action:manipulation}.chGate button.alt{background:#e2e8f0}.chGate button small{display:block;color:#475569;font-weight:600;margin-top:2px}.chGate button:disabled{opacity:.55}
.chWin{position:fixed;left:50%;transform:translateX(-50%);top:calc(150px + env(safe-area-inset-top,0px));z-index:37;background:#14532df5;color:#fff;border:1px solid #86efac;border-radius:14px;padding:10px 14px;font-weight:900;text-align:center;box-shadow:0 10px 30px #000a}.chWin small{display:block;font-weight:600;color:#bbf7d0;margin-top:2px}`} />
  </>;
}
