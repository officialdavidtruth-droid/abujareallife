'use client';
import { useEffect, useState } from 'react';
import { NET } from '../lib/cityNet';
import { GAME } from './cityShared';
import { KIND_FULL, PAX, PAX_MAX, admit, board, dropAll, hostKind, paxBusy, paxChanged, paxSend, poseOf, type PaxKind } from './cityPax';
import RuntimeStyle from './RuntimeStyle';

type Prompt = { id: number; from: string; k: 'invite' | 'ask'; kind: PaxKind; until: number };
const say = (m: string) => { GAME.notice = m; };

/** Start a ride-along with one player: invite them into my vehicle, or ask to join theirs. */
export function startSeat(name: string) {
  const q = NET.peers[name]; if (!q || !q.init) return say('🚗 That player is not around.');
  if (PAX.host) return say('🚗 You are already riding in someone’s vehicle.');
  const mine = hostKind();
  if (mine) {
    if (Object.keys(PAX.guests).length >= PAX_MAX[mine] && !PAX.guests[name]) return say(KIND_FULL[mine]);
    PAX.invited[name] = Date.now() + 60_000; paxSend(name, 'invite', { kind: mine }); return say(`🚗 Invite sent to @${name}`);
  }
  if (q.drv || q.rd === 1 || q.pl) { PAX.pending[name] = Date.now() + 60_000; paxSend(name, 'ask'); return say(`🙋 Asked @${name} if you can ride along`); }
  say('🚗 Get into your car, a taxi or the plane to invite someone, or ask a player who is driving or flying.');
}

