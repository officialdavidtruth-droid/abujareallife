'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import RuntimeStyle from './RuntimeStyle';
import { playScene } from './StreetEscort';

/* Club underworld panel (Nightclub only). Escorts, dealers and gang members make offers to REAL players in the room; anyone can accept or decline.
   All rules are enforced by /api/deal: this is only the interface. */
type Poll = { cash: number; heat: number; isCop: boolean; npcCops: { id: string; name: string; rank: string }[]; sells: { kind: string; label: string; e: string; blurb: string; min: number; max: number } | null;
  players: { name: string; e: string; role: string; cop: boolean }[];
  incoming: { id: string; kind: string; price: number; from: string; label: string; e: string }[];
  outgoing: { id: string; kind: string; price: number; to: string; status: string }[] };
const naira = (n: number) => '₦' + Math.round(n).toLocaleString();
const post = async (body: object) => { const r = await fetch('/api/deal', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { ok: r.ok, d: await r.json().catch(() => ({})) as any }; };

export default function Underworld({ onCash, onFx, toast }: { onCash: (n: number) => void; onFx: (fx: Record<string, number>) => void; toast: (m: string, bad?: boolean) => void }) {
  const [bribe, setBribe] = useState<Record<string, string>>({}), [open, setOpen] = useState(false), [s, setS] = useState<Poll | null>(null), [to, setTo] = useState(''), [price, setPrice] = useState('');
  const poll = useCallback(async () => { const r = await post({ action: 'poll' }); if (r.ok) setS(r.d); }, []);
  useEffect(() => { poll(); const i = setInterval(poll, 4000); return () => clearInterval(i); }, [poll]);
  const seenAcc = useRef<Set<string> | null>(null);   // the seller gets the scene too, once, when the buyer accepts
  useEffect(() => { if (!s) return; const acc = s.outgoing.filter(o => o.status === 'accepted' && o.kind === 'company').map(o => o.id); if (seenAcc.current === null) { seenAcc.current = new Set(acc); return; } for (const id of acc) if (!seenAcc.current.has(id)) { seenAcc.current.add(id); playScene(); } }, [s]);
  const n = s?.incoming.length || 0;
  const offer = async () => { if (!s?.sells) return; const r = await post({ action: 'offer', to, price: Number(price) }); if (!r.ok) return toast(r.d.error, true); toast(`${s.sells.e} Offer sent to ${to}. It expires in 2 minutes.`); setTo(''); poll(); };
  const answer = async (id: string, action: 'accept' | 'decline') => {
    const r = await post({ action, id }); if (!r.ok) { toast(r.d.error, true); return poll(); }
    if (action === 'accept') { if (r.d.cash != null) onCash(r.d.cash); if (r.d.sting) toast('🚔 Sting! The seller is now WANTED.'); else { onFx(r.d.fx || {}); toast('💰 Deal done.'); if (s?.incoming.find(o => o.id === id)?.kind === 'company') playScene(); } }
    poll();
  };
  const sendBribe = async (to: string) => { const r = await post({ action: 'bribe', to, price: Number(bribe[to]) }); if (!r.ok) return toast(r.d.error, true);
    if (r.d.cash != null) onCash(r.d.cash); toast(`${r.d.taken ? '💵' : r.d.pending ? '💵' : '🚨'} ${r.d.msg}`, r.d.taken === false); setBribe(b => ({ ...b, [to]: '' })); poll(); };
  const sells = s?.sells, cops = [...(s?.npcCops || []).map(c => ({ id: c.id, label: `${c.name} · ${c.rank} (NPC)` })), ...(s?.players || []).filter(p => p.cop).map(p => ({ id: p.name, label: `👮 Officer ${p.name} (player)` }))];
  return <>
    <button className="uwBtn" onClick={() => setOpen(v => !v)}>🪩 Underworld{n > 0 && <b>{n}</b>}</button>
    {open && <div className="uwSheet"><button className="x" aria-label="Close" onClick={() => setOpen(false)}>✕</button><h3>🪩 The Underworld</h3>
      <p className="uwNote">Everyone here is a real player. Deals only happen between people standing in this club.</p>
      {n > 0 && <section><h4>Offers for you</h4>{s!.incoming.map(o => <div key={o.id} className="uwRow"><span><b>{o.e} {o.label}</b><small>from {o.from} · {naira(o.price)}</small></span><span><button onClick={() => answer(o.id, 'accept')}>Accept</button><button className="no" onClick={() => answer(o.id, 'decline')}>Decline</button></span></div>)}</section>}
      {sells ? <section><h4>{sells.e} Your trade: {sells.label}</h4><p className="uwNote">{sells.blurb} Ask {naira(sells.min)}–{naira(sells.max)}. Real officers can accept as a sting.</p>
        <div className="uwList">{s!.players.length ? s!.players.map(p => <button key={p.name} className={to === p.name ? 'on' : ''} onClick={() => setTo(p.name)}>{p.e} {p.name}<small>{p.role}</small></button>) : <i>Nobody else is in the club yet.</i>}</div>
        <div className="uwAsk"><input inputMode="numeric" placeholder="Price ₦" value={price} onChange={e => setPrice(e.target.value.replace(/\D/g, '').slice(0, 7))} onKeyDown={e => e.stopPropagation()} onKeyUp={e => e.stopPropagation()} /><button disabled={!to || !price} onClick={offer}>Send offer{to ? ` to ${to}` : ''}</button></div>
        {s!.outgoing.length > 0 && <div className="uwOut">{s!.outgoing.map(o => <div key={o.id}>{naira(o.price)} → {o.to}: <b>{o.status}</b></div>)}</div>}</section>
        : <section><h4>Who is here</h4><div className="uwList">{s?.players.length ? s.players.map(p => <span key={p.name} className="uwChip">{p.e} {p.name}<small>{p.role}</small></span>) : <i>Nobody else is in the club yet.</i>}</div>
          <p className="uwNote">Want to deal? Pick <b>Club Escort</b>, <b>Drug Dealer</b> or <b>Gang Member</b> in ☰ → Character.</p></section>}
      {!s?.isCop && <section><h4>💵 Pay off the police</h4><p className="uwNote">Heat {s?.heat ?? 0}. Real officers choose by hand; NPC officers choose on their own (bigger bribes and a cooler record help). A refusal can get you arrested.</p>
        {cops.map(c => <div key={c.id} className="uwRow"><span><b>{c.label}</b></span><span className="uwAsk"><input inputMode="numeric" placeholder="₦" value={bribe[c.id] || ''} onChange={e => setBribe(b => ({ ...b, [c.id]: e.target.value.replace(/\D/g, '').slice(0, 7) }))} onKeyDown={e => e.stopPropagation()} onKeyUp={e => e.stopPropagation()} /><button disabled={!bribe[c.id]} onClick={() => sendBribe(c.id)}>Offer</button></span></div>)}</section>}
      {s?.isCop && <p className="uwNote">You are on duty: offers of bribes appear under "Offers for you". Taking one is a crime (you gain heat).</p>}
    </div>}
    <RuntimeStyle css={`.uwBtn{position:absolute;left:12px;top:140px;z-index:13;background:#7c3aedf0;color:#fff;border:1px solid #c4b5fd88;border-radius:999px;padding:8px 14px;font-size:13px;font-weight:800}.uwBtn b{background:#ef4444;border-radius:999px;padding:0 6px;margin-left:6px;font-size:11px}
.uwSheet{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(440px,92vw);max-height:78vh;overflow:auto;z-index:20;background:#140b26f5;color:#fff;border:1px solid #a855f788;border-radius:16px;padding:16px;font-size:13px}.uwSheet h3{margin:0 0 4px}.uwSheet h4{margin:12px 0 4px;font-size:13px;color:#d8b4fe}.uwSheet .x{position:absolute;right:10px;top:8px;background:none;border:0;color:#fff;font-size:18px}
.uwNote{color:#b9a8d8;font-size:11px;margin:2px 0 6px}.uwRow{display:flex;justify-content:space-between;align-items:center;gap:8px;background:#ffffff10;border-radius:10px;padding:8px;margin:4px 0}.uwRow small{display:block;color:#b9a8d8}.uwRow button,.uwAsk button{background:#d99a42;color:#111;border:0;border-radius:8px;padding:7px 10px;font-weight:800;margin-left:4px}.uwRow button.no{background:#ffffff22;color:#fff}.uwAsk button:disabled{opacity:.4}
.uwList{display:flex;flex-wrap:wrap;gap:6px}.uwList button,.uwChip{background:#ffffff14;color:#fff;border:1px solid #ffffff22;border-radius:10px;padding:6px 9px;font-size:12px}.uwList button.on{background:#7c3aed;border-color:#c4b5fd}.uwList small,.uwChip small{display:block;color:#b9a8d8;font-size:10px}
.uwAsk{display:flex;gap:6px;margin-top:8px}.uwRow .uwAsk{margin-top:0}.uwRow .uwAsk input{width:90px;flex:none}.uwAsk input{flex:1;min-width:0;background:#0a0618;border:1px solid #a855f788;border-radius:9px;padding:8px;color:#fff;font-size:16px}.uwOut{margin-top:8px;font-size:11px;color:#d8b4fe}`} />
  </>;
}
