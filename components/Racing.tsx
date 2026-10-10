'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import RuntimeStyle from './RuntimeStyle';
import { sfx } from '../lib/audio';
import { PAINTS, RIMS, TINTS, STYLE_COST, TUNES, baseTime, type Tier, type Tune } from '../lib/racing';

/* Street racing + car tuning + paint shop. Display and input only: /api/race decides every result, price and payout. */

type Car = { id: string; name: string; type: string; price: number; fuel: number; condition: number; paint: string; rims: string; tint: number; stolen: boolean; tune: Tune; perf: number; drivingLevel: number; spec: { topSpeed: number; accel: number; handling: number } };
type Info = { cash: number; heat: number; vehicles: Car[]; day: { n: number; max: number; net: number; cap: number; cooldown: number }; tiers: Tier[]; tunes: typeof TUNES };
type Result = { place: number; time: number; field: { name: string; time: number; you: boolean }[]; prize: number; net: number; capped: boolean; heat: number; wanted: boolean; cash: number; car: { fuel: number; condition: number } };
type Inputs = { reaction: number | null; shifts: number[] };
const naira = (n: number) => '₦' + Math.round(n).toLocaleString();
const post = async (body: object) => { const r = await fetch('/api/race', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { ok: r.ok, d: await r.json().catch(() => ({})) as any }; };
const postVeh = async (body: object) => { const r = await fetch('/api/vehicles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { ok: r.ok, d: await r.json().catch(() => ({})) as any }; };
const ordinal = (n: number) => ['', '1st', '2nd', '3rd', '4th'][n] || n + 'th';

/* ───────── the panel ───────── */
export function RacingPanel({ onCash, say }: { onCash: (n: number) => void; say: (m: string) => void }) {
  const [info, setInfo] = useState<Info | null>(null), [failed, setFailed] = useState(false), [sel, setSel] = useState(''), [tab, setTab] = useState<'race' | 'tune' | 'style'>('race'), [busy, setBusy] = useState(''), [race, setRace] = useState<{ tier: Tier; rivals: { name: string; car: string }[] } | null>(null), [cool, setCool] = useState(0);
  const load = useCallback(async () => { try { const r = await fetch('/api/race', { cache: 'no-store' }); if (!r.ok) { setFailed(true); return; } const d: Info = await r.json(); setInfo(d); setCool(d.day.cooldown); setSel(s => s && d.vehicles.some(v => v.id === s) ? s : d.vehicles[0]?.id || ''); } catch { setFailed(true); } }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (cool <= 0) return; const t = setTimeout(() => setCool(c => c - 1), 1000); return () => clearTimeout(t); }, [cool]);
  if (failed) return <><h3>🏁 Racing</h3><p className="rcMuted">Racing could not load. Check your connection and open this again.</p></>;
  if (!info) return <><h3>🏁 Racing</h3><p className="rcMuted">Loading…</p></>;
  const car = info.vehicles.find(v => v.id === sel) || null;
  const enter = async (tier: Tier) => {
    if (!car || busy) return; setBusy(tier.id);
    try { const r = await post({ action: 'start', vehicleId: car.id, tier: tier.id }); if (!r.ok) { sfx('error'); say(r.d.error || 'Could not enter.'); return; } if (typeof r.d.cash === 'number') onCash(r.d.cash); setRace({ tier, rivals: r.d.rivals || [] }); }
    finally { setBusy(''); }
  };
  const tune = async (part: string) => {
    if (!car || busy) return; setBusy(part);
    try { const r = await post({ action: 'tune', vehicleId: car.id, part }); if (!r.ok) { sfx('error'); say(r.d.error || 'Could not buy that.'); return; } sfx('success'); onCash(r.d.cash); say('🔧 Upgrade installed'); await load(); }
    finally { setBusy(''); }
  };
  const veh = async (action: string, extra: object = {}, label = 'Done') => {
    if (!car || busy) return; setBusy(action + JSON.stringify(extra));
    try { const r = await postVeh({ action, vehicleId: car.id, ...extra }); if (!r.ok) { sfx('error'); say(r.d.error || 'Could not do that.'); return; } sfx('success'); if (typeof r.d.cash === 'number') onCash(r.d.cash); say(label); await load(); }
    finally { setBusy(''); }
  };
  const repairCost = car ? Math.max(50_000, Math.round((100 - car.condition) * car.price * .012)) : 0, fuelCost = car ? Math.max(15_000, Math.round((100 - car.fuel) * 1200)) : 0;
  return <div className="rcPanel">
    <h3>🏁 Racing</h3>
    {info.vehicles.length === 0 ? <p className="rcMuted">You need a car first. Open 📱 Phone → Garage to buy one, then come back to race and tune it.</p> : <>
      <div className="rcCars">{info.vehicles.map(v => <button key={v.id} className={v.id === sel ? 'on' : ''} onClick={() => setSel(v.id)}>🚘 {v.name}</button>)}</div>
      {car && <div className="rcCard rcCarInfo">
        <div className="rcRow"><b>{car.name}</b><small>{car.condition}% condition · {car.fuel}% fuel</small></div>
        <Bars car={car} />
        <div className="rcRow"><small>Quarter-mile (stock inputs): <b>{baseTime(car.perf, car.drivingLevel).toFixed(2)}s</b></small><span className="rcMini"><button disabled={!!busy || car.condition >= 100} onClick={() => veh('repair', {}, '🔧 Repaired')}>Repair {car.condition < 100 ? naira(repairCost) : ''}</button><button disabled={!!busy || car.fuel >= 100} onClick={() => veh('refuel', {}, '⛽ Refuelled')}>Fuel {car.fuel < 100 ? naira(fuelCost) : ''}</button></span></div>
      </div>}
      <div className="rcTabs">{(['race', 'tune', 'style'] as const).map(t => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t === 'race' ? '🏁 Race' : t === 'tune' ? '🔧 Tune' : '🎨 Style'}</button>)}</div>

      {tab === 'race' && car && <>
        <p className="rcMuted">Illegal street races: win cash, but every run adds heat and wears your car. {info.day.n}/{info.day.max} races tonight · net today {naira(info.day.net)} of {naira(info.day.cap)} max.</p>
        {info.tiers.map(t => <div key={t.id} className="rcCard">
          <div className="rcRow"><span><i>{t.e}</i> <b>{t.name}</b></span><em>{naira(t.fee)} entry</em></div>
          <small className="rcMuted">{t.blurb} Win {naira(t.fee * t.prize[0])} · 2nd gets your entry back · 🔥 +{t.heat} heat</small>
          <button className="rcGo" disabled={!!busy || cool > 0 || car.stolen} onClick={() => enter(t)}>{busy === t.id ? '…' : cool > 0 ? `Cooling down ${cool}s` : `Enter · ${naira(t.fee)}`}</button>
        </div>)}
        {info.heat >= 40 && <p className="rcWarn">🚨 You are WANTED. Racing will only make it worse.</p>}
      </>}

      {tab === 'tune' && car && <>
        <p className="rcMuted">Parts are fitted to this car only. Better parts mean a quicker time for the same driving.</p>
        {info.tunes.map(p => { const lv = car.tune[p.id], max = lv >= 3; return <div key={p.id} className="rcCard">
          <div className="rcRow"><span><i>{p.e}</i> <b>{p.name}</b></span><span className="rcPips">{[0, 1, 2].map(i => <u key={i} className={i < lv ? 'on' : ''} />)}</span></div>
          <small className="rcMuted">{p.what}</small>
          <button className="rcGo" disabled={!!busy || max} onClick={() => tune(p.id)}>{max ? 'Maxed out ✅' : busy === p.id ? '…' : `Upgrade to level ${lv + 1} · ${naira(p.costs[lv])}`}</button>
        </div>; })}
      </>}

      {tab === 'style' && car && <>
        <CarArt paint={car.paint} rims={car.rims} tint={car.tint} />
        <h4>Paint <small>{naira(STYLE_COST.paint)}</small></h4>
        <div className="rcSwatches">{PAINTS.map(p => <button key={p.id} className={car.paint === p.id ? 'on' : ''} title={p.name} disabled={!!busy} style={{ background: p.id === 'factory' ? 'linear-gradient(135deg,#777,#ccc)' : p.id }} onClick={() => car.paint !== p.id && veh('paint', { paint: p.id }, '🎨 Painted')} />)}</div>
        <h4>Rims <small>{naira(STYLE_COST.rims)}</small></h4>
        <div className="rcChips">{RIMS.map(r => <button key={r.id} className={car.rims === r.id ? 'on' : ''} disabled={!!busy} onClick={() => car.rims !== r.id && veh('rims', { rims: r.id }, '🛞 Rims fitted')}>{r.name}</button>)}</div>
        <h4>Window tint <small>{naira(STYLE_COST.tint)}</small></h4>
        <div className="rcChips">{TINTS.map(t => <button key={t.v} className={car.tint === t.v ? 'on' : ''} disabled={!!busy} onClick={() => car.tint !== t.v && veh('tint', { tint: t.v }, '🕶️ Tint applied')}>{t.name}</button>)}</div>
        <p className="rcMuted">Your car shows these changes next time you get in it.</p>
      </>}
    </>}
    {race && car && <DragRace tier={race.tier} rivals={race.rivals} carName={car.name} paint={car.paint}
      onSubmit={async (inp) => { const r = await post({ action: 'finish', ...inp }); if (!r.ok) { say(r.d.error || 'The race fell apart.'); return null; } onCash(r.d.cash); return r.d as Result; }}
      onClose={() => { setRace(null); load(); }} />}
    <RuntimeStyle id="arl-racing" css={CSS} />
  </div>;
}

function Bars({ car }: { car: Car }) {
  const b = (label: string, v: number) => <div className="rcBar"><small>{label}</small><i><u style={{ width: Math.max(4, Math.min(100, v * 100)) + '%' }} /></i></div>;
  const s = car.spec, t = car.tune;
  return <div className="rcBars">{b('Power', Math.max(0, (s.topSpeed - 190) / 60) * .75 + t.engine * .08)}{b('Launch', Math.max(0, (10 - s.accel) / 4.2) * .75 + t.tires * .07 + t.weight * .04)}{b('Handling', Math.max(0, (s.handling - 70) / 20) * .75 + t.tires * .05)}</div>;
}

function CarArt({ paint, rims, tint }: { paint: string; rims: string; tint: number }) {
  const body = paint === 'factory' ? '#8a96a3' : paint, rim = rims === 'sport' ? '#d8dde3' : rims === 'black' ? '#111' : '#3a3f45', glass = tint ? `rgba(8,14,20,${.55 + tint / 200})` : 'rgba(150,200,230,.55)';
  return <svg viewBox="0 0 240 100" className="rcArt" role="img" aria-label="Your car"><ellipse cx="120" cy="86" rx="100" ry="7" fill="#0006" />
    <path d="M18 66 L24 50 Q30 42 52 40 L88 38 Q104 18 138 18 L170 22 Q196 28 210 46 L222 56 Q226 66 216 70 L22 72 Q14 72 18 66Z" fill={body} stroke="#0008" strokeWidth="1.5" />
    <path d="M96 38 Q108 24 136 24 L166 27 Q184 32 194 44 L100 44Z" fill={glass} /><line x1="146" y1="26" x2="146" y2="44" stroke="#0008" strokeWidth="2" />
    <circle cx="62" cy="72" r="15" fill="#111" /><circle cx="62" cy="72" r="9" fill={rim} /><circle cx="178" cy="72" r="15" fill="#111" /><circle cx="178" cy="72" r="9" fill={rim} /></svg>;
}

/* ───────── the drag race: lights → launch → three gear changes → replay → result ───────── */
const GEAR_SECS = [1.6, 1.5, 1.4], GREEN = [.78, .92];
function DragRace({ tier, rivals, carName, paint, onSubmit, onClose }: { tier: Tier; rivals: { name: string; car: string }[]; carName: string; paint: string; onSubmit: (i: Inputs) => Promise<Result | null>; onClose: () => void }) {
  type Phase = 'lights' | 'go' | 'gears' | 'sending' | 'replay' | 'result' | 'error';
  const [phase, setPhase] = useState<Phase>('lights'), [red, setRed] = useState(0), [msg, setMsg] = useState(''), [gear, setGear] = useState(0), [needle, setNeedle] = useState(0), [res, setRes] = useState<Result | null>(null), [prog, setProg] = useState<number[]>([0, 0, 0, 0]);
  const t0 = useRef(0), reaction = useRef<number | null>(null), shifts = useRef<number[]>([]), g0 = useRef(0), gearRef = useRef(0), phaseRef = useRef<Phase>('lights'), false_ = useRef(false), timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const to = (f: () => void, ms: number) => { timers.current.push(setTimeout(f, ms)); };
  const go = (p: Phase) => { phaseRef.current = p; setPhase(p); };
  const startGears = useCallback(() => { gearRef.current = 0; setGear(0); g0.current = performance.now(); go('gears'); }, []);
  useEffect(() => { // staging lights: three reds, a random wait, then green
    [1, 2, 3].forEach(n => to(() => { setRed(n); sfx('pop'); }, n * 750));
    to(() => { if (false_.current) return; t0.current = performance.now(); setRed(4); go('go'); sfx('success'); to(() => { if (phaseRef.current === 'go') { reaction.current = 1200; startGears(); } }, 1200); }, 3 * 750 + 500 + Math.random() * 1200);
    return () => timers.current.forEach(clearTimeout);
  }, [startGears]);
  useEffect(() => { // rev needle
    if (phase !== 'gears') return; let raf = 0;
    const f = (t: number) => {
      const p = (t - g0.current) / 1000 / GEAR_SECS[gearRef.current]; setNeedle(Math.min(1, p));
      if (p >= 1) { shiftNow(true); return; } raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f); return () => cancelAnimationFrame(raf);
  }, [phase, gear]); // eslint-disable-line react-hooks/exhaustive-deps
  const finish = async () => {
    go('sending'); const r = await onSubmit({ reaction: reaction.current, shifts: shifts.current });
    if (!r) { go('error'); return; } setRes(r); go('replay');
  };
  const shiftNow = (over = false) => {
    if (phaseRef.current !== 'gears') return;
    const p = Math.min(1, (performance.now() - g0.current) / 1000 / GEAR_SECS[gearRef.current]), acc = over ? 0 : Math.max(0, 1 - Math.abs(p - .85) / .35);
    shifts.current.push(acc); sfx(acc > .7 ? 'success' : 'pop'); setMsg(acc > .85 ? 'PERFECT!' : acc > .5 ? 'Good' : over ? 'Over-rev!' : 'Late/early');
    if (gearRef.current >= 2) { finish(); return; }
    gearRef.current++; setGear(gearRef.current); g0.current = performance.now(); setNeedle(0);
  };
  const press = () => {
    const ph = phaseRef.current;
    if (ph === 'lights') { false_.current = true; reaction.current = null; setMsg('FALSE START!'); sfx('error'); timers.current.forEach(clearTimeout); to(startGears, 700); return; }
    if (ph === 'go') { reaction.current = Math.round(performance.now() - t0.current); setMsg(reaction.current < 200 ? `${reaction.current}ms 🔥` : `${reaction.current}ms`); startGears(); return; }
    if (ph === 'gears') shiftNow();
  };
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); press(); } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { // replay: everyone runs their real time, scaled so the winner takes ~5s
    if (phase !== 'replay' || !res) return; const fast = res.field[0].time, scale = 5 / fast, t = performance.now(); let raf = 0;
    const order = ['You', ...rivals.map(r => r.name)];
    const f = (now: number) => { const el = (now - t) / 1000 * (1 / scale) * 1; const p = order.map(n => { const e = res.field.find(x => x.name === n); return e ? Math.min(1, el / e.time) : 0; }); setProg(p); if (p.every(x => x >= 1)) { go('result'); sfx(res.place === 1 ? 'success' : 'pop'); return; } raf = requestAnimationFrame(f); };
    raf = requestAnimationFrame(f); return () => cancelAnimationFrame(raf);
  }, [phase, res, rivals]);
  const names = ['You', ...rivals.map(r => r.name)], body = paint === 'factory' ? '#8a96a3' : paint;
  const big = phase === 'lights' ? 'TAP when the light turns GREEN' : phase === 'go' ? 'GO! GO! GO!' : phase === 'gears' ? `Gear ${gear + 1} · tap SHIFT in the green` : phase === 'sending' ? 'Timing the run…' : '';
  return <div className="rcWrap" role="dialog">
    <div className="rcRace" onPointerDown={e => { if ((e.target as HTMLElement).closest('button')) return; if (phase === 'lights' || phase === 'go' || phase === 'gears') press(); }}>
      <div className="rcTop"><b>{tier.e} {tier.name}</b><small>{carName}</small></div>
      <div className="rcTrack">{names.map((n, i) => <div key={n} className="rcLane"><small>{n}</small><i><span style={{ left: (prog[i] * 88) + '%', background: i === 0 ? body : undefined }} className={i === 0 ? 'me' : ''}>🏎️</span><u /></i></div>)}</div>
      {(phase === 'lights' || phase === 'go') && <div className="rcLights">{[1, 2, 3].map(i => <b key={i} className={red >= i && red < 4 ? 'red' : ''} />)}<b className={red === 4 ? 'green' : ''} /></div>}
      {phase === 'gears' && <div className="rcRev"><i><u style={{ left: GREEN[0] * 100 + '%', width: (GREEN[1] - GREEN[0]) * 100 + '%' }} /><em style={{ left: needle * 100 + '%' }} /></i></div>}
      {big && <p className="rcBig">{big}</p>}{msg && phase !== 'result' && <p className="rcMsg">{msg}</p>}
      {(phase === 'lights' || phase === 'go') && <button className="rcBtn" onClick={press}>🏁 GO</button>}
      {phase === 'gears' && <button className="rcBtn shift" onClick={() => shiftNow()}>⚙️ SHIFT</button>}
      {phase === 'error' && <><p className="rcBig">The race was called off.</p><button className="rcBtn" onClick={onClose}>Close</button></>}
      {phase === 'result' && res && <div className="rcResult">
        <h4>{res.place === 1 ? '🏆 You won!' : res.place === 2 ? '🥈 2nd place' : `${ordinal(res.place)} place`}</h4>
        <ol>{res.field.map(f => <li key={f.name} className={f.you ? 'me' : ''}><span>{f.name}</span><b>{f.time.toFixed(2)}s</b></li>)}</ol>
        <p>{res.prize > 0 ? `Prize ${naira(res.prize)} · net ${res.net >= 0 ? '+' : '-'}${naira(Math.abs(res.net))}` : `You lost your ${naira(tier.fee)} entry.`}{res.capped ? ' (daily profit cap reached)' : ''}</p>
        <small>🔥 Heat now {res.heat}{res.wanted ? ' · you are WANTED' : ''} · car {res.car.condition}% condition, {res.car.fuel}% fuel</small>
        <button className="rcBtn" onClick={onClose}>Back to the garage</button>
      </div>}
    </div>
  </div>;
}

