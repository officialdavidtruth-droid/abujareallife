'use client';
import { useCallback, useEffect, useState } from 'react';
import RuntimeStyle from './RuntimeStyle';
import { GAME } from './CityWorld';
import { MAX_PER_DEAL } from '../lib/dealers';

/* NPC weed dealers. In the Market you meet the supplier (you buy); in the Nightclub you meet the buyer (you sell).
   All prices, heat and bust rolls are decided by /api/dealer; this is only the interface. */
type Poll = { dealer: { name: string; e: string; role: 'supplier' | 'buyer'; line: string }; price: number; soldRecently: number; have: number; cash: number; heat: number; cop: boolean };
const naira = (n: number) => '₦' + Math.round(n).toLocaleString();
const post = async (body: object) => { const r = await fetch('/api/dealer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { ok: r.ok, d: await r.json().catch(() => ({})) as any }; }; // eslint-disable-line @typescript-eslint/no-explicit-any

export default function Dealers({ onCash, onFx, toast }: { onCash: (n: number) => void; onFx: (fx: Record<string, number>) => void; toast: (m: string, bad?: boolean) => void }) {
  const [open, setOpen] = useState(false), [s, setS] = useState<Poll | null>(null), [qty, setQty] = useState(1);
  const poll = useCallback(async () => { const r = await post({ action: 'poll' }); if (r.ok) setS(r.d); }, []);
  useEffect(() => { if (!open) return; poll(); const i = setInterval(poll, 8000); return () => clearInterval(i); }, [open, poll]);
  const go = async (action: 'buy' | 'sell') => {
    const r = await post({ action, qty }); if (!r.ok) return toast(r.d.error || 'Nope.', true);
    onCash(r.d.cash); GAME.heat = r.d.heat;
    if (action === 'buy') toast(`🌿 Bought ${r.d.qty} for ${naira(r.d.spent)}${r.d.wanted ? ' · you are WANTED' : ''}`);
    else if (r.d.busted) toast('🚔 It was a setup. Your weed was seized and you got no money.', true);
    else toast(`💰 Sold ${r.d.qty} for ${naira(r.d.earned)}${r.d.wanted ? ' · you are WANTED' : ''}`);
    poll();
  };
  const smoke = async () => {
    const r = await fetch('/api/intox', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'smoke' }) }), d = await r.json().catch(() => ({}));
    if (!r.ok) return toast(d.error || 'Nope.', true);
    GAME.high = d.high; GAME.drunk = d.drunk; if (d.blackout) { onFx(d.penalty || {}); toast('😵 You blacked out.', true); } else toast('🌿 You smoked a joint.'); poll();
  };
  const buying = s?.dealer.role === 'supplier';
  return <>
    <button className="dlBtn" onClick={() => setOpen(v => !v)}>{buying ? '🌿 The Plug' : '🕶️ Buyer'}</button>
    {open && <div className="dlSheet"><button className="x" aria-label="Close" onClick={() => setOpen(false)}>✕</button>
      {!s ? <p>…</p> : s.cop ? <p>Officers cannot deal.</p> : <>
        <h3>{s.dealer.e} {s.dealer.name}</h3><p className="dlLine">“{s.dealer.line}”</p>
        <p className="dlRow"><span>{buying ? 'Price per unit' : 'He pays per unit'}</span><b>{naira(s.price)}</b></p>
        {!buying && s.soldRecently > 0 && <p className="dlNote">You sold {s.soldRecently} in the last 10 minutes, so his price is lower. Wait or move less.</p>}
        <p className="dlRow"><span>You carry</span><b>{s.have} 🌿</b></p><p className="dlRow"><span>Your heat</span><b>{s.heat}</b></p>
        <div className="dlQty"><button onClick={() => setQty(q => Math.max(1, q - 1))}>−</button><b>{qty}</b><button onClick={() => setQty(q => Math.min(MAX_PER_DEAL, q + 1))}>+</button></div>
        <button className="dlGo" onClick={() => go(buying ? 'buy' : 'sell')}>{buying ? `Buy ${qty} · ${naira(s.price * qty)}` : `Sell ${qty} · ${naira(s.price * qty)}`}</button>
        {!buying && <p className="dlNote">Every sale adds heat and can be a setup.</p>}
        {s.have > 0 && <button className="dlSmoke" onClick={smoke}>🌿 Smoke one</button>}
      </>}
    </div>}
    <RuntimeStyle id="arl-dealers" css={`.dlBtn{position:absolute;right:12px;bottom:calc(200px + env(safe-area-inset-bottom,0px));z-index:35;background:#14532df2;color:#fff;border:1px solid #86efacaa;border-radius:999px;padding:10px 14px;font-weight:900}.dlSheet{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:40;width:min(340px,92vw);background:#0b1a10f5;color:#fff;border:1px solid #86efac66;border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:8px}.dlSheet .x{position:absolute;right:10px;top:8px;background:none;border:0;color:#fff;font-size:18px}.dlSheet h3{margin:0}.dlLine{margin:0;font-size:12px;opacity:.75;font-style:italic}.dlRow{display:flex;justify-content:space-between;margin:0;font-size:14px}.dlNote{margin:0;font-size:11px;opacity:.7}.dlQty{display:flex;gap:12px;align-items:center;justify-content:center}.dlQty button{width:36px;height:36px;border-radius:50%;background:#ffffff18;color:#fff;border:1px solid #ffffff33;font-size:18px}.dlGo{background:#16a34a;color:#fff;border:0;border-radius:10px;padding:11px;font-weight:900;font-size:15px}.dlSmoke{background:#ffffff14;color:#fff;border:1px solid #ffffff22;border-radius:10px;padding:9px}`} />
  </>;
}
