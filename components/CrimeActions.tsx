'use client';
import { useEffect, useRef, useState } from 'react';
import { GAME, JACK, PEDPOS, TPOS } from './CityWorld';
import RuntimeStyle from './RuntimeStyle';
import { NET } from '../lib/cityNet';
import { CARJACK_RANGE, ROB_ANY_COOLDOWN_MS, ROB_KIND_COOLDOWN_MS, ROB_RANGE } from '../lib/profile';

/* Physical crime: walk up to someone and use the button that appears. Nothing here is a menu action any more.
   Real players: rob (on foot) / carjack (while they drive) -> /api/rob, /api/carjack (server checks reach + positions).
   NPCs: pickpocket or mug a pedestrian, carjack an AI driver -> /api/crime (loot, heat and catch chance are decided server-side).
   Street robbery has a cooldown. The SERVER enforces it (database-backed); the buttons only mirror it as a countdown. */
type Kind = 'rob' | 'jack' | 'pick' | 'mug' | 'npcjack' | 'chop';
type Act = { k: Kind; label: string; name?: string; idx?: number };
const NPC_PED_RANGE = 2.2, NPC_CAR_RANGE = 5, PED_RETRY_MS = 180_000;
const SERVER_KIND: Partial<Record<Kind, string>> = { rob: 'rob_player', pick: 'pickpocket', mug: 'mug_npc', npcjack: 'carjack' };   // jack (player carjack) has no cooldown here
const naira = (n: number) => '₦' + Math.round(n).toLocaleString();
const post = async (url: string, body: object) => { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { ok: r.ok, d: await r.json().catch(() => ({})) as any }; }; // eslint-disable-line @typescript-eslint/no-explicit-any

function scan(done: Map<number, number>): Act[] {
  const me = NET.me, now = Date.now(), out: Act[] = [];
  if (GAME.jailed || me.drv || me.ko > now || GAME.ride) return out;
  let rn = '', rd = ROB_RANGE, jn = '', jd = CARJACK_RANGE;
  for (const [n, q] of Object.entries(NET.peers)) {
    if (q.safe) continue;   // just woke up: protected for a few seconds
    const d = Math.hypot(q.x - me.x, q.z - me.z);
    if (q.drv) { if (d < jd) { jd = d; jn = n; } } else if (d < rd) { rd = d; rn = n; }   // out-cold players stay in: they are the easiest target
  }
  if (rn) out.push({ k: 'rob', label: NET.peers[rn]?.ko ? `💰 Rob ${rn} (out cold)` : `💰 Rob ${rn}`, name: rn });
  if (jn) out.push({ k: 'jack', label: `🚗 Carjack ${jn}`, name: jn });
  if (out.length) return out;
  for (let i = 0; i < PEDPOS.length; i++) {   // a pedestrian you already hit is "tapped out" for a few minutes
    const p = PEDPOS[i]; if (!p || (done.get(i) || 0) > now || Math.hypot(p.x - me.x, p.z - me.z) >= NPC_PED_RANGE) continue;
    out.push({ k: 'pick', label: '🖐️ Pickpocket', idx: i }, { k: 'mug', label: '🔪 Mug', idx: i }); break;
  }
  for (const t of TPOS) if (t && t.x < 9e4 && Math.hypot(t.x - me.x, t.z - me.z) < NPC_CAR_RANGE) { out.push({ k: 'npcjack', label: '🚘 Carjack the driver' }); if (!(window as any).__arlChop) out.push({ k: 'chop', label: '🔧 Steal it for the chop shop' }); break; }
  return out;
}