const CSS = `.rcPanel h3{margin:0 0 8px}.rcPanel h4{margin:12px 0 6px;font-size:13px}.rcPanel h4 small{color:#9fb5aa;font-weight:600;margin-left:6px}
.rcMuted{color:#9fb5aa;font-size:12px;margin:6px 0 8px;line-height:1.4}.rcWarn{color:#fca5a5;font-size:12px}
.rcCars{display:flex;gap:6px;overflow-x:auto;padding-bottom:6px;margin-bottom:6px}.rcCars button{all:unset;cursor:pointer;flex:none;padding:7px 11px;border-radius:10px;background:#13231d;border:1px solid #ffffff16;color:#c9d8d0;font-size:12px;font-weight:800;white-space:nowrap}.rcCars button.on{background:#d99a42;color:#1a1208;border-color:#d99a42}
.rcCard{background:#13231d;border:1px solid #ffffff16;border-radius:12px;padding:9px 11px;margin-bottom:8px;display:flex;flex-direction:column;gap:6px}.rcCard i{font-style:normal}
.rcRow{display:flex;justify-content:space-between;align-items:center;gap:8px}.rcRow em{font-style:normal;color:#f0b94a;font-weight:800;font-size:12px;white-space:nowrap}.rcRow small{color:#9fb5aa}
.rcBars{display:flex;flex-direction:column;gap:4px}.rcBar{display:flex;align-items:center;gap:8px}.rcBar small{width:60px;color:#9fb5aa;font-size:11px}.rcBar i{flex:1;height:7px;border-radius:99px;background:#0b1511;overflow:hidden}.rcBar u{display:block;height:100%;background:linear-gradient(90deg,#3fb98a,#f0b94a);border-radius:99px}
.rcMini{display:flex;gap:6px}.rcMini button,.rcChips button{all:unset;cursor:pointer;padding:5px 9px;border-radius:9px;background:#1f332a;color:#d7e4dc;font-size:11px;font-weight:800;white-space:nowrap}.rcMini button:disabled,.rcChips button:disabled{opacity:.5;cursor:default}
.rcTabs{display:flex;gap:6px;margin:10px 0}.rcTabs button{all:unset;cursor:pointer;flex:1;text-align:center;padding:8px 6px;border-radius:10px;background:#13231d;border:1px solid #ffffff16;color:#c9d8d0;font-size:12px;font-weight:800}.rcTabs button.on{background:#d99a42;color:#1a1208;border-color:#d99a42}
.rcGo{all:unset;cursor:pointer;box-sizing:border-box;text-align:center;padding:9px 12px;border-radius:10px;background:#d99a42;color:#1a1208;font-weight:900;font-size:12.5px}.rcGo:disabled{opacity:.55;cursor:default}
.rcPips{display:flex;gap:4px}.rcPips u{width:18px;height:8px;border-radius:4px;background:#0b1511;border:1px solid #ffffff22}.rcPips u.on{background:#3fb98a;border-color:#3fb98a}
.rcArt{width:100%;max-height:120px;margin:4px 0}.rcSwatches{display:flex;flex-wrap:wrap;gap:8px}.rcSwatches button{all:unset;cursor:pointer;width:30px;height:30px;border-radius:50%;border:2px solid #ffffff33}.rcSwatches button.on{border-color:#f0b94a;box-shadow:0 0 0 3px #f0b94a55}.rcSwatches button:disabled{opacity:.5}
.rcChips{display:flex;flex-wrap:wrap;gap:6px}.rcChips button.on{background:#d99a42;color:#1a1208}
.rcWrap{position:fixed;inset:0;z-index:70;background:#000c;display:flex;align-items:center;justify-content:center;padding:12px;touch-action:manipulation}
.rcRace{width:min(400px,100%);max-height:calc(100dvh - 24px);overflow:auto;background:#0d1a14;border:2px solid #f0b94a;border-radius:18px;padding:12px;color:#fff;box-shadow:0 14px 40px #000b;display:flex;flex-direction:column;gap:10px;user-select:none}
.rcTop{display:flex;justify-content:space-between;align-items:center}.rcTop b{font-size:14px}.rcTop small{color:#9fb5aa;font-size:11px}
.rcTrack{display:flex;flex-direction:column;gap:6px}.rcLane{display:flex;flex-direction:column;gap:2px}.rcLane small{font-size:10px;color:#9fb5aa}.rcLane i{position:relative;display:block;height:26px;border-radius:8px;background:#1b1f23;border:1px solid #ffffff1c;overflow:hidden}.rcLane i u{position:absolute;right:6px;top:0;bottom:0;width:6px;background:repeating-linear-gradient(#fff 0 4px,#000 4px 8px)}
.rcLane span{position:absolute;top:1px;font-size:20px;line-height:22px;padding:0 3px;border-radius:6px;transition:left .05s linear}.rcLane span.me{outline:2px solid #f0b94a}
.rcLights{display:flex;gap:10px;justify-content:center}.rcLights b{width:30px;height:30px;border-radius:50%;background:#2a1212;border:2px solid #ffffff22}.rcLights b.red{background:#ef4444;box-shadow:0 0 14px #ef4444}.rcLights b.green{background:#22c55e;box-shadow:0 0 18px #22c55e}
.rcRev i{position:relative;display:block;height:26px;border-radius:99px;background:linear-gradient(90deg,#14532d,#a16207 70%,#7f1d1d);border:1px solid #ffffff26;overflow:hidden}.rcRev u{position:absolute;top:0;bottom:0;background:#22c55eaa;border-left:2px solid #fff;border-right:2px solid #fff}.rcRev em{position:absolute;top:0;bottom:0;width:5px;margin-left:-2px;background:#fff;box-shadow:0 0 8px #fff}
.rcBig{margin:0;text-align:center;font-size:15px;font-weight:900}.rcMsg{margin:0;text-align:center;font-size:13px;color:#f0b94a;font-weight:800}
.rcBtn{all:unset;cursor:pointer;box-sizing:border-box;text-align:center;padding:16px;border-radius:14px;background:#d99a42;color:#1a1208;font-weight:900;font-size:16px}.rcBtn:active{transform:scale(.98)}.rcBtn.shift{background:#3fb98a}
.rcResult{display:flex;flex-direction:column;gap:8px;text-align:center}.rcResult h4{margin:0;font-size:18px}.rcResult p{margin:0;font-size:13px}.rcResult small{color:#9fb5aa;font-size:11px}
.rcResult ol{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px}.rcResult li{display:flex;justify-content:space-between;padding:6px 10px;border-radius:9px;background:#13231d;font-size:13px}.rcResult li.me{background:#5a3a0a;border:1px solid #f0b94a}`;
