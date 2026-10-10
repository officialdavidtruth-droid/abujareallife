'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import RuntimeStyle from './RuntimeStyle';
import { sfx } from '../lib/audio';
import { GAME_LABEL, MAX_BONUS_PCT, MAX_ROUNDS, type GameKind } from '../lib/jobGames';

/* Skill play during a shift. Each round ends with 0-3 stars; the server (/api/shift "play") validates, caps and pays the bonus.
   The shift timer keeps running whether you play or not, so this is purely optional. */

export type Score = { pts: number; rounds: number; bonus: number; capped?: boolean };
type RoundProps = { onDone: (stars: number) => void };
const shuffle = <T,>(a: T[]) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

/* ───────── 🍳 Kitchen Rush: grab the ingredients in order, then plate it when the sizzle hits the green ───────── */
const DISHES: { name: string; e: string; ing: string[] }[] = [
  { name: 'Jollof rice', e: '🍛', ing: ['🍅', '🧅', '🌶️', '🍚'] },
  { name: 'Suya wrap', e: '🌯', ing: ['🥩', '🧅', '🌶️', '🫓'] },
  { name: 'Pepper soup', e: '🍲', ing: ['🐟', '🌶️', '🧄', '🧅'] },
  { name: 'Fried plantain & egg', e: '🍳', ing: ['🍌', '🥚', '🧅', '🫒'] },
  { name: 'Chicken & chips', e: '🍗', ing: ['🍗', '🥔', '🧂', '🫒'] },
  { name: 'Veggie stir-fry', e: '🥘', ing: ['🥕', '🫑', '🧄', '🍄'] },
];
const POOL = ['🍅', '🧅', '🌶️', '🍚', '🥩', '🫓', '🐟', '🧄', '🍌', '🥚', '🫒', '🍗', '🥔', '🧂', '🥕', '🫑', '🍄'];
function CookRound({ onDone }: RoundProps) {
  const [dish] = useState(() => DISHES[Math.floor(Math.random() * DISHES.length)]);
  const need = dish.ing.slice(0, 3);
  const [grid] = useState(() => shuffle([...need, ...shuffle(POOL.filter(x => !need.includes(x))).slice(0, 5)]));
  const [step, setStep] = useState(0), [miss, setMiss] = useState(0), [stage, setStage] = useState<'pick' | 'cook'>('pick'), [left, setLeft] = useState(12);
  const [pos, setPos] = useState(0), posRef = useRef(0), done = useRef(false);
  useEffect(() => { if (stage !== 'pick') return; const t = setInterval(() => setLeft(l => l - 1), 1000); return () => clearInterval(t); }, [stage]);
  useEffect(() => { if (stage === 'pick' && left <= 0 && !done.current) { done.current = true; onDone(0); } }, [left, stage, onDone]);
  useEffect(() => { // the sizzle needle sweeps back and forth
    if (stage !== 'cook') return; let raf = 0, t0 = performance.now();
    const f = (t: number) => { const ph = ((t - t0) / 1100) % 2; posRef.current = ph < 1 ? ph : 2 - ph; setPos(posRef.current); raf = requestAnimationFrame(f); };
    raf = requestAnimationFrame(f); return () => cancelAnimationFrame(raf);
  }, [stage]);
  const tap = (x: string) => {
    if (stage !== 'pick' || done.current) return;
    if (x === need[step]) { sfx('pop'); if (step + 1 >= need.length) setStage('cook'); else setStep(step + 1); } else { sfx('error'); setMiss(m => m + 1); }
  };
  const plate = () => {
    if (done.current) return; done.current = true;
    const p = posRef.current, hit = p > .38 && p < .62, near = p > .25 && p < .75;
    onDone(hit ? (miss === 0 ? 3 : 2) : near ? (miss === 0 ? 2 : 1) : 1);
  };
  return <div className="jgRound">
    <div className="jgTicket"><b>{dish.e} {dish.name}</b><span>{need.map((x, i) => <i key={i} className={i < step ? 'ok' : i === step && stage === 'pick' ? 'now' : ''}>{x}</i>)}</span></div>
    {stage === 'pick' ? <>
      <small className="jgHint">Tap the ingredients in order · {left}s{miss ? ` · ${miss} wrong` : ''}</small>
      <div className="jgGrid4">{grid.map((x, i) => <button key={i} onClick={() => tap(x)}>{x}</button>)}</div>
    </> : <>
      <small className="jgHint">Tap PLATE when the needle is in the green</small>
      <div className="jgSizzle"><u /><em style={{ left: (pos * 100) + '%' }} /></div>
      <button className="jgBig" onClick={plate}>🍽️ PLATE IT</button>
    </>}
  </div>;
}

