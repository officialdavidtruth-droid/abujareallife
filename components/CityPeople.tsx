'use client';
import { useEffect, useRef, useState } from 'react';
import { ACT_LIST, INTERACT_RANGE, NET, type useCityNet } from '../lib/cityNet';
import type { VoiceApi } from '../lib/cityVoice';

import RuntimeStyle from './RuntimeStyle';
type Net = ReturnType<typeof useCityNet>;
const dist = (n: string) => { const p = NET.peers[n]; return p ? Math.hypot(p.x - NET.me.x, p.z - NET.me.z) : Infinity; };
const ACT_EMOJI: Record<string, string> = { wave: '👋', cheer: '🙌', dance: '💃' };

/* Everything social in the open city: online list + chat, player card (wave / high-five / dance / mute),
   voice notes and incoming interaction notices. */
type Pub = { name: string; you: boolean; since: number; origin: string | null; fame: number; fameRank: number; tier: { e: string; label: string; next: { label: string; at: number } | null; pct: number }; rank: number; profession: { e: string; label: string } | null; style: string; bio: string; relationship: string; partner: string | null; top: { id: string; label: string; e: string; lv: number }[]; stalls: number; itemsSold: number };
const since = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
export default function CityPeople({ net, voice, sel, setSel }: { net: Net; voice: VoiceApi; sel: string | null; setSel: (n: string | null) => void }) {
  const [open, setOpen] = useState(false), [txt, setTxt] = useState(''), [, tick] = useState(0), box = useRef<HTMLDivElement>(null);
  useEffect(() => { const id = setInterval(() => tick(x => x + 1), 500); return () => clearInterval(id); }, []);
  useEffect(() => { if (open) { net.clearUnread(); box.current?.scrollTo(0, 1e9); } }, [open, net.log.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (sel && !net.roster.includes(sel)) setSel(null); }, [sel, net.roster, setSel]);
  useEffect(() => { const onPick = (e: Event) => { const name = String((e as CustomEvent).detail || ''); if (name && net.roster.includes(name)) setSel(name); }; window.addEventListener('arl-player-select', onPick); return () => window.removeEventListener('arl-player-select', onPick); }, [net.roster, setSel]);
  const go = () => { if (net.send(txt)) setTxt(''); };
  const [micHide, setMicHide] = useState(() => { try { return localStorage.getItem('arl-mic-hide') === '1'; } catch { return false; } }); // Cancel stays cancelled: the 🎤 button still asks when you want voice
  useEffect(() => { if (voice.mic.err) setMicHide(false); }, [voice.mic.err]); // only a real mic error brings the card back
  const count = net.roster.length + 1;
  const label = !net.enabled ? 'Solo' : net.status === 'online' ? `${count} online` : net.status === 'error' ? 'Offline' : 'Connecting…';
  const d = sel ? dist(sel) : Infinity, canAct = d <= INTERACT_RANGE;
  const [pub, setPub] = useState<Pub | null>(null), [find, setFind] = useState('');
  useEffect(() => { setPub(null); if (!sel) return; let dead = false; fetch('/api/player?name=' + encodeURIComponent(sel)).then(r => r.ok ? r.json() : null).then(j => { if (!dead && j) setPub(j); }).catch(() => {}); return () => { dead = true; }; }, [sel]);
  const people = [...net.roster].sort((a, b) => dist(a) - dist(b)).filter(n => !find || n.toLowerCase().includes(find.toLowerCase()));

  return <>
    <RuntimeStyle css={CSS} />
    <button className="cpOnline" onClick={() => setOpen(o => !o)} aria-label="Players and chat"><span>🌍</span><em>{label}</em><b>{net.enabled ? count : '–'}</b>{net.unread > 0 && !open && <i>{net.unread > 9 ? '9+' : net.unread}</i>}</button>

    <div className="cpStack">
      {voice.msg && <div className="cpNote" onClick={() => voice.clearMsg()}><span>{voice.msg}</span><button aria-label="Dismiss" onClick={e => { e.stopPropagation(); voice.clearMsg(); }}>✕</button></div>}
      {voice.mic.perm !== 'granted' && !voice.micOn && !micHide && <div className="cpCard"><div>🎤 <b>Voice chat needs your microphone.</b>{voice.mic.perm === 'denied' && <><br /><small>It is blocked for this site: tap the 🔒 by the address bar → Microphone → Allow, then reload.</small></>}{voice.mic.inApp && <><br /><small>Open the game in Chrome or Safari: in-app browsers can't use the mic.</small></>}</div><div className="cpRow"><button className="ok" onClick={() => voice.requestMic()}>Allow microphone</button><button onClick={() => { setMicHide(true); try { localStorage.setItem('arl-mic-hide', '1'); } catch { /* ignore */ } voice.clearMsg(); }}>Cancel</button></div></div>}
      {net.notices.map(n => <div key={n.id} className="cpCard"><div>{ACT_EMOJI[n.k]} <b>{n.from}</b> {n.text}</div><div className="cpRow">{dist(n.from) <= INTERACT_RANGE && <button className="ok" onClick={() => { net.act(n.k, n.from); net.dismissNotice(n.id); }}>{n.reply}</button>}<button onClick={() => net.dismissNotice(n.id)}>Dismiss</button></div></div>)}
    </div>

    {sel && net.roster.includes(sel) && <div className="cpSheet">
      <button className="cpX" onClick={() => setSel(null)} aria-label="Close">×</button>
      <div className="cpHead"><b>{sel}</b><span>{d === Infinity ? '' : d <= INTERACT_RANGE ? `${Math.round(d)} m away · close` : `${Math.round(d)} m away · walk closer`}</span></div>
      {pub ? <div className="cpProf">
        <div className="cpBadges"><span className="cpTier">{pub.tier.e} {pub.tier.label}</span>{pub.profession && <span>{pub.profession.e} {pub.profession.label}</span>}<span>Rank {pub.rank}</span>{pub.origin && <span>{pub.origin === 'NEPO' ? '👑 Nepo' : '🥣 Lapo'}</span>}</div>
        {pub.bio && <p className="cpBio">“{pub.bio}”</p>}
        <div className="cpStats"><div><b>#{pub.fameRank}</b><small>Fame rank</small></div><div><b>{pub.fame}</b><small>Fame</small></div><div><b>{pub.itemsSold}</b><small>Items sold</small></div><div><b>{since(pub.since)}</b><small>Joined</small></div></div>
        {pub.top.length > 0 && <div className="cpSkills">{pub.top.map(s => <span key={s.id}>{s.e} {s.label} · Lv {s.lv}</span>)}</div>}
        {pub.relationship !== 'single' && pub.partner && <p className="cpRel">❤️ {pub.relationship} with {pub.partner}</p>}
        {pub.stalls > 0 && <button className="cpStall" onClick={() => { window.dispatchEvent(new CustomEvent('arl-open-market', { detail: sel })); setSel(null); }}>🛒 Browse {pub.stalls} item{pub.stalls > 1 ? 's' : ''} for sale</button>}
      </div> : <p className="cpLoad">Loading profile…</p>}
      <div className="cpGrid">
        {ACT_LIST.map(([k, e, l]) => <button key={k} disabled={!canAct} onClick={() => { net.act(k, sel); setSel(null); }}>{e}<small>{l}</small></button>)}
        <button onClick={() => { window.dispatchEvent(new CustomEvent('arl-open-chat', { detail: sel })); setSel(null); }}>💬<small>Message</small></button>
        <button onClick={() => net.toggleMute(sel)}>{net.muted.includes(sel) ? '🔇' : '🔈'}<small>{net.muted.includes(sel) ? 'Unmute chat & voice' : 'Mute chat & voice'}</small></button>
      </div>
      <p>Voice is proximity chat: turn your 🎤 on and everyone near you hears you, fading with distance.</p>
      <VoiceStatus voice={voice} />
    </div>}

    {open && <div className="cpChat">
      <button className="cpX" onClick={() => setOpen(false)} aria-label="Close">×</button>
      {!net.enabled ? <p className="cpNoteTxt">Multiplayer is off. Add <b>NEXT_PUBLIC_SUPABASE_URL</b> and <b>NEXT_PUBLIC_SUPABASE_ANON_KEY</b> in Vercel and redeploy.</p> : <>
        <div className="cpTitle">🏙️ Abuja · City {net.room} · {net.status === 'online' ? `${count} players` : net.status}</div>
        {net.status === 'error' && NET.reason && <p className="cpNoteTxt">{NET.reason}</p>}
        {net.roster.length > 8 && <input className="cpFind" value={find} placeholder="Find a player…" onChange={e => setFind(e.target.value)} />}
        <div className="cpPeople">{net.roster.length === 0 ? <span>You're the only one here right now. Invite friends!</span> : people.length === 0 ? <span>No player matches “{find}”.</span> : people.map(n => <button key={n} onClick={() => { setSel(n); setOpen(false); }}>👤 {n} <small>{Math.round(dist(n))}m</small></button>)}</div>
        <VoiceStatus voice={voice} />
        <div className="cpLog" ref={box}>{net.log.length === 0 ? <span className="cpEmpty">Say hi to the city 👋</span> : net.log.slice(-40).map(m => <div key={m.id}><b>{m.u}:</b> {m.t}</div>)}</div>
        <div className="cpIn"><input value={txt} maxLength={120} placeholder="Say something…" enterKeyHint="send" onChange={e => setTxt(e.target.value)} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') go(); }} onKeyUp={e => e.stopPropagation()} /><button type="button" onClick={go}>Send</button></div>
      </>}
    </div>}
  </>;
}

function VoiceStatus({ voice }: { voice: VoiceApi }) {
  const t = voice.turn;
  return <div className="cpVs">
    <b>🎙️ Voice status</b>
    <div>{t.ok === null ? '⏳ Checking relay server…' : t.ok ? `✅ TURN relay detected${t.provider ? ' (' + t.provider + ')' : ''}` : `❌ No TURN relay detected${t.error ? ': ' + t.error : ''}${t.error.includes('no TURN variables') ? ' — add the variables in your host and REDEPLOY' : ''}`}</div>
    {voice.mic.inApp && <div>⚠️ You seem to be inside an app's built-in browser (WhatsApp, Instagram, Facebook…). These never ask for the microphone. Open the game in Chrome or Safari.</div>}
    {!voice.mic.secure && <div>⚠️ This page can't use the microphone (needs https and a supported browser).</div>}
    {voice.mic.perm === 'denied' && <div>🚫 Microphone is BLOCKED for this site, so no prompt will appear. Tap the 🔒 icon by the address bar → Microphone → Allow, then reload.</div>}
    {voice.mic.perm === 'prompt' && !voice.micOn && <div>👉 Tap the 🔇 Mic button on the game screen: the browser will then ask for permission.</div>}
    {voice.mic.perm === 'granted' && <div>✅ Microphone permission granted</div>}
    {voice.mic.err && <div>❌ {voice.mic.err}</div>}
    <div>{voice.micOn ? '🎤 Mic on' : '🔇 Mic off'} · direct links {voice.live}/{voice.linked}{voice.relayOn ? ' · 📡 relay audio active' : ''}</div>
  </div>;
}

const CSS = `
.cpVs{font-size:11px;line-height:1.35;background:#0d1d16;border:1px solid #ffffff22;border-radius:10px;padding:7px 9px;color:#cfe3d8;display:flex;flex-direction:column;gap:2px}.cpVs b{color:#fff}
.cpProf{display:flex;flex-direction:column;gap:7px;margin:6px 0 8px}.cpBadges{display:flex;flex-wrap:wrap;gap:5px}.cpBadges span{background:#13231d;border:1px solid #ffffff20;border-radius:999px;padding:3px 9px;font-size:11px;font-weight:700}.cpBadges .cpTier{background:#d99a42;color:#1a1410;border-color:#d99a42}
.cpBio{margin:0;font-size:12px;color:#cfe0d7;font-style:italic}.cpStats{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}.cpStats div{background:#0d1b16;border:1px solid #ffffff12;border-radius:10px;padding:6px 2px;text-align:center}.cpStats b{display:block;font-size:13px;color:#f0b94a}.cpStats small{font-size:9px;color:#8fa79b}
.cpSkills{display:flex;flex-wrap:wrap;gap:5px}.cpSkills span{font-size:11px;background:#10201a;border-radius:8px;padding:3px 8px}.cpRel{margin:0;font-size:12px}.cpLoad{font-size:12px;color:#8fa79b;margin:6px 0}.cpStall{background:#35c46b;color:#06210f;border:0;border-radius:10px;padding:9px;font-weight:800;font-size:12px;cursor:pointer}.cpFind{background:#0a1511;border:1px solid #2a4337;border-radius:9px;padding:8px;color:#fff;font-size:13px;margin-bottom:6px}.cpPeople small{opacity:.6;margin-left:4px}
.cpOnline{position:absolute;z-index:12;left:50%;transform:translateX(-50%);top:calc(10px + env(safe-area-inset-top,0px));display:flex;align-items:center;gap:7px;min-height:40px;padding:6px 14px;border-radius:999px;border:1px solid #ffffff3a;background:#0b1511e0;color:#fff;font-size:12px;cursor:pointer}
.cpOnline em{font-style:normal;font-weight:700}.cpOnline b{display:none}.cpOnline i{font-style:normal;position:absolute;top:-4px;right:-2px;background:#e5484d;border-radius:999px;font-size:10px;font-weight:800;padding:2px 6px}
.cpStack{position:absolute;z-index:25;left:50%;transform:translateX(-50%);top:calc(110px + env(safe-area-inset-top,0px));width:min(360px,calc(100vw - 24px));display:flex;flex-direction:column;gap:8px;pointer-events:none}
.cpStack>*{pointer-events:auto}
.cpCard{background:#09130ff2;border:1px solid #ffffff2e;border-radius:14px;padding:10px 12px;color:#fff;font-size:13px;display:flex;flex-direction:column;gap:8px;box-shadow:0 10px 30px #0008;animation:popIn .2s both}
.cpCard.ring{border-color:#d99a42;animation:popIn .2s both,pulseGlow 1.4s ease-in-out infinite}.cpCard.live{border-color:#3fb98a}.cpCard small{color:#9fb5aa}
.cpRow{display:flex;gap:8px}.cpRow button,.cpIn button{flex:1;min-height:42px;border-radius:10px;border:1px solid #2d493b;background:#173126;color:#fff;font-weight:700;font-size:13px}
.cpRow .ok{background:#1d7654;border-color:#3fb98a}.cpRow .no{background:#4a1f1f;border-color:#7d3a3a}
.cpNote{background:#d99a42;color:#1a1208;border-radius:999px;padding:8px 10px 8px 14px;font-size:12px;font-weight:700;text-align:center;display:flex;align-items:center;gap:8px}.cpNote span{flex:1}.cpNote button{flex:none;width:24px;height:24px;border:0;border-radius:50%;background:#1a120833;color:#1a1208;font-weight:900;font-size:12px;padding:0}
.cpSheet{position:absolute;z-index:30;left:50%;transform:translateX(-50%);bottom:calc(12px + env(safe-area-inset-bottom,0px));width:min(420px,calc(100vw - 24px));background:#09130ff7;border:1px solid #ffffff2e;border-radius:18px;padding:14px;color:#fff;box-shadow:0 18px 50px #000a;animation:popIn .2s both}
.cpSheet p{margin:8px 0 0;font-size:10px;color:#7f968b}.cpHead{display:flex;flex-direction:column;gap:2px;padding-right:34px;margin-bottom:10px}.cpHead b{font-size:16px}.cpHead span{font-size:11px;color:#9fb5aa}
.cpGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.cpGrid button{display:flex;flex-direction:column;align-items:center;gap:3px;min-height:64px;padding:8px 2px;border-radius:12px;border:1px solid #2d493b;background:#14261f;color:#fff;font-size:24px}.cpGrid button small{font-size:9px;color:#b7c8bf;text-align:center;line-height:1.15}.cpGrid button:disabled{opacity:.4}
.cpX{position:absolute;right:6px;top:4px;border:0;background:none;color:#fff;font-size:26px;width:38px;height:38px}
.cpChat{position:absolute;z-index:30;left:50%;transform:translateX(-50%);top:calc(58px + env(safe-area-inset-top,0px));width:min(360px,calc(100vw - 24px));max-height:calc(100% - 80px);display:flex;flex-direction:column;gap:7px;background:#09130ff7;border:1px solid #ffffff2a;border-radius:16px;padding:12px;color:#fff;box-shadow:0 18px 50px #000a}
.cpTitle{font-size:12px;font-weight:800;color:#f0b94a;padding-right:30px}.cpNoteTxt{font-size:12px;color:#cbd8d1;margin:0;padding-right:24px}
.cpPeople{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}.cpPeople span{font-size:11px;color:#9fb5aa}.cpPeople button{flex:0 0 auto;background:#14261f;border:1px solid #2a4337;color:#cfe;border-radius:999px;padding:6px 12px;font-size:12px;min-height:34px}
.cpLog{min-height:70px;max-height:34vh;overflow-y:auto;background:#0a1511;border-radius:10px;padding:8px 10px;font-size:12px;display:flex;flex-direction:column;gap:4px;user-select:text;-webkit-user-select:text}.cpLog b{color:#f3c56f}.cpEmpty{color:#7f968b}
.cpIn{display:flex;gap:6px}.cpIn input{flex:1;min-width:0;background:#0a1511;border:1px solid #2a4337;border-radius:10px;padding:10px;color:#fff;font-size:16px}.cpIn button{flex:0 0 auto;padding:0 16px;background:#d99a42;color:#1a1208;border:0}
@media (pointer:coarse),(max-width:820px){
  .cpOnline{left:auto;transform:none;left:calc(108px + env(safe-area-inset-left,0px));right:auto;top:calc(100px + env(safe-area-inset-top,0px));width:46px;height:46px;min-height:46px;padding:0;justify-content:center;gap:0;position:absolute;flex-direction:column;line-height:1}
  .cpOnline span{font-size:19px}.cpOnline em{display:none}.cpOnline b{display:block;font-size:10px}
  .cpStack{top:calc(104px + env(safe-area-inset-top,0px));width:min(360px,calc(100vw - 270px))}
  .cpChat{left:auto;right:calc(66px + env(safe-area-inset-right,0px));transform:none;top:calc(56px + env(safe-area-inset-top,0px));width:min(340px,calc(100vw - 90px));max-height:calc(100% - 70px)}
}
@media (max-height:480px){.cpGrid button{min-height:54px;font-size:20px}.cpSheet{padding:10px}.cpLog{max-height:22vh}}
`;
