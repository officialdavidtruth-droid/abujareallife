'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AD_SLOTS, DURATIONS, addDays, discountFor, naira, priceFor } from '../../lib/adSlots';

type Cfg = { slots: typeof AD_SLOTS; colors: string[]; today: string; maxAdvance: number; payments: boolean; booked: { slot: number; start: string; end: string }[] };
type Acc = { email: string; name: string; business: string; phone: string; admin: boolean };
type Bk = { id: string; slot: number; slotName: string; start: string; end: string; days: number; title: string; sub: string; contact: string; website: string; color: string; price: number; status: string; refund: string; note: string; holdUntil: string | null; createdAt: string; account?: { name: string; business: string; email: string; phone: string } };

async function api<T = any>(path: string, body?: unknown): Promise<T & { error?: string }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    const r = await fetch('/api/ads/' + path, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return await r.json().catch(() => ({ error: 'Unexpected reply from the server.' }));
  } catch { return { error: 'No connection. Check your internet and try again.' } as any; } // eslint-disable-line @typescript-eslint/no-explicit-any
}
const fmt = (ymd: string) => new Date(ymd + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const STATUS: Record<string, [string, string]> = { PENDING_PAYMENT: ['Waiting for payment', 'warn'], IN_REVIEW: ['Paid · in review', 'info'], APPROVED: ['Approved', 'ok'], REJECTED: ['Not accepted', 'bad'], CANCELLED: ['Cancelled', 'mute'] };

function Board({ title, sub, contact, color }: { title: string; sub: string; contact?: string; color: string }) {
  return <div className="abkBoard"><div className="abkFace" style={{ background: color }}><b>{title || 'YOUR HEADLINE'}</b><span>{sub || 'Your tagline goes here'}</span>{contact ? <small>{contact}</small> : null}</div><i className="abkPost l" /><i className="abkPost r" /></div>;
}

export default function AdBooking() {
  const [cfg, setCfg] = useState<Cfg | null>(null), [acc, setAcc] = useState<Acc | null | undefined>(undefined), [books, setBooks] = useState<Bk[]>([]);
  const [tab, setTab] = useState<'book' | 'mine' | 'admin'>('book'), [banner, setBanner] = useState<{ kind: 'ok' | 'bad' | 'info'; text: string } | null>(null);

  const refresh = useCallback(async () => { const m = await api('me'); setAcc(m.account || null); setBooks(m.bookings || []); }, []);
  useEffect(() => {
    (async () => {
      setCfg(await api('slots')); await refresh();
      const id = new URLSearchParams(location.search).get('paid');   // Paystack sends the advertiser back here
      if (id) {
        history.replaceState(null, '', '/adbooking'); setBanner({ kind: 'info', text: 'Checking your payment…' }); setTab('mine');
        const r = await api('verify', { id });
        setBanner({ kind: r.ok ? 'ok' : r.state === 'pending' ? 'info' : 'bad', text: r.error || r.message || 'Done.' }); await refresh();
      }
    })();
  }, [refresh]);

  if (!cfg || acc === undefined) return <main className="abk"><div className="abkLoad">Loading…</div></main>;
  return <main className="abk">
    <header className="abkTop"><a className="abkBrand" href="/adbooking"><span>▦</span> Abuja Real Life <em>Ads</em></a>
      <nav>{acc ? <><span className="abkWho">{acc.business}</span><button className="abkLink" onClick={async () => { await api('logout', {}); setAcc(null); setBooks([]); }}>Log out</button></> : null}<a className="abkLink" href="/">Play the game</a></nav></header>
    {banner && <div className={'abkBanner ' + banner.kind} role="status">{banner.text}<button aria-label="Dismiss" onClick={() => setBanner(null)}>×</button></div>}
    {!acc ? <Landing cfg={cfg} onAuth={a => { setAcc(a); refresh(); }} /> : <>
      <div className="abkTabs" role="tablist">
        <button role="tab" aria-selected={tab === 'book'} onClick={() => setTab('book')}>New booking</button>
        <button role="tab" aria-selected={tab === 'mine'} onClick={() => setTab('mine')}>My ads{books.length ? <i>{books.length}</i> : null}</button>
        {acc.admin && <button role="tab" aria-selected={tab === 'admin'} onClick={() => setTab('admin')}>Review queue</button>}
      </div>
      {tab === 'book' && <Book cfg={cfg} acc={acc} onError={t => setBanner({ kind: 'bad', text: t })} />}
      {tab === 'mine' && <Mine books={books} onChange={refresh} onMsg={(k, t) => setBanner({ kind: k, text: t })} goBook={() => setTab('book')} />}
      {tab === 'admin' && acc.admin && <Admin onMsg={(k, t) => setBanner({ kind: k, text: t })} />}
    </>}
    <footer className="abkFoot">Payments are processed securely by Paystack. Questions? Reply to your receipt email or contact the Abuja Real Life team.</footer>
  </main>;
}

/* ───────── logged out: pitch + sign up / log in ───────── */
function Landing({ cfg, onAuth }: { cfg: Cfg; onAuth: (a: Acc) => void }) {
  const [mode, setMode] = useState<'signup' | 'login'>('signup'), [f, setF] = useState({ name: '', business: '', phone: '', email: '', password: '' }), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const go = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setErr(''); const r = await api(mode, f); setBusy(false); if (r.error) setErr(r.error); else onAuth(r.account); };
  const low = Math.min(...cfg.slots.map(s => s.perDay));
  return <section className="abkHero">
    <div className="abkPitch">
      <p className="abkKicker">Billboard advertising</p>
      <h1>Put your business on the streets of Abuja Real Life.</h1>
      <p className="abkLead">Thousands of players drive, walk and shop past our city billboards every day. Pick a board, write your ad, pay securely and go live — from {naira(low)} a day.</p>
      <Board title="YOUR BRAND" sub="Seen by every player in the city" contact="WhatsApp 080 000 0000" color="#c9831f" />
      <ol className="abkSteps"><li><b>1</b> Create an account</li><li><b>2</b> Choose a board and dates</li><li><b>3</b> Write your ad and pay</li><li><b>4</b> We review it, then it goes live</li></ol>
    </div>
    <form className="abkCard" onSubmit={go}>
      <div className="abkSeg"><button type="button" aria-pressed={mode === 'signup'} onClick={() => setMode('signup')}>Sign up</button><button type="button" aria-pressed={mode === 'login'} onClick={() => setMode('login')}>Log in</button></div>
      {mode === 'signup' && <><label>Your name<input value={f.name} onChange={set('name')} autoComplete="name" required maxLength={60} /></label>
        <label>Business name<input value={f.business} onChange={set('business')} autoComplete="organization" required maxLength={80} /></label>
        <label>Phone / WhatsApp<input value={f.phone} onChange={set('phone')} autoComplete="tel" inputMode="tel" required maxLength={25} /></label></>}
      <label>Email<input type="email" value={f.email} onChange={set('email')} autoComplete="email" required /></label>
      <label>Password<input type="password" value={f.password} onChange={set('password')} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={mode === 'signup' ? 8 : 1} placeholder={mode === 'signup' ? 'At least 8 characters' : ''} /></label>
      {err && <p className="abkErr" role="alert">{err}</p>}
      <button className="abkBtn" disabled={busy}>{busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Log in'}</button>
      <p className="abkSmall">{mode === 'signup' ? 'Already advertise with us? ' : 'New here? '}<button type="button" className="abkLink" onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}>{mode === 'signup' ? 'Log in' : 'Create an account'}</button></p>
    </form>
    <div className="abkPrices"><h2>Boards and prices</h2><div className="abkGrid">{cfg.slots.map(s => <div key={s.index} className="abkRow"><div><b>{s.name}</b><small>{s.where} · {s.views}</small></div><strong>{naira(s.perDay)}<small>/day</small></strong></div>)}</div>
      <p className="abkSmall">Discounts: 7+ days 10% off · 14+ days 15% off · 30 days 20% off.</p></div>
  </section>;
}

