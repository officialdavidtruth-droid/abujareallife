'use client';
import { useEffect, useMemo, useState } from 'react';
import CityWorld, { GAME } from './CityWorld';
import { ALL_DESTS, BUILDING_DESTS, BUILDS_WORLD } from '../lib/destinations';
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
const ICON: Record<string, string> = { Bank: '🏦', Restaurant: '🍽️', Hotel: '🏨', Hospital: '🏥', Supermarket: '🛒', Salon: '💇', Barber: '💈', Gym: '🏋️', Mechanic: '🔧', 'Car Dealer': '🚗', School: '🎓', Office: '🏢', Nightclub: '🎶', Market: '🧺', 'Petrol Station': '⛽', Pharmacy: '💊', Cinema: '🎬', 'Tech Company': '💻', 'Estate Agency': '🏠', Logistics: '📦', Government: '🏛️', Airport: '✈️', 'Rail Station': '🚆', 'Police Station': '👮', Jail: '🔒', 'Gun Shop': '🔫' };
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

const WALK_MPS = 4.2; // about how fast the character walks, for the time estimate
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const bearing = (dx: number, dz: number) => COMPASS[(Math.round(Math.atan2(dx, -dz) / (Math.PI / 4)) + 8) % 8]; // map up = -z = north
const metres = (n: number) => n >= 1000 ? (n / 1000).toFixed(1) + ' km' : Math.round(n / 5) * 5 + ' m';

/* Turn the route into plain steps ("Head north 60 m, then turn east 25 m"), merging legs that point the same way. */
function directions(from: { x: number; z: number }, route: { pts: [number, number][]; i: number } | null, to: { x: number; z: number }) {
  const pts: [number, number][] = [[from.x, from.z], ...(route ? route.pts.slice(route.i) : []), [to.x, to.z]];
  const legs: { dir: string; d: number }[] = []; let total = 0;
  for (let k = 1; k < pts.length; k++) {
    const dx = pts[k][0] - pts[k - 1][0], dz = pts[k][1] - pts[k - 1][1], d = Math.hypot(dx, dz); if (d < 1.5) continue;
    total += d; const dir = bearing(dx, dz), last = legs[legs.length - 1];
    if (last && last.dir === dir) last.d += d; else legs.push({ dir, d });
  }
  return { legs, total, pts };
}

