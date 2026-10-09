'use client';
import { useEffect, useRef, useState } from 'react';
import { GAME, PEDPOS, TPOS } from './CityWorld';
import RuntimeStyle from './RuntimeStyle';
import { NET } from '../lib/cityNet';
import { CARJACK_RANGE, ROB_RANGE } from '../lib/profile';

/* Physical crime: walk up to someone and use the button that appears. Nothing here is a menu action any more.
   Real players: rob (on foot) / carjack (while they drive) -> /api/rob, /api/carjack (server checks reach + positions).
   NPCs: pickpocket a pedestrian, carjack an AI driver -> /api/crime (loot, heat and catch chance are decided server-side). */
type Act = { k: 'rob' | 'jack' | 'pick' | 'npcjack'; label: string; name?: string };
const NPC_PED_RANGE = 2.2, NPC_CAR_RANGE = 5;
const naira = (n: number) => '₦' + Math.round(n).toLocaleString();
const post = async (url: string, body: object) => { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { ok: r.ok, d: await r.json().catch(() => ({})) as any }; }; // eslint-disable-line @typescript-eslint/no-explicit-any

function scan(): Act[] {
  const me = NET.me, now = Date.now(), out: Act[] = [];
  if (GAME.jailed || me.drv || me.ko > now || GAME.ride) return out;
  let rn = '', rd = ROB_RANGE, jn = '', jd = CARJACK_RANGE;
  for (const [n, q] of Object.entries(NET.peers)) {
    if (q.ko) continue;
    const d = Math.hypot(q.x - me.x, q.z - me.z);
    if (q.drv) { if (d < jd) { jd = d; jn = n; } } else if (d < rd) { rd = d; rn = n; }
  }
  if (rn) out.push({ k: 'rob', label: `💰 Rob ${rn}`, name: rn });
  if (jn) out.push({ k: 'jack', label: `🚗 Carjack ${jn}`, name: jn });
  if (out.length) return out;
  for (const p of PEDPOS) if (p && Math.hypot(p.x - me.x, p.z - me.z) < NPC_PED_RANGE) { out.push({ k: 'pick', label: '🖐️ Pickpocket' }); break; }
  for (const t of TPOS) if (t && t.x < 9e4 && Math.hypot(t.x - me.x, t.z - me.z) < NPC_CAR_RANGE) { out.push({ k: 'npcjack', label: '🚘 Carjack the driver' }); break; }
  return out;
}

export default function CrimeActions({ username, say, refresh }: { username: string; say: (m: string) => void; refresh: () => void }) {
  const [acts, setActs] = useState<Act[]>([]), busy = useRef(false);
  useEffect(() => { const i = setInterval(() => { const n = scan(); setActs(a => (a.map(x => x.label).join('|') === n.map(x => x.label).join('|') ? a : n)); }, 300); return () => clearInterval(i); }, []);
  const copsNear = () => Object.values(NET.peers).filter(p => p.look.outfitModel === 'uniform' && Math.hypot(p.x - NET.me.x, p.z - NET.me.z) < 25).length;
  const go = async (a: Act) => {
    if (busy.current) return; busy.current = true; setTimeout(() => { busy.current = false; }, 1500);
    NET.me.anim = 'punch'; NET.me.animUntil = Date.now() + 450;
    if (a.k === 'rob' || a.k === 'jack') {
      const q = a.name ? NET.peers[a.name] : null; if (!q || !a.name) return say('They moved away.');
      const body = { target: a.name, sx: NET.me.x, sz: NET.me.z, tx: q.x, tz: q.z };
      const r = await post(a.k === 'rob' ? '/api/rob' : '/api/carjack', body);
      if (!r.ok) return say(r.d.error || 'It did not work.');
      if (a.k === 'rob') {
        say(r.d.amount ? `💰 You took ${naira(r.d.amount)} from ${a.name}${r.d.wanted ? ' · you are WANTED' : ''}` : `😒 ${a.name} has nothing worth taking${r.d.wanted ? ' · you are WANTED' : ''}`);
        if (r.d.amount) window.dispatchEvent(new CustomEvent('arl-net-fx', { detail: { to: a.name, t: `💸 ${username} robbed you of ${naira(r.d.amount)}!` } }));
      } else {
        say(`🚗 You stole ${a.name}'s ${r.d.car}${r.d.wanted ? ' · you are WANTED' : ''}`);
        window.dispatchEvent(new CustomEvent('arl-net-fx', { detail: { to: a.name, t: `🚗 ${username} stole your ${r.d.car}!` } }));
      }
    } else {
      const r = await post('/api/crime', { kind: a.k === 'pick' ? 'pickpocket' : 'carjack', policeNearby: copsNear() });
      if (!r.ok) return say(r.d.error || 'It did not work.');
      say(r.d.caught ? '😬 It went wrong. You are WANTED.' : `💰 You got away with ${naira(r.d.loot)}${r.d.wanted ? ' · you are WANTED' : ''}`);
    }
    refresh();
  };
  if (!acts.length) return null;
  return <>
    <div className="crimeActs">{acts.map(a => <button key={a.k + (a.name || '')} onClick={() => go(a)}>{a.label}</button>)}</div>
    <RuntimeStyle id="arl-crime-acts" css={`.crimeActs{position:absolute;left:50%;bottom:calc(96px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:30;display:flex;flex-direction:column;gap:8px;align-items:center}.crimeActs button{background:#7f1d1df2;color:#fff;border:1px solid #fca5a5aa;border-radius:999px;padding:11px 18px;font-size:15px;font-weight:900;box-shadow:0 4px 14px #0008}.crimeActs button:active{transform:scale(.96)}`} />
  </>;
}
