'use client';
/* Top-left profile card: avatar, name + fame badge, level with XP bar, and four labelled bars
   (Health, Energy, Hunger, Mood). The other four needs (hygiene, bladder, fun, social) sit in a thin row of
   small icon bars underneath so nothing is lost. Health is live (read from the fight state every 250 ms). */
import { useEffect, useState } from 'react';
import { NET } from '../lib/cityNet';
import { fameTier, skillLevel, type Profile } from '../lib/profile';
import type { Look } from '../lib/characterModels';

type Needs = Record<string, number>;
const MAIN: [string, string, string, string][] = [   // key, icon, label, bar colour
  ['hp', '❤️', 'Health', '#e5484d'], ['energy', '⚡', 'Energy', '#9bd23c'], ['hunger', '🍔', 'Hunger', '#3fa9f5'], ['mood', '😊', 'Mood', '#f0b94a'],
];
const MINI: [string, string][] = [['hygiene', '🚿'], ['bladder', '🚽'], ['fun', '🎮'], ['social', '💬']];

/* Player level from total skill XP (skills already use level = floor(sqrt(xp / 10)); this just sums them up smoothly). */
export function playerLevel(profile: Profile | null | undefined) {
  const total = Object.values(profile?.skills || {}).reduce((a, b) => a + (Number(b) || 0), 0);
  const lvl = 1 + Math.floor(Math.sqrt(total / 25)), lo = 25 * (lvl - 1) ** 2, hi = 25 * lvl ** 2;
  return { lvl, pct: Math.max(0, Math.min(100, Math.round(((total - lo) / (hi - lo)) * 100))) };
}

export default function HudCard({ look, profile, needs, mood }: { look: Look | null; profile: Profile | null; needs: Needs; mood: number }) {
  const [hp, setHp] = useState(100);
  useEffect(() => { const id = setInterval(() => setHp(Math.round(NET.me.hp ?? 100)), 250); return () => clearInterval(id); }, []);
  const { lvl, pct } = playerLevel(profile);
  const tier = fameTier(Number((profile as any)?.fame) || 0);
  const val = (k: string) => Math.max(0, Math.min(100, Math.round(k === 'hp' ? hp : k === 'mood' ? mood : needs[k] ?? 0)));
  return <div className="needs rhud">
    <div className="rhHead">
      <div className="rhAv" style={{ ['--skin' as any]: look?.skin || '#8b552f', ['--hair' as any]: look?.hairColor || '#0d0907' }} aria-hidden><i /><b /></div>
      <div className="rhWho"><strong>{look?.name || 'You'}{tier.at > 0 && <em> {tier.e}</em>}</strong>
        <span>Level {lvl}</span><div className="rhXp"><i style={{ width: pct + '%' }} /></div></div>
    </div>
    {MAIN.map(([k, e, l, c]) => { const v = val(k); return <div key={k} className={'rhRow' + (v < 25 ? ' low' : '')}>
      <span className="rhIc">{e}</span><span className="rhLb">{l}</span><span className="rhNum">{v}</span>
      <div className="rhBar"><i style={{ width: v + '%', background: c }} /></div></div>; })}
    <div className="rhMini">{MINI.map(([k, e]) => { const v = val(k); return <div key={k} className={'rhPip' + (v < 25 ? ' low' : '')} title={k}><span>{e}</span><div className="rhBar"><i style={{ width: v + '%', background: `hsl(${v * 1.25},70%,50%)` }} /></div></div>; })}</div>
  </div>;
}