export default function CrimeActions({ username, say, refresh }: { username: string; say: (m: string) => void; refresh: () => void }) {
  const [acts, setActs] = useState<Act[]>([]), [, force] = useState(0), busy = useRef(false);
  const until = useRef<Record<string, number>>({}), done = useRef(new Map<number, number>());   // cooldown end times (mirror of the server's) and tapped-out pedestrians
  const left = (k: Kind) => { const s = SERVER_KIND[k]; return s ? Math.max(0, (until.current.any || 0) - Date.now(), (until.current[s] || 0) - Date.now()) : 0; };
  const startCooldown = (k: Kind, retryIn?: number) => {
    const s = SERVER_KIND[k]; if (!s) return; const now = Date.now();
    if (retryIn) until.current[s] = Math.max(until.current[s] || 0, now + retryIn);
    else { until.current.any = now + ROB_ANY_COOLDOWN_MS; until.current[s] = now + Math.max(ROB_ANY_COOLDOWN_MS, ROB_KIND_COOLDOWN_MS[s] || 0); }
    force(x => x + 1);
  };
  useEffect(() => {
    const i = setInterval(() => {
      const n = scan(done.current); setActs(a => (a.map(x => x.label).join('|') === n.map(x => x.label).join('|') ? a : n));
      if (n.some(a => left(a.k) > 0) || Object.values(until.current).some(t => t > Date.now() - 400)) force(x => x + 1);   // keeps the countdown ticking, plus one last redraw when it ends
    }, 300);
    return () => clearInterval(i);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const copsNear = () => Object.values(NET.peers).filter(p => p.look.outfitModel === 'uniform' && Math.hypot(p.x - NET.me.x, p.z - NET.me.z) < 25).length;
  const go = async (a: Act) => {
    if (busy.current || left(a.k) > 0) return; busy.current = true; setTimeout(() => { busy.current = false; }, 1500);
    if (a.k === 'chop') { const f = (window as any).__arlChopSteal as ((n: number) => void) | undefined; if (f) f(copsNear()); return; }   // the chop shop job (components/ChopShop.tsx) does the rest
    NET.me.anim = 'punch'; NET.me.animUntil = Date.now() + 450;
    if (a.k === 'rob' || a.k === 'jack') {
      const q = a.name ? NET.peers[a.name] : null; if (!q || !a.name) return say('They moved away.');
      const body = { target: a.name, sx: NET.me.x, sz: NET.me.z, tx: q.x, tz: q.z };
      const r = await post(a.k === 'rob' ? '/api/rob' : '/api/carjack', body);
      if (!r.ok) { if (r.d.retryIn) startCooldown(a.k, r.d.retryIn); return say(r.d.error || 'It did not work.'); }
      startCooldown(a.k);
      if (a.k === 'rob') {
        say(r.d.amount ? `💰 You took ${naira(r.d.amount)} from ${a.name}${r.d.down ? ' while they were out cold' : ''}${r.d.wanted ? ' · you are WANTED' : ''}` : `😒 ${a.name} has nothing worth taking${r.d.wanted ? ' · you are WANTED' : ''}`);
        if (r.d.amount) window.dispatchEvent(new CustomEvent('arl-net-fx', { detail: { to: a.name, t: `💸 ${username} robbed you of ${naira(r.d.amount)}!` } }));   // instant toast; the server also saved a message for them
      } else {
        say(`🚗 You stole ${a.name}'s ${r.d.car}${r.d.wanted ? ' · you are WANTED' : ''}`);
        window.dispatchEvent(new CustomEvent('arl-net-fx', { detail: { to: a.name, t: `🚗 ${username} stole your ${r.d.car}!` } }));
      }
    } else {
      const kind = a.k === 'pick' ? 'pickpocket' : a.k === 'mug' ? 'mug_npc' : 'carjack';
      const r = await post('/api/crime', { kind, policeNearby: copsNear() });
      if (!r.ok) { if (r.d.retryIn) startCooldown(a.k, r.d.retryIn); return say(r.d.error || 'It did not work.'); }
      startCooldown(a.k);
      if (a.k === 'npcjack' && !r.d.jailSecs) { const ci = JACK.nearest(NET.me.x, NET.me.z, 8); if (ci >= 0) JACK.start(ci); }   // GTA-style: open the door, throw the driver out, take the wheel
      if (a.idx !== undefined) done.current.set(a.idx, Date.now() + PED_RETRY_MS);
      say(r.d.caught ? (r.d.jailSecs ? '🚔 Caught red-handed! Straight to jail.' : a.k === 'mug' ? '😱 They screamed and fought back. You are WANTED.' : '😬 It went wrong. You are WANTED.') : `💰 You got away with ${naira(r.d.loot)}${r.d.wanted ? ' · you are WANTED' : ''}`);
    }
    refresh();
  };
  if (!acts.length) return null;
  return <>
    <div className="crimeActs">{acts.map(a => { const l = left(a.k); return <button key={a.k + (a.name || '')} disabled={l > 0} onClick={() => go(a)}>{l > 0 ? `⏳ ${a.label.replace(/^\S+\s/, '')} · ${Math.ceil(l / 1000)}s` : a.label}</button>; })}</div>
    <RuntimeStyle id="arl-crime-acts" css={`.crimeActs{position:fixed;left:50%;bottom:calc(96px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:30;display:flex;flex-direction:column;gap:8px;align-items:center}.crimeActs button{background:#7f1d1df2;color:#fff;border:1px solid #fca5a5aa;border-radius:999px;min-height:44px;padding:11px 18px;font-size:15px;font-weight:900;box-shadow:0 4px 14px #0008;touch-action:manipulation}.crimeActs button:active{transform:scale(.96)}.crimeActs button:disabled{background:#3a2020ee;border-color:#ffffff30;color:#d7b8b8;transform:none}`} />
  </>;
}