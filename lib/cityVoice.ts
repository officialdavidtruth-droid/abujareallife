import { useCallback, useEffect, useRef, useState } from 'react';
import { NET, type RtcMsg } from './cityNet';
import { getSettings } from './settings';
import { sfx, startRing, stopRing } from './audio';

/* Private 1-to-1 voice calls between players (WebRTC, audio only).
   Rules: you must be within VOICE_REQ_RANGE metres to ask someone to talk, they must ACCEPT, and only then do the two of
   you hear each other. Nobody else can hear the call. The voice fades as you walk apart and the call drops past VOICE_MAX. */
export const VOICE_REQ_RANGE = 12;
export const VOICE_FULL = 8;
export const VOICE_MAX = 30;
export type Phase = 'idle' | 'calling' | 'incoming' | 'connecting' | 'live';
export type VoiceApi = ReturnType<typeof useCityVoice>;

const dist = (n: string) => { const p = NET.peers[n]; return p ? Math.hypot(p.x - NET.me.x, p.z - NET.me.z) : Infinity; };
// STUN always; TURN relay when the server has one configured (/api/turn) or NEXT_PUBLIC_TURN_* is set (needed on most mobile networks, see MULTIPLAYER.md)
let iceCache: { at: number; list: RTCIceServer[]; relay: boolean } | null = null;
async function iceServers(): Promise<{ list: RTCIceServer[]; relay: boolean }> {
  if (iceCache && Date.now() - iceCache.at < 5 * 60_000) return iceCache;
  let list: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }], relay = false;
  try { const r = await fetch('/api/turn', { cache: 'no-store' }); if (r.ok) { const d = await r.json(); if (Array.isArray(d.iceServers) && d.iceServers.length) { list = d.iceServers; relay = !!d.relay; } } } catch { /* offline: keep STUN */ }
  const url = process.env.NEXT_PUBLIC_TURN_URL;
  if (url && !relay) { list = [...list, { urls: url.split(',').map(x => x.trim()), username: process.env.NEXT_PUBLIC_TURN_USERNAME, credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL }]; relay = true; }
  iceCache = { at: Date.now(), list, relay }; return iceCache;
}

type Opts = { me: string; roster: string[]; signal: (to: string, t: string, d?: any) => void; subscribe: (f: (m: RtcMsg) => void) => () => void; isMuted: (n: string) => boolean; onSocial?: (a?: number) => void };
const clamp = (v: number) => Math.max(0, Math.min(1, v));