/* ───────── 🔧 Garage Fix: the faulty part flashes, hit it before it stops ───────── */
const PARTS = ['🔩', '🛞', '🔋', '⚙️', '🛢️', '🔧', '💡', '🧰', '🪛'];
function RepairRound({ onDone }: RoundProps) {
  const FAULTS = 6, [n, setN] = useState(0), [cell, setCell] = useState<number | null>(null), [hits, setHits] = useState(0), [flash, setFlash] = useState<number | null>(null), hitsRef = useRef(0), finished = useRef(false);
  useEffect(() => {
    if (finished.current) return;
    if (n >= FAULTS) { finished.current = true; const h = hitsRef.current; onDone(h >= 5 ? 3 : h >= 4 ? 2 : h >= 2 ? 1 : 0); return; }
    const t1 = setTimeout(() => setCell(Math.floor(Math.random() * 9)), 350 + Math.random() * 500);
    return () => clearTimeout(t1);
  }, [n, onDone]);
  useEffect(() => { if (cell === null) return; const t = setTimeout(() => { setCell(null); setN(x => x + 1); }, 1250); return () => clearTimeout(t); }, [cell]);
  const tap = (i: number) => {
    if (cell === null) { sfx('error'); return; }
    if (i === cell) { sfx('pop'); hitsRef.current++; setHits(hitsRef.current); setFlash(i); setTimeout(() => setFlash(null), 200); setCell(null); setN(x => x + 1); } else sfx('error');
  };
  return <div className="jgRound">
    <small className="jgHint">Tap the glowing part before it fades · {Math.min(n + 1, FAULTS)}/{FAULTS} · fixed {hits}</small>
    <div className="jgGrid3">{PARTS.map((p, i) => <button key={i} className={(cell === i ? 'glow ' : '') + (flash === i ? 'fixed' : '')} onClick={() => tap(i)}>{p}</button>)}</div>
  </div>;
}

/* ───────── 🚚 Delivery Run: switch lanes, collect parcels, dodge the roadblocks ───────── */
type Ent = { id: number; lane: number; y: number; kind: 'box' | 'block' };
function DriveRound({ onDone }: RoundProps) {
  const DUR = 18, [, force] = useState(0), lane = useRef(1), ents = useRef<Ent[]>([]), score = useRef({ got: 0, crash: 0 }), t = useRef(DUR), spawn = useRef(.4), nid = useRef(0), over = useRef(false), flash = useRef('');
  const move = useCallback((d: number) => { lane.current = Math.max(0, Math.min(2, lane.current + d)); }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'ArrowLeft' || e.key === 'a') move(-1); if (e.key === 'ArrowRight' || e.key === 'd') move(1); };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [move]);
  useEffect(() => {
    let raf = 0, last = performance.now();
    const f = (now: number) => {
      const dt = Math.min(.05, (now - last) / 1000); last = now; t.current -= dt; spawn.current -= dt;
      if (spawn.current <= 0) { spawn.current = .62 + Math.random() * .25; ents.current.push({ id: nid.current++, lane: Math.floor(Math.random() * 3), y: -8, kind: Math.random() < .55 ? 'box' : 'block' }); }
      ents.current.forEach(e => { e.y += 52 * dt; });
      ents.current = ents.current.filter(e => {
        if (e.y > 76 && e.y < 94 && e.lane === lane.current) { if (e.kind === 'box') { score.current.got++; flash.current = '+1 📦'; sfx('pop'); } else { score.current.crash++; flash.current = 'CRASH!'; sfx('error'); } return false; }
        return e.y < 108;
      });
      force(x => x + 1);
      if (t.current <= 0 && !over.current) { over.current = true; const s = score.current.got - 2 * score.current.crash; onDone(s >= 7 ? 3 : s >= 4 ? 2 : s >= 1 ? 1 : 0); return; }
      raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f); return () => cancelAnimationFrame(raf);
  }, [onDone]);
  return <div className="jgRound">
    <small className="jgHint">Steer into 📦, avoid 🚧 · {Math.max(0, Math.ceil(t.current))}s · 📦 {score.current.got} · 💥 {score.current.crash}</small>
    <div className="jgRoad" onPointerDown={e => { const r = e.currentTarget.getBoundingClientRect(); move(e.clientX < r.left + r.width / 2 ? -1 : 1); }}>
      <i className="jgLane l1" /><i className="jgLane l2" />
      {ents.current.map(e => <b key={e.id} className="jgEnt" style={{ left: (e.lane * 33.33 + 16.66) + '%', top: e.y + '%' }}>{e.kind === 'box' ? '📦' : '🚧'}</b>)}
      <b className="jgCar" style={{ left: (lane.current * 33.33 + 16.66) + '%' }}>🚚</b>
    </div>
    <div className="jgPad"><button onClick={() => move(-1)}>◀</button><button onClick={() => move(1)}>▶</button></div>
  </div>;
}

