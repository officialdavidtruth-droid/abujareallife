'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import CityWorld, { GAME } from './CityWorld';
import { ALL_DESTS, BUILDING_DESTS, BUILDS_WORLD } from '../lib/destinations';
import { CITY } from '../lib/cityData';
import { shiftPay } from '../lib/interiors';
import { shiftJobs } from '../lib/work';
import type { Look } from '../lib/characterModels';
import type { Business, Job } from '../lib/cityTypes';
import { businessStatus } from '../lib/businessHours';
import { HOUSES } from '../lib/houses';
import { BRIDGES, DOCKS, HIGHWAYS, HW_HALF, SWIM_DEPTH, WORLD_LIM, hwPath, hwPoint, waterDepth } from '../lib/terrain';
import { getTerrainMap } from '../lib/terrainMap';
import { GRID, WS, halfW } from '../lib/roadRoute';

type Tab = 'map' | 'jobs' | 'businesses' | null;
const ICON: Record<string, string> = { Bank: '🏦', Restaurant: '🍽️', Hotel: '🏨', Hospital: '🏥', Supermarket: '🛒', Salon: '💇', Barber: '💈', Gym: '🏋️', Mechanic: '🔧', 'Car Dealer': '🚗', School: '🎓', Office: '🏢', Nightclub: '🎶', Market: '🧺', 'Petrol Station': '⛽', Pharmacy: '💊', Cinema: '🎬', 'Tech Company': '💻', 'Estate Agency': '🏠', Logistics: '📦', Government: '🏛️', Airport: '✈️', 'Rail Station': '🚆', 'Police Station': '👮', Jail: '🔒', 'Gun Shop': '🔫', 'Fashion Boutique': '👗' };
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
  /* The map covers the WHOLE world (city, countryside, river, lake and sea) in world metres: 1 SVG unit = 1 m, the same coordinates as the 3D world, so the blue marker,
     buildings, highways and routes line up with what you see. The picture of the land under the roads is the one the minimap uses (lib/terrainMap.ts). */
  const WL = WORLD_LIM, WORLD = WL * 2;
  const [land, setLand] = useState<string>('');
  useEffect(() => { const f = () => { const c = getTerrainMap(); if (c) { try { setLand(c.toDataURL()); } catch { /* ignore */ } } }; f(); const i = setInterval(f, 1500); return () => clearInterval(i); }, []);   // the picture fills in over the first seconds after the game starts
  const shops = useMemo(() => BUILDS_WORLD.filter(b => b.business), []);
  const doorOf = useMemo(() => { const m = new Map<string, { x: number; z: number }>(); BUILDING_DESTS.forEach(d => m.set(d.id, { x: d.x, z: d.z })); return m; }, []);
  const places = useMemo(() => ALL_DESTS.filter(d => d.type === 'District'), []);
  const roads = useMemo(() => Array.from({ length: 11 }, (_, n) => n - 5), []);
  const hwLines = useMemo(() => HIGHWAYS.map(h => ({ h, line: hwPath(h), bridges: h.spans.map(([a, b]) => hwPath(h, a, b, 8)), label: hwPoint(h, h.len * .42) })), []);
  const pts = (l: [number, number][]) => l.map(p => `${p[0]},${p[1]}`).join(' ');
  /* pan + zoom: drag with one finger to move the map, pinch with two to zoom (mouse wheel and the + / − buttons work too). A tap without dragging still picks a place or drops a pin.
     view = the centre of what you see (world metres) and the span of the square window in metres (smaller = zoomed in). */
  const MIN_SPAN = 70;
  const [view, setView] = useState(() => ({ x: GAME.player.x, y: GAME.player.z, s: 620 }));
  const ptrs = useRef(new Map<number, { x: number; y: number }>()), drag = useRef({ moved: 0, pinch: 0 });
  const clampView = (v: { x: number; y: number; s: number }) => { const s = Math.max(MIN_SPAN, Math.min(WORLD, v.s)), h = s / 2, lim = Math.max(0, WL - h); return { s, x: Math.max(-lim, Math.min(lim, v.x)), y: Math.max(-lim, Math.min(lim, v.y)) }; };
  const zoomAt = (el: SVGSVGElement, cx: number, cy: number, f: number) => setView(v => { const r = el.getBoundingClientRect(), k0 = v.s / r.width, wx = v.x - v.s / 2 + (cx - r.left) * k0, wy = v.y - v.s / 2 + (cy - r.top) * k0, s = Math.max(MIN_SPAN, Math.min(WORLD, v.s / f)), k1 = s / r.width; return clampView({ s, x: wx - (cx - r.left) * k1 + s / 2, y: wy - (cy - r.top) * k1 + s / 2 }); });
  const mapDown = (e: React.PointerEvent<SVGSVGElement>) => { ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); drag.current.moved = 0; if (ptrs.current.size === 2) { const [a, b] = [...ptrs.current.values()]; drag.current.pinch = Math.hypot(a.x - b.x, a.y - b.y); } };
  const mapMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const prev = ptrs.current.get(e.pointerId); if (!prev) return; const el = e.currentTarget, r = el.getBoundingClientRect();
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size >= 2) { const [a, b] = [...ptrs.current.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (drag.current.pinch > 0 && d > 0) { drag.current.moved = 99; zoomAt(el, (a.x + b.x) / 2, (a.y + b.y) / 2, d / drag.current.pinch); } drag.current.pinch = d; return; }
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y; drag.current.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.current.moved < 8) return;   // still a tap
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    setView(v => { const k = v.s / r.width; return clampView({ ...v, x: v.x - dx * k, y: v.y - dy * k }); });
  };
  const mapUp = (e: React.PointerEvent<SVGSVGElement>) => { ptrs.current.delete(e.pointerId); drag.current.pinch = 0; if (ptrs.current.size === 1) drag.current.moved = 99; };
  const zoomBtn = (f: number) => setView(v => clampView({ ...v, s: v.s / f }));
  const u = view.s / 260;   // world metres per "map unit": every marker, line and label below is sized in these, so it keeps the same size on screen at any zoom
  const viewBox = `${view.x - view.s / 2} ${view.y - view.s / 2} ${view.s} ${view.s}`;
  const showShops = view.s < 1100, showLabels = view.s < 1500;
  const select = (b: Business) => { setSelected(b); onSelect(b); };
  const navigate = (b: Business) => { const d = doorOf.get(b.id); if (!d) return; GAME.nav = { x: d.x, z: d.z, name: b.name }; };
  const goTo = (d: { x: number; z: number; name: string }) => { GAME.nav = { x: d.x, z: d.z, name: d.name }; setSelected(null); };
  const pickPoint = (e: React.MouseEvent<SVGSVGElement>) => { // tap any spot on the map to drop a pin and get a route to it
    const svg = e.currentTarget, pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svg.getScreenCTM(); if (!ctm) return; const w = pt.matrixTransform(ctm.inverse());
    const x = Math.max(-(WL - 20), Math.min(WL - 20, w.x)), z = Math.max(-(WL - 20), Math.min(WL - 20, w.y));
    GAME.nav = { x, z, name: waterDepth(x, z) > SWIM_DEPTH ? 'Dropped pin (in the water)' : 'Dropped pin' }; setSelected(null);
  };
  const nav = GAME.nav, dir = nav ? directions(pos, GAME.route, nav) : null;
  const fin = (window as any).__arlMissionId ? GAME.missionFinal : null, finLeg = nav && fin && (fin.x !== nav.x || fin.z !== nav.z) ? fin : null; // final destination of the active mission (when it is a later stop)
  const heading = Math.atan2(Math.sin(pos.r), -Math.cos(pos.r)) * 180 / Math.PI;
  return <div className="realMap">
    <div className="realMapHead"><div><h3>🗺️ Abuja Real Life Map</h3><small>Tap a place, or tap anywhere on the map to drop a pin · the route shows up in red</small></div><button className="mapClose" onClick={onClose}>×</button></div>
    <div className="mapViewport">
      <svg viewBox={viewBox} role="application" aria-label="Interactive game map of Abuja Real Life" onClick={pickPoint} onClickCapture={e => { if (drag.current.moved >= 8) { e.stopPropagation(); e.preventDefault(); drag.current.moved = 0; } }} onPointerDown={mapDown} onPointerMove={mapMove} onPointerUp={mapUp} onPointerCancel={mapUp} onWheel={e => zoomAt(e.currentTarget, e.clientX, e.clientY, e.deltaY < 0 ? 1.2 : 1 / 1.2)} style={{ cursor: 'grab', touchAction: 'none' }}>
        <rect x={-WL} y={-WL} width={WORLD} height={WORLD} fill="#14231d" />
        {land && <image href={land} x={-WL} y={-WL} width={WORLD} height={WORLD} preserveAspectRatio="none" style={{ pointerEvents: 'none' }} />}
        {showShops && shops.map(b => <rect key={b.id} x={b.x - b.w / 2} y={b.z - b.d / 2} width={b.w} height={b.d} fill="#2b3f36" />)}
        {roads.map(k => { const major = k % 2 === 0, w = major ? halfW(0) * 2 : halfW(1) * 2, c = major ? '#8a7f5c' : '#5d6a63', L = 125 * WS; return <g key={k}><rect x={k * GRID - w / 2} y={-L} width={w} height={L * 2} fill={c} /><rect x={-L} y={k * GRID - w / 2} width={L * 2} height={w} fill={c} /></g>; })}
        {hwLines.map(({ h, line, bridges, label }) => <g key={h.id} style={{ pointerEvents: 'none' }}>
          <polyline points={pts(line)} fill="none" stroke="#8a7f5c" strokeWidth={Math.max(HW_HALF * 2 + 2, 3.2 * u)} strokeLinejoin="round" strokeLinecap="butt" />
          {bridges.map((b, i) => <polyline key={i} points={pts(b)} fill="none" stroke="#f0d070" strokeWidth={Math.max(HW_HALF * 2 + 5, 4.6 * u)} strokeLinecap="butt" />)}
          {bridges.map((b, i) => <polyline key={'i' + i} points={pts(b)} fill="none" stroke="#8a7f5c" strokeWidth={Math.max(HW_HALF * 2 + 1, 2.4 * u)} strokeLinecap="butt" />)}
          {showLabels && <text x={label.x} y={label.z - 5 * u} textAnchor="middle" className="districtLabel" style={{ fontSize: 5 * u + 'px' }}>{h.name}</text>}
        </g>)}
        {BRIDGES.map(b => <text key={b.id} x={b.x} y={b.z + 2.4 * u} textAnchor="middle" style={{ fontSize: 7 * u + 'px', pointerEvents: 'none' }}>🌉<title>{b.name}</title></text>)}
        {DOCKS.map(d => <g key={d.id} onClick={e => { e.stopPropagation(); goTo({ x: d.px, z: d.pz, name: d.name }); }} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') goTo({ x: d.px, z: d.pz, name: d.name }); }}><text x={d.px} y={d.pz + 2.4 * u} textAnchor="middle" style={{ fontSize: 6.5 * u + 'px' }}>⚓<title>{d.name}</title></text></g>)}
        {dir && <polyline points={dir.pts.map(p => `${p[0]},${p[1]}`).join(' ')} fill="none" stroke="#ff3b30" strokeWidth={2.2 * u} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${4 * u} ${3 * u}`} style={{ pointerEvents: 'none' }} />}
        {finLeg && nav && <line x1={nav.x} y1={nav.z} x2={finLeg.x} y2={finLeg.z} stroke="#ffd23f" strokeWidth={1.6 * u} strokeDasharray={`${2 * u} ${3 * u}`} strokeLinecap="round" style={{ pointerEvents: 'none' }} />}
        {places.map(d => <g key={d.id} onClick={e => { e.stopPropagation(); goTo(d); }} className="mapDistrict" role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') goTo(d); }}><circle cx={d.x} cy={d.z} r={6 * u} fill="#243d31" fillOpacity=".55" stroke="#90a89d" strokeWidth={.6 * u} /><text x={d.x} y={d.z - 8 * u} textAnchor="middle" className="districtLabel" style={{ fontSize: 5 * u + 'px' }}>{d.name}</text></g>)}
        {showShops && shops.map(b => { const biz = b.business!, on = selected?.id === biz.id; return <g key={biz.id} onClick={e => { e.stopPropagation(); select(biz); }} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') select(biz); }} className={`mapBiz ${on ? 'selected' : ''}`}><circle cx={b.x} cy={b.z} r={(on ? 4.4 : biz.type === 'Gun Shop' ? 3.6 : 2.7) * u} fill={biz.type === 'Gun Shop' ? '#ff5b52' : '#f0a83b'} stroke="#111" strokeWidth={.8 * u} /><title>{biz.name} · {biz.type}</title></g>; })}
        {nav && <g style={{ pointerEvents: 'none' }}><circle cx={nav.x} cy={nav.z} r={6 * u} fill="#ff3b30" fillOpacity=".25" stroke="#ff5b52" strokeWidth={1.4 * u} /><circle cx={nav.x} cy={nav.z} r={2 * u} fill="#ff3b30" /><text x={nav.x} y={nav.z + 12 * u} textAnchor="middle" className="navLabel" style={{ fontSize: 5 * u + 'px' }}>{nav.name}</text></g>}
        {fin && <g style={{ pointerEvents: 'none' }}><circle cx={fin.x} cy={fin.z} r={6 * u} fill="#ffd23f" fillOpacity=".25" stroke="#ffd23f" strokeWidth={1.4 * u} /><text x={fin.x} y={fin.z + 2 * u} textAnchor="middle" style={{ fontSize: 7 * u + 'px' }}>🏁</text><text x={fin.x} y={fin.z - 8 * u} textAnchor="middle" className="navLabel" style={{ fontSize: 5 * u + 'px', fill: '#ffd23f' }}>Final: {fin.name}</text></g>}
        <g transform={`translate(${pos.x} ${pos.z}) rotate(${heading}) scale(${u})`} style={{ pointerEvents: 'none' }}><circle r="5" fill="#4ba3ff" stroke="#fff" strokeWidth="1.2" /><path d="M0 -11 L-4 -4 L4 -4 Z" fill="#4ba3ff" stroke="#fff" strokeWidth=".8" /></g>
      </svg>
      <div className="mapZoom"><button type="button" aria-label="Zoom in" onClick={() => zoomBtn(1.5)}>+</button><button type="button" aria-label="Zoom out" onClick={() => zoomBtn(1 / 1.5)}>−</button><button type="button" aria-label="Centre on me" onClick={() => setView(clampView({ x: pos.x, y: pos.z, s: Math.min(view.s, 420) }))}>◎</button><button type="button" aria-label="Show the whole world" onClick={() => setView({ x: 0, y: 0, s: WORLD })}>🌍</button></div>
      <div className="mapLegend"><span><i className="youDot" />You</span><span><i className="bizDot" />Business</span><span><i style={{ background: '#ff5b52' }} />Gun Shop</span><span><i style={{ background: '#8a7f5c' }} />Highway</span><span>🌉 Bridge</span><span>⚓ Dock</span><span><i style={{ background: '#ff3b30' }} />Route</span>{fin && <span><i style={{ background: '#ffd23f' }} />Final destination</span>}</div>
    </div>
    {HOUSES.mine && !selected && <div className="mapPlace"><div><b>🏠 Your house</b><small>On the street outside the ring road · {HOUSES.mine.u}</small></div><button onClick={() => { const m = HOUSES.mine!; GAME.nav = { x: m.exit.x, z: m.exit.z, name: 'Your house' }; }}>📍 Route home</button></div>}
    {selected && <div className="mapPlace"><div><b>{ICON[selected.type] || '🏢'} {selected.name}</b><small>{selected.type} · {selected.district} · {businessStatus(selected.type, getMinute ? getMinute() : 0).label}</small></div><button onClick={() => navigate(selected)}>📍 Show route</button></div>}
    {nav && dir && <div className="mapRoute" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}><span>📍 <b>{nav.name}</b> · {metres(dir.total)} · about {Math.max(1, Math.round(dir.total / WALK_MPS / 60))} min on foot</span><button onClick={() => { GAME.nav = null; }}>Clear</button></div>
      {fin && <div style={{ marginTop: 6, color: '#ffd23f' }}>🏁 Mission final destination: <b>{fin.name}</b></div>}
      {dir.legs.length > 0 && <ol style={{ margin: '8px 0 0', paddingLeft: 18, display: 'grid', gap: 3, color: '#cfe' }}>{dir.legs.slice(0, 6).map((l, i) => <li key={i}>{i === 0 ? 'Head' : 'Then go'} <b>{l.dir}</b> for {metres(l.d)}</li>)}{dir.legs.length > 6 && <li>…then keep following the red line</li>}<li>You have arrived at <b>{nav.name}</b></li></ol>}
    </div>}
    <p className="jbTip">You travel there yourself: the red line is your route. It also shows on your minimap while you travel. Highways run out of the city; the 🌉 bridges cross the river.</p>
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
