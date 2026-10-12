'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MIN_PAID_PER_DAY, discountFor, naira, priceFor, priceLabel, type AdSlot } from '../../lib/adSlots';
import AdBoard from '../adbooking/AdBoard';

/* abujareallife.online/adminad: review and approve ads, and set what each billboard costs (0 = free).
   Sign in with an advertiser account whose email is listed in ADMIN_EMAILS. Every action is checked again on the server. */
type Acc = { email: string; name: string; business: string; admin: boolean };
type Bk = { id: string; slot: number; slotName: string; start: string; end: string; days: number; title: string; sub: string; contact: string; website: string; color: string; price: number; img: string; status: string; refund: string; note: string; createdAt: string; account?: { name: string; business: string; email: string; phone: string } };
type Msg = { kind: 'ok' | 'bad' | 'info'; text: string } | null;

async function api<T = any>(path: string, body?: unknown): Promise<T & { error?: string }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    const r = await fetch('/api/ads/' + path, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return await r.json().catch(() => ({ error: 'Unexpected reply from the server.' }));
  } catch { return { error: 'No connection. Check your internet and try again.' } as any; } // eslint-disable-line @typescript-eslint/no-explicit-any
}
const fmt = (ymd: string) => new Date(ymd + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const STATUS: Record<string, [string, string]> = { PENDING_PAYMENT: ['Waiting for payment', 'warn'], IN_REVIEW: ['Needs review', 'info'], APPROVED: ['Approved', 'ok'], REJECTED: ['Rejected', 'bad'], CANCELLED: ['Cancelled', 'mute'] };

export default function AdminAd() {
  const [acc, setAcc] = useState<Acc | null | undefined>(undefined), [tab, setTab] = useState<'review' | 'all' | 'prices'>('review'), [msg, setMsg] = useState<Msg>(null);
  const [rows, setRows] = useState<Bk[] | null>(null), [rev, setRev] = useState(0), [slots, setSlots] = useState<AdSlot[]>([]);

  const loadAll = useCallback(async () => {
    const a = await api('admin'); if (a.error) { setMsg({ kind: 'bad', text: a.error }); return; } setRows(a.bookings); setRev(a.revenue);
    const c = await api('slots'); if (Array.isArray(c.slots)) setSlots(c.slots);
  }, []);
  useEffect(() => { (async () => { const m = await api('me'); setAcc(m.account || null); if (m.account?.admin) loadAll(); })(); }, [loadAll]);

  if (acc === undefined) return <main className="abk"><div className="abkLoad">Loading…</div></main>;
  const top = <header className="abkTop"><a className="abkBrand" href="/adminad"><span>▦</span> Abuja Real Life <em>Ad admin</em></a>
    <nav>{acc ? <><span className="abkWho">{acc.email}</span><button className="abkLink" onClick={async () => { await api('logout', {}); setAcc(null); setRows(null); }}>Log out</button></> : null}<a className="abkLink" href="/adbooking">Advertiser page</a></nav></header>;

  if (!acc) return <main className="abk">{top}<Login onDone={a => { setAcc(a); if (a.admin) loadAll(); }} /></main>;
  if (!acc.admin) return <main className="abk">{top}<div className="abkLoad"><h2>This account is not an admin</h2><p>Add <b>{acc.email}</b> to the ADMIN_EMAILS setting in Vercel, redeploy, then log in again.</p></div></main>;

  const todo = (rows || []).filter(r => r.status === 'IN_REVIEW'), live = (rows || []).filter(r => r.status === 'APPROVED').length;
  return <main className="abk">{top}
    {msg && <div className={'abkBanner ' + msg.kind} role="status">{msg.text}<button aria-label="Dismiss" onClick={() => setMsg(null)}>×</button></div>}
    <div className="abkTabs" role="tablist">
      <button role="tab" aria-selected={tab === 'review'} onClick={() => setTab('review')}>To review{todo.length ? <i>{todo.length}</i> : null}</button>
      <button role="tab" aria-selected={tab === 'all'} onClick={() => setTab('all')}>All ads</button>
      <button role="tab" aria-selected={tab === 'prices'} onClick={() => setTab('prices')}>Prices</button>
    </div>
    {!rows ? <div className="abkLoad">Loading…</div> : <>
      <div className="abkStats" style={{ marginTop: 18 }}><div><b>{todo.length}</b>waiting for review</div><div><b>{live}</b>approved</div><div><b>{naira(rev)}</b>paid or approved so far</div></div>
      {tab === 'review' && <Queue rows={todo} onMsg={(k, t) => setMsg({ kind: k, text: t })} reload={loadAll} empty="Nothing waiting. New ads show up here as soon as they are paid for (or submitted, when a board is free)." />}
      {tab === 'all' && <All rows={rows} onMsg={(k, t) => setMsg({ kind: k, text: t })} reload={loadAll} />}
      {tab === 'prices' && <Prices slots={slots} onMsg={(k, t) => setMsg({ kind: k, text: t })} reload={loadAll} />}
    </>}
  </main>;
}

function Login({ onDone }: { onDone: (a: Acc) => void }) {
  const [f, setF] = useState({ email: '', password: '' }), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const go = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setErr(''); const r = await api('login', f); setBusy(false); if (r.error) setErr(r.error); else onDone(r.account); };
  return <section style={{ display: 'grid', placeItems: 'center', paddingTop: 48 }}><form className="abkCard" style={{ position: 'static', width: 'min(420px,100%)' }} onSubmit={go}>
    <h2 style={{ fontSize: 26 }}>Admin sign in</h2>
    <label>Email<input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} autoComplete="email" required /></label>
    <label>Password<input type="password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} autoComplete="current-password" required /></label>
    {err && <p className="abkErr" role="alert">{err}</p>}
    <button className="abkBtn" disabled={busy}>{busy ? 'Please wait…' : 'Log in'}</button>
    <p className="abkSmall">Use the advertiser account whose email is in ADMIN_EMAILS. No account yet? Create one at /adbooking first.</p>
  </form></section>;
}

