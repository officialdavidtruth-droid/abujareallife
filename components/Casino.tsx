'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import RuntimeStyle from './RuntimeStyle';
import { sfx } from '../lib/audio';
import { BET_CHIPS, DICE_MAX, DICE_MIN, LIMIT_MAX, LIMIT_MIN, MAX_BET, MIN_BET, REALITY_EVERY, SYMBOLS, colorOf, diceChance, diceMult, type RoulettePick } from '../lib/casino';

/* Casino: slots, roulette, dice. In-game cash only. Display and input: /api/casino does the RNG, the money and every limit. */

type View = { cash: number; limit: number; pendingLimit: { value: number; inMs: number } | null; net: number; wagered: number; rounds: number; room: number; breakLeftMs: number; closed: string | null; blocked?: string };
type Play = View & { game: string; outcome: any; bet: number; payout: number; win: boolean; delta: number };
const naira = (n: number) => '₦' + Math.round(n).toLocaleString();
const signed = (n: number) => (n >= 0 ? '+' : '-') + naira(Math.abs(n));
const post = async (body: object) => { const r = await fetch('/api/casino', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { ok: r.ok, d: await r.json().catch(() => ({})) as any }; };
const hours = (ms: number) => Math.max(1, Math.ceil(ms / 3600_000)) + 'h';
const PICKS: { p: RoulettePick; label: string }[] = [
  { p: { type: 'red' }, label: '🔴 Red · 2x' }, { p: { type: 'black' }, label: '⚫ Black · 2x' }, { p: { type: 'even' }, label: 'Even · 2x' }, { p: { type: 'odd' }, label: 'Odd · 2x' },
  { p: { type: 'low' }, label: '1–18 · 2x' }, { p: { type: 'high' }, label: '19–36 · 2x' },
];
const LIMITS = [250_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000].filter(v => v >= LIMIT_MIN && v <= LIMIT_MAX);

export function CasinoPanel({ onCash, say }: { onCash: (n: number) => void; say: (m: string) => void }) {
  const [v, setV] = useState<View | null>(null), [failed, setFailed] = useState(false), [game, setGame] = useState<'slots' | 'roulette' | 'dice'>('slots'), [bet, setBet] = useState(BET_CHIPS[1]), [busy, setBusy] = useState(false);
  const [last, setLast] = useState<Play | null>(null), [spin, setSpin] = useState(false), [pick, setPick] = useState<RoulettePick>({ type: 'red' }), [num, setNum] = useState(7), [target, setTarget] = useState(50), [rc, setRc] = useState(false), [setup, setSetup] = useState(false), [confirmBreak, setConfirmBreak] = useState(false);
  const session = useRef({ rounds: 0, net: 0, shownAt: 0 }), [sess, setSess] = useState({ rounds: 0, net: 0 }), [reels, setReels] = useState(['🍒', '🍋', '🔔']), tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const load = useCallback(async () => { try { const r = await fetch('/api/casino', { cache: 'no-store' }); if (!r.ok) { setFailed(true); return; } setV(await r.json()); } catch { setFailed(true); } }, []);
  useEffect(() => { load(); return () => { if (tick.current) clearInterval(tick.current); }; }, [load]);
  if (failed) return <><h3>🎰 Casino</h3><p className="csMuted">The casino could not load. Check your connection and open this again.</p></>;
  if (!v) return <><h3>🎰 Casino</h3><p className="csMuted">Loading…</p></>;
  if (v.blocked) return <><h3>🎰 Casino</h3><p className="csMuted">{v.blocked}</p></>;
  const lost = v.net < 0, used = lost ? Math.min(100, Math.round(-v.net / v.limit * 100)) : 0, shut = v.closed, maxBet = Math.min(MAX_BET, Math.max(0, v.room)), betOk = bet >= MIN_BET && bet <= maxBet && bet <= v.cash;
  const applyView = (d: View) => setV({ cash: d.cash, limit: d.limit, pendingLimit: d.pendingLimit, net: d.net, wagered: d.wagered, rounds: d.rounds, room: d.room, breakLeftMs: d.breakLeftMs, closed: d.closed });
  const play = async () => {
    if (busy || rc || !betOk) return; setBusy(true); setSpin(true);
    if (game === 'slots') { if (tick.current) clearInterval(tick.current); tick.current = setInterval(() => setReels([0, 1, 2].map(() => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)].s)), 90); }
    try {
      const body = game === 'slots' ? { action: 'play', game, bet } : game === 'roulette' ? { action: 'play', game, bet, pick: pick.type === 'number' ? { type: 'number', n: num } : pick } : { action: 'play', game, bet, target };
      const [r] = await Promise.all([post(body), new Promise(res => setTimeout(res, 900))]);
      if (tick.current) { clearInterval(tick.current); tick.current = null; }
      if (!r.ok) { sfx('error'); say(r.d.error || 'The table is closed.'); await load(); return; }
      const d: Play = r.d; if (game === 'slots') setReels(d.outcome.reels);
      setLast(d); applyView(d); onCash(d.cash); sfx(d.win ? 'success' : 'pop');
      session.current.rounds++; session.current.net += d.delta; setSess({ rounds: session.current.rounds, net: session.current.net });
      if (session.current.rounds - session.current.shownAt >= REALITY_EVERY) { session.current.shownAt = session.current.rounds; setRc(true); }
    } finally { if (tick.current) { clearInterval(tick.current); tick.current = null; } setSpin(false); setBusy(false); }
  };
  const setLimit = async (value: number) => { const r = await post({ action: 'limit', value }); if (!r.ok) { say(r.d.error || 'Could not change the limit.'); return; } applyView(r.d); say(value < v.limit ? '✅ Limit lowered' : value > v.limit ? '⏳ Higher limit starts in 24h' : 'Limit unchanged'); };
  const takeBreak = async () => { const r = await post({ action: 'break' }); setConfirmBreak(false); if (!r.ok) { say(r.d.error || 'Could not start the break.'); return; } applyView(r.d); say('🛑 See you in 24 hours'); };
  const chance = diceChance(target), mult = diceMult(target);
  return <div className="csPanel">
    <h3>🎰 Casino</h3>
    <p className="csNote">Play money only. Gambling can be habit-forming: set a limit you are comfortable losing, and stop when it stops being fun.</p>
    <div className="csCard csLimit">
      <div className="csRow"><b>Today</b><span className={lost ? 'neg' : 'pos'}>{signed(v.net)}</span></div>
      <div className="csBar"><i style={{ width: used + '%' }} className={used >= 80 ? 'hot' : ''} /></div>
      <div className="csRow"><small>Daily loss limit {naira(v.limit)} · {naira(Math.max(0, v.room))} left · wagered {naira(v.wagered)}</small><button className="csLink" onClick={() => setSetup(s => !s)}>{setup ? 'Close' : 'Limits'}</button></div>
      {v.pendingLimit && <small className="csMuted">⏳ New higher limit {naira(v.pendingLimit.value)} starts in {hours(v.pendingLimit.inMs)}</small>}
      {setup && <div className="csSetup">
        <small>Daily loss limit (lowering is instant, raising takes 24h):</small>
        <div className="csChips">{LIMITS.map(l => <button key={l} className={l === v.limit ? 'on' : ''} onClick={() => setLimit(l)}>{naira(l)}</button>)}</div>
        {!confirmBreak ? <button className="csDanger" onClick={() => setConfirmBreak(true)}>🛑 Take a 24-hour break</button> : <div className="csConfirm"><small>The casino will be closed to you for 24 hours. This cannot be undone.</small><div><button className="csDanger" onClick={takeBreak}>Yes, close it</button><button className="csLink" onClick={() => setConfirmBreak(false)}>Cancel</button></div></div>}
      </div>}
    </div>
    {shut ? <div className="csCard"><b>🔒 Casino closed for you</b><p className="csMuted">{shut}</p></div> : <>
      <div className="csTabs">{(['slots', 'roulette', 'dice'] as const).map(g => <button key={g} className={game === g ? 'on' : ''} onClick={() => { setGame(g); setLast(null); }}>{g === 'slots' ? '🎰 Slots' : g === 'roulette' ? '🎡 Roulette' : '🎲 Dice'}</button>)}</div>

      {game === 'slots' && <div className="csCard">
        <div className="csReels">{reels.map((s, i) => <span key={i} className={spin ? 'spin' : ''}>{s}</span>)}</div>
        <small className="csMuted">Three of a kind pays 5x–150x. Two 🍒 pays 1.5x, one 🍒 pays 0.4x. Return to player about 92%.</small>
      </div>}
      {game === 'roulette' && <div className="csCard">
        <div className="csWheel">{last && last.game === 'roulette' ? <span className={'n ' + last.outcome.color}>{last.outcome.n}</span> : <span className="n idle">?</span>}</div>
        <div className="csChips">{PICKS.map(x => <button key={x.p.type} className={pick.type === x.p.type ? 'on' : ''} onClick={() => setPick(x.p)}>{x.label}</button>)}<button className={pick.type === 'number' ? 'on' : ''} onClick={() => setPick({ type: 'number', n: num })}>🎯 Number · 36x</button></div>
        {pick.type === 'number' && <div className="csRow"><small>Your number (0–36)</small><input type="number" min={0} max={36} value={num} onChange={e => { const n = Math.max(0, Math.min(36, Math.floor(Number(e.target.value) || 0))); setNum(n); setPick({ type: 'number', n }); }} /><span className={'dot ' + colorOf(num)} /></div>}
        <small className="csMuted">European wheel, one zero (green loses every bet except a straight number on 0). Return to player about 97%.</small>
      </div>}
      {game === 'dice' && <div className="csCard">
        <div className="csWheel">{last && last.game === 'dice' ? <span className={'n ' + (last.win ? 'green' : 'red')}>{last.outcome.roll}</span> : <span className="n idle">?</span>}</div>
        <div className="csRow"><b>Roll under {target}</b><span className="pos">{Math.round(chance * 100)}% · pays {mult}x</span></div>
        <input type="range" min={DICE_MIN} max={DICE_MAX} value={target} onChange={e => setTarget(Number(e.target.value))} />
        <small className="csMuted">A number from 1 to 100 is rolled. Lower target = riskier = bigger payout. Return to player about 97%.</small>
      </div>}

      <div className="csCard">
        <div className="csRow"><b>Bet</b><span>{naira(bet)}</span></div>
        <div className="csChips">{BET_CHIPS.map(c => <button key={c} className={bet === c ? 'on' : ''} disabled={c > maxBet || c > v.cash} onClick={() => setBet(c)}>{c >= 1000 ? c / 1000 + 'k' : c}</button>)}</div>
        <button className="csPlay" disabled={busy || !betOk} onClick={play}>{busy ? '…' : game === 'slots' ? 'SPIN' : game === 'roulette' ? 'SPIN THE WHEEL' : 'ROLL'}</button>
        {!betOk && !busy && <small className="csMuted">{v.cash < MIN_BET ? 'Not enough cash.' : maxBet < MIN_BET ? 'Your limit leaves no room to bet.' : 'Pick a bet you can afford within your limit.'}</small>}
        {last && <div className={'csResult ' + (last.win ? 'win' : 'lose')}>{last.win ? `🎉 Won ${naira(last.payout)}` : `Lost ${naira(last.bet)}`}{last.win && last.delta <= 0 ? ' (partial return)' : ''}<small> · balance {naira(last.cash)}</small></div>}
      </div>
    </>}
    {rc && <div className="csReality" role="dialog"><div>
      <b>⏱ Reality check</b>
      <p>You have played {sess.rounds} rounds this visit.<br />Net {signed(sess.net)} · today {signed(v.net)}.</p>
      <p className="csMuted">Take a moment. Is this still fun?</p>
      <button className="csPlay" onClick={() => setRc(false)}>Keep playing</button>
      <button className="csDanger" onClick={() => { setRc(false); takeBreak(); }}>Stop for 24 hours</button>
    </div></div>}
    <RuntimeStyle id="arl-casino" css={CSS} />
  </div>;
}

