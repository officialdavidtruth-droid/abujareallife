import { useCallback, useEffect, useRef, useState } from 'react';
import { NET, type RtcMsg } from './cityNet';
import { getSettings } from './settings';

/* Proximity voice chat, like CODM / GTA Online: no calls, nothing to accept.
   Turn your mic on (🎤 button, or hold V) and every player within range simply hears you; you hear everyone nearby who has their mic on.
   Voice gets quieter with distance. Under the hood it is a small WebRTC audio mesh: you link to the (up to MAX_LINKS) closest players
   and drop links when they walk away. Set-up messages travel over the same Supabase channel as the position updates. */
export const VOICE_FULL = 7;       // metres: full volume inside this
export const VOICE_MAX = 30;       // metres: silent / not connected beyond this
export const VOICE_DROP = 40;      // links are only dropped past this (a little hysteresis, so walking at the edge does not flap)
export const VOICE_REQ_RANGE = VOICE_MAX; // kept for older imports
const MAX_LINKS = 6;
export type VoiceApi = ReturnType<typeof useCityVoice>;

const dist = (n: string) => { const p = NET.peers[n]; return p ? Math.hypot(p.x - NET.me.x, p.z - NET.me.z) : Infinity; };
const clamp = (v: number) => Math.max(0, Math.min(1, v));
// STUN always; TURN relay when the server has one configured (/api/turn) or NEXT_PUBLIC_TURN_* is set (needed on most phone networks, see VOICE-SETUP.md)
let iceCache: { at: number; list: RTCIceServer[]; relay: boolean } | null = null;
async function iceServers(): Promise<{ list: RTCIceServer[]; relay: boolean }> {
  if (iceCache && Date.now() - iceCache.at < 5 * 60_000) return iceCache;
  let list: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }], relay = false;
  try { const r = await fetch('/api/turn', { cache: 'no-store' }); if (r.ok) { const d = await r.json(); if (Array.isArray(d.iceServers) && d.iceServers.length) { list = d.iceServers; relay = !!d.relay; } } } catch { /* offline: keep STUN */ }
  const url = process.env.NEXT_PUBLIC_TURN_URL;
  if (url && !relay) { list = [...list, { urls: url.split(',').map(x => x.trim()), username: process.env.NEXT_PUBLIC_TURN_USERNAME, credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL }]; relay = true; }
  if (!relay && typeof console !== 'undefined') console.warn('[voice] No TURN relay configured: voice will not reach players on most phone networks. Open /api/turn while signed in to see why.');
  iceCache = { at: Date.now(), list, relay }; return iceCache;
}

type Opts = { me: string; roster: string[]; signal: (to: string, t: string, d?: any) => void; subscribe: (f: (m: RtcMsg) => void) => () => void; isMuted: (n: string) => boolean; onSocial?: (a?: number) => void };
type Link = { pc: RTCPeerConnection; audio: HTMLAudioElement | null; ice: RTCIceCandidateInit[]; since: number; live: boolean; stopWatch: () => void };

