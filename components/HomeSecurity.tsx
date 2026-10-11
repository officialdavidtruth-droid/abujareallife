'use client';
import { useCallback, useEffect, useState } from 'react';
import { GUARDS, NO_SEC, type Guard, type Sec } from '../lib/security';
import { loadHouses } from '../lib/houses';
import RuntimeStyle from './RuntimeStyle';

/* Protect your house: hire guard dogs and security guards that patrol your plot (everybody can see them) and cut a burglar's chance (app/api/security). */
const naira = (n: number) => '₦' + Math.round(n).toLocaleString('en-NG');
export default function HomeSecurity({ onClose, onChange }: { onClose: () => void; onChange?: (cash: number) => void }) {
  const [list, setList] = useState<Guard[]>(GUARDS), [owned, setOwned] = useState<Sec>(NO_SEC), [cash, setCash] = useState<number | null>(null), [odds, setOdds] = useState<number | null>(null), [busy, setBusy] = useState(''), [pick, setPick] = useState(''), [note, setNote] = useState<{ t: string; bad?: boolean } | null>(null);
  const say = (t: string, bad = false) => { setNote({ t, bad }); setTimeout(() => setNote(n => (n && n.t === t ? null : n)), 3500); };
  const apply = useCallback((d: { owned: Sec; cash: number; intruderOdds: number; catalog?: Guard[] }) => { setOwned(d.owned); setCash(d.cash); setOdds(d.intruderOdds); if (d.catalog) setList(d.catalog); onChange?.(d.cash); }, [onChange]);
  useEffect(() => { (async () => { try { const r = await fetch('/api/security', { cache: 'no-store' }); if (r.ok) apply(await r.json()); } catch { /* offline */ } })(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function buy(g: Guard) {
    if (busy) return; setBusy(g.id); setPick('');
    try { const r = await fetch('/api/security', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: g.id }) }), d = await r.json().catch(() => ({}));
      if (!r.ok) say(d.error || 'Could not hire them.', true); else { apply(d); loadHouses(); say(`${g.e} ${d.bought} is now on patrol at your house!`); }   // reload the street so the new guard shows up on your plot now
    } catch { say('No connection.', true); } finally { setBusy(''); }
  }
  return <div className="hsWrap" onClick={onClose}><div className="hsBox" onClick={e => e.stopPropagation()}>
    <RuntimeStyle css={CSS} id="arl-homesec" />
    <div className="hsHead"><div><h3>🛡️ Home security</h3><small>{cash == null ? 'Loading…' : `Your cash: ${naira(cash)}`}</small></div><button onClick={onClose} aria-label="Close">×</button></div>
    <p className="hsInfo">Other players can break into your house and take a cut of your cash while you are out. Guards patrol your plot where everybody can see them, and the more you have, the worse a burglar&apos;s odds.</p>
    {odds != null && <div className="hsOdds"><span>A stranger&apos;s chance of getting in</span><i><u style={{ width: odds + '%', background: odds >= 70 ? '#ef4444' : odds >= 45 ? '#f59e0b' : '#22c55e' }} /></i><b>{odds}%</b></div>}
    {note && <div className={'hsNote' + (note.bad ? ' bad' : '')}>{note.t}</div>}
    <div className="hsList">{list.map(g => { const n = owned[g.id], full = n >= g.max, locked = !!g.needs && owned[g.needs] < 1, poor = cash != null && cash < g.price;
      return <div key={g.id} className={'hsCard' + (n ? ' own' : '')}>
        <i>{g.e}</i><div><b>{g.name} <em>{n}/{g.max}</em></b><span>{g.blurb}</span></div>
        <div className="hsBuy"><strong>{naira(g.price)}</strong>{full ? <em>FULL ✓</em> : locked ? <small>Hire a {list.find(x => x.id === g.needs)?.name.toLowerCase()} first</small> : pick === g.id ? <><button className="go" disabled={!!busy} onClick={() => buy(g)}>Confirm</button><button onClick={() => setPick('')}>No</button></> : <button disabled={!!busy || poor} onClick={() => setPick(g.id)}>{poor ? 'Too pricey' : 'Hire'}</button>}</div></div>; })}</div>
    <small className="hsFoot">Guards start work straight away and stay for good. If one catches a burglar, you get a message.</small>
  </div></div>;
}
const CSS = `.hsWrap{position:fixed;inset:0;z-index:80;background:#000a;display:grid;place-items:center;padding:10px;backdrop-filter:blur(3px)}
.hsBox{width:min(560px,100%);max-height:calc(100dvh - 24px);display:flex;flex-direction:column;gap:8px;background:#0f1b16;color:#fff;border:1px solid #ffffff22;border-radius:18px;padding:14px;font-family:Inter,system-ui,sans-serif}
.hsHead{display:flex;justify-content:space-between;align-items:flex-start}.hsHead h3{margin:0;font-size:18px}.hsHead small{color:#9fb5aa;font-size:11px}.hsHead button{background:#20372d;border:0;color:#fff;border-radius:50%;width:32px;height:32px;font-size:18px}
.hsInfo{margin:0;color:#c3d6cb;font-size:12px;line-height:1.4}.hsOdds{display:grid;grid-template-columns:1fr auto;gap:4px 8px;align-items:center;font-size:11px;color:#c3d6cb}.hsOdds i{grid-column:1/-1;grid-row:2;display:block;height:8px;border-radius:4px;background:#ffffff1f;overflow:hidden}.hsOdds u{display:block;height:100%;transition:width .3s}.hsOdds b{color:#fff;font-size:13px}
.hsNote{background:#1f3a2e;border:1px solid #ffffff22;border-radius:10px;padding:7px 10px;font-size:12px}.hsNote.bad{background:#4a1f22;border-color:#e5484d66}
.hsList{flex:1;min-height:120px;overflow:auto;display:flex;flex-direction:column;gap:7px}
.hsCard{display:flex;align-items:center;gap:10px;background:#10201a;border:1px solid #ffffff14;border-radius:14px;padding:10px}.hsCard.own{border-color:#d99a42}.hsCard>i{flex:none;font-style:normal;font-size:28px;width:40px;text-align:center}.hsCard>div:nth-child(2){flex:1;min-width:0}.hsCard b{display:block;font-size:14px}.hsCard b em{font-style:normal;color:#d99a42;font-size:11px;margin-left:4px}.hsCard span{display:block;color:#c3d6cb;font-size:11px;margin-top:2px;line-height:1.3}
.hsBuy{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:5px;max-width:130px}.hsBuy strong{font-size:13px;color:#ffd9a0}.hsBuy small{color:#9fb5aa;font-size:10px;text-align:right}.hsBuy button{background:#20372d;color:#fff;border:0;border-radius:10px;padding:7px 12px;font-weight:800;font-size:12px}.hsBuy button.go{background:#d99a42;color:#1a1208}.hsBuy button:disabled{opacity:.5}.hsBuy em{font-style:normal;color:#d99a42;font-weight:900;font-size:11px}
.hsFoot{color:#7f968b;font-size:10px;text-align:center}`;
