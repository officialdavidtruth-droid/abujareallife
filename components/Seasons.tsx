'use client';
import { useEffect, useState } from 'react';

/* Seasons: seasonal leaderboards. Display only: /api/season decides the standings. The list of boards comes from the server,
   so adding a board there (race times, richest crew) makes it appear here without changing this file. */

type Board = { id: string; label: string; icon: string; unit: string; blurb: string; lowerIsBetter: boolean };
type Data = {
  season: { index: number; name: string; msLeft: number; day: number }; boards: Board[]; board: string;
  top: { rank: number; name: string; score: number; you: boolean }[]; me: { rank: number | null; score: number } | null;
};
const left = (ms: number) => { const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4); return d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`; };

export default function SeasonsPanel() {
  const [board, setBoard] = useState('fame'), [d, setD] = useState<Data | null>(null), [bad, setBad] = useState(false);
  useEffect(() => {
    let live = true;
    const load = () => fetch('/api/season?board=' + board).then(r => r.json()).then(x => { if (live && x.top) { setD(x); setBad(false); } else if (live) setBad(true); }).catch(() => { if (live) setBad(true); });
    load(); const i = setInterval(() => { if (!document.hidden) load(); }, 20000);   // not while the app is in the background
    return () => { live = false; clearInterval(i); };
  }, [board]);
  const b = d?.boards.find(x => x.id === board);
  const fmt = (n: number) => (b?.unit === 'ms' ? (n / 1000).toFixed(3) + ' s' : n.toLocaleString() + (b?.unit && b.unit !== 'naira' ? ' ' + b.unit : ''));
  return <>
    <h3>🏅 {d ? d.season.name : 'Seasons'}</h3>
    {d && <p className="m">Day {d.season.day} · ends in <b>{left(d.season.msLeft)}</b>. Everyone starts from zero each season.</p>}
    {d && d.boards.length > 1 && <div className="tiers">{d.boards.map(x => <button key={x.id} className={'chip' + (x.id === board ? ' on' : '')} onClick={() => setBoard(x.id)}>{x.icon} {x.label}</button>)}</div>}
    {b && <p className="m">{b.icon} <b>{b.label}.</b> {b.blurb}</p>}
    {d?.me && <div className="fameMe"><b>You are #{d.me.rank}</b><span>{fmt(d.me.score)}</span></div>}
    {d && !d.me && <p className="m">You have no score on this board yet this season.</p>}
    {!d && !bad && <p className="m">Loading standings…</p>}
    {bad && <p className="m">Could not load the standings. Check your connection.</p>}
    {d && d.top.length === 0 && <p className="m">Nobody has scored yet. Be the first.</p>}
    {d && d.top.length > 0 && <div className="lbGroup">{d.top.map(r => <div key={r.rank} className={'lbRow' + (r.you ? ' you' : '')}><em>#{r.rank}</em><b>{r.name}</b><span>{fmt(r.score)}</span></div>)}</div>}
  </>;
}
