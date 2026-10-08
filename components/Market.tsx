'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CATALOG, CATS, isStaple, itemById, type CatId } from '../lib/catalog';
import { itemSellValue, mallPrice } from '../lib/sell';
import RuntimeStyle from './RuntimeStyle';

type L = { id: string; itemKey: string; name: string; e: string; cat: string; cost: number; qty: number; price: number; seller: string; mine: boolean; soldQty: number; earned: number; at: number };
type Data = { listings: L[]; mine: L[]; sold: L[]; cash: number; fee: number; bounds: Record<string, { min: number; max: number } | null> };
const naira = (n: number) => '₦' + Math.round(n).toLocaleString();
const call = async (body: object) => { const r = await fetch('/api/market', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { ok: r.ok, d: await r.json().catch(() => ({})) as any }; };
const ago = (t: number) => { const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };

/* Player marketplace: browse what other players are selling, list your own items, manage your stalls. */
export default function Market({ onClose, onCash, seller }: { onClose: () => void; onCash: (n: number) => void; seller?: string }) {
  const [tab, setTab] = useState<'shop' | 'browse' | 'sell' | 'mine'>(seller ? 'browse' : 'shop'), [data, setData] = useState<Data | null>(null), [cat, setCat] = useState(''), [q, setQ] = useState(''), [who, setWho] = useState(seller || '');
  const [inv, setInv] = useState<{ id: string; qty: number }[]>([]), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const [qtys, setQtys] = useState<Record<string, number>>({}), [pick, setPick] = useState(''), [sq, setSq] = useState(1), [sp, setSp] = useState('');
  const [shopCat, setShopCat] = useState<CatId | ''>(''), [shopQ, setShopQ] = useState(''), [sort, setSort] = useState<'cheap' | 'pricey' | 'az'>('cheap'), [shopQty, setShopQty] = useState<Record<string, number>>({}), [limit, setLimit] = useState(60);
  const say = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 4000); };
  const load = useCallback(async () => {
    const p = new URLSearchParams(); if (who) p.set('seller', who);
    const [m, i] = await Promise.all([fetch('/api/market?' + p).then(r => r.ok ? r.json() : null).catch(() => null), fetch('/api/inventory').then(r => r.ok ? r.json() : null).catch(() => null)]);
    if (m) { setData(m); onCash(m.cash); } if (i) setInv(i.items || []);
  }, [who, onCash]);
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);

  const shown = useMemo(() => (data?.listings || []).filter(l => (!cat || l.cat === cat) && (!q || l.name.toLowerCase().includes(q.toLowerCase()) || l.seller.toLowerCase().includes(q.toLowerCase()))), [data, cat, q]);
  const sellable = useMemo(() => inv.map(x => ({ ...x, it: itemById(x.id) })).filter(x => x.it && !x.it.use && !isStaple(x.it) && x.qty > 0), [inv]);
  const chosen = sellable.find(x => x.id === pick), range = data?.bounds?.[pick] || (chosen?.it ? { min: Math.max(1, Math.floor(chosen.it.cost * .1)), max: Math.floor(chosen.it.cost * 5) } : null);
  const price = Math.floor(Number(sp) || 0);
  const mallCats = useMemo(() => CATS.filter(c => !isStaple({ cat: c.id })), []);
  const mall = useMemo(() => {
    const n = shopQ.trim().toLowerCase();
    return CATALOG.filter(i => !i.use && !isStaple(i) && (!shopCat || i.cat === shopCat) && (!n || i.name.toLowerCase().includes(n))).sort((a, b) => sort === 'az' ? a.name.localeCompare(b.name) : sort === 'cheap' ? a.cost - b.cost : b.cost - a.cost);
  }, [shopCat, shopQ, sort]);
  useEffect(() => setLimit(60), [shopCat, shopQ, sort]);
  const owned = useMemo(() => Object.fromEntries(inv.map(x => [x.id, x.qty])), [inv]);

  const act = async (body: object, ok: string) => { if (busy) return; setBusy(true); const r = await call(body); setBusy(false); if (!r.ok) return say('⛔ ' + (r.d.error || 'Failed.')); if (r.d.cash != null) onCash(r.d.cash); say(ok); await load(); };
  const buy = (l: L) => act({ action: 'buy', id: l.id, qty: Math.min(l.qty, Math.max(1, qtys[l.id] || 1)) }, `✅ Bought ${l.name}`);
  const shopBuy = (id: string, name: string, n: number) => act({ action: 'shop', itemKey: id, qty: n }, `📦 ${n > 1 ? n + '× ' : ''}${name} delivered to your bag`);
  const quickSell = async (id: string, name: string, n: number) => {
    if (busy) return; setBusy(true);
    try { const r = await fetch('/api/inventory', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'sell', kind: 'item', id, qty: n }) }), d = await r.json().catch(() => ({}));
      if (!r.ok) say('⛔ ' + (d.error || 'Could not sell that.')); else { onCash(d.cash); say(`💰 Sold ${name} ×${n} for ${naira(d.gained)}`); setPick(''); }
    } catch { say('⛔ No connection.'); } setBusy(false); await load();
  };
  const list = async () => { if (!chosen?.it) return; await act({ action: 'list', itemKey: pick, qty: sq, price }, `🏷️ Listed ${chosen.it.name} for ${naira(price)} each`); setPick(''); setSp(''); setSq(1); setTab('mine'); };

  return <div className="mkWrap" onClick={onClose}><div className="mkBox" onClick={e => e.stopPropagation()}>
    <RuntimeStyle css={CSS} />
    <div className="mkHead"><div><h3>🛒 Marketplace</h3><small>Online mall + player-to-player · {data ? naira(data.cash) : '…'} cash · {Math.round((data?.fee ?? .05) * 100)}% fee on sales</small></div><button className="mkX" onClick={onClose} aria-label="Close">×</button></div>
    <div className="mkTabs">{([['shop', '🛍️ Shop'], ['browse', '🔎 Players'], ['sell', '🏷️ Sell'], ['mine', `📦 My stalls${data?.mine.length ? ` (${data.mine.length})` : ''}`]] as const).map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
    {msg && <div className="mkMsg">{msg}</div>}

    {tab === 'shop' && <>
      <div className="mkFilters"><input value={shopQ} placeholder={`Search ${CATALOG.filter(i => !i.use && !isStaple(i)).length}+ products…`} onChange={e => setShopQ(e.target.value)} onKeyDown={e => e.stopPropagation()} onKeyUp={e => e.stopPropagation()} />
        <select className="mkSel" value={sort} onChange={e => setSort(e.target.value as 'cheap' | 'pricey' | 'az')}><option value="cheap">₦ low → high</option><option value="pricey">₦ high → low</option><option value="az">A–Z</option></select></div>
      <div className="mkChips"><button className={'mkChip' + (!shopCat ? ' on' : '')} onClick={() => setShopCat('')}>All</button>{mallCats.map(c => <button key={c.id} className={'mkChip' + (shopCat === c.id ? ' on' : '') + (c.id === 'luxury' ? ' gold' : '')} onClick={() => setShopCat(c.id)}>{c.e} {c.label}</button>)}</div>
      <p className="mkHint">Delivered to your bag · +8% delivery. Groceries &amp; toiletries: go to the Market, Supermarket or Pharmacy in person.</p>
      <div className="mkGrid">{mall.slice(0, limit).map(i => { const n = Math.min(20, Math.max(1, shopQty[i.id] || 1)), unit = mallPrice(i.cost), have = owned[i.id] || 0;
        return <div className={'mkProd' + (i.cat === 'luxury' ? ' lux' : '')} key={i.id}>
          {i.cat === 'luxury' && <em className="mkLux">LUXURY</em>}
          <div className="mkPic">{i.e}</div><b>{i.name}</b><small>{CATS.find(c => c.id === i.cat)?.label}{have ? ` · you own ${have}` : ''}</small>
          <span className="mkPrice">{naira(unit)}</span>
          <div className="mkStep"><button disabled={n <= 1} onClick={() => setShopQty(q => ({ ...q, [i.id]: n - 1 }))}>−</button><span>{n}</span><button disabled={n >= 20} onClick={() => setShopQty(q => ({ ...q, [i.id]: n + 1 }))}>+</button></div>
          <button className="mkGo" disabled={busy || (data?.cash ?? 0) < unit * n} onClick={() => shopBuy(i.id, i.name, n)}>{(data?.cash ?? 0) < unit * n ? 'Too pricey' : `Buy ${naira(unit * n)}`}</button>
        </div>; })}
        {mall.length === 0 && <p className="mkEmpty">Nothing matches that search.</p>}
        {mall.length > limit && <button className="mkMore" onClick={() => setLimit(l => l + 60)}>Show more ({mall.length - limit} left)</button>}
      </div></>}

    {tab === 'browse' && <>
      <div className="mkFilters"><input value={q} placeholder="Search items or sellers…" onChange={e => setQ(e.target.value)} />{who && <button className="mkChip on" onClick={() => setWho('')}>Seller: {who} ✕</button>}</div>
      <div className="mkChips"><button className={'mkChip' + (!cat ? ' on' : '')} onClick={() => setCat('')}>All</button>{mallCats.map(c => <button key={c.id} className={'mkChip' + (cat === c.id ? ' on' : '')} onClick={() => setCat(c.id)}>{c.e} {c.label}</button>)}</div>
      <div className="mkList">{!data ? <p className="mkEmpty">Loading…</p> : shown.length === 0 ? <p className="mkEmpty">No players are selling anything here yet. Be the first, or shop the mall in the 🛍️ Shop tab.</p> : shown.map(l => {
        const n = Math.min(l.qty, Math.max(1, qtys[l.id] || 1)), cheap = l.price < l.cost, total = l.price * n;
        return <div className="mkCard" key={l.id}>
          <div className="mkIcon">{l.e}</div>
          <div className="mkInfo"><b>{l.name}</b><small>by @{l.seller}{l.mine ? ' (you)' : ''} · {l.qty} left · {ago(l.at)}</small><span className="mkPrice">{naira(l.price)} each{cheap && <em>deal</em>}</span></div>
          {l.mine ? <span className="mkYours">Your stall</span> : <div className="mkBuy"><div className="mkStep"><button disabled={n <= 1} onClick={() => setQtys(s => ({ ...s, [l.id]: n - 1 }))}>−</button><span>{n}</span><button disabled={n >= l.qty} onClick={() => setQtys(s => ({ ...s, [l.id]: n + 1 }))}>+</button></div><button className="mkGo" disabled={busy || (data?.cash ?? 0) < total} onClick={() => buy(l)}>Buy {naira(total)}</button></div>}
        </div>; })}</div>
    </>}

    {tab === 'sell' && <div className="mkSell">
      {sellable.length === 0 ? <p className="mkEmpty">You have nothing to sell yet. Buy furniture, tech, decor and more from the 🛍️ Shop tab or the stores around Abuja, then sell it here.</p> : <>
        <p className="mkHint">Pick something from your bag:</p>
        <div className="mkBag">{sellable.map(x => <button key={x.id} className={'mkBagItem' + (pick === x.id ? ' on' : '')} onClick={() => { setPick(x.id); setSq(1); setSp(String(x.it!.cost)); }}><span>{x.it!.e}</span><b>{x.it!.name}</b><small>×{x.qty}</small></button>)}</div>
        {chosen?.it && range && <div className="mkForm">
          <label>How many<input type="number" min={1} max={chosen.qty} value={sq} onChange={e => setSq(Math.max(1, Math.min(chosen.qty, Math.floor(Number(e.target.value) || 1))))} /></label>
          <label>Price each (₦)<input type="number" min={range.min} max={range.max} value={sp} onChange={e => setSp(e.target.value)} /></label>
          <small>Store price {naira(chosen.it.cost)} · allowed {naira(range.min)}–{naira(range.max)} · you receive about {naira(Math.floor(price * sq * (1 - (data?.fee ?? .05))))} after the fee</small>
          <button className="mkGo" disabled={busy || price < range.min || price > range.max} onClick={list}>List {sq} for sale to players</button>
          <button className="mkCancel" disabled={busy} onClick={() => quickSell(pick, chosen.it!.name, sq)}>Quick sell to the market · {naira(itemSellValue(chosen.it.cost) * sq)}</button>
        </div>}
      </>}
    </div>}

    {tab === 'mine' && <div className="mkList">
      <h4>Active stalls</h4>
      {!data?.mine.length ? <p className="mkEmpty">You aren't selling anything right now.</p> : data.mine.map(l => <div className="mkCard" key={l.id}><div className="mkIcon">{l.e}</div><div className="mkInfo"><b>{l.name}</b><small>{l.qty} left · {l.soldQty} sold</small><span className="mkPrice">{naira(l.price)} each</span></div><button className="mkCancel" disabled={busy} onClick={() => act({ action: 'cancel', id: l.id }, `↩️ ${l.name} returned to your bag`)}>Take back</button></div>)}
      <h4>Recent sales</h4>
      {!data?.sold.length ? <p className="mkEmpty">No sales yet.</p> : data.sold.map(l => <div className="mkCard sold" key={l.id}><div className="mkIcon">{l.e}</div><div className="mkInfo"><b>{l.name}</b><small>{l.soldQty} sold · {ago(l.at)}</small><span className="mkPrice">+{naira(l.earned)}</span></div></div>)}
    </div>}
  </div></div>;
}

const CSS = `.mkWrap{position:absolute;inset:0;z-index:95;background:#000a;display:grid;place-items:center;padding:10px}
.mkBox{width:min(520px,100%);max-height:calc(100vh - 20px);display:flex;flex-direction:column;background:linear-gradient(160deg,#15231e,#09130f);border:1px solid #ffffff2a;border-radius:20px;color:#fff;overflow:hidden;box-shadow:0 24px 70px #000b}
.mkHead{display:flex;justify-content:space-between;align-items:flex-start;padding:14px 16px 6px}.mkHead h3{margin:0;font-size:18px}.mkHead small{color:#9fb5aa;font-size:11px}.mkX{background:#13231d;border:1px solid #ffffff20;color:#fff;width:36px;height:36px;border-radius:10px;font-size:20px;cursor:pointer}
.mkTabs{display:flex;gap:6px;padding:6px 12px}.mkTabs button{flex:1;padding:9px 6px;border-radius:10px;border:1px solid #ffffff1a;background:#10201a;color:#cfe0d7;font-weight:700;font-size:12px;cursor:pointer}.mkTabs button.on{background:#d99a42;color:#1a1410;border-color:#d99a42}
.mkMsg{margin:4px 12px;padding:8px 10px;background:#000b;border:1px solid #ffffff22;border-radius:10px;font-size:12px;text-align:center}
.mkFilters{display:flex;gap:6px;padding:4px 12px}.mkFilters input,.mkForm input{flex:1;background:#0a1511;border:1px solid #2a4337;border-radius:10px;padding:9px;color:#fff;font-size:14px;min-width:0}
.mkChips{display:flex;gap:6px;padding:6px 12px;overflow-x:auto;scrollbar-width:none}.mkChip{flex:none;padding:6px 10px;border-radius:999px;border:1px solid #ffffff22;background:#10201a;color:#cfe0d7;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap}.mkChip.on{background:#3fb98a;color:#06210f;border-color:#3fb98a}
.mkList{flex:1;min-height:120px;overflow-y:auto;padding:6px 12px 14px;display:flex;flex-direction:column;gap:8px;overscroll-behavior:contain}.mkList h4{margin:8px 0 0;font-size:12px;letter-spacing:.08em;color:#d99a42;text-transform:uppercase}
.mkCard{display:flex;gap:10px;align-items:center;background:#10201a;border:1px solid #ffffff14;border-radius:14px;padding:9px}.mkCard.sold{opacity:.85}.mkIcon{width:46px;height:46px;flex:none;display:grid;place-items:center;font-size:26px;background:#0a1511;border-radius:12px}
.mkInfo{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}.mkInfo b{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mkInfo small{color:#8fa79b;font-size:11px}.mkPrice{font-weight:800;color:#f0b94a;font-size:13px}.mkPrice em{font-style:normal;margin-left:6px;background:#35c46b;color:#06210f;border-radius:6px;padding:1px 6px;font-size:10px}
.mkBuy{display:flex;flex-direction:column;gap:5px;align-items:stretch}.mkStep{display:flex;align-items:center;justify-content:space-between;gap:6px}.mkStep button{width:28px;height:26px;border-radius:8px;border:1px solid #ffffff22;background:#0a1511;color:#fff;cursor:pointer}.mkStep button:disabled{opacity:.35}.mkStep span{font-weight:800;font-size:13px}
.mkGo{background:#d99a42;color:#1a1410;border:0;border-radius:10px;padding:9px 12px;font-weight:800;font-size:12px;cursor:pointer}.mkGo:disabled,.mkCancel:disabled{opacity:.4;cursor:default}.mkCancel{background:#13231d;color:#fff;border:1px solid #ffffff22;border-radius:10px;padding:9px 10px;font-size:12px;font-weight:700;cursor:pointer}.mkYours{font-size:11px;color:#8fa79b}
.mkEmpty{color:#8fa79b;font-size:13px;text-align:center;margin:18px 10px}.mkHint{margin:0;padding:6px 14px;color:#9fb5aa;font-size:12px}
.mkSell{flex:1;overflow-y:auto;padding:0 12px 14px}.mkBag{display:grid;grid-template-columns:repeat(auto-fill,minmax(98px,1fr));gap:7px;padding:2px}.mkBagItem{display:flex;flex-direction:column;align-items:center;gap:2px;padding:9px 6px;background:#10201a;border:2px solid #ffffff14;border-radius:12px;color:#fff;cursor:pointer;font-size:11px;text-align:center}.mkBagItem.on{border-color:#d99a42}.mkBagItem span{font-size:24px}.mkBagItem small{color:#8fa79b}
.mkForm{display:flex;flex-direction:column;gap:8px;margin-top:12px;background:#0d1b16;border:1px solid #ffffff14;border-radius:14px;padding:12px}.mkForm label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:#cfe0d7}.mkForm small{color:#8fa79b;font-size:11px}
.mkSel{background:#0a1511;border:1px solid #2a4337;border-radius:10px;padding:9px 6px;color:#fff;font-size:12px;flex:none;max-width:122px}.mkChip.gold.on{background:#e7b34a;border-color:#e7b34a;color:#221704}.mkChip.gold{border-color:#e7b34a88;color:#f0cf86}
.mkGrid{flex:1;min-height:140px;overflow-y:auto;padding:4px 12px 14px;display:grid;grid-template-columns:repeat(auto-fill,minmax(138px,1fr));gap:8px;align-content:start;overscroll-behavior:contain}
.mkProd{position:relative;display:flex;flex-direction:column;gap:3px;background:#10201a;border:1px solid #ffffff14;border-radius:14px;padding:9px;min-width:0}.mkProd.lux{background:linear-gradient(160deg,#2a2210,#10201a 70%);border-color:#e7b34a77}
.mkProd b{font-size:12px;line-height:1.2;min-height:29px}.mkProd small{color:#8fa79b;font-size:10px}.mkPic{font-size:34px;text-align:center;background:#0a1511;border-radius:11px;padding:8px 0}.mkLux{position:absolute;top:6px;right:6px;font-style:normal;font-size:8px;font-weight:900;letter-spacing:.08em;background:#e7b34a;color:#221704;border-radius:6px;padding:2px 5px}
.mkMore{grid-column:1/-1;background:#13231d;color:#fff;border:1px solid #ffffff22;border-radius:12px;padding:11px;font-weight:800;cursor:pointer}`;