const CSS = `.csPanel h3{margin:0 0 6px}.csNote{font-size:11px;color:#9fb5aa;line-height:1.4;margin:0 0 8px}.csMuted{color:#9fb5aa;font-size:11.5px;line-height:1.4;margin:4px 0}
.csCard{background:#13231d;border:1px solid #ffffff16;border-radius:12px;padding:10px 12px;margin-bottom:8px;display:flex;flex-direction:column;gap:8px}
.csRow{display:flex;justify-content:space-between;align-items:center;gap:8px}.csRow small{color:#9fb5aa}.pos{color:#8be0b5;font-weight:800}.neg{color:#fca5a5;font-weight:800}
.csBar{height:7px;border-radius:99px;background:#0b1511;overflow:hidden}.csBar i{display:block;height:100%;background:#3fb98a;border-radius:99px;transition:width .4s}.csBar i.hot{background:#ef4444}
.csLink{all:unset;cursor:pointer;color:#f0b94a;font-size:12px;font-weight:800}.csSetup{display:flex;flex-direction:column;gap:8px;border-top:1px solid #ffffff14;padding-top:8px}
.csChips{display:flex;flex-wrap:wrap;gap:6px}.csChips button{all:unset;cursor:pointer;padding:7px 10px;border-radius:9px;background:#1f332a;color:#d7e4dc;font-size:12px;font-weight:800}.csChips button.on{background:#d99a42;color:#1a1208}.csChips button:disabled{opacity:.4;cursor:default}
.csDanger{all:unset;cursor:pointer;text-align:center;padding:9px 12px;border-radius:10px;background:#7f1d1d;color:#fff;font-weight:800;font-size:12.5px}.csConfirm{display:flex;flex-direction:column;gap:6px}.csConfirm div{display:flex;gap:10px;align-items:center}
.csTabs{display:flex;gap:6px;margin-bottom:8px}.csTabs button{all:unset;cursor:pointer;flex:1;text-align:center;padding:8px 6px;border-radius:10px;background:#13231d;border:1px solid #ffffff16;color:#c9d8d0;font-size:12px;font-weight:800}.csTabs button.on{background:#d99a42;color:#1a1208;border-color:#d99a42}
.csReels{display:flex;gap:8px;justify-content:center}.csReels span{width:72px;height:72px;display:flex;align-items:center;justify-content:center;font-size:40px;background:#0b1511;border:2px solid #f0b94a66;border-radius:14px}.csReels span.spin{filter:blur(1px)}
.csWheel{display:flex;justify-content:center}.n{width:76px;height:76px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:900;color:#fff;border:3px solid #ffffff44}.n.red{background:#b91c1c}.n.black{background:#111}.n.green{background:#15803d}.n.idle{background:#0b1511;color:#9fb5aa}
.dot{width:14px;height:14px;border-radius:50%;display:inline-block;border:1px solid #fff5}.dot.red{background:#b91c1c}.dot.black{background:#111}.dot.green{background:#15803d}
.csPanel input[type=number]{all:unset;width:54px;text-align:center;padding:5px;border-radius:8px;background:#0b1511;border:1px solid #ffffff22;color:#fff}.csPanel input[type=range]{width:100%}
.csPlay{all:unset;cursor:pointer;box-sizing:border-box;text-align:center;padding:12px;border-radius:12px;background:#d99a42;color:#1a1208;font-weight:900;font-size:14px}.csPlay:disabled{opacity:.5;cursor:default}
.csResult{text-align:center;font-weight:900;font-size:14px;padding:8px;border-radius:10px}.csResult small{font-weight:600;color:#9fb5aa}.csResult.win{background:#1f4a37;color:#8be0b5}.csResult.lose{background:#2a1a1a;color:#fca5a5}
.csReality{position:fixed;inset:0;z-index:80;background:#000c;display:flex;align-items:center;justify-content:center;padding:16px}.csReality>div{width:min(320px,100%);background:#0d1a14;border:2px solid #f0b94a;border-radius:16px;padding:16px;color:#fff;display:flex;flex-direction:column;gap:10px;text-align:center}.csReality p{margin:0;font-size:13px;line-height:1.5}`;
