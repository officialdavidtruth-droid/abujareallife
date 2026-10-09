'use client';
import { useEffect, useMemo, useState } from 'react';
import { GAME } from './CityWorld';
import DestPicker, { DEST_PICKER_CSS } from './DestPicker';
import RuntimeStyle from './RuntimeStyle';
import { pointDest, type Dest } from '../lib/destinations';

/* "Order a ride" for another real player: pick where they should be taken (your location, or any place in the city).
   Nothing is charged until they accept; if they decline or ignore it, you pay nothing. */
export default function RideOrder({ to, me, onClose, onSent }: { to: string; me: string; onClose: () => void; onSent: (msg: string) => void }) {
  const [kind, setKind] = useState<'taxi' | 'bike'>('taxi'), [fares, setFares] = useState<Record<string, number>>({}), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  useEffect(() => { fetch('/api/transport').then(r => r.json()).then(d => d?.fares && setFares(d.fares)).catch(() => {}); }, []);
  const here = useMemo(() => [pointDest(`📍 Meet me here (@${me})`, GAME.player.x, GAME.player.z)], [me]); // snapshot of where you stand when the panel opens
  const send = async (d: Dest) => {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/rides', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'order', to, kind, destName: d.id === 'point' ? `Meet @${me}` : d.name, destX: d.x, destZ: d.z }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || 'Could not send the request.'); setBusy(false); return; }
      onSent(`🚕 Ride request sent to @${to}. You pay ₦${(j.ride?.fare ?? 0).toLocaleString()} only if they accept.`); onClose();
    } catch { setErr('Network error. Try again.'); setBusy(false); }
  };
  const f = fares[kind];
  return <div className="roSheet">
    <button className="roX" aria-label="Close" onClick={onClose}>✕</button>
    <h3>🚕 Order a ride for @{to}</h3>
    <div className="roBody">
      <p>@{to} must accept before the ride starts. Pick where they get taken{f ? ` · about ₦${f.toLocaleString()}, paid by you after they accept` : ''}.</p>
      <div className="roKinds">{(['taxi', 'bike'] as const).map(k => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{k === 'taxi' ? '🚕 Taxi' : '🚲 Bike taxi'}{fares[k] ? ` · ₦${fares[k].toLocaleString()}` : ''}</button>)}</div>
      {err && <p className="roErr">{err}</p>}
      <DestPicker disabled={busy} extra={here} label="Send" onPick={send} />
    </div>
    <RuntimeStyle id="arl-ride-order" css={`${DEST_PICKER_CSS}
.roSheet{position:fixed;z-index:97;right:calc(12px + env(safe-area-inset-right,0px));top:calc(54px + env(safe-area-inset-top,0px));bottom:calc(12px + env(safe-area-inset-bottom,0px));width:min(340px,92vw);display:flex;flex-direction:column;overflow:hidden;background:#261a36;color:#fff3d6;border:4px solid #1a1410;border-radius:22px;box-shadow:0 6px 0 #1a1410,0 18px 34px #000a;font-family:system-ui,sans-serif}
.roSheet h3{flex:none;margin:0;padding:10px 54px 8px 16px;background:#ffb81c;border-bottom:4px solid #1a1410;font-size:17px;color:#1a1410}
.roX{all:unset;position:absolute;right:10px;top:8px;width:32px;height:32px;display:grid;place-items:center;border-radius:50%;cursor:pointer;background:#ff5147;border:3px solid #1a1410;color:#fff;font-size:14px}
.roBody{flex:1;min-height:0;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:9px}
.roBody p{margin:0;padding:7px 12px;background:#fff3d6;color:#1a1410;border:3px solid #1a1410;border-radius:14px;font-size:13px;line-height:1.28}.roBody p.roErr{background:#ffd9d4;color:#7a1608;font-weight:800}
.roKinds{display:flex;gap:6px}.roKinds button{all:unset;flex:1;text-align:center;cursor:pointer;padding:7px 4px;background:#34244a;border:3px solid #1a1410;border-radius:12px;font-size:13px;font-weight:800}.roKinds button.on{background:#2fc66b}
.roBody .dpWrap button{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:10px;cursor:pointer;width:100%;padding:8px 9px 8px 12px;background:#34244a;border:3px solid #1a1410;border-radius:16px;box-shadow:0 4px 0 #1a1410}.roBody .dpWrap button:active{transform:translateY(4px);box-shadow:none}
.roBody .tx{flex:1;min-width:0}.roBody .tx b{font-weight:800;font-size:14px}.roBody em{flex:none;font-style:normal;padding:4px 12px;background:#2fc66b;color:#fff;border:3px solid #1a1410;border-radius:12px;font-weight:800;font-size:13px}
.dpTools{background:#261a36}
@media (max-width:620px) and (orientation:portrait){.roSheet{left:10px;right:10px;top:auto;width:auto;max-height:60vh}}`} />
  </div>;
}
