'use client';
import { useEffect, useRef, useState } from 'react';
import { GAME } from './CityWorld';
import RuntimeStyle from './RuntimeStyle';
import { NET, goDown } from '../lib/cityNet';
import { HOUSES, nearDoor } from '../lib/houses';
import { BREAKIN, riskLabel, secLine, winChance } from '../lib/security';

/* Break into another player's house (server: /api/burgle). Walk up to a house that is not yours: a 🔓 Break in button shows, with who is on
   guard and how risky it is. Tap it (or press E at the door), stand at the door while the lock bar fills, and the server rolls the outcome.
   Guards cut your odds: if they catch you they put you on the ground. Leaving the door cancels the attempt. */
const naira = (n: number) => '₦' + Math.round(n).toLocaleString();
const post = async (body: object) => { const r = await fetch('/api/burgle', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { ok: r.ok, d: await r.json().catch(() => ({})) as any }; }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Near = { slot: number; u: string; line: string; risk: { t: string; c: string } };
type Job = { slot: number; u: string; token: string; t0: number; secs: number };

export default function BreakIn({ username, say, refresh }: { username: string; say: (m: string) => void; refresh: () => void }) {
  const [near, setNear] = useState<Near | null>(null), [job, setJob] = useState<Job | null>(null), [bar, setBar] = useState(0), [, force] = useState(0);
  const busy = useRef(false), finishing = useRef(false), until = useRef(0);
  const blocked = () => !!GAME.jailed || !!GAME.ride || NET.me.drv || NET.me.ko > Date.now();

  useEffect(() => {   // which stranger's door am I standing at?
    const i = setInterval(() => {
      const h = !blocked() ? nearDoor(NET.me.x, NET.me.z) : null;
      const n: Near | null = h && !h.mine ? { slot: h.slot, u: h.u, line: secLine(h.sec), risk: riskLabel(winChance(h.sec, 0)) } : null;
      setNear(p => (p?.slot === n?.slot && p?.line === n?.line ? p : n));
      if (until.current > Date.now() - 400) force(x => x + 1);   // keeps the cooldown countdown ticking
    }, 300);
    return () => clearInterval(i);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async (slot: number) => {
    if (busy.current || job || blocked()) return;
    const h = HOUSES.list.find(x => x.slot === slot); if (!h || h.mine) return;
    if (until.current > Date.now()) return say(`⏳ Lie low for ${Math.ceil((until.current - Date.now()) / 1000)}s.`);
    busy.current = true;
    const r = await post({ action: 'start', slot }).finally(() => { busy.current = false; });
    if (!r.ok) { if (r.d.retryIn) until.current = Date.now() + r.d.retryIn; return say(r.d.error || 'The lock would not budge.'); }
    finishing.current = false; setBar(0);
    setJob({ slot, u: String(r.d.owner), token: String(r.d.token), t0: Date.now(), secs: Number(r.d.secs) || BREAKIN.secs });
    say(`🔓 Working on ${r.d.owner}'s lock (${r.d.risk}). Stay at the door.`);
  };
  const finish = async (j: Job) => {
    finishing.current = true;
    const r = await post({ action: 'finish', token: j.token });
    setJob(null); setBar(0);
    if (!r.ok) { if (r.d.retryIn) until.current = Date.now() + r.d.retryIn; say(r.d.error || 'It went wrong.'); return refresh(); }
    until.current = Date.now() + 120_000;   // mirrors the server's break-in cooldown; the server decides
    const d = r.d, w = d.wanted ? ' · you are WANTED' : '';
    if (d.result === 'win') {
      say(`💰 You cleaned out ${d.owner}'s house: ${naira(d.amount)}${w}`);
      window.dispatchEvent(new CustomEvent('arl-net-fx', { detail: { to: d.owner, t: `🏚️ ${username} broke into your house and took ${naira(d.amount)}!` } }));
    } else if (d.result === 'empty') say(`😒 You got in, but ${d.owner} has nothing worth taking${w}`);
    else { say(d.down ? `🚨 ${d.guards || 'The guards'} caught you! You are on the ground${w}` : `🚨 A neighbour spotted you and you ran${w}`); if (d.down) goDown(Number(d.koMs) || 15_000, 'ko'); }
    refresh();
  };

  useEffect(() => {   // the lock bar: fills over `secs`, cancels if you walk off or get stopped
    if (!job) return;
    const door = HOUSES.list.find(x => x.slot === job.slot)?.door;
    const i = setInterval(() => {
      const el = Date.now() - job.t0;
      if (blocked() || !door || Math.hypot(NET.me.x - door.x, NET.me.z - door.z) > BREAKIN.cancelDist) { clearInterval(i); setJob(null); setBar(0); say('🚪 You backed off the door.'); return; }
      setBar(Math.min(1, el / (job.secs * 1000)));
      if (el >= job.secs * 1000 && !finishing.current) { clearInterval(i); finish(job); }
    }, 100);
    return () => clearInterval(i);
  }, [job]); // eslint-disable-line react-hooks/exhaustive-deps

  const live = useRef({ near, start }); live.current = { near, start };
  useEffect(() => {   // E at the door of a house that is not yours (CityWorld sends the event)
    const f = (e: Event) => { const s = (e as CustomEvent).detail?.slot; if (typeof s === 'number') live.current.start(s); };
    window.addEventListener('arl-break-in', f); return () => window.removeEventListener('arl-break-in', f);
  }, []);

  const cd = Math.max(0, until.current - Date.now());
  if (!near && !job) return null;
  return <>
    {job ? <div className="biBar"><b>🔓 Picking {job.u}&apos;s lock…</b><i><u style={{ width: bar * 100 + '%' }} /></i><small>{Math.max(0, Math.ceil(job.secs * (1 - bar)))}s · stay at the door</small><button onPointerDown={e => { e.preventDefault(); setJob(null); setBar(0); }}>Cancel</button></div>
      : near && <div className="biWrap">
        <div className="biChip"><span>{near.line ? `On watch: ${near.line}` : 'No guards'}</span><b style={{ color: near.risk.c }}>{near.risk.t}</b></div>
        <button className="cwBtn biBtn" aria-label={`Break into ${near.u}'s house`} disabled={cd > 0} onPointerDown={e => { e.preventDefault(); start(near.slot); }} onContextMenu={e => e.preventDefault()}>
          <span>{cd > 0 ? '⏳' : '🔓'}</span><small>{cd > 0 ? Math.ceil(cd / 1000) + 's' : 'Break in'}</small><em>E</em></button></div>}
    <RuntimeStyle id="arl-breakin" css={`.biWrap{position:fixed;right:14px;bottom:calc(252px + env(safe-area-inset-bottom,0px));z-index:30;display:flex;flex-direction:column;align-items:flex-end;gap:6px;pointer-events:none}.biChip{pointer-events:none;background:#101a15ee;border:1px solid #ffffff2a;border-radius:10px;padding:5px 9px;font:700 11px system-ui;color:#e8f2ec;display:flex;gap:8px;align-items:center}.biBtn{pointer-events:auto;position:relative;width:70px;height:70px;border-radius:50%;background:#7c2d12ef;border:2px solid #fdba74aa;color:#fff;box-shadow:0 4px 14px #0009;touch-action:manipulation}.biBtn span{font-size:24px;line-height:1}.biBtn small{font-size:10px;font-weight:900;line-height:1.1;text-align:center;padding:0 4px}.biBtn em{position:absolute;top:-4px;left:-4px;min-width:18px;height:18px;border-radius:9px;background:#fff;color:#7c2d12;font:900 11px/18px system-ui;font-style:normal;text-align:center}.biBtn:active{background:#d99a42;color:#111;transform:scale(.94)}.biBtn:disabled{background:#3a2a20ee;border-color:#ffffff30;color:#d7c4b8}.biBar{position:fixed;left:50%;bottom:calc(120px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:31;width:min(320px,calc(100vw - 24px));background:#101a15f2;border:1px solid #fdba7466;border-radius:14px;padding:10px 12px;color:#fff;font:600 12px system-ui;display:grid;gap:6px;text-align:center}.biBar i{display:block;height:9px;border-radius:5px;background:#ffffff1f;overflow:hidden}.biBar u{display:block;height:100%;background:linear-gradient(90deg,#f59e0b,#ef4444);transition:width .1s linear}.biBar small{color:#c3d6cb;font-size:11px}.biBar button{justify-self:center;background:#20372d;color:#fff;border:0;border-radius:9px;padding:6px 14px;font-weight:800;font-size:12px}@media (pointer:coarse),(max-width:700px){.biWrap{right:12px;bottom:calc(236px + env(safe-area-inset-bottom,0px))}.biBtn{width:64px;height:64px}.biBtn em{display:none}}`} />
  </>;
}
