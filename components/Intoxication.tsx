'use client';
import { useEffect, useState } from 'react';
import RuntimeStyle from './RuntimeStyle';
import { GAME } from './CityWorld';
import { DRINKS, effects, stageOf } from '../lib/intoxication';
import { PASSOUT_DOWN_MS } from '../lib/downed';
import { goDown } from '../lib/cityNet';

/* Screen effect while drunk / high. Levels come from /api/status (server-owned). GAME.drunk / GAME.high are set for the world to read (walking sway, speed). */
export function IntoxOverlay({ drunk, high }: { drunk: number; high: number }) {
  useEffect(() => { GAME.drunk = drunk; GAME.high = high; }, [drunk, high]);
  const fx = effects(drunk, high);
  if (stageOf(Math.max(drunk, high)) === 'sober') return null;
  return <>
    <div className="intoxFx" style={{ backdropFilter: `blur(${fx.blurPx}px) hue-rotate(${fx.hue}deg)`, WebkitBackdropFilter: `blur(${fx.blurPx}px) hue-rotate(${fx.hue}deg)`, animationDuration: `${Math.max(2.2, 7 - drunk / 20)}s` }} />
    <div className="intoxTag">{drunk >= high ? '🍺' : '🌿'} {stageOf(Math.max(drunk, high))}</div>
    <RuntimeStyle id="arl-intox" css={`.intoxFx{position:absolute;inset:0;z-index:20;pointer-events:none;animation:intoxSway ease-in-out infinite}.intoxTag{position:absolute;top:calc(64px + env(safe-area-inset-top,0px));left:12px;z-index:31;background:#000a;color:#fff;border-radius:999px;padding:4px 10px;font-size:12px;font-weight:800;text-transform:capitalize}@keyframes intoxSway{0%,100%{transform:translateX(0) rotate(0)}30%{transform:translateX(5px) rotate(.4deg)}70%{transform:translateX(-5px) rotate(-.4deg)}}`} />
  </>;
}

const naira = (n: number) => '₦' + Math.round(n).toLocaleString();
/** Drinks menu for bars / clubs / restaurants / hotels (rendered inside the building), plus a smoke button if you carry a joint. */
export function DrinksMenu({ onCash, onFx, toast, onBlackout }: { onCash: (n: number) => void; onFx: (fx: Record<string, number>) => void; toast: (m: string, bad?: boolean) => void; onBlackout?: () => void }) {
  const [open, setOpen] = useState(false), [lvl, setLvl] = useState({ drunk: 0, high: 0 }), [joints, setJoints] = useState(0);
  const load = () => { fetch('/api/status').then(r => r.ok ? r.json() : null).then(d => d && setLvl({ drunk: d.drunk || 0, high: d.high || 0 })).catch(() => {}); fetch('/api/intox').then(r => r.ok ? r.json() : null).then(d => d && setJoints(d.joints || 0)).catch(() => {}); };
  useEffect(() => { if (open) load(); }, [open]);
  const go = async (body: object) => {
    const r = await fetch('/api/intox', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const d = await r.json().catch(() => ({}));
    if (!r.ok) return toast(d.error || 'Nope.', true);
    if (d.cash != null) onCash(d.cash);
    setLvl({ drunk: d.drunk, high: d.high }); GAME.drunk = d.drunk; GAME.high = d.high;
    if (d.blackout) { onFx(d.penalty || {}); goDown(d.downMs || PASSOUT_DOWN_MS, 'passout'); setOpen(false); toast('🥴 You passed out. Security drags you out to the street…', true); onBlackout?.(); } else toast(d.spent ? `🍹 ${d.label} · ${naira(d.spent)}` : `🌿 You smoked a ${d.label}.`);
    load();
  };
  return <>
    <button className="drkBtn" onClick={() => setOpen(v => !v)}>🍹 Drinks</button>
    {open && <div className="drkSheet"><button className="x" aria-label="Close" onClick={() => setOpen(false)}>✕</button><h3>🍹 Bar menu</h3>
      <p className="drkLv">Drunk {lvl.drunk}% · High {lvl.high}% {lvl.drunk >= 75 || lvl.high >= 75 ? '· one more and you pass out' : ''}</p>
      {DRINKS.map(d => <button key={d.id} className="drkRow" onClick={() => go({ action: 'drink', id: d.id })}><span>{d.e} {d.label}</span><b>{naira(d.cost)}</b></button>)}
      {joints > 0 && <button className="drkRow" onClick={() => go({ action: 'smoke' })}><span>🌿 Smoke a joint (you have {joints})</span><b>free</b></button>}
    </div>}
    <RuntimeStyle id="arl-drinks" css={`.drkBtn{position:absolute;right:12px;bottom:calc(150px + env(safe-area-inset-bottom,0px));z-index:35;background:#7c2d12f2;color:#fff;border:1px solid #fdba74aa;border-radius:999px;padding:10px 14px;font-weight:900}.drkSheet{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:40;width:min(340px,92vw);background:#1c1410f5;color:#fff;border:1px solid #fdba7466;border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:8px}.drkSheet .x{position:absolute;right:10px;top:8px;background:none;border:0;color:#fff;font-size:18px}.drkSheet h3{margin:0}.drkLv{margin:0;font-size:12px;opacity:.8}.drkRow{display:flex;justify-content:space-between;background:#ffffff14;color:#fff;border:1px solid #ffffff22;border-radius:10px;padding:10px 12px;font-size:14px}`} />
  </>;
}