export function useCityVoice(o: Opts) {
  const [micOn, setMicOnS] = useState(false), [msg, setMsg] = useState(''), [linked, setLinked] = useState(0);
  const op = useRef(o); op.current = o;
  const links = useRef(new Map<string, Link>()), building = useRef(new Set<string>()), early = useRef<Record<string, RTCIceCandidateInit[]>>({}), retry = useRef<Record<string, number>>({});
  const stream = useRef<MediaStream | null>(null), micRef = useRef(false), ptt = useRef(false), stopLocal = useRef<() => void>(() => {}), ctx = useRef<AudioContext | null>(null);
  const note = (t: string) => { setMsg(t); setTimeout(() => setMsg(m => (m === t ? '' : m)), 6000); };

  const track = () => stream.current?.getAudioTracks()[0] || null;
  const syncTrack = () => { const t = track(); if (t) t.enabled = micRef.current || ptt.current; };
  const audioCtx = () => { try { const AC = window.AudioContext || (window as any).webkitAudioContext; if (!ctx.current) ctx.current = new AC(); ctx.current!.resume?.().catch(() => {}); return ctx.current!; } catch { return null; } };
  // "is this stream loud right now": drives the green speaking indicator
  const watch = (s: MediaStream, key: string) => {
    try {
      const c = audioCtx(); if (!c) return () => {};
      const src = c.createMediaStreamSource(s), an = c.createAnalyser(); an.fftSize = 256; src.connect(an);
      const buf = new Uint8Array(an.fftSize);
      const id = setInterval(() => { an.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128)); if (m > 8) NET.talk[key] = Date.now() + 350; }, 120);
      return () => { clearInterval(id); try { src.disconnect(); } catch { /* already gone */ } delete NET.talk[key]; };
    } catch { return () => {}; }
  };

  async function getMic() {
    if (stream.current) return true;
    if (!navigator.mediaDevices?.getUserMedia) { note('Voice needs a secure (https) page and a browser with microphone support.'); return false; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      stream.current = s; syncTrack(); stopLocal.current = watch(s, op.current.me);
      const t = s.getAudioTracks()[0]; links.current.forEach(L => L.pc.getSenders().forEach(x => { if (!x.track || x.track.kind === 'audio') x.replaceTrack(t).catch(() => {}); })); // start sending on links that already exist
      return true;
    } catch (e) { const n = (e as DOMException)?.name; note(n === 'NotFoundError' ? 'No microphone found on this device.' : 'Microphone blocked. Allow mic access for this site (lock icon in the address bar) and try again.'); return false; }
  }

  const drop = useCallback((who: string, tell = false) => {
    const L = links.current.get(who); delete early.current[who];
    if (tell) op.current.signal(who, 'bye');
    if (!L) return;
    links.current.delete(who); L.stopWatch();
    try { L.pc.onconnectionstatechange = null; L.pc.oniceconnectionstatechange = null; L.pc.close(); } catch { /* ignore */ }
    if (L.audio) { L.audio.pause(); L.audio.srcObject = null; L.audio.remove(); }
    delete NET.talk[who];
  }, []);

  async function build(who: string): Promise<Link> {
    const { list } = await iceServers();
    const pc = new RTCPeerConnection({ iceServers: list, iceCandidatePoolSize: 2 });
    const tr = pc.addTransceiver('audio', { direction: 'sendrecv' }); // always two-way, so we can listen even while our own mic is off
    const t = track(); if (t) tr.sender.replaceTrack(t).catch(() => {});
    const L: Link = { pc, audio: null, ice: early.current[who] || [], since: Date.now(), live: false, stopWatch: () => {} }; delete early.current[who];
    pc.onicecandidate = e => { if (e.candidate) op.current.signal(who, 'ice', e.candidate.toJSON()); };
    pc.ontrack = e => {
      const s = e.streams[0] || new MediaStream([e.track]);
      if (L.audio) { L.audio.pause(); L.audio.remove(); } L.stopWatch();
      const a = document.createElement('audio'); a.autoplay = true; a.setAttribute('playsinline', ''); a.style.display = 'none'; a.srcObject = s; document.body.appendChild(a); L.audio = a;
      a.play().catch(() => note('Tap the screen once to hear nearby players.'));
      L.stopWatch = watch(s, who);
    };
    const lost = () => { if (links.current.get(who) === L) { drop(who); retry.current[who] = Date.now() + 5000; } };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'connected') L.live = true; else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') lost(); else if (pc.connectionState === 'disconnected') { try { pc.restartIce(); } catch { /* old browser */ } } };
    pc.oniceconnectionstatechange = () => { // older iPhones have no connectionState
      if (typeof (pc as any).connectionState !== 'undefined') return;
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') L.live = true; else if (pc.iceConnectionState === 'failed') lost();
    };
    return L;
  }
  const flush = async (L: Link) => { for (const x of L.ice.splice(0)) await L.pc.addIceCandidate(x).catch(() => {}); };

  const connect = useCallback(async (who: string) => { // we are the "caller" side of this pair (alphabetical rule), so we send the offer
    if (building.current.has(who) || links.current.has(who)) return;
    building.current.add(who);
    try {
      const L = await build(who); links.current.set(who, L);
      const offer = await L.pc.createOffer(); await L.pc.setLocalDescription(offer);
      op.current.signal(who, 'offer', { type: offer.type, sdp: offer.sdp });
    } catch { drop(who); retry.current[who] = Date.now() + 8000; } finally { building.current.delete(who); }
  }, [drop]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => op.current.subscribe(async m => {
    const { u, t, d } = m, p = op.current;
    if (!p.roster.includes(u) || p.isMuted(u)) return;
    if (t === 'offer' && d) {
      if (dist(u) > VOICE_DROP) return;
      drop(u); early.current[u] = []; // a new offer replaces any older link; candidates that race ahead of the link wait in early[]
      try {
        const L = await build(u); links.current.set(u, L);
        await L.pc.setRemoteDescription(d); await flush(L);
        const ans = await L.pc.createAnswer(); await L.pc.setLocalDescription(ans); p.signal(u, 'answer', { type: ans.type, sdp: ans.sdp });
      } catch { drop(u); retry.current[u] = Date.now() + 8000; }
    } else if (t === 'answer' && d) {
      const L = links.current.get(u); if (!L || L.pc.signalingState !== 'have-local-offer') return;
      await L.pc.setRemoteDescription(d).catch(() => {}); await flush(L);
    } else if (t === 'ice' && d) {
      const L = links.current.get(u);
      if (L) { if (L.pc.remoteDescription) await L.pc.addIceCandidate(d).catch(() => {}); else L.ice.push(d); }
      else if (early.current[u]) early.current[u].push(d);
    } else if (t === 'bye') { drop(u); retry.current[u] = Date.now() + 2000; }
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  // once a second: link to the closest players in range, drop the ones who left, and set each voice's volume by distance
  useEffect(() => {
    const id = setInterval(() => {
      const p = op.current, now = Date.now(), cfg = getSettings();
      const near = Object.keys(NET.peers).filter(n => p.roster.includes(n) && !p.isMuted(n)).map(n => [n, dist(n)] as const).filter(([, d]) => d <= VOICE_MAX).sort((a, b) => a[1] - b[1]).slice(0, MAX_LINKS);
      for (const [n] of near) if (!links.current.has(n) && !building.current.has(n) && p.me.toLowerCase() < n.toLowerCase() && now > (retry.current[n] || 0)) connect(n);
      links.current.forEach((L, n) => {
        const d = dist(n);
        if (d > VOICE_DROP || !p.roster.includes(n) || p.isMuted(n) || (!L.live && now - L.since > 20_000)) { drop(n, true); retry.current[n] = now + 8000; return; }
        if (L.audio) { const v = d <= VOICE_FULL ? 1 : 1 - (d - VOICE_FULL) / (VOICE_MAX - VOICE_FULL); L.audio.volume = clamp(v * cfg.voice); L.audio.muted = v < .02 || cfg.muteAll; } // iPhones ignore .volume, but obey .muted
      });
      setLinked(links.current.size);
    }, 1000);
    return () => clearInterval(id);
  }, [connect, drop]);

  const setMic = useCallback(async (on: boolean) => {
    if (on && !(await getMic())) return;
    audioCtx(); micRef.current = on; setMicOnS(on); syncTrack();
    if (on) note('🎤 Mic on: nearby players can hear you.');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleMic = useCallback(() => setMic(!micRef.current), [setMic]);

  // hold V = push-to-talk (works while the mic is off)
  useEffect(() => {
    const typing = (e: Event) => { const t = e.target as HTMLElement | null; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
    const dn = async (e: KeyboardEvent) => { if (e.key.toLowerCase() !== 'v' || e.repeat || typing(e)) return; if (await getMic()) { ptt.current = true; syncTrack(); } };
    const up = (e: KeyboardEvent) => { if (e.key.toLowerCase() !== 'v') return; ptt.current = false; syncTrack(); };
    const blur = () => { ptt.current = false; syncTrack(); };
    window.addEventListener('keydown', dn); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // some browsers need one tap before audio plays
  useEffect(() => {
    const f = () => { links.current.forEach(L => L.audio?.play().catch(() => {})); ctx.current?.resume?.().catch(() => {}); };
    window.addEventListener('pointerdown', f); return () => window.removeEventListener('pointerdown', f);
  }, []);

  useEffect(() => () => {
    [...links.current.keys()].forEach(n => drop(n, true));
    stopLocal.current(); stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; ctx.current?.close().catch(() => {}); ctx.current = null;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { micOn, toggleMic, setMic, msg, linked };
}