export default function PaxUi() {
  const [prompts, setPrompts] = useState<Prompt[]>([]), [, tick] = useState(0);
  useEffect(() => {
    let seq = 0;
    const add = (p: Omit<Prompt, 'id' | 'until'>) => setPrompts(l => [...l.filter(x => !(x.from === p.from && x.k === p.k)).slice(-2), { ...p, id: ++seq, until: Date.now() + 30_000 }]);
    const inn = (e: Event) => {
      const d = (e as CustomEvent).detail as { from: string; k: string; kind: PaxKind; seat: number; r: string }, now = Date.now();
      if (!d || !d.from) return;
      if (d.k === 'invite') { if (paxBusy()) paxSend(d.from, 'no', { r: 'is busy right now.' }); else add({ from: d.from, k: 'invite', kind: d.kind }); }
      else if (d.k === 'ask') {
        const kind = hostKind();
        if (!kind) paxSend(d.from, 'no', { r: 'is not in a car, taxi or plane right now.' });
        else if (Object.keys(PAX.guests).length >= PAX_MAX[kind] && !PAX.guests[d.from]) paxSend(d.from, 'no', { r: kind === 'taxi' ? 'taxi is full.' : kind === 'plane' ? 'plane is full.' : 'car is full.' });
        else add({ from: d.from, k: 'ask', kind });
      }
      else if (d.k === 'join') {
        if ((PAX.invited[d.from] || 0) < now) return paxSend(d.from, 'no', { r: 'invite has expired.' });
        const err = admit(d.from); if (err) paxSend(d.from, 'no', { r: err }); else delete PAX.invited[d.from];
      }
      else if (d.k === 'seated') { if ((PAX.pending[d.from] || 0) > now && !PAX.host) { delete PAX.pending[d.from]; board(d.from, d.seat, d.kind); } }
      else if (d.k === 'no') say(`🚫 @${d.from} ${d.r || 'said no.'}`);
      else if (d.k === 'leave') { if (PAX.guests[d.from]) { delete PAX.guests[d.from]; say(`👋 @${d.from} got out`); paxChanged(); } }
      else if (d.k === 'drop') { if (PAX.host === d.from) { PAX.wantOut = true; PAX.forced = true; PAX.msg = d.r || 'You got out.'; } }
    };
    const start = (e: Event) => { const n = String((e as CustomEvent).detail || ''); if (n) startSeat(n); };
    const chg = () => tick(v => v + 1);
    window.addEventListener('arl-seat-in', inn); window.addEventListener('arl-seat-start', start); window.addEventListener('arl-pax', chg);
    const sweep = setInterval(() => { setPrompts(l => { const n = l.filter(x => x.until > Date.now()); return n.length === l.length ? l : n; }); tick(v => v + 1); }, 1000);
    const key = (e: KeyboardEvent) => { if (e.code !== 'KeyE' || e.repeat || !PAX.host) return; const t = e.target as HTMLElement | null; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return; PAX.wantOut = true; PAX.forced = false; PAX.msg = ''; };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('arl-seat-in', inn); window.removeEventListener('arl-seat-start', start); window.removeEventListener('arl-pax', chg); window.removeEventListener('keydown', key); clearInterval(sweep); };
  }, []);

  const answer = (p: Prompt, yes: boolean) => {
    setPrompts(l => l.filter(x => x.id !== p.id));
    if (!yes) return paxSend(p.from, 'no', { r: 'said no thanks.' });
    if (p.k === 'ask') { const err = admit(p.from); if (err) { say('🚫 ' + err); paxSend(p.from, 'no', { r: err }); } return; }
    // an invite: I can only climb in if I am free and their vehicle is still there
    const q = NET.peers[p.from], pose = q && q.init ? poseOf(q) : null;
    if (paxBusy()) return say('🚗 Finish what you are doing first, then ask again.');
    if (!pose) return say('🚗 That ride has already left.');
    if (Math.hypot(pose.x - NET.me.x, pose.z - NET.me.z) > 90) return say('🚗 Too far to catch up with them.');
    PAX.pending[p.from] = Date.now() + 15_000; paxSend(p.from, 'join', { kind: p.kind });
  };

  const guests = Object.keys(PAX.guests);
  return <>
    {prompts.map((p, i) => <div key={p.id} className="paxCard" role="alert" style={{ top: `calc(${112 + i * 72}px + env(safe-area-inset-top,0px))` }}>
      <i>{p.kind === 'taxi' ? '🚕' : p.kind === 'plane' ? '✈️' : '🚗'}</i>
      <span><b>@{p.from}</b><small>{p.k === 'invite' ? `invites you to ride with them · ${Math.max(0, Math.ceil((p.until - Date.now()) / 1000))}s` : `asks to ride along with you · ${Math.max(0, Math.ceil((p.until - Date.now()) / 1000))}s`}</small></span>
      <button className="ok" onClick={() => answer(p, true)}>{p.k === 'invite' ? 'Get in' : 'Let in'}</button><button className="no" onClick={() => answer(p, false)}>✕</button>
    </div>)}
    {PAX.host && <button className="paxOut" onClick={() => { PAX.wantOut = true; PAX.forced = false; PAX.msg = ''; }} aria-label="Get out"><span>🚪 Get out</span><small className="kbd">E</small><em>riding with @{PAX.host}</em></button>}
    {!PAX.host && guests.length > 0 && <div className="paxChip"><span>👥 With you: {guests.map(n => '@' + n).join(', ')}</span><button onClick={() => dropAll('You got dropped off.')}>Drop off</button></div>}
    <RuntimeStyle id="arl-pax-ui" css={`.paxCard{position:fixed;left:0;right:0;margin:0 auto;width:fit-content;z-index:98;display:flex;align-items:center;gap:10px;max-width:min(440px,calc(100vw - 20px));background:#0b1a13f8;border:2px solid #2fc66b;border-radius:16px;padding:9px 12px;color:#fff;box-shadow:0 8px 24px #000a;font-family:system-ui,sans-serif}
.paxCard i{font-style:normal;font-size:26px}.paxCard span{display:flex;flex-direction:column;min-width:0}.paxCard small{color:#b9d3c6;font-size:11px}
.paxCard button{all:unset;cursor:pointer;padding:7px 12px;border-radius:12px;font-weight:800;font-size:13px;border:2px solid #1a1410;touch-action:manipulation}.paxCard .ok{background:#2fc66b;color:#fff}.paxCard .no{background:#ff5147;color:#fff}
.paxOut{all:unset;box-sizing:border-box;position:fixed;z-index:61;left:50%;transform:translateX(-50%);bottom:calc(86px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;align-items:center;gap:3px;padding:10px 22px 8px;cursor:pointer;background:#ffb81c;color:#1a1410;border:4px solid #1a1410;border-radius:22px;box-shadow:0 4px 0 #1a1410,0 10px 22px #0008;font:800 17px/1 system-ui,sans-serif;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.paxOut span{display:flex;align-items:center;gap:8px}.paxOut small{font-size:11px;padding:2px 6px;border:2px solid #1a1410;border-radius:6px;background:#fff3d6}.paxOut em{font-style:normal;font-size:11px;font-weight:700;opacity:.8}.paxOut:active{transform:translateX(-50%) translateY(4px);box-shadow:none}@media (hover:none){.paxOut small{display:none}}
.paxChip{position:fixed;z-index:61;left:50%;transform:translateX(-50%);bottom:calc(142px + env(safe-area-inset-bottom,0px));display:flex;align-items:center;gap:10px;max-width:min(420px,calc(100vw - 20px));padding:7px 10px 7px 14px;background:#0b1a13f4;color:#fff;border:2px solid #2fc66b;border-radius:999px;font:700 12px/1.2 system-ui,sans-serif;box-shadow:0 6px 18px #0009}
.paxChip button{all:unset;cursor:pointer;flex:none;padding:5px 11px;background:#ff5147;color:#fff;border:2px solid #1a1410;border-radius:999px;font-weight:800;font-size:12px}`} />
  </>;
}