function GameMap({ onClose, onSelect, getMinute }: { onClose: () => void; onSelect: (b: Business) => void; getMinute?: () => number }) {
  const [pos, setPos] = useState(() => ({ x: GAME.player.x, z: GAME.player.z, r: GAME.player.r }));
  const [selected, setSelected] = useState<Business | null>(null);
  const [, bump] = useState(0);
  useEffect(() => { const i = setInterval(() => { setPos({ x: GAME.player.x, z: GAME.player.z, r: GAME.player.r }); bump(n => n + 1); }, 150); return () => clearInterval(i); }, []);
  // the map uses the SAME world coordinates as the 3D city (22 m road grid), so the blue marker, buildings and routes line up with what you see
  const mx = (x: number) => 130 + x, my = (z: number) => 130 + z;
  const shops = useMemo(() => BUILDS_WORLD.filter(b => b.business), []);
  const doorOf = useMemo(() => { const m = new Map<string, { x: number; z: number }>(); BUILDING_DESTS.forEach(d => m.set(d.id, { x: d.x, z: d.z })); return m; }, []);
  const places = useMemo(() => ALL_DESTS.filter(d => d.type === 'District'), []);
  const roads = useMemo(() => Array.from({ length: 11 }, (_, n) => n - 5), []);
  const select = (b: Business) => { setSelected(b); onSelect(b); };
  const navigate = (b: Business) => { const d = doorOf.get(b.id); if (!d) return; GAME.nav = { x: d.x, z: d.z, name: b.name }; };
  const goTo = (d: { x: number; z: number; name: string }) => { GAME.nav = { x: d.x, z: d.z, name: d.name }; setSelected(null); };
  const pickPoint = (e: React.MouseEvent<SVGSVGElement>) => { // tap any spot on the map to drop a pin and get a route to it
    const svg = e.currentTarget, pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svg.getScreenCTM(); if (!ctm) return; const w = pt.matrixTransform(ctm.inverse());
    const x = Math.max(-124, Math.min(124, w.x - 130)), z = Math.max(-124, Math.min(124, w.y - 130));
    GAME.nav = { x, z, name: 'Dropped pin' }; setSelected(null);
  };
  const nav = GAME.nav, dir = nav ? directions(pos, GAME.route, nav) : null;
  const heading = Math.atan2(Math.sin(pos.r), -Math.cos(pos.r)) * 180 / Math.PI;
  return <div className="realMap">
    <div className="realMapHead"><div><h3>🗺️ Abuja Real Life Map</h3><small>Tap a place, or tap anywhere on the map to drop a pin · the route shows up in red</small></div><button className="mapClose" onClick={onClose}>×</button></div>
    <div className="mapViewport">
      <svg viewBox="0 0 260 260" role="application" aria-label="Interactive game map of Abuja Real Life" onClick={pickPoint} style={{ cursor: 'crosshair', touchAction: 'manipulation' }}>
        <rect x="0" y="0" width="260" height="260" fill="#14231d" />
        {shops.map(b => <rect key={b.id} x={mx(b.x - b.w / 2)} y={my(b.z - b.d / 2)} width={b.w} height={b.d} fill="#2b3f36" />)}
        {roads.map(k => { const major = k % 2 === 0, w = major ? 3.4 : 2.2, c = major ? '#8a7f5c' : '#5d6a63'; return <g key={k}><rect x={mx(k * 22) - w / 2} y={5} width={w} height={250} fill={c} /><rect x={5} y={my(k * 22) - w / 2} width={250} height={w} fill={c} /></g>; })}
        {dir && <polyline points={dir.pts.map(p => `${mx(p[0])},${my(p[1])}`).join(' ')} fill="none" stroke="#ff3b30" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 3" style={{ pointerEvents: 'none' }} />}
        {places.map(d => <g key={d.id} onClick={e => { e.stopPropagation(); goTo(d); }} className="mapDistrict" role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') goTo(d); }}><circle cx={mx(d.x)} cy={my(d.z)} r="6" fill="#243d31" fillOpacity=".55" stroke="#90a89d" strokeWidth=".6" /><text x={mx(d.x)} y={my(d.z) - 8} textAnchor="middle" className="districtLabel" style={{ fontSize: '5px' }}>{d.name}</text></g>)}
        {shops.map(b => { const biz = b.business!, on = selected?.id === biz.id; return <g key={biz.id} onClick={e => { e.stopPropagation(); select(biz); }} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') select(biz); }} className={`mapBiz ${on ? 'selected' : ''}`}><circle cx={mx(b.x)} cy={my(b.z)} r={on ? 4.4 : biz.type === 'Gun Shop' ? 3.6 : 2.7} fill={biz.type === 'Gun Shop' ? '#ff5b52' : '#f0a83b'} stroke="#111" strokeWidth=".8" /><title>{biz.name} · {biz.type}</title></g>; })}
        {nav && <g style={{ pointerEvents: 'none' }}><circle cx={mx(nav.x)} cy={my(nav.z)} r="6" fill="#ff3b30" fillOpacity=".25" stroke="#ff5b52" strokeWidth="1.4" /><circle cx={mx(nav.x)} cy={my(nav.z)} r="2" fill="#ff3b30" /><text x={mx(nav.x)} y={my(nav.z) + 12} textAnchor="middle" className="navLabel" style={{ fontSize: '5px' }}>{nav.name}</text></g>}
        <g transform={`translate(${mx(pos.x)} ${my(pos.z)}) rotate(${heading})`} style={{ pointerEvents: 'none' }}><circle r="5" fill="#4ba3ff" stroke="#fff" strokeWidth="1.2" /><path d="M0 -11 L-4 -4 L4 -4 Z" fill="#4ba3ff" stroke="#fff" strokeWidth=".8" /></g>
      </svg>
      <div className="mapLegend"><span><i className="youDot" />You</span><span><i className="bizDot" />Business</span><span><i style={{ background: '#ff5b52' }} />Gun Shop</span><span><i style={{ background: '#ff3b30' }} />Route</span></div>
    </div>
    {selected && <div className="mapPlace"><div><b>{ICON[selected.type] || '🏢'} {selected.name}</b><small>{selected.type} · {selected.district} · {businessStatus(selected.type, getMinute ? getMinute() : 0).label}</small></div><button onClick={() => navigate(selected)}>📍 Show route</button></div>}
    {nav && dir && <div className="mapRoute" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}><span>📍 <b>{nav.name}</b> · {metres(dir.total)} · about {Math.max(1, Math.round(dir.total / WALK_MPS / 60))} min on foot</span><button onClick={() => { GAME.nav = null; }}>Clear</button></div>
      {dir.legs.length > 0 && <ol style={{ margin: '8px 0 0', paddingLeft: 18, display: 'grid', gap: 3, color: '#cfe' }}>{dir.legs.slice(0, 6).map((l, i) => <li key={i}>{i === 0 ? 'Head' : 'Then go'} <b>{l.dir}</b> for {metres(l.d)}</li>)}{dir.legs.length > 6 && <li>…then keep following the red line</li>}<li>You have arrived at <b>{nav.name}</b></li></ol>}
    </div>}
    <p className="jbTip">You walk there yourself: the red line is your route. It also shows on your minimap while you travel.</p>
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