/* ───────── new booking ───────── */
function Book({ cfg, acc, onError }: { cfg: Cfg; acc: Acc; onError: (t: string) => void }) {
  const [slot, setSlot] = useState(cfg.slots[0].index), [start, setStart] = useState(addDays(cfg.today, 1)), [days, setDays] = useState<number>(7);
  const [ad, setAd] = useState({ title: acc.business.slice(0, 28), sub: '', contact: acc.phone, website: '', color: cfg.colors[0] }), [terms, setTerms] = useState(false), [busy, setBusy] = useState(false);
  const s = cfg.slots.find(x => x.index === slot)!, price = priceFor(s, days), disc = discountFor(days), end = addDays(start, days - 1);
  const clash = useMemo(() => cfg.booked.some(b => b.slot === slot && b.start < addDays(start, days) && b.end > start), [cfg.booked, slot, start, days]);
  const setA = (k: keyof typeof ad) => (e: React.ChangeEvent<HTMLInputElement>) => setAd({ ...ad, [k]: e.target.value });
  const pay = async () => {
    setBusy(true); const r = await api('book', { slot, startDate: start, days, ...ad, terms });
    if (r.url) { location.href = r.url; return; } setBusy(false); onError(r.error || 'Could not start the payment.');
  };
  const ready = !clash && terms && ad.title.trim().length >= 2 && ad.sub.trim().length >= 2 && start >= cfg.today && start <= addDays(cfg.today, cfg.maxAdvance);
  return <section className="abkBook">
    <div className="abkCol">
      <h2><i>1</i> Choose a billboard</h2>
      <div className="abkSlots">{cfg.slots.map(x => <button key={x.index} type="button" aria-pressed={slot === x.index} onClick={() => setSlot(x.index)}><b>{x.name}</b><small>{x.where}</small><span>{x.views}</span><strong>{naira(x.perDay)}<small>/day</small></strong></button>)}</div>
      <h2><i>2</i> Pick your dates</h2>
      <div className="abkRowF"><label>Start date<input type="date" value={start} min={cfg.today} max={addDays(cfg.today, cfg.maxAdvance)} onChange={e => setStart(e.target.value)} /></label>
        <div className="abkChips" role="group" aria-label="How many days">{DURATIONS.map(d => <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>{d} {d === 1 ? 'day' : 'days'}</button>)}</div></div>
      <p className={clash ? 'abkErr' : 'abkSmall'}>{clash ? 'Some of these dates are already booked on this board. Try other dates or another board.' : `Shows ${fmt(start)} to ${fmt(end)}.`}</p>
      <h2><i>3</i> Write your ad</h2>
      <label>Headline <small>{ad.title.length}/28</small><input value={ad.title} onChange={setA('title')} maxLength={28} placeholder="Your business name or offer" /></label>
      <label>Tagline <small>{ad.sub.length}/44</small><input value={ad.sub} onChange={setA('sub')} maxLength={44} placeholder="One short line that sells" /></label>
      <div className="abkRowF"><label>Phone / WhatsApp on the board<input value={ad.contact} onChange={setA('contact')} maxLength={40} /></label><label>Website (optional)<input value={ad.website} onChange={setA('website')} maxLength={80} placeholder="yourbusiness.com" /></label></div>
      <div className="abkSw" role="group" aria-label="Board colour">{cfg.colors.map(c => <button key={c} type="button" style={{ background: c }} aria-label={'Colour ' + c} aria-pressed={ad.color === c} onClick={() => setAd({ ...ad, color: c })} />)}</div>
    </div>
    <aside className="abkSide">
      <h3>Preview</h3><Board {...ad} />
      <dl className="abkSum"><dt>Board</dt><dd>{s.name}</dd><dt>Dates</dt><dd>{fmt(start)} – {fmt(end)}</dd><dt>Price</dt><dd>{naira(s.perDay)} × {days} day{days === 1 ? '' : 's'}</dd>{disc ? <><dt>Discount</dt><dd>{disc}% off</dd></> : null}<dt className="tot">Total</dt><dd className="tot">{naira(price)}</dd></dl>
      <label className="abkChk"><input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} /><span>I confirm this is my own business and the ad follows the rules: no adult, gambling-bonus, get-rich-quick, abusive or illegal content. Ads are reviewed before they go live; if we cannot accept yours you are refunded in full. Approved ads are not refundable.</span></label>
      <button className="abkBtn" disabled={!ready || busy} onClick={pay}>{busy ? 'Opening Paystack…' : `Pay ${naira(price)} with Paystack`}</button>
      {!cfg.payments && <p className="abkErr">Online payment is not switched on yet.</p>}
      <p className="abkSmall">You will pay on Paystack by card, bank transfer or USSD, then come back here. Your dates are held for 1 hour while you pay.</p>
    </aside>
  </section>;
}

