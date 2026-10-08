'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CATS } from '../lib/catalog';
import RuntimeStyle from './RuntimeStyle';

/* "My Stuff": everything you own (items, vehicles, properties) in one place, with selling. Values come from the server (lib/sell.ts). */
type Item = { id: string; qty: number; name: string; e: string; cat: string; cost: number; sell: number };
type Veh = { id: string; name: string; type: string; price: number; condition: number; fuel: number; sell: number };
type Prop = { id: string; name: string; district: string; type: string; price: number; rent: number; sell: number };
type Data = { items: Item[]; vehicles: Veh[]; properties: Prop[]; cash: number };
const naira = (n: number) => '₦' + Math.round(n).toLocaleString();
const call = async (body: object) => { try { const r = await fetch('/api/inventory', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { ok: r.ok, d: await r.json().catch(() => ({})) as any }; } catch { return { ok: false, d: { error: 'No connection.' } as any }; } };
const VEH_E: Record<string, string> = { CAR: '🚗', SUV: '🚙', MOTORCYCLE: '🏍️', BUS: '🚌' }, PROP_E: Record<string, string> = { ROOM: '🛏️', APARTMENT: '🏢', HOUSE: '🏠', MANSION: '🏰' };

export default function Inventory({ onClose, onCash }: { onClose: () => void; onCash: (n: number) => void }) {
  const [data, setData] = useState<Data | null>(null), [tab, setTab] = useState<'items' | 'vehicles' | 'properties'>('items'), [cat, setCat] = useState(''), [q, setQ] = useState('');
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false), [qtys, setQtys] = useState<Record<string, number>>({}), [confirm, setConfirm] = useState('');
  const say = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 4000); };
  const load = useCallback(async () => { try { const r = await fetch('/api/inventory', { cache: 'no-store' }); if (r.ok) { const d = await r.json(); setData(d); onCash(d.cash); } } catch { /* offline: keep what we have */ } }, [onCash]);
  useEffect(() => { load(); }, [load]);

  const sell = async (kind: 'item' | 'vehicle' | 'property', id: string, qty = 1) => {
    if (busy) return; setBusy(true); const r = await call({ action: 'sell', kind, id, qty }); setBusy(false); setConfirm('');
    if (!r.ok) return say('⛔ ' + (r.d.error || 'Could not sell that.'));
    setData({ items: r.d.items, vehicles: r.d.vehicles, properties: r.d.properties, cash: r.d.cash }); onCash(r.d.cash); say(`💰 Sold ${r.d.label} for ${naira(r.d.gained)}`);
  };
  const shown = useMemo(() => (data?.items || []).filter(x => (!cat || x.cat === cat) && (!q || x.name.toLowerCase().includes(q.toLowerCase()))), [data, cat, q]);
  const worth = useMemo(() => data ? data.items.reduce((a, x) => a + x.sell * x.qty, 0) + data.vehicles.reduce((a, v) => a + v.sell, 0) + data.properties.reduce((a, p) => a + p.sell, 0) : 0, [data]);
  const count = (data?.items.reduce((a, x) => a + x.qty, 0) || 0);

  return <div className="ivWrap" onClick={onClose}><div className="ivBox" onClick={e => e.stopPropagation()}>
    <RuntimeStyle css={CSS} id="arl-inventory" />
    <div className="ivHead"><div><h3>🎒 My Stuff</h3><small>{data ? `${naira(data.cash)} cash · worth ${naira(worth)} if sold` : 'Loading…'}</small></div><button className="ivX" onClick={onClose} aria-label="Close">×</button></div>
    <div className="ivTabs">{([['items', `📦 Items${count ? ` (${count})` : ''}`], ['vehicles', `🚗 Vehicles${data?.vehicles.length ? ` (${data.vehicles.length})` : ''}`], ['properties', `🏠 Properties${data?.properties.length ? ` (${data.properties.length})` : ''}`]] as const).map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); setConfirm(''); }}>{l}</button>)}</div>
    {msg && <div className="ivMsg">{msg}</div>}

    {tab === 'items' && <>
      <div className="ivFilter"><input placeholder="Search your items" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.stopPropagation()} onKeyUp={e => e.stopPropagation()} />
        <select value={cat} onChange={e => setCat(e.target.value)}><option value="">All</option>{CATS.filter(c => c.id !== 'food').map(c => <option key={c.id} value={c.id}>{c.e} {c.label}</option>)}</select></div>
      <div className="ivList">
        {data && shown.length === 0 && <div className="ivEmpty">📦<b>{data.items.length ? 'Nothing matches' : 'No items yet'}</b><small>Buy things from stores in the city: they land here.</small></div>}
        {shown.map(x => { const n = Math.min(x.qty, Math.max(1, qtys[x.id] || 1)), key = 'i' + x.id; return <div key={x.id} className="ivRow">
          <i>{x.e}</i><div><b>{x.name}</b><small>×{x.qty} · sells for {naira(x.sell)} each</small></div>
          {confirm === key ? <div className="ivAct"><button className="go" disabled={busy} onClick={() => sell('item', x.id, n)}>Sell {n} · {naira(x.sell * n)}</button><button onClick={() => setConfirm('')}>No</button></div>
            : <div className="ivAct">{x.qty > 1 && <span className="ivQty"><button onClick={() => setQtys(s => ({ ...s, [x.id]: Math.max(1, n - 1) }))}>−</button><b>{n}</b><button onClick={() => setQtys(s => ({ ...s, [x.id]: Math.min(x.qty, n + 1) }))}>＋</button></span>}<button onClick={() => setConfirm(key)}>Sell</button></div>}
        </div>; })}
      </div></>}

    {tab === 'vehicles' && <div className="ivList">
      {data && data.vehicles.length === 0 && <div className="ivEmpty">🚗<b>No vehicles</b><small>Visit a Car Dealer to buy one.</small></div>}
      {data?.vehicles.map(v => { const key = 'v' + v.id; return <div key={v.id} className="ivRow"><i>{VEH_E[v.type] || '🚗'}</i><div><b>{v.name}</b><small>Bought for {naira(v.price)} · condition {v.condition}% · fuel {v.fuel}%</small></div>
        {confirm === key ? <div className="ivAct"><button className="go" disabled={busy} onClick={() => sell('vehicle', v.id)}>Sell · {naira(v.sell)}</button><button onClick={() => setConfirm('')}>No</button></div> : <div className="ivAct"><button onClick={() => setConfirm(key)}>Sell {naira(v.sell)}</button></div>}</div>; })}
    </div>}

    {tab === 'properties' && <div className="ivList">
      {data && data.properties.length === 0 && <div className="ivEmpty">🏠<b>No properties yet</b><small>Properties you buy will show up here.</small></div>}
      {data?.properties.map(p => { const key = 'p' + p.id; return <div key={p.id} className="ivRow"><i>{PROP_E[p.type] || '🏠'}</i><div><b>{p.name}</b><small>{p.district} · bought for {naira(p.price)}{p.rent ? ` · rent ${naira(p.rent)}` : ''}</small></div>
        {confirm === key ? <div className="ivAct"><button className="go" disabled={busy} onClick={() => sell('property', p.id)}>Sell · {naira(p.sell)}</button><button onClick={() => setConfirm('')}>No</button></div> : <div className="ivAct"><button onClick={() => setConfirm(key)}>Sell {naira(p.sell)}</button></div>}</div>; })}
    </div>}
    <small className="ivNote">Stores buy back at a fair share of the price. For more, list items for other players on the 🛒 Market.</small>
  </div></div>;
}

