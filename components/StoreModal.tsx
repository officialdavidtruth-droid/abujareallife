'use client';
import { useEffect, useMemo, useState } from 'react';
import { CATS, storeCats, storeItems, itemById, type CatId, type Item } from '../lib/catalog';
import { sfx } from '../lib/audio';

import RuntimeStyle from './RuntimeStyle';
const naira = (n: number) => '₦' + Math.round(n).toLocaleString('en-NG');
const TINT: Record<CatId, string> = { food: '#ff8a3d', household: '#4aa8ff', kitchen: '#ff5a4d', furniture: '#a96bff', decor: '#2fc66b', tech: '#28c7d9', style: '#ffb81c', kids: '#ff7eb6', grocery: '#7bd34a', toiletry: '#5ad1e6', luxury: '#e7b34a', arms: '#ff3b30', parts: '#9aa4b2' };

export default function StoreModal({ bizName, bizType, onClose, onCash, onFx }: { bizName: string; bizType: string; onClose: () => void; onCash: (n: number) => void; onFx: (fx: Record<string, number>) => void }) {
  const cats = useMemo(() => CATS.filter(c => storeCats(bizType).includes(c.id)), [bizType]), all = useMemo(() => storeItems(bizType), [bizType]);
  const [tab, setTab] = useState<CatId | 'all' | 'owned'>('all'), [q, setQ] = useState(''), [sort, setSort] = useState<'cheap' | 'pricey' | 'az'>('cheap'), [qty, setQty] = useState(1);
  const [shop, setShop] = useState<{ owner: string | null; prices?: Record<string, number> } | null>(null), [cmp, setCmp] = useState<{ name: string; list: number | null; shops: { businessId: string; name: string; district: string; owner: string; price: number }[] } | null>(null);
  const [pantry, setPantry] = useState<{ meals: number; supplies: number } | null>(null), [cash, setCash] = useState<number | null>(null), [owned, setOwned] = useState<Record<string, number>>({}), [note, setNote] = useState<{ t: string; bad?: boolean } | null>(null), [busy, setBusy] = useState('');
  useEffect(() => { sfx('open'); return () => sfx('close'); }, []);
  useEffect(() => {
    (async () => {
      const [s, i, pn, sh] = await Promise.all([fetch('/api/status').then(r => r.ok ? r.json() : null).catch(() => null), fetch('/api/inventory').then(r => r.ok ? r.json() : null).catch(() => null), fetch('/api/pantry').then(r => r.ok ? r.json() : null).catch(() => null), fetch('/api/shop').then(r => r.ok ? r.json() : null).catch(() => null)]);
      if (sh) setShop(sh);
      if (pn) setPantry(pn); if (s) setCash(s.cash); if (i) setOwned(Object.fromEntries(i.items.map((x: { id: string; qty: number }) => [x.id, x.qty])));
    })();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const say = (t: string, bad = false) => { setNote({ t, bad }); setTimeout(() => setNote(n => (n && n.t === t ? null : n)), 3200); };

  const priceOf = (it: Item) => shop?.prices?.[it.id] ?? it.cost; // player-run shops set their own prices; the server charges the same number
  async function compare(it: Item) {
    const d = await fetch('/api/shop?compare=' + encodeURIComponent(it.id)).then(r => r.ok ? r.json() : null).catch(() => null);
    setCmp(d ? { name: it.name, list: it.cost, shops: d.shops } : null); if (!d) say('Could not load prices.', true);
  }

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let l: Item[] = tab === 'owned' ? Object.keys(owned).map(id => itemById(id)).filter((x): x is Item => !!x) : tab === 'all' ? all : all.filter(i => i.cat === tab);
    if (needle) l = l.filter(i => i.name.toLowerCase().includes(needle) || (CATS.find(c => c.id === i.cat)?.label || '').toLowerCase().includes(needle));
    return [...l].sort((a, b) => sort === 'az' ? a.name.localeCompare(b.name) : sort === 'cheap' ? priceOf(a) - priceOf(b) : priceOf(b) - priceOf(a));
  }, [tab, q, sort, all, owned, shop]); // eslint-disable-line react-hooks/exhaustive-deps

  async function buy(it: Item) {
    if (busy) return; const n = it.use ? qty : Math.min(qty, 20);
    if (cash != null && cash < priceOf(it) * n) { sfx('error'); return say(`Not enough cash for ${n > 1 ? n + '× ' : ''}${it.name}`, true); }
    setBusy(it.id);
    try {
      const r = await fetch('/api/shop', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ item: it.id, qty: n }) }), d = await r.json().catch(() => ({}));
      if (!r.ok) { sfx('error'); say(d.error || 'Could not buy that.', true); return; }
      sfx('buy'); window.dispatchEvent(new Event('arl-inventory-changed')); setCash(d.cash); onCash(d.cash); if (d.fx && Object.keys(d.fx).length) onFx(d.fx);
      if (d.pantry) { setPantry(d.pantry); window.dispatchEvent(new CustomEvent('arl-pantry', { detail: d.pantry })); }
      else if (!it.use) setOwned(o => ({ ...o, [it.id]: d.owned ?? (o[it.id] || 0) + n }));
      say(it.use ? `Yum! ${n > 1 ? n + '× ' : ''}${it.name}` : it.pantry ? `Stocked up: ${n > 1 ? n + '× ' : ''}${it.name} (+${d.units ?? (it.units || 0) * n} ${it.pantry === 'meals' ? 'meals' : 'uses'})` : `Added to your bag: ${n > 1 ? n + '× ' : ''}${it.name}`);
    } finally { setBusy(''); }
  }
  const mine = Object.values(owned).reduce((a, b) => a + b, 0);

  return <div className="stoBack" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="stoBox" role="dialog" aria-label={bizName + ' store'}>
      <div className="stoHead"><div className="stoTitle"><span>🛍️ {bizName}</span></div>{pantry && <div className="stoCash stoPan" title="What is left in your pantry and bathroom cupboard">🍲 {pantry.meals} · 🧼 {pantry.supplies}</div>}<div className="stoCash" title="Your cash">💵 {cash == null ? '…' : naira(cash)}</div><button className="stoX" aria-label="Close store" onClick={onClose}>✕</button></div>
      <div className="stoTabs" role="tablist">
        <button role="tab" className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>⭐ All <small>{all.length}</small></button>
        {cats.map(c => <button key={c.id} role="tab" className={tab === c.id ? 'on' : ''} style={{ ['--t' as string]: TINT[c.id] }} onClick={() => setTab(c.id)}>{c.e} {c.label} <small>{all.filter(i => i.cat === c.id).length}</small></button>)}
        <button role="tab" className={'own' + (tab === 'owned' ? ' on' : '')} onClick={() => setTab('owned')}>🎒 My bag <small>{mine}</small></button>
      </div>
      <div className="stoBar">
        <input placeholder="Search items…" value={q} onChange={e => setQ(e.target.value)} />
        <div className="stoSeg">{([['cheap', '₦↑'], ['pricey', '₦↓'], ['az', 'A–Z']] as const).map(([k, l]) => <button key={k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{l}</button>)}</div>
        {tab !== 'owned' && <div className="stoSeg qty" title="How many to buy">{[1, 5, 10].map(n => <button key={n} className={qty === n ? 'on' : ''} onClick={() => setQty(n)}>×{n}</button>)}</div>}
      </div>
      {shop?.owner && <div className="stoOwner">🏪 Run by <b>{shop.owner}</b> · prices are set by the owner</div>}
      {cmp && <div className="stoCmpBox"><b>{cmp.name}</b> · list {naira(cmp.list || 0)} <button onClick={() => setCmp(null)} aria-label="Close comparison">✕</button>{cmp.shops.length ? cmp.shops.slice(0, 5).map(s => <div key={s.businessId}><span>{s.name} <small>{s.district} · {s.owner}</small></span><em>{naira(s.price)}</em></div>) : <div><span>No player-run shop sells this yet.</span></div>}</div>}
      {note && <div className={'stoNote' + (note.bad ? ' bad' : '')} key={note.t}>{note.t}</div>}
      <div className="stoGrid">
        {shown.length === 0 && <p className="stoEmpty">{tab === 'owned' ? 'Your bag is empty. Go shopping! 🛒' : 'Nothing matches that search.'}</p>}
        {shown.map(it => { const have = owned[it.id] || 0, n = it.use ? qty : qty, poor = cash != null && cash < priceOf(it) * n;
          return <div key={it.id} className={'stoCard' + (poor && tab !== 'owned' ? ' poor' : '')} style={{ ['--t' as string]: TINT[it.cat] }}>
            <div className="stoTile"><span>{it.e}</span>{have > 0 && <i className="stoOwn">×{have}</i>}</div>
            <b className="stoName">{it.name}</b>
            {it.pantry && <small className="stoUnits">+{it.units} {it.pantry === 'meals' ? 'meals' : 'uses'}</small>}
            {tab === 'owned' ? <div className="stoPrice">worth {naira(it.cost)}</div>
              : <><div className="stoPrice">{naira(priceOf(it))}{n > 1 ? <small> ×{n}</small> : null}</div>
                <button className="stoBuy" disabled={busy === it.id} onClick={() => buy(it)}>{busy === it.id ? '…' : it.use ? 'Eat / Drink' : 'Buy'}</button><button className="stoCmp" title="Compare prices at other player-run shops" onClick={() => compare(it)}>🔎 Compare</button></>}
          </div>; })}
      </div>
    </div>
    <RuntimeStyle css={CSS} />
  </div>;
}

