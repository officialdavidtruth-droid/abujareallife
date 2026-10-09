'use client';
import { useState } from 'react';
import RuntimeStyle from './RuntimeStyle';

const naira = (n: number) => '₦' + Math.round(n).toLocaleString();

/* Send game money to any player by username (works for players who are offline too). The server moves the money in one database transaction. */
export default function SendMoney({ cash, start, onClose, onDone }: { cash: number; start?: string; onClose: () => void; onDone: (newCash: number, msg: string) => void }) {
  const [to, setTo] = useState(start || ''), [amount, setAmount] = useState(''), [note, setNote] = useState(''), [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const name = to.trim().replace(/^@/, ''), amt = Math.floor(Number(amount) || 0);
  const problem = !name ? 'Enter a username.' : amt < 1 ? 'Enter an amount.' : amt > cash ? "You don't have that much cash." : '';
  const send = async () => {
    if (!confirm) { setConfirm(true); return; } // second tap = really send, so a mistyped name or amount is caught first
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: name, kind: 'cash', amount: amt, body: note.trim().slice(0, 80) }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error || 'Could not send the money.'); setConfirm(false); setBusy(false); return; }
      onDone(d.cash, `💸 Sent ${naira(amt)} to @${d.message?.to || name}`); onClose();
    } catch { setErr('Network error. Try again.'); setConfirm(false); setBusy(false); }
  };
  return <div className="smBack" onClick={onClose}><div className="smBox" onClick={e => e.stopPropagation()}>
    <button className="smX" aria-label="Close" onClick={onClose}>✕</button>
    <h3>💸 Send money</h3>
    <small className="smBal">Your cash: <b>{naira(cash)}</b></small>
    <label>Player username<input value={to} autoCapitalize="none" autoCorrect="off" maxLength={19} placeholder="e.g. Chidi_22" onChange={e => { setTo(e.target.value); setConfirm(false); }} /></label>
    <label>Amount (₦)<input inputMode="numeric" value={amount} placeholder="0" onChange={e => { setAmount(e.target.value.replace(/[^0-9]/g, '').slice(0, 10)); setConfirm(false); }} /></label>
    <label>Note <i>(optional)</i><input value={note} maxLength={80} placeholder="For the taxi, rent…" onChange={e => setNote(e.target.value)} /></label>
    {(err || (problem && (name || amount))) && <p className="smErr">{err || problem}</p>}
    <button className={'smGo' + (confirm ? ' sure' : '')} disabled={busy || !!problem} onClick={send}>{busy ? 'Sending…' : confirm ? `Tap again to send ${naira(amt)} to @${name}` : 'Send'}</button>
    <RuntimeStyle id="arl-send-money" css={`.smBack{position:fixed;inset:0;z-index:99;background:#000a;display:grid;place-items:center;padding:14px}.smBox{position:relative;width:min(360px,100%);display:flex;flex-direction:column;gap:9px;background:#10201a;color:#fff;border:2px solid #d99a42;border-radius:18px;padding:16px;font-family:system-ui,sans-serif}
.smBox h3{margin:0;font-size:18px}.smX{all:unset;position:absolute;right:12px;top:10px;cursor:pointer;font-size:16px;color:#b9cfc4}.smBal{color:#b9cfc4}.smBox label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:#b9cfc4}
.smBox input{all:unset;box-sizing:border-box;padding:9px 11px;background:#fff;color:#1a1410;border-radius:10px;font:700 15px system-ui}.smErr{margin:0;padding:7px 10px;border-radius:10px;background:#ffd9d4;color:#7a1608;font-size:13px;font-weight:700}
.smGo{all:unset;text-align:center;cursor:pointer;padding:11px;border-radius:12px;background:#2fc66b;color:#06210f;font-weight:900;font-size:14px}.smGo.sure{background:#ffb81c;color:#1a1410}.smGo:disabled{opacity:.45;cursor:default}`} />
  </div></div>;
}
