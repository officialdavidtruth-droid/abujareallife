import { useCallback, useEffect, useRef, useState } from 'react';
import { NET, type RtcMsg } from './cityNet';

/* Private 1-to-1 voice calls between players (WebRTC, audio only).
   Rules: you must be within VOICE_REQ_RANGE metres to ask someone to talk, they must ACCEPT, and only then do the two of
   you hear each other. Nobody else can hear the call. The voice fades as you walk apart and the call drops past VOICE_MAX. */
export const VOICE_REQ_RANGE = 12;
export const VOICE_FULL = 8;
export const VOICE_MAX = 30;
export type Phase = 'idle' | 'calling' | 'incoming' | 'connecting' | 'live';
export type VoiceApi = ReturnType<typeof useCityVoice>;

const dist = (n: string) => { const p = NET.peers[n]; return p ? Math.hypot(p.x - NET.me.x, p.z - NET.me.z) : Infinity; };
function iceServers(): RTCIceServer[] {
  const s: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  const url = process.env.NEXT_PUBLIC_TURN_URL; // optional TURN relay (needed on many mobile networks), see MULTIPLAYER.md
  if (url) s.push({ urls: url.split(',').map(x => x.trim()), username: process.env.NEXT_PUBLIC_TURN_USERNAME, credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL });
  return s;
}

type Opts = { me: string; roster: string[]; signal: (to: string, t: string, d?: any) => void; subscribe: (f: (m: RtcMsg) => void) => () => void; isMuted: (n: string) => boolean; onSocial?: (a?: number) => void };