/* ───────── my ads ───────── */
function Mine({ books, onChange, onMsg, goBook }: { books: Bk[]; onChange: () => void; onMsg: (k: 'ok' | 'bad' | 'info', t: string) => void; goBook: () => void }) {
  const [busy, setBusy] = useState('');
  const act = async (id: string, what: 'pay' | 'cancel') => { setBusy(id); const r = await api(what, { id }); setBusy(''); if (r.url) { location.href = r.url; return; } if (r.error) onMsg('bad', r.error); else onMsg('ok', 'Booking cancelled.'); onChange(); };
  if (!books.length) return <section className="abkEmpty"><p>You have no ads yet.</p><button className="abkBtn" onClick={goBook}>Book your first billboard</button></section>;
  return <section className="abkList">{books.map(b => { const [label, cls] = STATUS[b.status] || [b.status, 'mute']; return <article key={b.id} className="abkItem">
    <Board title={b.title} sub={b.sub} contact={b.contact} color={b.color} />
    <div className="abkInfo"><div className="abkHead"><b>{b.slotName}</b><span className={'abkPill ' + cls}>{label}</span></div>
      <p>{fmt(b.start)} – {fmt(b.end)} · {b.days} day{b.days === 1 ? '' : 's'} · <b>{naira(b.price)}</b></p>
      {b.status === 'IN_REVIEW' && <p className="abkSmall">We are checking your ad. This usually takes under 24 hours. It goes live on your start date once approved.</p>}
      {b.status === 'APPROVED' && <p className="abkSmall">Approved. It shows on the board from {fmt(b.start)}.</p>}
      {b.status === 'REJECTED' && <p className="abkErr">{b.note || 'Not accepted.'}{b.refund ? (b.refund.startsWith('FAILED') ? ' We will complete your refund manually within 2 working days.' : ' Your refund has been requested; banks can take a few days.') : ''}</p>}
      {b.status === 'PENDING_PAYMENT' && <div className="abkAct"><button className="abkBtn sm" disabled={busy === b.id} onClick={() => act(b.id, 'pay')}>Pay {naira(b.price)}</button><button className="abkBtn ghost sm" disabled={busy === b.id} onClick={() => act(b.id, 'cancel')}>Cancel</button></div>}
    </div></article>; })}</section>;
}

