'use client';
import { useEffect, useMemo, useState } from 'react';
import CityWorld, { GAME } from './CityWorld';
import { CITY } from '../lib/cityData';
import { shiftPay } from '../lib/interiors';
import { shiftJobs } from '../lib/work';
import type { Look } from '../lib/characterModels';
import type { Business, Job } from '../lib/cityTypes';
import { businessStatus } from '../lib/businessHours';

type Tab = 'map' | 'jobs' | 'businesses' | null;
const MAP_W = 120;
const mapX = (x: number) => 60 + x * 0.92;
const mapY = (z: number) => 60 + z * 0.92;
const ICON: Record<string, string> = { Bank: '🏦', Restaurant: '🍽️', Hotel: '🏨', Hospital: '🏥', Supermarket: '🛒', Salon: '💇', Barber: '💈', Gym: '🏋️', Mechanic: '🔧', 'Car Dealer': '🚗', School: '🎓', Office: '🏢', Nightclub: '🎶', Market: '🧺', 'Petrol Station': '⛽', Pharmacy: '💊', Cinema: '🎬', 'Tech Company': '💻', 'Estate Agency': '🏠', Logistics: '📦', Government: '🏛️', Airport: '✈️', 'Rail Station': '🚆', 'Police Station': '👮', Jail: '🔒' };
const naira = (n: number) => '₦' + Math.round(n).toLocaleString();
const short = (n: number) => n >= 1_000_000 ? '₦' + (n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0) + 'M' : n >= 1000 ? '₦' + Math.round(n / 1000) + 'k' : '₦' + n;