export function useCityVoice(o: Opts) {
  const [phase, setPhaseS] = useState<Phase>('idle'), [peer, setPeerS] = useState<string | null>(null), [micOff, setMicOff] = useState(false), [msg, setMsg] = useState('');
  const ph = useRef<Phase>('idle'), pr = useRef<string | null>(null), pc = useRef<RTCPeerConnection | null>(null), local = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null), gain = useRef<GainNode | null>(null), el = useRef<HTMLAudioElement | null>(null), ice = useRef<RTCIceCandidateInit[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), far = useRef(0), op = useRef(o); op.current = o;
  const set = (p: Phase, who: string | null) => { ph.current = p; pr.current = who; setPhaseS(p); setPeerS(who); NET.me.call = p === 'live' || p === 'connecting'; };
  const note = (t: string) => { setMsg(t); setTimeout(() => setMsg(m => (m === t ? '' : m)), 4500); };
  const clearT = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };

  const cleanup = useCallback((why?: string, tell = false) => {
    const who = pr.current; clearT();
    if (tell && who) op.current.signal(who, 'end');
    pc.current?.close(); pc.current = null; ice.current = []; far.current = 0;
    local.current?.getTracks().forEach(t => t.stop()); local.current = null;
    if (el.current) { el.current.srcObject = null; el.current = null; }
    gain.current = null; ctx.current?.close().catch(() => {}); ctx.current = null;
    set('idle', null); setMicOff(false); if (why) note(why);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function getMic() {
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext; ctx.current = new AC(); ctx.current.resume().catch(() => {});
      local.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      return true;
    } catch { note('Microphone blocked. Allow mic access for this site and try again.'); ctx.current?.close().catch(() => {}); ctx.current = null; return false; }
  }
  function makePc(who: string) {
    const c = new RTCPeerConnection({ iceServers: iceServers() }); pc.current = c;
    local.current?.getTracks().forEach(t => c.addTrack(t, local.current!));
    c.onicecandidate = e => { if (e.candidate) op.current.signal(who, 'ice', e.candidate.toJSON()); };
    c.ontrack = e => {
      const stream = e.streams[0]; if (!stream) return;
      const a = new Audio(); a.srcObject = stream; a.muted = true; (a as any).playsInline = true; a.play().catch(() => {}); el.current = a; // keeps the stream alive in Chrome
      if (ctx.current) { const g = ctx.current.createGain(); g.gain.value = 1; ctx.current.createMediaStreamSource(stream).connect(g); g.connect(ctx.current.destination); gain.current = g; ctx.current.resume().catch(() => {}); }
    };
    c.onconnectionstatechange = () => {
      if (c.connectionState === 'connected') { clearT(); set('live', who); }
      else if (c.connectionState === 'failed') cleanup('Call failed. The network may be blocking voice.', true);
    };
    return c;
  }
  const flush = async () => { const c = pc.current; if (!c?.remoteDescription) return; for (const x of ice.current.splice(0)) await c.addIceCandidate(x).catch(() => {}); };

  const request = useCallback(async (who: string) => {
    if (ph.current !== 'idle') return;
    if (!op.current.roster.includes(who)) return note('Player not found.');
    if (dist(who) > VOICE_REQ_RANGE) return note(`Get closer to ${who} (within ${VOICE_REQ_RANGE} m) to talk.`);
    if (!(await getMic())) return;
    if (ph.current !== 'idle') { cleanup(); return; }
    set('calling', who); op.current.signal(who, 'req');
    timer.current = setTimeout(() => cleanup(`${who} didn't answer.`, true), 25000);
  }, [cleanup]); // eslint-disable-line react-hooks/exhaustive-deps

  const accept = useCallback(async () => {
    const who = pr.current; if (ph.current !== 'incoming' || !who) return;
    clearT();
    if (dist(who) > VOICE_MAX) { op.current.signal(who, 'dec'); return cleanup(`${who} is too far away.`); }
    if (!(await getMic())) { op.current.signal(who, 'dec'); return cleanup(); }
    set('connecting', who); op.current.signal(who, 'acc');
    timer.current = setTimeout(() => cleanup('Could not connect.', true), 20000);
  }, [cleanup]); // eslint-disable-line react-hooks/exhaustive-deps
  const decline = useCallback(() => { const who = pr.current; if (who) op.current.signal(who, 'dec'); cleanup(); }, [cleanup]);
  const hangup = useCallback(() => cleanup('Call ended.', true), [cleanup]);
  const toggleMic = useCallback(() => { const t = local.current?.getAudioTracks()[0]; if (t) { t.enabled = !t.enabled; setMicOff(!t.enabled); } }, []);

  useEffect(() => op.current.subscribe(async m => {
    const { u, t, d } = m, p = op.current;
    if (!p.roster.includes(u)) return;
    if (t === 'req') {
      if (ph.current !== 'idle') return p.signal(u, 'busy');
      if (p.isMuted(u)) return p.signal(u, 'dec');
      set('incoming', u); timer.current = setTimeout(() => { p.signal(u, 'dec'); cleanup(); }, 25000); return;
    }
    if (u !== pr.current) return;
    if (t === 'dec') cleanup(`${u} declined.`);
    else if (t === 'busy') cleanup(`${u} is on another call.`);
    else if (t === 'end') cleanup(`${u} ended the call.`);
    else if (t === 'acc' && ph.current === 'calling') {
      clearT(); set('connecting', u); timer.current = setTimeout(() => cleanup('Could not connect.', true), 20000);
      const c = makePc(u), offer = await c.createOffer(); await c.setLocalDescription(offer); p.signal(u, 'offer', { type: offer.type, sdp: offer.sdp });
    } else if (t === 'offer' && ph.current === 'connecting' && d) {
      const c = makePc(u); await c.setRemoteDescription(d); await flush();
      const ans = await c.createAnswer(); await c.setLocalDescription(ans); p.signal(u, 'answer', { type: ans.type, sdp: ans.sdp });
    } else if (t === 'answer' && pc.current && d) { await pc.current.setRemoteDescription(d).catch(() => {}); await flush(); }
    else if (t === 'ice' && d) { if (pc.current?.remoteDescription) await pc.current.addIceCandidate(d).catch(() => {}); else ice.current.push(d); }
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  // distance rules: fade the voice with distance, drop the call if you walk away or they leave
  useEffect(() => {
    const id = setInterval(() => {
      const who = pr.current; if (!who || ph.current === 'idle') return;
      const d = dist(who);
      if (d === Infinity) { cleanup(`${who} left the city.`); return; }
      if (gain.current) gain.current.gain.value = d <= VOICE_FULL ? 1 : Math.max(0, 1 - (d - VOICE_FULL) / (VOICE_MAX - VOICE_FULL));
      if (ph.current === 'live') { far.current = d > VOICE_MAX ? far.current + 500 : 0; if (far.current >= 4000) cleanup('You walked out of range.', true); }
    }, 500);
    return () => clearInterval(id);
  }, [cleanup]);
  useEffect(() => () => cleanup(), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { // some browsers need one tap before audio plays
    const f = () => { el.current?.play().catch(() => {}); ctx.current?.resume().catch(() => {}); };
    window.addEventListener('pointerdown', f); return () => window.removeEventListener('pointerdown', f);
  }, []);
  return { phase, peer, micOff, msg, request, accept, decline, hangup, toggleMic };
}
