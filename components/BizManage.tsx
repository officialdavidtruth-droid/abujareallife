'use client';
import { useCallback, useEffect, useState } from 'react';
import RuntimeStyle from './RuntimeStyle';
import { MAX_WAGE, MIN_WAGE, ROLES } from '../lib/bizEconomy';

/* Owner tools (staff, wages, prices) and the employee's "My jobs" list. Used inside the Living Abuja panel. */
const naira = (n: number) => '₦' + Math.round(n).toLocaleString('en-NG');
const post = async (u: string, b: object) => { const r = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { ok: r.ok, d: await r.json().catch(() => ({})) }; };
type Staff = { id: string; username: string; role: string; wage: number; status: string; onShift: boolean; owed: number; earned: number };
type Owner = { businessId: string; capacity: number; staff: Staff[] };
type Job = { id: string; business: string; role: string; wage: number; status: string; onShift: boolean; shiftStart: number; due: number; owed: number; earned: number };
type Pricing = { markup: number; index: number; rivals: number; market: number; customers: number; capacity: number; crew: number; sells: number; services: { id: string; name: string; base: number; price: number }[] };

export function useBizJobs() {
  const [d, setD] = useState<{ owner: Owner[]; jobs: Job[] } | null>(null);
  const load = useCallback(async () => { const r = await fetch('/api/bizjobs').then(x => x.ok ? x.json() : null).catch(() => null); if (r) setD(r); }, []);
  useEffect(() => { load(); const i = setInterval(load, 15000); return () => clearInterval(i); }, [load]);
  return { d, load };
}

export function BizManage({ businessId, pricing, owner, say, reload }: { businessId: string; pricing?: Pricing; owner?: Owner; say: (t: string) => void; reload: () => void }) {
  const [user, setUser] = useState(''), [role, setRole] = useState('cashier'), [wage, setWage] = useState('8000'), [level, setLevel] = useState(''), [svc, setSvc] = useState<Record<string, string>>({}), [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const run = async (body: object, ok: string) => { setBusy(true); const r = await post('/api/bizjobs', body); setBusy(false); say(r.ok ? ok : r.d?.error || 'That did not work.'); reload(); return r.ok; };
  const savePrices = async () => {
    setBusy(true);
    const prices = Object.fromEntries(Object.entries(svc).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)]));
    const r = await post('/api/businesses', { action: 'setprices', businessId, markup: level === '' ? undefined : Number(level) / 100, prices: Object.keys(prices).length ? prices : undefined });
    setBusy(false); say(r.ok ? 'Prices saved.' : r.d?.error || 'Could not save prices.'); if (r.ok) { setSvc({}); setLevel(''); reload(); }
  };
  const staff = owner?.staff || [];
  return <div className="bzBox">
    <button className="bzToggle" onClick={() => setOpen(o => !o)}>{open ? '▾' : '▸'} Staff & prices <small>{staff.filter(s => s.status === 'ACTIVE').length}/{owner?.capacity ?? '–'} staff{pricing ? ` · ${pricing.customers}% customer share` : ''}</small></button>
    {open && <>
      <h5>👥 Staff</h5>
      {staff.length === 0 && <p className="bzMuted">Nobody works here yet. Offer a job to another player below.</p>}
      {staff.map(s => <div className="bzRow" key={s.id}>
        <span><b>{s.username}</b> · {s.role}<small>{s.status === 'OFFERED' ? 'offer sent, waiting' : s.status === 'FORMER' ? 'left, owed ' + naira(s.owed) : s.onShift ? '🟢 on shift' : 'off shift'} · {naira(s.wage)}/h{s.status === 'ACTIVE' && s.owed > 0 ? ` · owed ${naira(s.owed)}` : ''}</small></span>
        {s.status !== 'FORMER' && <span className="bzAct">
          <input aria-label={'Hourly wage for ' + s.username} defaultValue={s.wage} inputMode="numeric" onBlur={e => { const v = Number(e.target.value); if (v && v !== s.wage) run({ action: 'setwage', employeeId: s.id, wage: v }, 'Wage updated (next shift).'); }} />
          <button disabled={busy} onClick={() => run({ action: 'fire', employeeId: s.id }, s.status === 'OFFERED' ? 'Offer withdrawn.' : 'Fired.')}>{s.status === 'OFFERED' ? 'Withdraw' : 'Fire'}</button>
        </span>}
      </div>)}
      <div className="bzForm">
        <input placeholder="Player username" value={user} onChange={e => setUser(e.target.value)} />
        <select value={role} onChange={e => setRole(e.target.value)}>{ROLES.map(r => <option key={r}>{r}</option>)}</select>
        <input className="bzNum" aria-label="Wage per hour" inputMode="numeric" value={wage} onChange={e => setWage(e.target.value.replace(/\D/g, ''))} />
        <button disabled={busy || !user.trim()} onClick={async () => { if (await run({ action: 'offer', businessId, username: user.trim(), role, wage: Number(wage) }, `Offer sent to ${user.trim()}.`)) setUser(''); }}>Offer job</button>
      </div>
      <small className="bzMuted">Wage ₦{MIN_WAGE.toLocaleString()}–{MAX_WAGE.toLocaleString()} per hour on shift, paid from this business's profit. If the till is empty the rest is kept as owed.</small>

      {pricing && <>
        <h5>🏷️ Prices</h5>
        <p className="bzMuted">Your average price is <b>{Math.round(pricing.index * 100)}%</b> of list; {pricing.rivals ? `${pricing.rivals} rival shop${pricing.rivals > 1 ? 's' : ''} nearby average ${Math.round(pricing.market * 100)}%` : 'no rival shops nearby, so the city average (100%) is your yardstick'}. Cheaper than the market wins customers; dearer loses them. You pay suppliers 50% of list on every sale, so going below 50% loses money.</p>
        <div className="bzForm">
          <label>Price level % <input className="bzNum" inputMode="numeric" placeholder={String(Math.round(pricing.markup * 100))} value={level} onChange={e => setLevel(e.target.value.replace(/\D/g, ''))} /></label>
          <small className="bzMuted">50–300. Applies to all {pricing.sells} items; services below can be set individually.</small>
        </div>
        {pricing.services.map(s => <div className="bzRow" key={s.id}><span><b>{s.name}</b><small>list {naira(s.base)}</small></span><span className="bzAct"><input aria-label={'Price of ' + s.name} inputMode="numeric" placeholder={String(s.price)} value={svc[s.id] ?? ''} onChange={e => setSvc({ ...svc, [s.id]: e.target.value.replace(/\D/g, '') })} /></span></div>)}
        <button className="bzSave" disabled={busy || (level === '' && !Object.values(svc).some(v => v !== ''))} onClick={savePrices}>Save prices</button>
      </>}
    </>}
    <RuntimeStyle css={CSS} />
  </div>;
}