/* ───────── reviewers ───────── */
function Admin({ onMsg }: { onMsg: (k: 'ok' | 'bad' | 'info', t: string) => void }) {
  const [rows, setRows] = useState<Bk[] | null>(null), [rev, setRev] = useState(0), [note, setNote] = useState<Record<string, string>>({}), [busy, setBusy] = useState('');
  const load = useCallback(async () => { const r = await api('admin'); if (r.error) onMsg('bad', r.error); else { setRows(r.bookings); setRev(r.revenue); } }, [onMsg]);
  useEffect(() => { load(); }, [load]);
  const decide = async (id: string, decision: 'approve' | 'reject') => { setBusy(id); const r = await api('review', { id, decision, note: note[id] || '' }); setBusy(''); if (r.error) onMsg('bad', r.error); else onMsg('ok', decision === 'approve' ? 'Approved. It will show in the game from its start date.' : r.refund === 'REQUESTED' ? 'Rejected and refund requested.' : 'Rejected. The automatic refund failed (' + r.refund + '): refund it in the Paystack dashboard.'); load(); };
  if (!rows) return <div className="abkLoad">Loading…</div>;
  const todo = rows.filter(r => r.status === 'IN_REVIEW'), rest = rows.filter(r => r.status !== 'IN_REVIEW');
  return <section className="abkList"><p className="abkSmall">Paid and approved revenue so far: <b>{naira(rev)}</b> · {todo.length} waiting for review</p>
    {[...todo, ...rest].map(b => <article key={b.id} className="abkItem">
      <Board title={b.title} sub={b.sub} contact={b.contact} color={b.color} />
      <div className="abkInfo"><div className="abkHead"><b>{b.slotName}</b><span className={'abkPill ' + (STATUS[b.status]?.[1] || 'mute')}>{STATUS[b.status]?.[0] || b.status}</span></div>
        <p>{fmt(b.start)} – {fmt(b.end)} · {b.days}d · <b>{naira(b.price)}</b></p>
        <p className="abkSmall">{b.account?.business} · {b.account?.name} · {b.account?.phone} · {b.account?.email}{b.website ? ' · ' + b.website : ''}</p>
        {b.refund && <p className={b.refund.startsWith('FAILED') ? 'abkErr' : 'abkSmall'}>Refund: {b.refund}</p>}
        {(b.status === 'IN_REVIEW' || b.status === 'APPROVED') && <div className="abkAct"><input placeholder="Reason (needed to reject)" value={note[b.id] || ''} onChange={e => setNote({ ...note, [b.id]: e.target.value })} />
          {b.status === 'IN_REVIEW' && <button className="abkBtn sm" disabled={busy === b.id} onClick={() => decide(b.id, 'approve')}>Approve</button>}
          <button className="abkBtn ghost sm" disabled={busy === b.id} onClick={() => decide(b.id, 'reject')}>Reject + refund</button></div>}
      </div></article>)}
    {!rows.length && <p className="abkSmall">No paid bookings yet.</p>}</section>;
}