const CSS = `
.stoOwner{margin:0 12px 6px;font-size:13px;color:var(--cream);opacity:.9}.stoCmp{all:unset;cursor:pointer;font-size:12px;opacity:.8;text-decoration:underline}.stoCmpBox{margin:0 12px 6px;padding:8px 12px;background:var(--plum2);border:3px solid var(--ink);border-radius:12px;font-size:14px}.stoCmpBox>button{all:unset;cursor:pointer;float:right}.stoCmpBox>div{display:flex;justify-content:space-between;gap:8px;margin-top:4px}.stoCmpBox small{opacity:.7}.stoCmpBox em{font-style:normal;color:var(--gold)}
.stoPan{font-size:13px;padding:4px 10px}.stoUnits{display:block;text-align:center;font-size:11px;color:var(--cream);opacity:.85;margin-top:-2px}
.stoBack{position:absolute;inset:0;z-index:60;background:#0a0612cc;display:grid;place-items:center;padding:10px;backdrop-filter:blur(3px);font-family:var(--gf)}
.stoBox{width:min(900px,100%);height:min(640px,calc(100% - 4px));display:flex;flex-direction:column;background:var(--plum);color:var(--cream);border:4px solid var(--ink);border-radius:22px;box-shadow:0 7px 0 var(--ink),0 24px 50px #000a;overflow:hidden;animation:glPop .22s cubic-bezier(.3,1.5,.5,1)}
.stoHead{display:flex;align-items:center;gap:10px;padding:9px 12px 9px 16px;background:var(--green);border-bottom:4px solid var(--ink)}
.stoTitle{flex:1;min-width:0;font-size:24px;letter-spacing:.03em;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.stoTitle span{-webkit-text-stroke:6px var(--ink);paint-order:stroke fill}
.stoCash{flex:none;background:var(--cream);color:var(--ink);border:3px solid var(--ink);border-radius:999px;padding:4px 14px;font-size:17px;box-shadow:0 3px 0 var(--ink)}
.stoX{all:unset;flex:none;cursor:pointer;width:36px;height:36px;display:grid;place-items:center;border-radius:50%;background:var(--red);border:3px solid var(--ink);box-shadow:0 3px 0 var(--ink);color:#fff;font-size:16px}.stoX:active{transform:translateY(3px);box-shadow:none}
.stoTabs{display:flex;gap:8px;padding:10px 12px 6px;overflow-x:auto;scrollbar-width:thin;flex:none}
.stoTabs button{all:unset;box-sizing:border-box;flex:none;cursor:pointer;display:inline-flex;align-items:center;gap:6px;padding:5px 12px;background:var(--plum2);border:3px solid var(--ink);border-radius:999px;box-shadow:0 3px 0 var(--ink);font-size:15px;letter-spacing:.02em;white-space:nowrap}
.stoTabs button small{background:#0003;border-radius:99px;padding:0 7px;font-size:12px}
.stoTabs button.on{background:var(--t,var(--gold));color:#fff;-webkit-text-stroke:4px var(--ink);paint-order:stroke fill}.stoTabs button.on small{-webkit-text-stroke:0;color:#fff}
.stoTabs button.own.on{background:var(--purple)}.stoTabs button:active{transform:translateY(3px);box-shadow:none}
.stoBar{display:flex;gap:8px;align-items:center;padding:6px 12px 8px;flex:none;flex-wrap:wrap}
.stoBar input{flex:1;min-width:140px;background:var(--cream);color:var(--ink);border:3px solid var(--ink);border-radius:12px;padding:7px 12px;font-family:var(--gf);font-size:15px;box-shadow:0 3px 0 var(--ink);outline:none}
.stoSeg{display:flex;gap:5px}.stoSeg button{all:unset;box-sizing:border-box;cursor:pointer;padding:5px 10px;background:var(--plum2);border:3px solid var(--ink);border-radius:10px;box-shadow:0 3px 0 var(--ink);font-size:14px}
.stoSeg button.on{background:var(--gold);color:#fff;-webkit-text-stroke:4px var(--ink);paint-order:stroke fill}.stoSeg button:active{transform:translateY(3px);box-shadow:none}
.stoNote{margin:0 12px 6px;padding:6px 12px;background:var(--green);color:#fff;border:3px solid var(--ink);border-radius:12px;box-shadow:0 3px 0 var(--ink);font-size:15px;animation:glPop .2s;flex:none;-webkit-text-stroke:4px var(--ink);paint-order:stroke fill}.stoNote.bad{background:var(--red)}
.stoGrid{flex:1;min-height:0;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:12px;padding:6px 12px 16px;align-content:start}
.stoEmpty{grid-column:1/-1;text-align:center;padding:40px 10px;font-size:18px;color:#c9b8e8;margin:0}
.stoCard{display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px 8px 10px;background:var(--plum2);border:3px solid var(--ink);border-radius:16px;box-shadow:0 4px 0 var(--ink);transition:transform .12s}
.stoCard:hover{transform:translateY(-3px)}
.stoTile{position:relative;width:100%;height:72px;display:grid;place-items:center;background:var(--t);border:3px solid var(--ink);border-radius:11px;font-size:38px;line-height:1;background-image:radial-gradient(circle at 30% 25%,#ffffff55,transparent 60%)}
.stoOwn{position:absolute;right:-8px;top:-9px;background:var(--cream);color:var(--ink);border:3px solid var(--ink);border-radius:99px;padding:0 7px;font-style:normal;font-size:13px}
.stoName{font-weight:400;font-size:15px;line-height:1.15;text-align:center;min-height:34px;display:flex;align-items:center;letter-spacing:.01em}
.stoPrice{background:#120c1c;border:2px solid var(--ink);border-radius:99px;padding:1px 12px;font-size:15px;color:var(--gold)}.stoPrice small{color:#c9b8e8}
.stoCard.poor .stoPrice{color:#ff8a80}
.stoBuy{all:unset;box-sizing:border-box;width:100%;text-align:center;cursor:pointer;padding:6px 8px;background:var(--green);color:#fff;border:3px solid var(--ink);border-radius:12px;box-shadow:0 4px 0 var(--ink);font-size:15px;letter-spacing:.04em;-webkit-text-stroke:4px var(--ink);paint-order:stroke fill}
.stoBuy:active{transform:translateY(4px);box-shadow:none}.stoCard.poor .stoBuy{background:#7a6a8a}.stoBuy:disabled{opacity:.7}
@media (max-width:560px){.stoGrid{grid-template-columns:repeat(2,1fr);gap:9px}.stoTitle{font-size:19px}.stoTile{height:60px;font-size:32px}.stoBox{border-radius:16px}}
`;