function Queue({ rows, onMsg, reload, empty }: { rows: Bk[]; onMsg: (k: 'ok' | 'bad' | 'info', t: string) => void; reload: () => void; empty: string }) {
  const [note, setNote] = useState<Record<string, string>>({}), [busy, setBusy] = useState('');
  const decide = async (id: string, decision: 'approve' | 'reject') => {
    setBusy(id); const r = await api('review', { id, decision, note: note[id] || '' }); setBusy('');
    if (r.error) onMsg('bad', r.error);
    else onMsg('ok', decision === 'approve' ? 'Approved. It shows in the game from its start date.' : r.refund === 'NONE' ? 'Rejected (it was a free ad, nothing to refund).' : r.refund === 'REQUESTED' ? 'Rejected and the refund was requested.' : 'Rejected, but the automatic refund failed (' + r.refund + '). Refund it in the Paystack dashboard.');
    reload();
  };
  if (!rows.length) return <p className="abkSmall" style={{ paddingTop: 20 }}>{empty}</p>;
  return <section className="abkList">{rows.map(b => <article key={b.id} className="abkItem" style={{ gridTemplateColumns: 'minmax(0,440px) 1fr' }}>
    <div><AdBoard title={b.title} sub={b.sub} contact={b.contact} color={b.color} img={b.img} />{b.img && <a className="abkZoom abkLink" href={b.img} target="_blank" rel="noreferrer">Open the flyer full size</a>}</div>
    <div className="abkInfo"><div className="abkHead"><b>{b.slotName}</b><span className={'abkPill ' + (b.price <= 0 ? 'free' : STATUS[b.status]?.[1] || 'mute')}>{b.price <= 0 ? 'FREE ad' : naira(b.price)}</span></div>
      <p>{fmt(b.start)} – {fmt(b.end)} · {b.days} day{b.days === 1 ? '' : 's'}</p>
      <p><b>{b.title}</b>{!b.img && b.sub ? ' · ' + b.sub : ''}</p>
      <p className="abkSmall">{b.account?.business} · {b.account?.name} · {b.account?.phone} · {b.account?.email}{b.website ? ' · ' + b.website : ''}</p>
      <div className="abkAct"><input placeholder="Reason (needed to reject)" value={note[b.id] || ''} onChange={e => setNote({ ...note, [b.id]: e.target.value })} maxLength={300} />
        <button className="abkBtn sm" disabled={busy === b.id} onClick={() => decide(b.id, 'approve')}>Approve</button>
        <button className="abkBtn ghost sm" disabled={busy === b.id} onClick={() => decide(b.id, 'reject')}>{b.price > 0 ? 'Reject + refund' : 'Reject'}</button></div>
    </div></article>)}</section>;
}