export function useCityVoice(o: Opts) {
  const [phase, setPhaseS] = useState<Phase>('idle'), [peer, setPeerS] = useState<string | null>(null), [micOff, setMicOff] = useState(false), [msg, setMsg] = useState(''), [diag, setDiag] = useState('');
  const ph = useRef<Phase>('idle'), pr = useRef<string | null>(null), pc = useRef<RTCPeerConnection | null>(null), local = useRef<MediaStream | null>(null);
  const el = useRef<HTMLAudioElement | null>(null), ice = useRef<RTCIceCandidateInit[]>([]), relay = useRef(false), restarted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), far = useRef(0), op = useRef(o); op.current = o;
  const set = (p: Phase, who: string | null) => { ph.current = p; pr.current = who; setPhaseS(p); setPeerS(who); NET.me.call = p === 'live' || p === 'connecting'; };
  const note = (t: string) => { setMsg(t); setTimeout(() => setMsg(m => (m === t ? '' : m)), 6000); };
  const clearT = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };

  const cleanup = useCallback((why?: string, tell = false) => {
    const who = pr.current, wasLive = ph.current === 'live'; clearT();
    if (tell && who) op.current.signal(who, 'end');
    pc.current?.close(); pc.current = null; ice.current = []; far.current = 0; restarted.current = false;
    local.current?.getTracks().forEach(t => t.stop()); local.current = null;
    if (el.current) { el.current.pause(); el.current.srcObject = null; el.current.remove(); el.current = null; }
    set('idle', null); setMicOff(false); setDiag(''); if (why) note(why); if (wasLive) sfx('close');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function getMic() {
    if (!navigator.mediaDevices?.getUserMedia) { note('Voice needs a secure (https) page and a browser with microphone support.'); return false; }
    try {
      local.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      return true;
    } catch (e) { const n = (e as DOMException)?.name; note(n === 'NotFoundError' ? 'No microphone found on this device.' : 'Microphone blocked. Allow mic access for this site (lock icon in the address bar) and try again.'); return false; }
  }
  // the remote voice plays through a normal <audio> element: the most reliable path on Chrome, Android and iOS
  function attachRemote(stream: MediaStream) {
    if (el.current) { el.current.pause(); el.current.remove(); }
    const a = document.createElement('audio'); a.autoplay = true; a.setAttribute('playsinline', ''); a.style.display = 'none'; a.srcObject = stream; document.body.appendChild(a); el.current = a;
    a.volume = clamp(getSettings().voice);
    a.play().catch(() => note('Tap anywhere on the screen to hear the call.'));
  }
  async function makePc(who: string) {
    const { list, relay: hasRelay } = await iceServers(); relay.current = hasRelay;
    const c = new RTCPeerConnection({ iceServers: list, iceCandidatePoolSize: 4 }); pc.current = c;
    local.current?.getTracks().forEach(t => c.addTrack(t, local.current!));
    c.onicecandidate = e => { if (e.candidate) op.current.signal(who, 'ice', e.candidate.toJSON()); };
    c.ontrack = e => attachRemote(e.streams[0] || new MediaStream([e.track]));
    c.oniceconnectionstatechange = () => setDiag(`network: ${c.iceConnectionState}`);
    c.onconnectionstatechange = () => {
      if (c.connectionState === 'connected') { clearT(); set('live', who); setDiag(''); }
      else if (c.connectionState === 'disconnected' && !restarted.current) { restarted.current = true; try { c.restartIce(); } catch { /* old browser */ } }
      else if (c.connectionState === 'failed') cleanup(relay.current ? 'The call dropped. Check your connection and try again.' : 'Could not connect the call. Phone networks usually need a relay server: ask the game owner to set up TURN (see MULTIPLAYER.md).', true);
    };
    return c;
  }
  const flush = async () => { const c = pc.current; if (!c?.remoteDescription) return; for (const x of ice.current.splice(0)) await c.addIceCandidate(x).catch(() => {}); };
  const stuck = () => cleanup(relay.current ? 'Could not connect. Try again in a moment.' : 'Stuck connecting. This network blocks direct voice, so the game needs a TURN relay (see MULTIPLAYER.md).', true);

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
    if (ph.current !== 'incoming' || pr.current !== who) { local.current?.getTracks().forEach(t => t.stop()); local.current = null; return; } // caller hung up while the mic prompt was open
    set('connecting', who); op.current.signal(who, 'acc');
    timer.current = setTimeout(stuck, 30000);
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
      clearT(); set('connecting', u); timer.current = setTimeout(stuck, 30000);
      const c = await makePc(u), offer = await c.createOffer(); await c.setLocalDescription(offer); p.signal(u, 'offer', { type: offer.type, sdp: offer.sdp });
    } else if (t === 'offer' && ph.current === 'connecting' && d) {
      const c = await makePc(u); await c.setRemoteDescription(d); await flush();
      const ans = await c.createAnswer(); await c.setLocalDescription(ans); p.signal(u, 'answer', { type: ans.type, sdp: ans.sdp });
    } else if (t === 'answer' && pc.current && d) { await pc.current.setRemoteDescription(d).catch(() => {}); await flush(); }
    else if (t === 'ice' && d) { if (pc.current?.remoteDescription) await pc.current.addIceCandidate(d).catch(() => {}); else ice.current.push(d); }
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  // distance rules: fade the voice with distance (and the Voice slider in Settings), drop the call if you walk away or they leave
  useEffect(() => {
    const id = setInterval(() => {
      const who = pr.current; if (!who || ph.current === 'idle') return;
      const d = dist(who);
      if (d === Infinity) { cleanup(`${who} left the city.`); return; }
      if (el.current) el.current.volume = clamp((d <= VOICE_FULL ? 1 : 1 - (d - VOICE_FULL) / (VOICE_MAX - VOICE_FULL)) * getSettings().voice);
      if (ph.current === 'live') { far.current = d > VOICE_MAX ? far.current + 500 : 0; if (far.current >= 4000) cleanup('You walked out of range.', true); }
    }, 500);
    return () => clearInterval(id);
  }, [cleanup]);
  useEffect(() => () => { cleanup(); stopRing(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { // phone sounds: ring while calling / being called, a happy chime when connected
    if (phase === 'incoming') startRing('incoming'); else if (phase === 'calling') startRing('outgoing'); else stopRing();
    if (phase === 'live') sfx('success');
  }, [phase]);
  useEffect(() => { // some browsers need one tap before audio plays
    const f = () => { el.current?.play().catch(() => {}); };
    window.addEventListener('pointerdown', f); return () => window.removeEventListener('pointerdown', f);
  }, []);
  return { phase, peer, micOff, msg, diag, request, accept, decline, hangup, toggleMic };
}
