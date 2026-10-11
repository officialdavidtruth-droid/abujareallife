'use client';
import { useEffect, useRef, useState } from 'react';
import RuntimeStyle from './RuntimeStyle';
import { ROOM } from '../lib/roomNet';
import { CLUB_PEOPLE, CLUB_REG, CLUB_TALK, COMPANION, TALK_RANGE, clubPerson, endCompanion } from '../lib/clubNpc';
import { sfx } from '../lib/audio';

/* STEP 1 of the club companion flow: club NPCs can be approached and spoken to.
   Tap one (or press E next to her): you walk up, she stops dancing and turns to you, and you pick what to say.
   The two "Companion" NPCs also talk about company, behind the same 18+ confirmation the street NPCs use.
   STEP 2: agree the price and pay (server-checked, /api/club-company); she then follows you and leaves the club with you. */
type Info = { adult: boolean; cash: number; cop: boolean };
const naira = (n: number) => '₦' + Math.round(n).toLocaleString();
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const api = async (body: object, url = '/api/street-npc') => { try { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { ok: r.ok, d: await r.json().catch(() => ({})) as any }; } catch { return { ok: false, d: { error: 'No connection.' } }; } }; // eslint-disable-line @typescript-eslint/no-explicit-any

export default function ClubTalk({ toast }: { toast: (m: string, bad?: boolean) => void }) {
  const [idx, setIdx] = useState(-1), [say, setSay] = useState(''), [near, setNear] = useState(-1), [info, setInfo] = useState<Info | null>(null), [gate, setGate] = useState(false), [quote, setQuote] = useState(false), [busy, setBusy] = useState(false), [dob, setDob] = useState(''), [ok18, setOk18] = useState(false);
  const want = useRef(-1), [comp, setComp] = useState(COMPANION.phase === 'none' ? '' : COMPANION.name), [phase, setPhase] = useState<string>(COMPANION.phase);
  const p = clubPerson(idx);

  const dist = (i: number) => { const r = CLUB_REG[i]; return r ? Math.hypot(r.x - ROOM.me.x, r.z - ROOM.me.z) : 99; };
  const open = (i: number) => { const q = clubPerson(i); if (!q) return; want.current = -1; CLUB_TALK.idx = i; setIdx(i); setQuote(false); setGate(false); setSay(pick(q.greet)); sfx('pop'); };
  const close = () => { CLUB_TALK.idx = -1; want.current = -1; setIdx(-1); setQuote(false); setGate(false); };
  const approach = (i: number) => {
    if (dist(i) <= TALK_RANGE) { open(i); return; }
    const r = CLUB_REG[i]; if (!r) return; const dx = ROOM.me.x - r.x, dz = ROOM.me.z - r.z, d = Math.hypot(dx, dz) || 1;
    want.current = i; close(); want.current = i; window.dispatchEvent(new CustomEvent('arl-club-walkto', { detail: { idx: i, x: r.x + dx / d * 1.5, z: r.z + dz / d * 1.5 } }));
  };

  useEffect(() => {
    const talk = (e: Event) => approach(Number((e as CustomEvent).detail?.index));
    const arrived = (e: Event) => { const i = Number((e as CustomEvent).detail?.idx); if (want.current === i) open(i); };
    window.addEventListener('arl-club-talk', talk); window.addEventListener('arl-club-arrived', arrived);
    return () => { window.removeEventListener('arl-club-talk', talk); window.removeEventListener('arl-club-arrived', arrived); CLUB_TALK.idx = -1; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // who is within reach (for the E prompt), and walking away ends the chat
  useEffect(() => {
    const t = setInterval(() => {
      let best = -1, bd = TALK_RANGE; for (const q of CLUB_PEOPLE) { const d = dist(q.idx); if (d < bd) { bd = d; best = q.idx; } }
      setNear(n => (n === best ? n : best)); setPhase(COMPANION.phase); setComp(COMPANION.phase === 'none' ? '' : COMPANION.name);
      if (CLUB_TALK.idx >= 0 && dist(CLUB_TALK.idx) > TALK_RANGE + 3) close();
    }, 250);
    const key = (e: KeyboardEvent) => { const t = e.target as HTMLElement | null; if (t && (t.tagName === 'INPUT' || t.isContentEditable)) return; if (e.key.toLowerCase() === 'e' && !e.repeat && CLUB_TALK.idx < 0) { let best = -1, bd = TALK_RANGE; for (const q of CLUB_PEOPLE) { const d = dist(q.idx); if (d < bd) { bd = d; best = q.idx; } } if (best >= 0) open(best); } else if (e.key === 'Escape' && CLUB_TALK.idx >= 0) close(); };
    window.addEventListener('keydown', key);
    return () => { clearInterval(t); window.removeEventListener('keydown', key); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => { const r = await api({ action: 'poll' }); if (r.ok) setInfo(r.d); return r.ok ? (r.d as Info) : null; };
  const askCompany = async () => {
    if (!p) return; setBusy(true); const d = await load(); setBusy(false);
    if (!d) { toast('Could not reach the server.', true); return; }
    if (d.cop) { setSay("You look like police to me. Not tonight, officer."); return; }
    if (!d.adult) { setGate(true); setSay('Before we talk about that, I need to know you are an adult.'); return; }
    setGate(false); setQuote(true); setSay(`${naira(p.price || 0)} for the night. We leave together, nothing rough, and either of us can walk away at any time. ${pick(p.club)}`);
  };
  const pay = async () => {
    if (!p || busy) return; setBusy(true); const r = await api({ action: 'pay', npc: p.idx }, '/api/club-company'); setBusy(false);
    if (!r.ok) { toast(r.d.error || 'That did not work.', true); setSay(r.d.error === "You can't afford that." ? "Come back when you can afford it, darling." : (r.d.error || '')); return; }
    if (typeof r.d.cash === 'number') window.dispatchEvent(new CustomEvent('arl-cash-update', { detail: { cash: r.d.cash } }));
    window.dispatchEvent(new CustomEvent('arl-apply-fx', { detail: r.d.fx || {} }));
    COMPANION.idx = p.idx; COMPANION.name = p.name; COMPANION.phase = 'inside'; sfx('coin');
    toast(`💋 ${naira(r.d.spent)} paid. ${p.name} is coming with you${r.d.wanted ? ' · you are WANTED' : ''}`); close();
  };
  const confirm18 = async () => {
    if (busy) return; setBusy(true); const r = await api({ action: 'adult', dateOfBirth: dob, accept: ok18 }); setBusy(false);
    if (!r.ok) { toast(r.d.error || 'Could not confirm.', true); return; }
    await load(); setGate(false); askCompany();
  };

  return <>
    {idx < 0 && near >= 0 && <button className="ctPrompt" onClick={() => open(near)}><b>E</b> Talk to {clubPerson(near)?.name}</button>}
    {phase === 'inside' && comp && <div className="ctTrip"><span>💋</span><div><b>{comp} is with you</b><small>Walk to the exit and head out together.</small></div><button onClick={() => { endCompanion(); setPhase('none'); setComp(''); toast(`${comp} says goodnight and walks off.`); }}>Call it off</button></div>}
    {p && <div className="ctSheet" role="dialog" aria-label={`Talking to ${p.name}`}>
      <button className="ctX" aria-label="Walk away" onClick={close}>✕</button>
      <div className="ctHead"><i>{p.e}</i><div><b>{p.name}</b><small>{p.role}</small></div></div>
      <p className="ctSay">“{say}”</p>
      {gate && <div className="ctGate"><p>This part of the game has mature fictional themes. Confirm you are 18 or older to continue. Nothing explicit is shown.</p>
        <label>Date of birth <input type="date" value={dob} max={new Date().toISOString().slice(0, 10)} onChange={e => setDob(e.target.value)} onKeyDown={e => e.stopPropagation()} onKeyUp={e => e.stopPropagation()} /></label>
        <label className="ctChk"><input type="checkbox" checked={ok18} onChange={e => setOk18(e.target.checked)} /> I am 18 or older and understand this content is fictional.</label>
        <button className="ctGo" disabled={busy || !dob || !ok18} onClick={confirm18}>Confirm</button></div>}
      {!gate && <div className="ctOpts">
        <button onClick={() => setSay(pick(p.chat))}>💬 Chat</button>
        <button onClick={() => setSay(pick(p.club))}>🎵 Ask about the club</button>
        {p.escort && !quote && <button className="hot" disabled={busy} onClick={askCompany}>💋 Ask about company</button>}
        {quote && <><button className="ctGo" disabled={busy} onClick={pay}>💳 Pay {naira(p.price || 0)} &amp; leave together</button>
          <button onClick={() => { setQuote(false); setSay('No pressure. The offer stands if you change your mind.'); }}>🙂 Maybe later</button></>}
        <button className="ghost" onClick={close}>👋 Say goodbye</button>
      </div>}
    </div>}
    <RuntimeStyle id="arl-club-talk" css={CSS} />
  </>;
}

const CSS = `.ctPrompt{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(120px + env(safe-area-inset-bottom,0px));z-index:36;background:#180e28ee;color:#fff;border:1px solid #e879f9aa;border-radius:10px;padding:7px 12px;font:700 13px system-ui;box-shadow:0 6px 18px #0009;cursor:pointer}.ctPrompt b{display:inline-block;min-width:20px;text-align:center;margin-right:6px;padding:1px 5px;border-radius:5px;background:#f0b94a;color:#1a1410}
.ctSheet{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:58;width:min(430px,calc(100vw - 20px));background:#100b1cf7;color:#f8fafc;border:1px solid #c084fc77;border-radius:18px;padding:14px 15px;box-shadow:0 14px 45px #000c;display:flex;flex-direction:column;gap:9px;animation:ctIn .25s both}
.ctTrip{position:absolute;left:50%;transform:translateX(-50%);top:calc(64px + env(safe-area-inset-top,0px));z-index:57;display:flex;gap:10px;align-items:center;background:#100b1cf7;border:1px solid #e879f9aa;border-radius:14px;padding:8px 12px;color:#fff;box-shadow:0 8px 24px #000a;max-width:calc(100vw - 20px)}.ctTrip span{font-size:24px}.ctTrip b{display:block;font-size:13px;color:#f0abfc}.ctTrip small{color:#c9bde0;font-size:11px}.ctTrip button{background:none;border:1px solid #ffffff33;color:#cdbfe6;border-radius:8px;padding:5px 8px;font:700 11px system-ui;cursor:pointer}
.ctX{position:absolute;right:10px;top:6px;background:none;border:0;color:#a9a0c0;font-size:20px;cursor:pointer}.ctHead{display:flex;gap:10px;align-items:center}.ctHead i{font-style:normal;font-size:30px}.ctHead b{display:block;font-size:15px;color:#f0abfc}.ctHead small{color:#b8a9d6;font-size:11px}
.ctSay{margin:0;background:#1d1433;border:1px solid #ffffff1a;border-radius:12px;padding:9px 11px;font-size:13px;line-height:1.45;font-style:italic}
.ctOpts{display:flex;flex-wrap:wrap;gap:7px}.ctOpts button,.ctGo{background:#2a1b45;color:#fff;border:1px solid #ffffff2a;border-radius:10px;padding:8px 11px;font:700 12px system-ui;cursor:pointer}.ctOpts button.hot{background:#6d1b6b;border-color:#e879f9}.ctOpts button.ghost{background:none;color:#b8a9d6}.ctOpts button:disabled,.ctGo:disabled{opacity:.5;cursor:not-allowed}
.ctGate{display:flex;flex-direction:column;gap:7px;font-size:12px}.ctGate p{margin:0;color:#d8cbef}.ctGate label{display:flex;gap:8px;align-items:center}.ctChk{font-size:11.5px}.ctGo{background:#d99a42;color:#1a1208;border:0}
@keyframes ctIn{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}`;
