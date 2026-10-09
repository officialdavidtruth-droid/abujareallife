'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import RuntimeStyle from './RuntimeStyle';
import { NET } from '../lib/cityNet';
import { GAME } from './CityWorld';
import { SCENE_LINES, STREET } from '../lib/nightlife';

/* Step 7: street escort service (interface only; /api/escort decides everything).
   - A Club Escort standing next to a real player on foot gets "💃 Offer company" and names a price.
   - The other player gets an offer card with Accept / Decline (an officer who accepts is running a sting).
   - The scene is a plain fade to black with one line of text. Nothing is shown. */
const naira = (n: number) => '₦' + Math.round(n).toLocaleString();
const post = async (body: object) => { try { const r = await fetch('/api/escort', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { ok: r.ok, d: await r.json().catch(() => ({})) as any }; } catch { return { ok: false, d: { error: 'Network error.' } as any }; } }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Fade to black, one line of text, fade back. Builds its own DOM overlay so it works from the street AND from inside a building. */
export function playScene(line?: string) {
  if (typeof document === 'undefined' || document.getElementById('arl-scene')) return;
  const el = document.createElement('div'); el.id = 'arl-scene';
  el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#000;color:#e5e7eb;display:flex;align-items:center;justify-content:center;font:600 18px system-ui,sans-serif;text-align:center;padding:24px;opacity:0;transition:opacity .9s;pointer-events:none';
  el.textContent = line || SCENE_LINES[Math.floor(Math.random() * SCENE_LINES.length)];
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '1'; });
  setTimeout(() => { el.style.opacity = '0'; }, 2800);
  setTimeout(() => el.remove(), 3900);
}

type Poll = { isEscort: boolean; min: number; max: number; incoming: { id: string; price: number; from: string }[]; outgoing: { id: string; price: number; to: string; status: string }[] };

export default function StreetEscort({ say, refresh }: { say: (m: string) => void; refresh: () => void }) {
  const [s, setS] = useState<Poll | null>(null), [target, setTarget] = useState(''), [ask, setAsk] = useState(false), [price, setPrice] = useState(''), [busy, setBusy] = useState(false);
  const seen = useRef<Set<string> | null>(null);
  const poll = useCallback(async () => {
    const r = await post({ action: 'poll' }); if (!r.ok) return; setS(r.d);
    const acc = (r.d.outgoing as Poll['outgoing']).filter(o => o.status === 'accepted').map(o => o.id);
    if (seen.current === null) seen.current = new Set(acc);   // offers accepted before this page loaded do not replay
    else for (const id of acc) if (!seen.current.has(id)) { seen.current.add(id); playScene(); say('💃 It is done. You are hotter now.'); refresh(); }
  }, [say, refresh]);
  useEffect(() => { poll(); const i = setInterval(poll, 4000); return () => clearInterval(i); }, [poll]);

  // who is within reach on foot?
  useEffect(() => {
    const i = setInterval(() => {
      if (GAME.jailed || NET.me.drv) return setTarget('');
      let best = '', d0: number = STREET.range;
      for (const [n, q] of Object.entries(NET.peers)) { if (q.drv || q.safe) continue; const d = Math.hypot(q.x - NET.me.x, q.z - NET.me.z); if (d < d0) { d0 = d; best = n; } }
      setTarget(best);
    }, 400);
    return () => clearInterval(i);
  }, []);
  useEffect(() => { if (!target) setAsk(false); }, [target]);

  const pos = (name: string) => { const q = NET.peers[name]; return q ? { sx: NET.me.x, sz: NET.me.z, tx: q.x, tz: q.z } : null; };
  const offer = async () => {
    const p = pos(target); if (!p || busy) return; setBusy(true);
    const r = await post({ action: 'offer', to: target, price: Number(price), ...p }); setBusy(false);
    if (!r.ok) return say(r.d.error || 'It did not work.');
    say(`💃 Offer sent to ${target}. It expires in 2 minutes.`); setAsk(false); setPrice(''); poll();
  };
  const answer = async (id: string, from: string, action: 'accept' | 'decline') => {
    const p = pos(from); if (busy) return;
    if (action === 'accept' && !p) return say('Step closer to them first.');
    setBusy(true); const r = await post({ action, id, ...(p || {}) }); setBusy(false);
    if (!r.ok) { say(r.d.error || 'It did not work.'); return poll(); }
    if (action === 'accept') {
      if (r.d.sting) say('🚔 Sting! The escort is now WANTED.');
      else { playScene(); if (typeof r.d.cash === 'number') window.dispatchEvent(new CustomEvent('arl-mission-paid', { detail: { cash: r.d.cash, reward: 0 } })); say('🌙 Done.'); }
      refresh();
    }
    poll();
  };

  const inc = s?.incoming[0];
  return <>
    {inc && <div className="seBox"><b>💃 {inc.from} offers company</b><small>{naira(inc.price)}{NET.peers[inc.from] ? '' : ' · step closer to answer'}</small>
      <span><button disabled={busy} onClick={() => answer(inc.id, inc.from, 'accept')}>Accept</button><button disabled={busy} className="no" onClick={() => answer(inc.id, inc.from, 'decline')}>Decline</button></span></div>}
    {s?.isEscort && target && !inc && (ask
      ? <div className="seBox"><b>💃 Offer company to {target}</b><small>Ask {naira(s.min)}–{naira(s.max)} · hotter than the club: you gain heat, and an officer can sting you.</small>
          <input inputMode="numeric" placeholder="Price ₦" value={price} onChange={e => setPrice(e.target.value.replace(/\D/g, '').slice(0, 7))} onKeyDown={e => e.stopPropagation()} onKeyUp={e => e.stopPropagation()} />
          <span><button disabled={busy || !price} onClick={offer}>Send offer</button><button className="no" onClick={() => setAsk(false)}>Cancel</button></span></div>
      : <button className="seBtn" onClick={() => setAsk(true)}>💃 Offer company to {target}</button>)}
    <RuntimeStyle id="arl-street-escort" css={`.seBtn{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(150px + env(safe-area-inset-bottom,0px));z-index:30;background:#7c3aedf2;color:#fff;border:1px solid #c4b5fdaa;border-radius:999px;min-height:44px;padding:11px 18px;font-size:14px;font-weight:900;box-shadow:0 4px 14px #0008;touch-action:manipulation}
.seBox{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(150px + env(safe-area-inset-bottom,0px));z-index:36;width:min(300px,calc(100vw - 24px));background:#140b26f5;color:#fff;border:1px solid #a855f7;border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:8px;text-align:center;box-shadow:0 10px 30px #000b}.seBox small{font-size:11px;color:#c4b5fd}.seBox span{display:flex;gap:8px}.seBox button{flex:1;min-height:44px;border:0;border-radius:10px;background:#d99a42;color:#111;font-weight:900;touch-action:manipulation}.seBox button.no{background:#ffffff22;color:#fff}.seBox button:disabled{opacity:.5}.seBox input{background:#0a0618;border:1px solid #a855f788;border-radius:9px;padding:9px;color:#fff;font-size:16px}`} />
  </>;
}
