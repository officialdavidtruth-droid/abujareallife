'use client';
import { useEffect, useState } from 'react';
import RuntimeStyle from './RuntimeStyle';
import { TAIL } from '../lib/tailRoute';
import { TAIL_RULES as R } from '../lib/missions';

/* On-screen readout for the Wuse Market Tail: how far the dealer is, how alert he is, and what to do next. Reads TAIL (lib/tailRoute.ts) a few times a second. */
type Snap = { phase: string; susp: number; dist: number; band: string; lost: number; witness: number; stop: string; leg: number; legs: number };
const TIPS: Record<string, string> = {
  close: 'Too close. Back off!',
  view: 'He can see you. Get behind him!',
  watch: 'He is watching the street. Hang back.',
  mid: 'A little closer than safe.',
  ok: 'Good distance.',
  far: 'Keep up. Do not lose him.',
};

export default function TailHud() {
  const [s, setS] = useState<Snap | null>(null);
  useEffect(() => {
    const i = window.setInterval(() => {
      if (!TAIL.on || !TAIL.follow) { setS(v => (v ? null : v)); return; }
      setS({ phase: TAIL.phase, susp: Math.round(TAIL.susp), dist: Math.round(TAIL.dist), band: TAIL.band, lost: TAIL.lostFor, witness: TAIL.witness, stop: TAIL.stopName, leg: TAIL.leg, legs: TAIL.legs.length });
    }, 150);
    return () => window.clearInterval(i);
  }, []);
  if (!s) return null;
  const lostLeft = Math.max(0, Math.ceil(R.loseSecs - s.lost)), losing = s.lost > 0.2 && s.dist > R.loseDist;
  const status = s.phase === 'depart' ? 'He is getting in his car…'
    : s.phase === 'dwell' ? `Parked at ${s.stop}. Keep your distance.`
    : s.phase === 'handover' ? `Handover at ${s.stop}. Watch from ${R.closeDist}–${R.witnessDist} m.`
    : `Following · stop ${Math.min(s.leg + 1, s.legs)} of ${s.legs}`;
  const tip = losing ? `Losing him! ${lostLeft}s` : (TIPS[s.band] || '');
  const danger = s.susp >= 66 || s.band === 'close' || s.band === 'view' || losing;
  return <>
    <RuntimeStyle id="arl-tail-hud" css={CSS} />
    <div className="tlHud" role="status" aria-live="polite">
      <small>🕶️ TAILING THE DEALER</small>
      <div className="tlRow"><span>Distance</span><b>{s.dist >= 900 ? '—' : `${s.dist} m`}</b></div>
      <div className="tlBar" title="Alertness"><i style={{ width: `${s.susp}%`, background: s.susp < 40 ? '#35c46b' : s.susp < 70 ? '#f2b705' : '#ff5147' }} /></div>
      <div className="tlRow"><span>Alertness</span><b>{s.susp}%</b></div>
      {s.phase === 'handover' && <div className="tlBar wit" title="Eyes on the handover"><i style={{ width: `${Math.min(100, s.witness / R.witnessSecs * 100)}%` }} /></div>}
      <em className={danger ? 'bad' : ''}>{tip}</em>
      <span className="tlSt">{status}</span>
    </div>
  </>;
}
const CSS = `.tlHud{position:absolute;z-index:13;left:50%;top:calc(118px + var(--sat,0px));transform:translateX(-50%);width:min(250px,calc(100vw - 24px));display:flex;flex-direction:column;gap:5px;background:#0a161cf0;color:#fff;border:1px solid #35d0ff;border-radius:12px;padding:9px 12px;box-shadow:0 4px 18px #0006;font:700 11px system-ui;pointer-events:none}.tlHud small{font-size:8px;letter-spacing:.14em;color:#35d0ff}.tlRow{display:flex;justify-content:space-between;color:#cfe3ea;font-weight:600}.tlRow b{color:#fff}.tlBar{height:6px;border-radius:6px;background:#26363d;overflow:hidden}.tlBar i{display:block;height:100%;transition:width .15s linear}.tlBar.wit i{background:#35d0ff}.tlHud em{font-style:normal;font-size:12px;color:#9fe3c0;text-align:center}.tlHud em.bad{color:#ff8a7e}.tlSt{font-size:10px;color:#9db3a4;text-align:center;font-weight:500}@media (pointer:coarse),(max-width:700px){.tlHud{top:calc(64px + var(--sat,0px));width:min(220px,calc(100vw - 200px))}}`;