const CSS = `.ivWrap{position:absolute;inset:0;z-index:95;background:#000a;display:grid;place-items:center;padding:10px}
.ivBox{width:min(560px,100%);max-height:calc(100vh - 24px);display:flex;flex-direction:column;gap:8px;background:#0f1b16;color:#fff;border:1px solid #ffffff22;border-radius:18px;padding:14px;font-family:Inter,system-ui,sans-serif}
.ivHead{display:flex;justify-content:space-between;align-items:flex-start}.ivHead h3{margin:0;font-size:18px}.ivHead small{color:#9fb5aa;font-size:11px}.ivX{background:#20372d;border:0;color:#fff;border-radius:50%;width:32px;height:32px;font-size:18px}
.ivTabs{display:flex;gap:6px}.ivTabs button{flex:1;background:#17281f;border:1px solid #ffffff18;color:#c9dacf;border-radius:10px;padding:8px 4px;font-size:12px;font-weight:800}.ivTabs button.on{background:#d99a42;color:#1a1208;border-color:#d99a42}
.ivMsg{background:#1f3a2e;border:1px solid #ffffff22;border-radius:10px;padding:7px 10px;font-size:12px}
.ivFilter{display:flex;gap:6px}.ivFilter input,.ivFilter select{background:#0a1511;border:1px solid #2a4337;border-radius:10px;padding:8px 10px;color:#fff;font-size:14px;min-width:0}.ivFilter input{flex:1}
.ivList{flex:1;min-height:120px;overflow:auto;display:flex;flex-direction:column;gap:6px}
.ivRow{display:flex;align-items:center;gap:10px;background:#10201a;border:1px solid #ffffff14;border-radius:14px;padding:8px 10px}.ivRow>i{flex:none;font-style:normal;font-size:26px;width:36px;text-align:center}.ivRow>div:nth-child(2){flex:1;min-width:0}.ivRow b{display:block;font-size:13px}.ivRow small{display:block;color:#9fb5aa;font-size:10px}
.ivAct{flex:none;display:flex;gap:6px;align-items:center}.ivAct button{background:#20372d;color:#fff;border:0;border-radius:10px;padding:7px 11px;font-weight:800;font-size:12px}.ivAct button.go{background:#d99a42;color:#1a1208}.ivAct button:disabled{opacity:.5}
.ivQty{display:flex;align-items:center;gap:4px}.ivQty button{padding:4px 8px!important}.ivQty b{min-width:18px;text-align:center}
.ivEmpty{margin:auto;text-align:center;color:#9fb5aa;display:flex;flex-direction:column;gap:4px;padding:24px;font-size:28px}.ivEmpty b{font-size:14px;color:#fff}.ivEmpty small{font-size:11px}.ivNote{color:#7f968b;font-size:10px;text-align:center}`;