export function MyJobs({ jobs, say, reload }: { jobs: Job[]; say: (t: string) => void; reload: () => void }) {
  const [busy, setBusy] = useState(false);
  const run = async (body: object, ok: (d: any) => string) => { setBusy(true); const r = await post('/api/bizjobs', body); setBusy(false); say(r.ok ? ok(r.d) : r.d?.error || 'That did not work.'); reload(); };
  if (!jobs.length) return <p className="bzMuted">No job yet. Ask a business owner to send you an offer, or open a business of your own.<RuntimeStyle css={CSS} /></p>;
  return <div>{jobs.map(j => <div className="bzRow bzJob" key={j.id}>
    <span><b>{j.business}</b> · {j.role}<small>{j.status === 'OFFERED' ? 'Job offer' : j.status === 'FORMER' ? 'Former job' : j.onShift ? `🟢 on shift since ${new Date(j.shiftStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · earned so far ${naira(j.due)}` : 'off shift'} · {naira(j.wage)}/h{j.owed > 0 ? ` · owed ${naira(j.owed)}` : ''}</small></span>
    <span className="bzAct">
      {j.status === 'OFFERED' && <><button disabled={busy} onClick={() => run({ action: 'respond', offerId: j.id, accept: true }, () => 'You got the job!')}>Accept</button><button disabled={busy} onClick={() => run({ action: 'respond', offerId: j.id, accept: false }, () => 'Offer declined.')}>Decline</button></>}
      {j.status === 'ACTIVE' && !j.onShift && <button disabled={busy} onClick={() => run({ action: 'clockin', employeeId: j.id }, () => 'Clocked in. Stay at work and clock out to get paid.')}>Clock in</button>}
      {j.status === 'ACTIVE' && j.onShift && <button disabled={busy} onClick={() => run({ action: 'clockout', employeeId: j.id }, d => d.owed > 0 ? `Paid ${naira(d.paid)}. The business still owes you ${naira(d.owed)}.` : `Paid ${naira(d.paid)}.`)}>Clock out</button>}
      {j.owed > 0 && j.status !== 'OFFERED' && <button disabled={busy} onClick={() => run({ action: 'claim', employeeId: j.id }, d => d.paid ? `Collected ${naira(d.paid)}.` : 'The till is still empty.')}>Claim owed</button>}
      {j.status === 'ACTIVE' && <button className="bzGhost" disabled={busy} onClick={() => run({ action: 'quit', employeeId: j.id }, () => 'You quit.')}>Quit</button>}
    </span>
    <RuntimeStyle css={CSS} />
  </div>)}</div>;
}

const CSS = `
.bzBox{margin-top:7px;border-top:1px dashed #ffffff18;padding-top:6px}
.bzToggle{all:unset;cursor:pointer;font-size:11px;font-weight:800;color:#f3c56f}.bzToggle small{color:#91a99d;font-weight:400;margin-left:6px}
.bzBox h5{margin:9px 0 4px;font-size:11px;color:#fff}
.bzMuted{color:#91a99d;font-size:10px;margin:3px 0}
.bzRow{display:flex;justify-content:space-between;align-items:center;gap:6px;background:#0e1c17;border-radius:8px;padding:6px 8px;margin:4px 0;font-size:11px}
.bzRow small{display:block;color:#91a99d;font-size:9px;margin-top:2px}
.bzAct{display:flex;gap:4px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.bzAct input,.bzForm input,.bzForm select{background:#0a1511;color:#fff;border:1px solid #2a4337;border-radius:7px;padding:5px 6px;font-size:10px;width:80px}
.bzForm{display:flex;gap:5px;flex-wrap:wrap;align-items:center;margin:6px 0}.bzForm input:first-child{flex:1;min-width:100px}.bzForm .bzNum{width:70px}
.bzBox button:not(.bzToggle),.bzJob button{background:#d99a42;color:#171008;border:0;border-radius:8px;padding:6px 9px;font-weight:800;font-size:10px;cursor:pointer}
.bzBox button:disabled,.bzJob button:disabled{opacity:.5;cursor:default}
.bzJob button.bzGhost{background:#2a4337;color:#cfe3d8}
.bzSave{margin-top:6px}
`;
