'use client';
import { useEffect, useRef, useState } from 'react';
import { ACT_LIST, INTERACT_RANGE, NET, type useCityNet } from '../lib/cityNet';
import { VOICE_REQ_RANGE, type VoiceApi } from '../lib/cityVoice';

type Net = ReturnType<typeof useCityNet>;
const dist = (n: string) => { const p = NET.peers[n]; return p ? Math.hypot(p.x - NET.me.x, p.z - NET.me.z) : Infinity; };
const ACT_EMOJI: Record<string, string> = { wave: '👋', cheer: '🙌', dance: '💃' };

/* Everything social in the open city: online list + chat, player card (talk / wave / high-five / dance / mute),
   voice-call banners and incoming interaction notices. */
export default function CityPeople({ net, voice, sel, setSel }: { net: Net; voice: VoiceApi; sel: string | null; setSel: (n: string | null) => void }) {
  const [open, setOpen] = useState(false), [txt, setTxt] = useState(''), [, tick] = useState(0), box = useRef<HTMLDivElement>(null);
  useEffect(() => { const id = setInterval(() => tick(x => x + 1), 500); return () => clearInterval(id); }, []);
  useEffect(() => { if (open) { net.clearUnread(); box.current?.scrollTo(0, 1e9); } }, [open, net.log.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (sel && !net.roster.includes(sel)) setSel(null); }, [sel, net.roster, setSel]);
  const go = () => { if (net.send(txt)) setTxt(''); };
  const count = net.roster.length + 1;
  const label = !net.enabled ? 'Solo' : net.status === 'online' ? `${count} online` : net.status === 'error' ? 'Offline' : 'Connecting…';
  const d = sel ? dist(sel) : Infinity, canTalk = d <= VOICE_REQ_RANGE, canAct = d <= INTERACT_RANGE;
  const busy = voice.phase !== 'idle';

  return <>
    <style>{CSS}</style>
    <button className="cpOnline" onClick={() => setOpen(o => !o)} aria-label="Players and chat"><span>🌍</span><em>{label}</em><b>{net.enabled ? count : '–'}</b>{net.unread > 0 && !open && <i>{net.unread > 9 ? '9+' : net.unread}</i>}</button>

    <div className="cpStack">
      {voice.phase === 'incoming' && voice.peer && <div className="cpCard ring"><div>📞 <b>{voice.peer}</b> wants to talk</div><div className="cpRow"><button className="ok" onClick={voice.accept}>Accept</button><button className="no" onClick={voice.decline}>Decline</button></div></div>}
      {voice.phase === 'calling' && voice.peer && <div className="cpCard"><div>📞 Calling <b>{voice.peer}</b>…</div><div className="cpRow"><button className="no" onClick={voice.hangup}>Cancel</button></div></div>}
      {voice.phase === 'connecting' && voice.peer && <div className="cpCard"><div>🔗 Connecting to <b>{voice.peer}</b>…</div></div>}
      {voice.phase === 'live' && voice.peer && <div className="cpCard live"><div>🎙️ Talking to <b>{voice.peer}</b>{dist(voice.peer) > 8 ? <small> · fading, move closer</small> : null}</div><div className="cpRow"><button onClick={voice.toggleMic}>{voice.micOff ? '🔇 Unmute' : '🎤 Mute'}</button><button className="no" onClick={voice.hangup}>Hang up</button></div></div>}
      {voice.msg && <div className="cpNote">{voice.msg}</div>}
      {net.notices.map(n => <div key={n.id} className="cpCard"><div>{ACT_EMOJI[n.k]} <b>{n.from}</b> {n.text}</div><div className="cpRow">{dist(n.from) <= INTERACT_RANGE && <button className="ok" onClick={() => { net.act(n.k, n.from); net.dismissNotice(n.id); }}>{n.reply}</button>}<button onClick={() => net.dismissNotice(n.id)}>Dismiss</button></div></div>)}
    </div>

    {sel && net.roster.includes(sel) && <div className="cpSheet">
      <button className="cpX" onClick={() => setSel(null)} aria-label="Close">×</button>
      <div className="cpHead"><b>{sel}</b><span>{d === Infinity ? '' : d <= INTERACT_RANGE ? `${Math.round(d)} m away · close` : `${Math.round(d)} m away · walk closer`}</span></div>
      <div className="cpGrid">
        <button disabled={busy || !canTalk} onClick={() => { voice.request(sel); setSel(null); }}>🎙️<small>{busy ? 'In a call' : canTalk ? 'Talk (voice)' : 'Too far to talk'}</small></button>
        {ACT_LIST.map(([k, e, l]) => <button key={k} disabled={!canAct} onClick={() => { net.act(k, sel); setSel(null); }}>{e}<small>{l}</small></button>)}
        <button onClick={() => net.toggleMute(sel)}>{net.muted.includes(sel) ? '🔇' : '🔈'}<small>{net.muted.includes(sel) ? 'Unmute chat' : 'Mute chat'}</small></button>
      </div>
      <p>Voice is private: {sel} must accept first, then only the two of you hear each other.</p>
    </div>}

    {open && <div className="cpChat">
      <button className="cpX" onClick={() => setOpen(false)} aria-label="Close">×</button>
      {!net.enabled ? <p className="cpNoteTxt">Multiplayer is off. Add <b>NEXT_PUBLIC_SUPABASE_URL</b> and <b>NEXT_PUBLIC_SUPABASE_ANON_KEY</b> in Vercel and redeploy.</p> : <>
        <div className="cpTitle">🏙️ Abuja · City {net.room} · {net.status === 'online' ? `${count} players` : net.status}</div>
        <div className="cpPeople">{net.roster.length === 0 ? <span>You're the only one here right now. Invite friends!</span> : net.roster.map(n => <button key={n} onClick={() => { setSel(n); setOpen(false); }}>👤 {n}</button>)}</div>
        <div className="cpLog" ref={box}>{net.log.length === 0 ? <span className="cpEmpty">Say hi to the city 👋</span> : net.log.slice(-40).map(m => <div key={m.id}><b>{m.u}:</b> {m.t}</div>)}</div>
        <div className="cpIn"><input value={txt} maxLength={120} placeholder="Say something…" enterKeyHint="send" onChange={e => setTxt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') go(); }} /><button onClick={go}>Send</button></div>
      </>}
    </div>}
  </>;
}

const CSS = `
.cpOnline{position:absolute;z-index:12;left:50%;transform:translateX(-50%);top:calc(10px + env(safe-area-inset-top,0px));display:flex;align-items:center;gap:7px;min-height:40px;padding:6px 14px;border-radius:999px;border:1px solid #ffffff3a;background:#0b1511e0;color:#fff;font-size:12px;cursor:pointer}
.cpOnline em{font-style:normal;font-weight:700}.cpOnline b{display:none}.cpOnline i{font-style:normal;position:absolute;top:-4px;right:-2px;background:#e5484d;border-radius:999px;font-size:10px;font-weight:800;padding:2px 6px}
.cpStack{position:absolute;z-index:25;left:50%;transform:translateX(-50%);top:calc(110px + env(safe-area-inset-top,0px));width:min(360px,calc(100vw - 24px));display:flex;flex-direction:column;gap:8px;pointer-events:none}
.cpStack>*{pointer-events:auto}
.cpCard{background:#09130ff2;border:1px solid #ffffff2e;border-radius:14px;padding:10px 12px;color:#fff;font-size:13px;display:flex;flex-direction:column;gap:8px;box-shadow:0 10px 30px #0008;animation:popIn .2s both}
.cpCard.ring{border-color:#d99a42;animation:popIn .2s both,pulseGlow 1.4s ease-in-out infinite}.cpCard.live{border-color:#3fb98a}.cpCard small{color:#9fb5aa}
.cpRow{display:flex;gap:8px}.cpRow button,.cpIn button{flex:1;min-height:42px;border-radius:10px;border:1px solid #2d493b;background:#173126;color:#fff;font-weight:700;font-size:13px}
.cpRow .ok{background:#1d7654;border-color:#3fb98a}.cpRow .no{background:#4a1f1f;border-color:#7d3a3a}
.cpNote{background:#d99a42;color:#1a1208;border-radius:999px;padding:8px 14px;font-size:12px;font-weight:700;text-align:center}
.cpSheet{position:absolute;z-index:30;left:50%;transform:translateX(-50%);bottom:calc(12px + env(safe-area-inset-bottom,0px));width:min(420px,calc(100vw - 24px));background:#09130ff7;border:1px solid #ffffff2e;border-radius:18px;padding:14px;color:#fff;box-shadow:0 18px 50px #000a;animation:popIn .2s both}
.cpSheet p{margin:8px 0 0;font-size:10px;color:#7f968b}.cpHead{display:flex;flex-direction:column;gap:2px;padding-right:34px;margin-bottom:10px}.cpHead b{font-size:16px}.cpHead span{font-size:11px;color:#9fb5aa}
.cpGrid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.cpGrid button{display:flex;flex-direction:column;align-items:center;gap:3px;min-height:64px;padding:8px 2px;border-radius:12px;border:1px solid #2d493b;background:#14261f;color:#fff;font-size:24px}.cpGrid button small{font-size:9px;color:#b7c8bf;text-align:center;line-height:1.15}.cpGrid button:disabled{opacity:.4}
.cpX{position:absolute;right:6px;top:4px;border:0;background:none;color:#fff;font-size:26px;width:38px;height:38px}
.cpChat{position:absolute;z-index:30;left:50%;transform:translateX(-50%);top:calc(58px + env(safe-area-inset-top,0px));width:min(360px,calc(100vw - 24px));max-height:calc(100% - 80px);display:flex;flex-direction:column;gap:7px;background:#09130ff7;border:1px solid #ffffff2a;border-radius:16px;padding:12px;color:#fff;box-shadow:0 18px 50px #000a}
.cpTitle{font-size:12px;font-weight:800;color:#f0b94a;padding-right:30px}.cpNoteTxt{font-size:12px;color:#cbd8d1;margin:0;padding-right:24px}
.cpPeople{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}.cpPeople span{font-size:11px;color:#9fb5aa}.cpPeople button{flex:0 0 auto;background:#14261f;border:1px solid #2a4337;color:#cfe;border-radius:999px;padding:6px 12px;font-size:12px;min-height:34px}
.cpLog{min-height:70px;max-height:34vh;overflow-y:auto;background:#0a1511;border-radius:10px;padding:8px 10px;font-size:12px;display:flex;flex-direction:column;gap:4px;user-select:text;-webkit-user-select:text}.cpLog b{color:#f3c56f}.cpEmpty{color:#7f968b}
.cpIn{display:flex;gap:6px}.cpIn input{flex:1;min-width:0;background:#0a1511;border:1px solid #2a4337;border-radius:10px;padding:10px;color:#fff;font-size:16px}.cpIn button{flex:0 0 auto;padding:0 16px;background:#d99a42;color:#1a1208;border:0}
@media (pointer:coarse),(max-width:820px){
  .cpOnline{left:auto;transform:none;right:calc(10px + env(safe-area-inset-right,0px));top:calc(224px + env(safe-area-inset-top,0px));width:46px;height:46px;min-height:46px;padding:0;justify-content:center;gap:0;position:absolute;flex-direction:column;line-height:1}
  .cpOnline span{font-size:19px}.cpOnline em{display:none}.cpOnline b{display:block;font-size:10px}
  .cpStack{top:calc(104px + env(safe-area-inset-top,0px));width:min(360px,calc(100vw - 270px))}
  .cpChat{left:auto;right:calc(66px + env(safe-area-inset-right,0px));transform:none;top:calc(56px + env(safe-area-inset-top,0px));width:min(340px,calc(100vw - 90px));max-height:calc(100% - 70px)}
}
@media (max-height:480px){.cpGrid button{min-height:54px;font-size:20px}.cpSheet{padding:10px}.cpLog{max-height:22vh}}
`;
