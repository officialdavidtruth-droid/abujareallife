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
// Phones (iOS Safari, many Android browsers) cannot tell us whether the mic is already allowed, so we remember it ourselves.
// Without this the "Allow microphone" card came back every time you stepped outside.
const MIC_OK = 'arl-mic-granted', MIC_ASKED = 'arl-mic-asked';
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } };
/* ── Relay voice: the part that makes voice work on ANY network. ──
   Direct WebRTC fails on most phone networks without a TURN server. So while a nearby player has no live direct link to you,
   your voice is also sent as small compressed audio chunks through the same Supabase channel (only while you are actually speaking),
   and played back with distance volume. Once a direct link goes live, the relay stops for that pair automatically. */
const mu = (x: number) => { const s = x < 0 ? -1 : 1, y = s * Math.log(1 + 255 * Math.min(1, Math.abs(x))) / Math.log(256); return Math.round((y + 1) * 127.5); };
const unmu = (b: number) => { const y = b / 127.5 - 1, s = y < 0 ? -1 : 1; return s * ((Math.pow(256, Math.abs(y)) - 1) / 255); };
export type VoiceApiMesh = ReturnType<typeof useCityVoiceMesh>;

const cityDist = (n: string) => { const p = NET.peers[n]; return p ? Math.hypot(p.x - NET.me.x, p.z - NET.me.z) : Infinity; };
const clamp = (v: number) => Math.max(0, Math.min(1, v));
// STUN always; TURN relay when the server has one configured (/api/turn) or NEXT_PUBLIC_TURN_* is set (needed on most phone networks, see VOICE-SETUP.md)
let iceCache: { at: number; list: RTCIceServer[]; relay: boolean } | null = null;
// Last-resort public relay (Open Relay) so voice has a chance on phone networks even before you configure your own TURN. Audio stays end-to-end encrypted (DTLS-SRTP). Set NEXT_PUBLIC_NO_PUBLIC_TURN=1 to turn it off; your own METERED_/CF_TURN_/TURN_ settings always win.
const PUBLIC_TURN: RTCIceServer = { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' };
async function iceServers(): Promise<{ list: RTCIceServer[]; relay: boolean }> {
  if (iceCache && Date.now() - iceCache.at < 5 * 60_000) return iceCache;
  let list: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302', 'stun:global.stun.twilio.com:3478'] }], relay = false;
  try { const r = await fetch('/api/turn', { cache: 'no-store' }); if (r.ok) { const d = await r.json(); if (Array.isArray(d.iceServers) && d.iceServers.length) { list = d.iceServers; relay = !!d.relay; } } } catch { /* offline: keep STUN */ }
  const url = process.env.NEXT_PUBLIC_TURN_URL;
  if (url && !relay) { list = [...list, { urls: url.split(',').map(x => x.trim()), username: process.env.NEXT_PUBLIC_TURN_USERNAME, credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL }]; relay = true; }
  if (!relay && !process.env.NEXT_PUBLIC_NO_PUBLIC_TURN) list = [...list, PUBLIC_TURN];
  if (!relay && typeof console !== 'undefined') console.warn('[voice] No TURN relay configured: voice will not reach players on most phone networks. Open /api/turn while signed in to see why.');
  iceCache = { at: Date.now(), list, relay }; return iceCache;
}

export type Opts = { dist?: (n: string) => number; me: string; roster: string[]; signal: (to: string, t: string, d?: any) => void; subscribe: (f: (m: RtcMsg) => void) => () => void; isMuted: (n: string) => boolean; onSocial?: (a?: number) => void };
type Link = { pc: RTCPeerConnection; audio: HTMLAudioElement | null; ice: RTCIceCandidateInit[]; since: number; live: boolean; stopWatch: () => void };

export function useCityVoiceMesh(o: Opts) {
  const [micOn, setMicOnS] = useState(false), [msg, setMsg] = useState(''), [linked, setLinked] = useState(0);
  const op = useRef(o); op.current = o;
  const dist = (n: string) => (op.current.dist || cityDist)(n); // open city: world distance · inside a building: distance inside the room
  const [live, setLive] = useState(0), lastFail = useRef(0), [turn, setTurn] = useState<{ ok: boolean | null; provider: string; error: string }>({ ok: null, provider: '', error: '' }), [relayOn, setRelayOn] = useState(false), [mic, setMicState] = useState<{ perm: string; secure: boolean; inApp: boolean; err: string }>(() => ({ perm: lsGet(MIC_OK) === '1' ? 'granted' : 'unknown', secure: true, inApp: false, err: '' }));
  const readPerm = () => { try { const ua = navigator.userAgent || ''; const inApp = /FBAN|FBAV|Instagram|WhatsApp|Line\/|MicroMessenger|TikTok|Snapchat|; wv\)/i.test(ua); const secure = window.isSecureContext !== false && !!navigator.mediaDevices?.getUserMedia; (navigator as any).permissions?.query({ name: 'microphone' }).then((r: any) => { const sync = () => { lsSet(MIC_OK, r.state === 'granted' ? '1' : null); setMicState(m => ({ ...m, perm: r.state })); }; setMicState(m => ({ ...m, perm: r.state, secure, inApp })); lsSet(MIC_OK, r.state === 'granted' ? '1' : null); r.onchange = sync; }).catch(() => setMicState(m => ({ ...m, secure, inApp, perm: lsGet(MIC_OK) === '1' ? 'granted' : m.perm }))); /* no Permissions API for the mic (iPhone): use what we remembered */ setMicState(m => ({ ...m, secure, inApp })); } catch { /* ignore */ } };
  useEffect(readPerm, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { // what does the SERVER say about the TURN setup? (the same check as opening /api/turn)
    let dead = false;
    fetch('/api/turn', { cache: 'no-store' }).then(async r => { const d = await r.json().catch(() => ({})); if (dead) return; if (!r.ok) setTurn({ ok: false, provider: '', error: d.error || `HTTP ${r.status}` }); else setTurn({ ok: !!d.relay, provider: d.provider || '', error: d.error || '' }); }).catch(() => { if (!dead) setTurn({ ok: false, provider: '', error: 'could not reach /api/turn' }); });
    return () => { dead = true; };
  }, []);
  const links = useRef(new Map<string, Link>()), building = useRef(new Set<string>()), early = useRef<Record<string, RTCIceCandidateInit[]>>({}), retry = useRef<Record<string, number>>({}), asked = useRef<Record<string, number>>({}), relayNeed = useRef(false), proc = useRef<{ sp: ScriptProcessorNode; src: MediaStreamAudioSourceNode; z: GainNode } | null>(null), hang = useRef(0), relayPlay = useRef<Record<string, { next: number; g: GainNode }>>({});
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

  const startRelay = () => {
    if (proc.current || !stream.current) return;
    const c = audioCtx(); if (!c || !c.createScriptProcessor) return;
    try {
      const src = c.createMediaStreamSource(stream.current), sp = c.createScriptProcessor(2048, 1, 1), z = c.createGain(); z.gain.value = 0;
      let carry = 0; const out: number[] = [];
      sp.onaudioprocess = e => {
        if (!relayNeed.current || !(micRef.current || ptt.current)) { out.length = 0; return; }
        const inp = e.inputBuffer.getChannelData(0), ratio = c.sampleRate / 16000, now = Date.now();
        let peak = 0; for (let i = 0; i < inp.length; i++) peak = Math.max(peak, Math.abs(inp[i]));
        if (peak > .02) hang.current = now + 450;
        if (now > hang.current) { out.length = 0; carry = 0; return; } // silence: send nothing
        for (; carry < inp.length; carry += ratio) { const i = Math.floor(carry), f = carry - i, a = inp[i], b = inp[Math.min(i + 1, inp.length - 1)]; out.push(mu(a + (b - a) * f)); }
        carry -= inp.length;
        if (out.length >= 3200) { const bytes = new Uint8Array(out.splice(0, out.length)); let s = ''; for (let i = 0; i < bytes.length; i += 4096) s += String.fromCharCode(...bytes.subarray(i, i + 4096)); op.current.signal('*', 'aud', { b: btoa(s) }); }
      };
      src.connect(sp); sp.connect(z); z.connect(c.destination); proc.current = { sp, src, z };
    } catch { /* no relay on this browser: direct links still work */ }
  };
  const micError = (e: unknown) => { const n = (e as DOMException)?.name; if (n === 'NotAllowedError' || n === 'SecurityError') lsSet(MIC_OK, null); const m = n === 'NotFoundError' ? 'No microphone found on this device.' : n === 'NotReadableError' ? 'The microphone is being used by another app. Close it and try again.' : 'Microphone blocked. Tap the lock icon next to the address, set Microphone to Allow, then reload the page.'; note(m); setMicState(s => ({ ...s, err: m })); readPerm(); };
  // Ask the browser for the microphone RIGHT NOW (shows the permission prompt if it has not been answered). Used on the first tap and by the "Allow microphone" button.
  const requestMic = useCallback(async () => {
    try { audioCtx(); } catch { /* ignore */ }
    if (!navigator.mediaDevices?.getUserMedia) { setMicState(m => ({ ...m, err: 'This browser cannot use the microphone here. Open the game in Chrome or Safari (not inside WhatsApp / Instagram / Facebook).' })); return false; }
    try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach(t => t.stop()); lsSet(MIC_OK, '1'); lsSet('arl-mic-hide', null); setMicState(m => ({ ...m, perm: 'granted', err: '' })); return true; } catch (e) { micError(e); return false; }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const permRef = useRef('unknown'), primed = useRef(false); permRef.current = mic.perm;
  useEffect(() => { // first tap or key press anywhere in the game: if permission was never granted, ask for it
    const first = () => { if (primed.current) return; primed.current = true; window.removeEventListener('pointerdown', first); window.removeEventListener('keydown', first); if (permRef.current !== 'granted' && !lsGet(MIC_ASKED) && !(window.matchMedia?.('(pointer:coarse)').matches)) { lsSet(MIC_ASKED, '1'); requestMic(); } }; // asked once ever, and never from a random touch on a phone (the Allow card / 🎤 button ask there)
    window.addEventListener('pointerdown', first); window.addEventListener('keydown', first);
    return () => { window.removeEventListener('pointerdown', first); window.removeEventListener('keydown', first); };
  }, [requestMic]);
  async function getMic() {
    if (stream.current && stream.current.getAudioTracks()[0]?.readyState === 'live') return true;
    if (stream.current) { try { proc.current?.sp.disconnect(); proc.current?.src.disconnect(); proc.current?.z.disconnect(); } catch { /* gone */ } proc.current = null; stopLocal.current(); stream.current = null; } // the old mic stream died (permission revoked / device unplugged): ask again
    if (!navigator.mediaDevices?.getUserMedia) { note('Voice needs a secure (https) page and a browser with microphone support.'); setMicState(m => ({ ...m, err: 'This browser cannot use the microphone here. Open the game in Chrome or Safari (not inside WhatsApp / Instagram / Facebook).' })); return false; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      stream.current = s; lsSet(MIC_OK, '1'); lsSet('arl-mic-hide', null); setMicState(m => ({ ...m, perm: 'granted', err: '' })); syncTrack(); stopLocal.current = watch(s, op.current.me); startRelay();
      const t = s.getAudioTracks()[0]; links.current.forEach(L => L.pc.getSenders().forEach(x => { if (!x.track || x.track.kind === 'audio') x.replaceTrack(t).catch(() => {}); })); // start sending on links that already exist
      return true;
    } catch (e) { micError(e); return false; }
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

  async function build(who: string, offerer = true): Promise<Link> {
    const { list } = await iceServers();
    const pc = new RTCPeerConnection({ iceServers: list, iceCandidatePoolSize: 2 });
    if (offerer) { const tr = pc.addTransceiver('audio', { direction: 'sendrecv' }); const t0 = track(); if (t0) tr.sender.replaceTrack(t0).catch(() => {}); } // always two-way, so we can listen even while our own mic is off. The answering side attaches to the offer's own audio line instead (see attachAnswerer), which is what makes two-way audio reliable
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
  const attachAnswerer = (L: Link) => { // after setRemoteDescription(offer): make the offer's audio line two-way and give it our mic
    const tr = L.pc.getTransceivers().find(x => x.receiver.track?.kind === 'audio'); if (!tr) return;
    try { tr.direction = 'sendrecv'; } catch { /* old browser */ }
    const t = track(); if (t) tr.sender.replaceTrack(t).catch(() => {});
  };
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
        const L = await build(u, false); links.current.set(u, L);
        await L.pc.setRemoteDescription(d); attachAnswerer(L); await flush(L);
        const ans = await L.pc.createAnswer(); await L.pc.setLocalDescription(ans); p.signal(u, 'answer', { type: ans.type, sdp: ans.sdp });
      } catch { drop(u); retry.current[u] = Date.now() + 8000; }
    } else if (t === 'answer' && d) {
      const L = links.current.get(u); if (!L || L.pc.signalingState !== 'have-local-offer') return;
      await L.pc.setRemoteDescription(d).catch(() => {}); await flush(L);
    } else if (t === 'ice' && d) {
      const L = links.current.get(u);
      if (L) { if (L.pc.remoteDescription) await L.pc.addIceCandidate(d).catch(() => {}); else L.ice.push(d); }
      else if (early.current[u]) early.current[u].push(d);
    } else if (t === 'aud') {
      if (typeof d?.b !== 'string' || d.b.length > 20000) return;
      const L = links.current.get(u); if (L?.live) return; // a direct link already carries their voice
      const dd = dist(u); if (dd > VOICE_MAX) return;
      const c = audioCtx(); if (!c) return;
      try {
        const bin = atob(d.b), n = bin.length, f32 = new Float32Array(n); for (let i = 0; i < n; i++) f32[i] = unmu(bin.charCodeAt(i));
        const buf = c.createBuffer(1, n, 16000); buf.copyToChannel(f32, 0);
        let R = relayPlay.current[u]; if (!R) { R = { next: 0, g: c.createGain() }; R.g.connect(c.destination); relayPlay.current[u] = R; }
        const cfg = getSettings(), v = dd <= VOICE_FULL ? 1 : 1 - (dd - VOICE_FULL) / (VOICE_MAX - VOICE_FULL);
        R.g.gain.value = cfg.muteAll ? 0 : clamp(v * cfg.voice);
        const s = c.createBufferSource(); s.buffer = buf; s.connect(R.g);
        if (R.next < c.currentTime + .05 || R.next - c.currentTime > 1.2) R.next = c.currentTime + .18; // jitter buffer / catch up after a stall
        s.start(R.next); R.next += buf.duration; NET.talk[u] = Date.now() + 500;
      } catch { /* bad frame */ }
    } else if (t === 'want') { if (dist(u) <= VOICE_MAX && !links.current.has(u) && !building.current.has(u) && p.me.toLowerCase() < u.toLowerCase()) connect(u);
    } else if (t === 'bye') { drop(u); retry.current[u] = Date.now() + 2000; }
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  // once a second: link to the closest players in range, drop the ones who left, and set each voice's volume by distance
  useEffect(() => {
    const id = setInterval(() => {
      const p = op.current, now = Date.now(), cfg = getSettings();
      const near = p.roster.filter(n => !p.isMuted(n)).map(n => [n, dist(n)] as const).filter(([, d]) => d <= VOICE_MAX).sort((a, b) => a[1] - b[1]).slice(0, MAX_LINKS);
      relayNeed.current = near.some(([n]) => !links.current.get(n)?.live);
      for (const [n] of near) {
        if (links.current.has(n) || building.current.has(n) || now <= (retry.current[n] || 0)) continue;
        if (p.me.toLowerCase() < n.toLowerCase()) connect(n);
        else if (now - (asked.current[n] || 0) > 4000) { asked.current[n] = now; p.signal(n, 'want'); } // we are the answerer side: nudge them to call us
      }
      links.current.forEach((L, n) => {
        const d = dist(n);
        if (d > VOICE_DROP || !p.roster.includes(n) || p.isMuted(n) || (!L.live && now - L.since > 12_000)) { if (!L.live && d <= VOICE_DROP && now - lastFail.current > 60_000) { lastFail.current = now; note(`Couldn't connect voice with ${n}. Using relay voice instead (slightly lower quality).`); } drop(n, true); retry.current[n] = now + 8000; return; }
        if (L.audio) { const v = d <= VOICE_FULL ? 1 : 1 - (d - VOICE_FULL) / (VOICE_MAX - VOICE_FULL); L.audio.volume = clamp(v * cfg.voice); L.audio.muted = v < .02 || cfg.muteAll; } // iPhones ignore .volume, but obey .muted
      });
      setRelayOn(relayNeed.current && (micRef.current || ptt.current)); setLinked(links.current.size); setLive([...links.current.values()].filter(L => L.live).length);
    }, 1000);
    return () => clearInterval(id);
  }, [connect, drop]);

  const setMic = useCallback(async (on: boolean) => {
    if (on) audioCtx(); // phones only let audio start inside the tap itself, so do it BEFORE awaiting the permission prompt
    links.current.forEach(L => L.audio?.play().catch(() => {}));
    if (on && !(await getMic())) return;
    audioCtx(); micRef.current = on; setMicOnS(on); syncTrack(); if (on) setMicState(s => ({ ...s, err: '' }));
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
    ['pointerdown', 'touchend', 'click'].forEach(ev => window.addEventListener(ev, f)); return () => ['pointerdown', 'touchend', 'click'].forEach(ev => window.removeEventListener(ev, f));
  }, []);

  useEffect(() => () => {
    [...links.current.keys()].forEach(n => drop(n, true));
    try { proc.current?.sp.disconnect(); proc.current?.src.disconnect(); proc.current?.z.disconnect(); } catch { /* gone */ } proc.current = null;
    stopLocal.current(); stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; ctx.current?.close().catch(() => {}); ctx.current = null;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { micOn, toggleMic, setMic, msg, clearMsg: () => setMsg(''), linked, live, turn, relayOn, mic, requestMic };
}