function Jobs({ near, focus }: { near: Business | null; focus: Business | null }) {
  const here = focus || near;
  const owner = useMemo(() => { const m = new Map<string, Business>(); CITY.businesses.forEach(b => b.jobs.forEach(j => m.set(j.id, b))); return m; }, []);
  const all = useMemo(() => CITY.businesses.flatMap(b => shiftJobs(b)), []); // manager roles are seats you apply for inside the building, not shift jobs
  const types = useMemo(() => { const c: Record<string, number> = {}; all.forEach(j => { c[j.type] = (c[j.type] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 8).map(x => x[0]); }, [all]);
  const [f, setF] = useState<string>(here ? 'near' : 'all');
  const list = useMemo(() => {
    const l: Job[] = f === 'near' ? (here ? shiftJobs(here) : []) : f === 'all' ? all : all.filter(j => j.type === f);
    return [...l].sort((a, b) => b.pay - a.pay).slice(0, 40);
  }, [f, all, here]);
  return <>
    <div className="jbHead"><h3>💼 Jobs</h3><span>{list.length} shown</span></div>
    <div className="jbChips">
      {here && <button className={f === 'near' ? 'on' : ''} onClick={() => setF('near')}>{focus ? '📍 ' + focus.name : '📍 Near you'}</button>}
      <button className={f === 'all' ? 'on' : ''} onClick={() => setF('all')}>Top paid</button>
      {types.map(t => <button key={t} className={f === t ? 'on' : ''} onClick={() => setF(t)}>{ICON[t] || '💼'} {t}</button>)}
    </div>
    <div className="jbList">
      {list.length === 0 && <p className="jbEmpty">No jobs here. Try another filter.</p>}
      {list.map(j => <div key={j.id} className="jbCard">
        <div className="jbIc">{ICON[j.type] || '💼'}</div>
        <div className="jbBody"><b>{j.title}</b><span>{j.business}</span>
          <div className="jbTags"><i className="pay">{short(j.pay)}<small>/month</small></i><i>⏱ {j.shift}</i><i>{j.district}</i></div></div>
        <div className="jbShift"><small>per shift · 8–12 min</small><b>{naira(shiftPay(j.pay))}</b>{near && owner.get(j.id)?.id === near.id ? <button className="jbApply" onClick={() => window.dispatchEvent(new CustomEvent('arl-enter', { detail: near.id }))}>🚪 Enter &amp; apply</button> : <small className="jbFar">📍 {j.district} · go there to apply</small>}</div>
      </div>)}
    </div>
    <p className="jbTip">Walk to the building, tap 🚪 Enter, then tap the 💼 Jobs spot (or the staff member) inside to apply.</p>
  </>;
}

function GameMap({ onClose, onSelect, getMinute }: { onClose: () => void; onSelect: (b: Business) => void; getMinute?: () => number }) {
  const [pos, setPos] = useState(() => ({ x: GAME.player.x, z: GAME.player.z }));
  const [selected, setSelected] = useState<Business | null>(null);
  useEffect(() => { const i = setInterval(() => setPos({ x: GAME.player.x, z: GAME.player.z }), 100); return () => clearInterval(i); }, []);
  const bounds = 58;
  const points = CITY.businesses.filter(b => Math.abs(b.x) <= bounds && Math.abs(b.z) <= bounds);
  const select = (b: Business) => { setSelected(b); onSelect(b); };
  const navigate = (b: Business) => {
    const build = CITY.buildings.find(x => x.business?.id === b.id);
    const pad = 5.2;
    let tx = b.x, tz = b.z;
    if (build) {
      const dx = pos.x - b.x, dz = pos.z - b.z;
      if (Math.abs(dx) >= Math.abs(dz)) tx = b.x + (dx >= 0 ? build.w / 2 + pad : -build.w / 2 - pad);
      else tz = b.z + (dz >= 0 ? build.d / 2 + pad : -build.d / 2 - pad);
    }
    GAME.nav = { x: tx, z: tz, name: b.name }; setSelected(b);
  };
  const navigateDistrict = (d: typeof CITY.districts[number]) => { GAME.nav = { x: d.x, z: d.z, name: d.name }; setSelected(null); };
  return <div className="realMap">
    <div className="realMapHead"><div><h3>🗺️ Abuja Real Life Map</h3><small>Tap a place to inspect it · Tap Navigate to travel there</small></div><button className="mapClose" onClick={onClose}>×</button></div>
    <div className="mapViewport">
      <svg viewBox={`0 0 ${MAP_W} ${MAP_W}`} role="application" aria-label="Interactive game map of Abuja Real Life">
        <rect x="0" y="0" width="120" height="120" fill="#14231d"/>
        {CITY.roads.map(r => r.d > r.w ? <g key={r.id}><line x1={mapX(r.x)} y1={2} x2={mapX(r.x)} y2={118} stroke={r.major ? '#d8b36a' : '#718078'} strokeWidth={r.major ? 1.25 : .65}/><text x={mapX(r.x)+1.4} y={mapY(0)-2} className="roadLabel">{r.name}</text></g> : <g key={r.id}><line x1={2} y1={mapY(r.z)} x2={118} y2={mapY(r.z)} stroke={r.major ? '#d8b36a' : '#718078'} strokeWidth={r.major ? 1.25 : .65}/><text x={mapX(0)+2} y={mapY(r.z)-1.5} className="roadLabel">{r.name}</text></g>)}
        {CITY.districts.map(d => <g key={d.name} onClick={() => navigateDistrict(d)} className="mapDistrict" role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') navigateDistrict(d); }}><circle cx={mapX(d.x)} cy={mapY(d.z)} r="3.4" fill="#243d31" stroke="#90a89d" strokeWidth=".35"/><text x={mapX(d.x)} y={mapY(d.z)-4.2} textAnchor="middle" className="districtLabel">{d.name}</text></g>)}
        {points.map(b => <g key={b.id} onClick={() => select(b)} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') select(b); }} className={`mapBiz ${selected?.id === b.id ? 'selected' : ''}`}><circle cx={mapX(b.x)} cy={mapY(b.z)} r={selected?.id === b.id ? 2.3 : 1.45} fill="#f0a83b" stroke="#111" strokeWidth=".45"/><title>{b.name} · {b.type}</title></g>)}
        {GAME.nav && <><circle cx={mapX(GAME.nav.x)} cy={mapY(GAME.nav.z)} r="3" fill="none" stroke="#ff5b52" strokeWidth="1"/><text x={mapX(GAME.nav.x)} y={mapY(GAME.nav.z)+6} textAnchor="middle" className="navLabel">DESTINATION</text></>}
        <circle cx={mapX(pos.x)} cy={mapY(pos.z)} r="2.8" fill="#4ba3ff" stroke="#fff" strokeWidth=".7"/><path d={`M ${mapX(pos.x)} ${mapY(pos.z)-5} L ${mapX(pos.x)-2} ${mapY(pos.z)-1} L ${mapX(pos.x)+2} ${mapY(pos.z)-1} Z`} fill="#4ba3ff"/>
      </svg>
      <div className="mapLegend"><span><i className="youDot"/>You</span><span><i className="bizDot"/>Business</span><span><i className="roadDot"/>Major road</span></div>
    </div>
    {selected && <div className="mapPlace"><div><b>{ICON[selected.type] || '🏢'} {selected.name}</b><small>{selected.type} · {selected.district} · {businessStatus(selected.type, getMinute ? getMinute() : 0).label}</small></div><button onClick={() => navigate(selected)}>📍 Navigate</button></div>}
    {GAME.nav && <div className="mapRoute">📍 Navigating to <b>{GAME.nav.name}</b><button onClick={() => { GAME.nav = null; }}>Cancel</button></div>}
    <p className="jbTip">The map uses the same coordinates as the 3D city: your blue marker moves live, businesses are clickable, and Navigate sends your character there.</p>
  </div>;
}

export default function City({ look, onNear, getMinute, onSocial, tab: tabProp, onTab }: { look: Look; onNear: (b: Business | null) => void; getMinute?: () => number; onSocial?: (a?: number) => void; tab?: Tab; onTab?: (t: Tab) => void }) {
  const [own, setOwn] = useState<Tab>(null), [near, setNear] = useState<Business | null>(null), [focus, setFocus] = useState<Business | null>(null), [entering, setEntering] = useState(false), [dismissed, setDismissed] = useState<string | null>(null);
  const controlled = onTab !== undefined, tab = controlled ? (tabProp ?? null) : own, setTab = (t: Tab) => (controlled ? onTab!(t) : setOwn(t));
  return <div className="cityShell">
    <CityWorld look={look} onNear={b => { setNear(b); setDismissed(d => (b && d === b.id ? d : null)); onNear(b); }} getMinute={getMinute} onSocial={onSocial} onOpenMap={() => setTab('map')} />
    {!controlled && <div className="cityActions"><button onClick={() => setTab(tab === 'map' ? null : 'map')}>🗺️<em> Map</em></button><button onClick={() => setTab(tab === 'jobs' ? null : 'jobs')}>💼<em> Jobs</em></button><button onClick={() => setTab(tab === 'businesses' ? null : 'businesses')}>🏪<em> Businesses</em></button></div>}
    {near && !tab && dismissed !== near.id && (() => { const bs = businessStatus(near.type, getMinute ? getMinute() : 0); return <div className="nearCard" role="dialog" aria-label={`Nearby building: ${near.name}`}>
      <button type="button" className="ncClose" aria-label="Close" onClick={() => setDismissed(near.id)}>×</button>
      <div className="nearIdentity"><div className="nearIcon">🏢</div><div className="nearCopy"><b>{near.name}</b><span>{near.type} · {near.district}</span><em className={bs.open ? 'openNow' : 'closedNow'}>{bs.open ? '● OPEN' : '● CLOSED'} · {bs.hours}</em></div></div>
      <div className="nearActions"><button onClick={() => { setFocus(null); setTab('jobs'); }}>💼 Jobs</button><button className="ncEnter" disabled={!bs.open || entering} onClick={() => { setEntering(true); window.dispatchEvent(new CustomEvent('arl-enter', { detail: near.id })); setTimeout(() => setEntering(false), 1200); }}>{entering ? '⏳ Entering…' : bs.open ? '🚪 Enter' : '🔒 Closed'}</button></div>
    </div>; })()}
    {tab && <div className="cityPanel sheet"><button className="close" onClick={() => setTab(null)}>×</button>
      {tab === 'map' && <GameMap getMinute={getMinute} onClose={() => setTab(null)} onSelect={b => { setFocus(b); }} />}
      {tab === 'businesses' && <><div className="jbHead"><h3>🏪 Businesses</h3><span>{CITY.businesses.length}</span></div><div className="jbList">{CITY.businesses.slice(0, 45).map(b => <button key={b.id} className="jbCard btn" onClick={() => { setFocus(b); setTab('jobs'); }}><div className="jbIc">{ICON[b.type] || '🏢'}</div><div className="jbBody"><b>{b.name}</b><span>{b.type} · {b.district}</span></div></button>)}</div></>}
      {tab === 'jobs' && <Jobs near={near} focus={focus} />}
    </div>}
  </div>;
}