/* ───────── the overlay: round after round, stars between them ───────── */
export default function JobGame({ kind, initial, onStars, onClose }: { kind: GameKind; initial: Score; onStars: (stars: number) => Promise<Score | null>; onClose: () => void }) {
  const [round, setRound] = useState(0), [phase, setPhase] = useState<'ready' | 'play' | 'result'>('ready'), [stars, setStars] = useState(0), [score, setScore] = useState<Score>(initial), [note, setNote] = useState('');
  const meta = GAME_LABEL[kind], capped = score.capped || score.rounds >= MAX_ROUNDS;
  const done = useCallback(async (s: number) => {
    setStars(s); setPhase('result'); sfx(s >= 2 ? 'success' : 'pop'); setNote('');
    const r = await onStars(s); if (r) setScore(r); else setNote('Result not counted (too quick, or the shift ended).');
  }, [onStars]);
  const Round = kind === 'cook' ? CookRound : kind === 'repair' ? RepairRound : DriveRound;
  return <div className="jgWrap" role="dialog">
    <div className="jgCard">
      <div className="jgTop"><b>{meta.e} {meta.name}</b><span>Bonus <em>+{score.bonus}%</em> <small>/ max {MAX_BONUS_PCT}%</small></span><button className="jgX" aria-label="Close" onClick={onClose}>✕</button></div>
      {phase === 'ready' && <div className="jgMid"><p>{kind === 'cook' ? 'Orders are coming in. Pick the right ingredients fast, then plate at the perfect moment.' : kind === 'repair' ? 'Cars are waiting. Spot the faulty part and fix it before it fades.' : 'Parcels to deliver. Switch lanes to grab them and dodge roadblocks.'}</p><p className="jgSub">Your shift timer keeps running while you play. Stars add bonus pay when the shift ends.</p>{capped ? <p className="jgSub">🏁 You have hit the round limit for this shift.</p> : <button className="jgBig" onClick={() => { setRound(r => r + 1); setPhase('play'); }}>▶ Start order {score.rounds + 1}</button>}</div>}
      {phase === 'play' && <Round key={round} onDone={done} />}
      {phase === 'result' && <div className="jgMid"><div className="jgStars">{[1, 2, 3].map(i => <span key={i} className={i <= stars ? 'on' : ''}>★</span>)}</div><p>{stars === 3 ? 'Perfect!' : stars === 2 ? 'Nice work.' : stars === 1 ? 'Done. Could be sharper.' : 'Missed it.'}</p><p className="jgSub">{score.pts} stars this shift · {score.rounds} order{score.rounds === 1 ? '' : 's'}{note ? ' · ' + note : ''}</p>{capped ? <p className="jgSub">🏁 Round limit reached. Your bonus is locked in.</p> : <button className="jgBig" onClick={() => setPhase('ready')}>Next order</button>}<button className="jgGhost" onClick={onClose}>Back to the room</button></div>}
    </div>
    <RuntimeStyle id="arl-jobgames" css={CSS} />
  </div>;
}

