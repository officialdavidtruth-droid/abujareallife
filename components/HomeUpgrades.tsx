'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Upgrade } from '../lib/homeUpgrades';
import RuntimeStyle from './RuntimeStyle';

/* Upgrade your home: build rooms and add luxury items. */
const naira = (n: number) => '₦' + Math.round(n).toLocaleString('en-NG');
export default function HomeUpgrades({ onClose, onChange }: { onClose: () => void; onChange: (owned: string[], cash: number) => void }) {
  const [list, setList] = useState<Upgrade[]>([]), [owned, setOwned] = useState<string[]>([]), [cash, setCash] = useState<number | null>(null), [busy, setBusy] = useState(''), [pick, setPick] = useState(''), [note, setNote] = useState<{ t: string; bad?: boolean } | null>(null);
  const say = (t: string, bad = false) => { setNote({ t, bad }); setTimeout(() => setNote(n => (n && n.t === t ? null : n)), 3500); };
  const load = useCallback(async () => { try { const r = await fetch('/api/home', { cache: 'no-store' }); if (r.ok) { const d = await r.json(); setList(d.catalog); setOwned(d.owned); setCash(d.cash); onChange(d.owned, d.cash); } } catch { /* offline */ } }, [onChange]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function buy(u: Upgrade) {
    if (busy) return; setBusy(u.id); setPick('');
    try { const r = await fetch('/api/home', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: u.id }) }), d = await r.json().catch(() => ({}));
      if (!r.ok) say(d.error || 'Could not build it.', true); else { setOwned(d.owned); setCash(d.cash); onChange(d.owned, d.cash); say(`✨ ${d.bought} added to your home!`); }
    } catch { say('No connection.', true); } finally { setBusy(''); }
  }
  const group = (kind: Upgrade['kind'], title: string) => <>
    <h4>{title}</h4>
    {list.filter(u => u.kind === kind).map(u => { const has = owned.includes(u.id), locked = !!u.needs && !owned.includes(u.needs), poor = cash != null && cash < u.price; return <div key={u.id} className={'huCard' + (has ? ' own' : '')}>
      <i>{u.e}</i><div><b>{u.name}</b><span>{u.blurb}</span></div>
      <div className="huBuy"><strong>{naira(u.price)}</strong>{has ? <em>BUILT ✓</em> : locked ? <small>Needs the {list.find(x => x.id === u.needs)?.name}</small> : pick === u.id ? <><button className="go" disabled={!!busy} onClick={() => buy(u)}>Confirm</button><button onClick={() => setPick('')}>No</button></> : <button disabled={!!busy || poor} onClick={() => setPick(u.id)}>{poor ? 'Too pricey' : 'Build'}</button>}</div></div>; })}</>;
  return <div className="huWrap" onClick={onClose}><div className="huBox" onClick={e => e.stopPropagation()}>
    <RuntimeStyle css={CSS} id="arl-homeupg" />
    <div className="huHead"><div><h3>🏗️ Upgrade your home</h3><small>{cash == null ? 'Loading…' : `Your cash: ${naira(cash)}`}</small></div><button onClick={onClose} aria-label="Close">×</button></div>
    {note && <div className={'huNote' + (note.bad ? ' bad' : '')}>{note.t}</div>}
    <div className="huList">{group('room', '🧱 Rooms')}{group('luxury', '💎 Luxury items')}</div>
    <small className="huFoot">Upgrades are permanent and appear straight away in your home.</small>
  </div></div>;
}
const CSS = `.huWrap{position:fixed;inset:0;z-index:80;background:#000a;display:grid;place-items:center;padding:10px;backdrop-filter:blur(3px)}
.huBox{width:min(560px,100%);max-height:calc(100vh - 24px);display:flex;flex-direction:column;gap:8px;background:#0f1b16;color:#fff;border:1px solid #ffffff22;border-radius:18px;padding:14px;font-family:Inter,system-ui,sans-serif}
.huHead{display:flex;justify-content:space-between;align-items:flex-start}.huHead h3{margin:0;font-size:18px}.huHead small{color:#9fb5aa;font-size:11px}.huHead button{background:#20372d;border:0;color:#fff;border-radius:50%;width:32px;height:32px;font-size:18px}
.huNote{background:#1f3a2e;border:1px solid #ffffff22;border-radius:10px;padding:7px 10px;font-size:12px}.huNote.bad{background:#4a1f22;border-color:#e5484d66}
.huList{flex:1;min-height:140px;overflow:auto;display:flex;flex-direction:column;gap:7px}.huList h4{margin:6px 0 0;font-size:12px;color:#d99a42;letter-spacing:.04em}
.huCard{display:flex;align-items:center;gap:10px;background:#10201a;border:1px solid #ffffff14;border-radius:14px;padding:10px}.huCard.own{border-color:#d99a42}.huCard>i{flex:none;font-style:normal;font-size:28px;width:40px;text-align:center}.huCard>div:nth-child(2){flex:1;min-width:0}.huCard b{display:block;font-size:14px}.huCard span{display:block;color:#c3d6cb;font-size:11px;margin-top:2px;line-height:1.3}
.huBuy{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:5px;max-width:130px}.huBuy strong{font-size:13px;color:#ffd9a0}.huBuy small{color:#9fb5aa;font-size:10px;text-align:right}.huBuy button{background:#20372d;color:#fff;border:0;border-radius:10px;padding:7px 12px;font-weight:800;font-size:12px}.huBuy button.go{background:#d99a42;color:#1a1208}.huBuy button:disabled{opacity:.5}.huBuy em{font-style:normal;color:#d99a42;font-weight:900;font-size:11px}
.huFoot{color:#7f968b;font-size:10px;text-align:center}`;