function All({ rows, onMsg, reload }: { rows: Bk[]; onMsg: (k: 'ok' | 'bad' | 'info', t: string) => void; reload: () => void }) {
  const [f, setF] = useState('ALL'), [note, setNote] = useState<Record<string, string>>({}), [busy, setBusy] = useState('');
  const shown = useMemo(() => (f === 'ALL' ? rows : rows.filter(r => r.status === f)), [rows, f]);
  const takeDown = async (id: string) => {
    if (!confirm('Take this ad down? A paid ad is refunded automatically.')) return;
    setBusy(id); const r = await api('review', { id, decision: 'reject', note: note[id] || '' }); setBusy('');
    if (r.error) onMsg('bad', r.error); else onMsg('ok', r.refund && r.refund !== 'NONE' && r.refund !== 'REQUESTED' ? 'Taken down, but the refund failed (' + r.refund + '). Refund it in Paystack.' : 'Taken down.'); reload();
  };
  return <section className="abkList">
    <div className="abkFilters" role="group" aria-label="Filter">{[['ALL', 'All'], ['IN_REVIEW', 'Needs review'], ['APPROVED', 'Approved'], ['REJECTED', 'Rejected']].map(([k, l]) => <button key={k} aria-pressed={f === k} onClick={() => setF(k)}>{l}</button>)}</div>
    {!shown.length && <p className="abkSmall">Nothing here.</p>}
    {shown.map(b => <article key={b.id} className="abkItem">
      <div><AdBoard title={b.title} sub={b.sub} contact={b.contact} color={b.color} img={b.img} />{b.img && <a className="abkZoom abkLink" href={b.img} target="_blank" rel="noreferrer">Open the flyer full size</a>}</div>
      <div className="abkInfo"><div className="abkHead"><b>{b.slotName}</b><span className={'abkPill ' + (STATUS[b.status]?.[1] || 'mute')}>{STATUS[b.status]?.[0] || b.status}</span></div>
        <p>{fmt(b.start)} – {fmt(b.end)} · {b.days}d · <b>{priceLabel(b.price)}</b></p>
        <p className="abkSmall">{b.account?.business} · {b.account?.name} · {b.account?.phone} · {b.account?.email}</p>
        {b.note && <p className="abkSmall">Note: {b.note}</p>}
        {b.refund && <p className={b.refund.startsWith('FAILED') ? 'abkErr' : 'abkSmall'}>Refund: {b.refund}</p>}
        {b.status === 'APPROVED' && <div className="abkAct"><input placeholder="Reason (needed to take down)" value={note[b.id] || ''} onChange={e => setNote({ ...note, [b.id]: e.target.value })} maxLength={300} /><button className="abkBtn ghost sm" disabled={busy === b.id || (note[b.id] || '').trim().length < 3} onClick={() => takeDown(b.id)}>Take down</button></div>}
        {b.status === 'IN_REVIEW' && <p className="abkSmall">Open the “To review” tab to approve or reject this one.</p>}
      </div></article>)}
  </section>;
}

function Prices({ slots, onMsg, reload }: { slots: AdSlot[]; onMsg: (k: 'ok' | 'bad' | 'info', t: string) => void; reload: () => void }) {
  const [val, setVal] = useState<Record<number, string>>({}), [busy, setBusy] = useState<number | null>(null);
  const save = async (slot: number, perDay: number) => {
    setBusy(slot); const r = await api('setprice', { slot, perDay }); setBusy(null);
    if (r.error) { onMsg('bad', r.error); return; }
    setVal(v => { const n = { ...v }; delete n[slot]; return n; }); onMsg('ok', perDay === 0 ? 'That billboard is now free.' : 'Price saved: ' + naira(perDay) + ' per day.'); reload();
  };
  return <section className="abkList">
    <p className="abkSmall">Set what each billboard costs per day. <b>0 makes it free</b> (advertisers then skip payment and go straight to your review queue). A paid price must be at least {naira(MIN_PAID_PER_DAY)} a day. Changes apply to new bookings; bookings already made keep the price they were made at. Multi-day discounts still apply: 7+ days {discountFor(7)}% off, 14+ days {discountFor(14)}%, 30 days {discountFor(30)}%.</p>
    {slots.map(s => { const typed = val[s.index], n = typed === undefined ? s.perDay : Math.round(Number(typed)), valid = Number.isFinite(n) && n >= 0 && (n === 0 || n >= MIN_PAID_PER_DAY), changed = typed !== undefined && n !== s.perDay;
      return <div key={s.index} className="abkPrice">
        <div><b>{s.name}</b> <span className={'abkPill ' + (s.perDay <= 0 ? 'free' : 'mute')}>{s.perDay <= 0 ? 'FREE now' : naira(s.perDay) + '/day'}</span><br /><small>{s.where} · {s.views}</small>
          {valid && <><br /><small>{n === 0 ? '7 days costs nothing.' : `7 days = ${naira(priceFor({ ...s, perDay: n }, 7))} · 30 days = ${naira(priceFor({ ...s, perDay: n }, 30))}`}</small></>}</div>
        <div className="abkAct"><input inputMode="numeric" aria-label={'Price per day for ' + s.name} value={typed ?? String(s.perDay)} onChange={e => setVal({ ...val, [s.index]: e.target.value.replace(/[^\d]/g, '') })} />
          <button className="abkBtn sm" disabled={busy === s.index || !changed || !valid} onClick={() => save(s.index, n)}>Save</button>
          <button className="abkBtn ghost sm" disabled={busy === s.index || s.perDay === 0} onClick={() => save(s.index, 0)}>Make free</button></div>
      </div>; })}
  </section>;
}
