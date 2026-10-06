'use client';
import { useMemo, useState } from 'react';
import CityWorld from './CityWorld';
import { CITY } from '../lib/cityData';
import { shiftPay } from '../lib/interiors';
import { shiftJobs } from '../lib/work';
import type { Look } from '../lib/characterModels';
import type { Business, Job } from '../lib/cityTypes';

type Tab = 'map' | 'jobs' | 'businesses' | null;
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
        <div className="jbShift"><small>per shift · 45–60 min</small><b>{naira(shiftPay(j.pay))}</b>{near && owner.get(j.id)?.id === near.id ? <button className="jbApply" onClick={() => window.dispatchEvent(new CustomEvent('arl-enter', { detail: near.id }))}>🚪 Enter &amp; apply</button> : <small className="jbFar">📍 {j.district} · go there to apply</small>}</div>
      </div>)}
    </div>
    <p className="jbTip">Walk to the building, tap 🚪 Enter, then tap the 💼 Jobs spot (or the staff member) inside to apply.</p>
  </>;
}

export default function City({ look, onNear, getMinute, onSocial, tab: tabProp, onTab }: { look: Look; onNear: (b: Business | null) => void; getMinute?: () => number; onSocial?: (a?: number) => void; tab?: Tab; onTab?: (t: Tab) => void }) {
  const [own, setOwn] = useState<Tab>(null), [near, setNear] = useState<Business | null>(null), [focus, setFocus] = useState<Business | null>(null);
  const controlled = onTab !== undefined, tab = controlled ? (tabProp ?? null) : own, setTab = (t: Tab) => (controlled ? onTab!(t) : setOwn(t));
  return <div className="cityShell">
    <CityWorld look={look} onNear={b => { setNear(b); onNear(b); }} getMinute={getMinute} onSocial={onSocial} />
    <div className="cityTop"><b>🏙️ ABUJA REAL LIFE</b><span>{CITY.buildings.length} buildings · {CITY.businesses.length} businesses</span></div>
    {!controlled && <div className="cityActions"><button onClick={() => setTab(tab === 'map' ? null : 'map')}>🗺️<em> Map</em></button><button onClick={() => setTab(tab === 'jobs' ? null : 'jobs')}>💼<em> Jobs</em></button><button onClick={() => setTab(tab === 'businesses' ? null : 'businesses')}>🏪<em> Businesses</em></button></div>}
    {near && !tab && <div className="nearCard"><b>{near.name}</b><span>{near.type} · {near.district}</span><button onClick={() => { setFocus(null); setTab('jobs'); }}>💼 Jobs &amp; apply</button><button className="ncEnter" onClick={() => window.dispatchEvent(new CustomEvent('arl-enter', { detail: near.id }))}>🚪 Enter</button></div>}
    {tab && <div className="cityPanel sheet"><button className="close" onClick={() => setTab(null)}>×</button>
      {tab === 'map' && <><h3>🗺️ Abuja map</h3><div className="mapGrid">{CITY.districts.map(d => <div key={d.name} style={{ left: `${50 + d.x * .75}%`, top: `${50 + d.z * .75}%` }}>{d.name}</div>)}</div><p className="jbTip">Major roads connect every district.</p></>}
      {tab === 'businesses' && <><div className="jbHead"><h3>🏪 Businesses</h3><span>{CITY.businesses.length}</span></div><div className="jbList">{CITY.businesses.slice(0, 45).map(b => <button key={b.id} className="jbCard btn" onClick={() => { setFocus(b); setTab('jobs'); }}><div className="jbIc">{ICON[b.type] || '🏢'}</div><div className="jbBody"><b>{b.name}</b><span>{b.type} · {b.district}</span></div></button>)}</div></>}
      {tab === 'jobs' && <Jobs near={near} focus={focus} />}
    </div>}
  </div>;
}
