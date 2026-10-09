'use client';
import { useMemo, useState } from 'react';
import { ALL_DESTS, DEST_DISTRICTS, destIcon, filterDests, type Dest } from '../lib/destinations';

/* Searchable list of every place in the city (all buildings + districts). Used by the street taxi / bus sheet and by "order a ride for a player". */
export default function DestPicker({ onPick, disabled, label = 'Go', extra = [] }: { onPick: (d: Dest) => void; disabled?: boolean; label?: string; extra?: Dest[] }) {
  const [q, setQ] = useState(''), [district, setDistrict] = useState('');
  const list = useMemo(() => filterDests([...extra, ...ALL_DESTS], q, district), [q, district, extra]);
  return <div className="dpWrap">
    <div className="dpTools">
      <input className="dpSearch" value={q} placeholder="Search any place…" onChange={e => setQ(e.target.value)} />
      <select className="dpDistrict" value={district} onChange={e => setDistrict(e.target.value)} aria-label="District">
        <option value="">All districts</option>
        {DEST_DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
      </select>
    </div>
    {list.length === 0 && <p className="dpEmpty">No place matches “{q}”.</p>}
    {list.slice(0, 80).map(d => <button key={d.id + d.name} disabled={disabled} style={disabled ? { opacity: .6 } : undefined} onClick={() => onPick(d)}>
      <span className="tx"><b>{destIcon(d.type)} {d.name}</b>{d.type !== 'District' && d.type !== 'Meeting point' && <small className="dpSub">{d.type} · {d.district}</small>}</span><em>{disabled ? '…' : label}</em>
    </button>)}
    {list.length > 80 && <p className="dpEmpty">Showing 80 of {list.length}: type to narrow it down.</p>}
  </div>;
}
export const DEST_PICKER_CSS = `.dpWrap{display:flex;flex-direction:column;gap:9px}.dpTools{display:flex;gap:6px;position:sticky;top:-12px;z-index:1;padding:4px 0;background:var(--plum,#261a36)}
.dpSearch,.dpDistrict{all:unset;box-sizing:border-box;min-width:0;padding:7px 10px;background:#fff;color:#1a1410;border:3px solid var(--ink,#1a1410);border-radius:12px;font:700 13px/1.2 var(--gf,system-ui)}.dpSearch{flex:1}.dpDistrict{flex:none;max-width:42%;cursor:pointer}
.dpSub{display:block;font-size:11px;color:#cdbfe0;font-weight:400;letter-spacing:0;margin-top:1px}.dpEmpty{text-align:center}`;