const CSS = `.jgWrap{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;background:#000a;padding:12px}
.jgCard{width:min(380px,100%);max-height:calc(100dvh - 24px);overflow:auto;background:#0d1a14;border:2px solid #f0b94a;border-radius:18px;padding:12px;color:#fff;box-shadow:0 14px 40px #000b;display:flex;flex-direction:column;gap:10px}
.jgTop{display:flex;align-items:center;gap:8px}.jgTop b{font-size:14px;flex:1}.jgTop span{font-size:11px;color:#9fb5aa}.jgTop em{font-style:normal;color:#f0b94a;font-weight:900}.jgTop small{font-size:10px}
.jgX,.jgGhost{all:unset;cursor:pointer;color:#9fb5aa;font-size:13px;padding:4px 8px}.jgX:hover,.jgGhost:hover{color:#fff}.jgGhost{text-align:center;font-weight:700;font-size:12px}
.jgMid{display:flex;flex-direction:column;gap:8px;text-align:center;padding:6px 2px}.jgMid p{margin:0;font-size:13px;line-height:1.4;color:#d7e4dc}.jgSub{font-size:11px!important;color:#9fb5aa!important}
.jgBig{all:unset;cursor:pointer;box-sizing:border-box;text-align:center;padding:12px;border-radius:12px;background:#d99a42;color:#1a1208;font-weight:900;font-size:14px}.jgBig:active{transform:scale(.98)}
.jgRound{display:flex;flex-direction:column;gap:8px;user-select:none;touch-action:manipulation}.jgHint{font-size:11px;color:#9fb5aa;text-align:center}
.jgTicket{background:#13231d;border:1px solid #ffffff1c;border-radius:12px;padding:8px 10px;display:flex;flex-direction:column;gap:6px;align-items:center}.jgTicket b{font-size:13px}.jgTicket span{display:flex;gap:8px}
.jgTicket i{font-style:normal;font-size:24px;padding:4px 7px;border-radius:10px;background:#0b1511;border:1px solid #ffffff14;opacity:.55}.jgTicket i.now{opacity:1;border-color:#f0b94a;box-shadow:0 0 0 2px #f0b94a44}.jgTicket i.ok{opacity:1;background:#1f4a37;border-color:#3fb98a}
.jgGrid4{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.jgGrid3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.jgGrid4 button,.jgGrid3 button{all:unset;cursor:pointer;text-align:center;font-size:28px;padding:12px 0;border-radius:12px;background:#13231d;border:1px solid #ffffff1c}.jgGrid3 button{font-size:32px;padding:16px 0;transition:background .12s,box-shadow .12s}
.jgGrid4 button:active,.jgGrid3 button:active{background:#1f4a37}.jgGrid3 button.glow{background:#5a3a0a;border-color:#f0b94a;box-shadow:0 0 16px 3px #f0b94acc;animation:jgPulse .5s ease-in-out infinite}.jgGrid3 button.fixed{background:#1f4a37;border-color:#3fb98a}
.jgSizzle{position:relative;height:28px;border-radius:99px;background:linear-gradient(90deg,#7f1d1d 0,#b45309 25%,#16a34a 38%,#16a34a 62%,#b45309 75%,#7f1d1d 100%);border:1px solid #ffffff26}.jgSizzle u{display:none}.jgSizzle em{position:absolute;top:-4px;bottom:-4px;width:6px;margin-left:-3px;border-radius:4px;background:#fff;box-shadow:0 0 8px #fff}
.jgRoad{position:relative;height:250px;border-radius:12px;background:#1b1f23;border:1px solid #ffffff1c;overflow:hidden;touch-action:manipulation}.jgLane{position:absolute;top:0;bottom:0;width:0;border-left:2px dashed #ffffff30}.jgLane.l1{left:33.33%}.jgLane.l2{left:66.66%}
.jgEnt,.jgCar{position:absolute;transform:translate(-50%,-50%);font-size:28px;line-height:1}.jgCar{top:86%;font-size:34px;transition:left .09s}
.jgPad{display:grid;grid-template-columns:1fr 1fr;gap:8px}.jgPad button{all:unset;cursor:pointer;text-align:center;padding:12px;border-radius:12px;background:#13231d;border:1px solid #ffffff1c;font-size:18px}.jgPad button:active{background:#1f4a37}
.jgStars{font-size:38px;letter-spacing:6px}.jgStars span{color:#33413a}.jgStars span.on{color:#f0b94a;text-shadow:0 0 10px #f0b94a99}
@keyframes jgPulse{50%{box-shadow:0 0 22px 7px #f0b94acc}}`;
