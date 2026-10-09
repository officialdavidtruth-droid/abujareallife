'use client';
import { useCallback, useEffect, useState } from 'react';
import RuntimeStyle from './RuntimeStyle';
import { TOPUPS, type TopUp } from '../lib/wallet';

const n = (v: number) => '₦' + v.toLocaleString('en-NG');
type Info = { cash: number; hasEmail: boolean; configured: boolean; history: { coins: number; pkg: string; at: string }[] };
type Banner = { kind: 'ok' | 'wait' | 'bad'; text: string } | null;

/* Open with the 💰 Wallet dock button (event 'arl-open-wallet'). Also finishes a payment when Paystack sends the player back to /?wallet=1&reference=... */
export default function Wallet() {
  const [open, setOpen] = useState(false), [info, setInfo] = useState<Info | null>(null), [busy, setBusy] = useState(''), [email, setEmail] = useState(''), [msg, setMsg] = useState(''), [banner, setBanner] = useState<Banner>(null);

  const load = useCallback(async () => {
    try { const r = await fetch('/api/wallet', { cache: 'no-store' }); const d = await r.json(); if (d?.ok) setInfo(d); } catch { /* offline */ }
  }, []);

  useEffect(() => { const f = () => { setOpen(true); setMsg(''); void load(); }; window.addEventListener('arl-open-wallet', f); return () => window.removeEventListener('arl-open-wallet', f); }, [load]);

  // returning from Paystack: ask the server (which asks Paystack) whether the payment succeeded
  useEffect(() => {
    const q = new URLSearchParams(window.location.search), ref = q.get('reference') || q.get('trxref');
    if (!q.get('wallet') || !ref) return;
    window.history.replaceState({}, '', window.location.pathname);
    let dead = false;
    const check = async (tries: number) => {
      setBanner({ kind: 'wait', text: 'Confirming your payment…' });
      try {
        const r = await fetch('/api/wallet/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reference: ref }) });
        const d = await r.json().catch(() => ({}));
        if (dead) return;
        if (d.ok) {
          window.dispatchEvent(new CustomEvent('arl-cash-update', { detail: { cash: d.cash } }));
          setBanner({ kind: 'ok', text: d.state === 'already' ? `Payment already confirmed. Your balance is ${n(d.cash)}.` : `✅ ${n(d.naira)} paid — ${n(d.coins)} game money added. Balance: ${n(d.cash)}.` }); void load();
        } else if (d.state === 'pending' && tries < 6) setTimeout(() => void check(tries + 1), 3000);
        else setBanner({ kind: d.state === 'pending' ? 'wait' : 'bad', text: d.state === 'pending' ? 'Your payment is still processing. It will be added automatically once confirmed.' : (d.error || 'Could not confirm the payment.') });
      } catch { if (!dead) setBanner({ kind: 'wait', text: 'Could not confirm yet. If you were charged, your wallet is credited automatically within a few minutes.' }); }
    };
    void check(0);
    return () => { dead = true; };
  }, [load]);

  const pay = async (p: TopUp) => {
    if (busy) return; setMsg(''); setBusy(p.id);
    try {
      const r = await fetch('/api/wallet/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ package: p.id, email: email.trim() }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.url) { window.location.assign(d.url); return; }
      setMsg(d.error || 'Could not start the payment.');
    } catch { setMsg('Network error. Check your connection and try again.'); }
    setBusy('');
  };

  return <>
    <RuntimeStyle css={CSS} />
    {banner && <div className={'wlBanner ' + banner.kind} onClick={() => banner.kind !== 'wait' && setBanner(null)}>{banner.text}{banner.kind !== 'wait' && <small> · tap to close</small>}</div>}
    {open && <div className="wlBackdrop" onClick={() => setOpen(false)}><section className="wlPanel" onClick={e => e.stopPropagation()}>
      <header><div><small>ABUJA REAL LIFE</small><h2>💰 Wallet</h2></div><button className="wlClose" onClick={() => setOpen(false)}>×</button></header>
      <div className="wlBal"><span>Your balance</span><b>{info ? n(info.cash) : '…'}</b></div>
      <p className="wlNote">Add game money with a real-money payment (Paystack: card, bank transfer, USSD). Game money is for use in the game only and cannot be withdrawn or refunded as cash.</p>
      {info && !info.hasEmail && <input className="wlEmail" type="email" inputMode="email" placeholder="Your email (for the payment receipt)" value={email} onChange={e => setEmail(e.target.value)} />}
      {info && !info.configured && <p className="wlErr">Payments are not switched on yet.</p>}
      <div className="wlGrid">{TOPUPS.map(p => <button key={p.id} className="wlPack" disabled={!!busy || (info ? !info.configured : false)} onClick={() => void pay(p)}>
        {p.tag && <em>{p.tag}</em>}<span>{n(p.coins)}</span><small>game money</small><b>{busy === p.id ? 'Opening…' : 'Pay ' + n(p.naira)}</b></button>)}</div>
      {msg && <p className="wlErr">{msg}</p>}
      {!!info?.history.length && <div className="wlHist"><h3>Recent top-ups</h3>{info.history.map((h, i) => { const p = TOPUPS.find(t => t.id === h.pkg); return <div key={i}><span>{new Date(h.at).toLocaleDateString()}</span><span>{p ? n(p.naira) : ''}</span><b>+{n(h.coins)}</b></div>; })}</div>}
    </section></div>}
  </>;
}

const CSS = `.wlBackdrop{position:fixed;inset:0;z-index:60;background:#020806c4;display:grid;place-items:center;padding:14px;font-family:system-ui,sans-serif}.wlPanel{width:min(560px,100%);max-height:88dvh;overflow:auto;background:#101a15;color:#f8f4e9;border:1px solid #ffffff24;border-radius:20px;padding:17px;box-shadow:0 18px 60px #0009;display:flex;flex-direction:column;gap:12px}.wlPanel header{display:flex;align-items:center;justify-content:space-between}.wlPanel header small{font-size:9px;letter-spacing:.18em;color:#e5b14b;font-weight:900}.wlPanel h2{margin:3px 0 0;font-size:23px}.wlClose{border:0;border-radius:50%;width:36px;height:36px;background:#26362d;color:#fff;font-size:25px;cursor:pointer}.wlBal{display:flex;justify-content:space-between;align-items:center;background:#17251d;border:1px solid #ffffff13;border-radius:13px;padding:12px 14px}.wlBal span{font-size:11px;color:#9db3a4;font-weight:800;letter-spacing:.08em}.wlBal b{font-size:22px;color:#e5b14b}.wlNote{font-size:11px;line-height:1.5;color:#9db3a4;margin:0}.wlEmail{border:1px solid #ffffff2a;background:#0b1511;color:#fff;border-radius:10px;padding:11px;font-size:14px}.wlGrid{display:grid;grid-template-columns:repeat(2,1fr);gap:9px}.wlPack{position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;background:#17251d;color:#fff;border:1px solid #ffffff1f;border-radius:14px;padding:16px 8px 10px;cursor:pointer}.wlPack:hover:not(:disabled){border-color:#e5b14b}.wlPack:disabled{opacity:.6;cursor:default}.wlPack span{font-size:18px;font-weight:900}.wlPack small{font-size:9px;color:#9db3a4;letter-spacing:.1em;text-transform:uppercase}.wlPack b{margin-top:8px;background:#e5b14b;color:#1b1509;border-radius:9px;padding:8px 12px;font-size:12px}.wlPack em{position:absolute;top:-7px;right:10px;background:#b7352b;color:#fff;font:900 8px system-ui;font-style:normal;padding:3px 7px;border-radius:6px;letter-spacing:.08em}.wlErr{color:#ff9a8f;font-size:12px;margin:0}.wlHist h3{margin:4px 0 6px;font-size:11px;letter-spacing:.1em;color:#9db3a4}.wlHist div{display:flex;justify-content:space-between;font-size:12px;padding:6px 0;border-top:1px solid #ffffff12;color:#cfdcd3}.wlHist b{color:#7be0a0}.wlBanner{position:fixed;z-index:70;left:50%;top:14px;transform:translateX(-50%);max-width:92vw;padding:11px 16px;border-radius:12px;font:700 13px system-ui;color:#fff;box-shadow:0 6px 20px #0008;cursor:pointer;border:1px solid #ffffff30}.wlBanner.ok{background:#14532d}.wlBanner.wait{background:#1f2b24}.wlBanner.bad{background:#7a1f1a}.wlBanner small{font-weight:500;opacity:.7}@media(max-width:420px){.wlGrid{grid-template-columns:1fr 1fr}.wlPack span{font-size:16px}}`;
