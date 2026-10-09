import { useCallback, useEffect, useRef, useState } from 'react';
import type { Room as LkRoom, RemoteAudioTrack, LocalAudioTrack } from 'livekit-client';
import { NET } from './cityNet';
import { getSettings } from './settings';
import { useCityVoiceMesh, type Opts as MeshOpts } from './cityVoiceMesh';

/* Proximity voice chat on LiveKit (https://livekit.io).
   Everyone in the open city joins one LiveKit room; each building has its own room. Nothing to accept: turn your mic on (🎤, or hold V) and players
   within range hear you, getting quieter with distance. We subscribe ONLY to players inside VOICE_MAX, so a busy city costs almost no bandwidth.
   The server (/api/livekit) signs a short-lived token for the signed-in player, so nobody can join as someone else.
   Set NEXT_PUBLIC_VOICE=mesh to go back to the old peer-to-peer voice (lib/cityVoiceMesh.ts). */
export const VOICE_FULL = 7;       // metres: full volume inside this
export const VOICE_MAX = 30;       // metres: silent / not subscribed beyond this
export const VOICE_DROP = 40;      // unsubscribe only past this (hysteresis, so walking at the edge does not flap)
export const VOICE_REQ_RANGE = VOICE_MAX; // kept for older imports
export type VoiceApi = ReturnType<typeof useLiveKitVoice>;
type Opts = MeshOpts & { room?: string }; // room: 'city' (default) or 'bld:<businessId>'

const MIC_OK = 'arl-mic-granted', MIC_ASKED = 'arl-mic-asked';
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } };
const cityDist = (n: string) => { const p = NET.peers[n]; return p ? Math.hypot(p.x - NET.me.x, p.z - NET.me.z) : Infinity; };
const clamp = (v: number) => Math.max(0, Math.min(1, v));
/* Live microphone level (0..1), measured on this device from the real mic signal. The mic button and the voice status card read it to glow while you speak. */
export const MIC = { level: 0, active: false };
let meterStop: (() => void) | null = null;
function stopMeter() { try { meterStop?.(); } catch { /* ignore */ } meterStop = null; MIC.level = 0; MIC.active = false; }
function startMeter(t: MediaStreamTrack) {
  stopMeter();
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext; if (!AC) return;
    const ctx = new AC(); ctx.resume?.().catch(() => {});
    const src = ctx.createMediaStreamSource(new MediaStream([t])), an = ctx.createAnalyser(); an.fftSize = 512; src.connect(an); // not connected to the speakers, so no echo
    const buf = new Uint8Array(an.fftSize);
    const id = setInterval(() => { an.getByteTimeDomainData(buf); let sum = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; } MIC.level = Math.min(1, Math.sqrt(sum / buf.length) * 5); MIC.active = true; }, 80);
    meterStop = () => { clearInterval(id); try { src.disconnect(); } catch { /* ignore */ } ctx.close().catch(() => {}); };
  } catch { MIC.active = false; }
}

function useLiveKitVoice(o: Opts) {
  const [micOn, setMicOnS] = useState(false), [msg, setMsg] = useState(''), [linked, setLinked] = useState(0), [live, setLive] = useState(0), [publishing, setPublishing] = useState(false);
  const [turn, setTurn] = useState<{ ok: boolean | null; provider: string; error: string }>({ ok: null, provider: 'livekit', error: '' });
  const [mic, setMicState] = useState<{ perm: string; secure: boolean; inApp: boolean; err: string }>(() => ({ perm: lsGet(MIC_OK) === '1' ? 'granted' : 'unknown', secure: true, inApp: false, err: '' }));
  const op = useRef(o); op.current = o;
  const dist = (n: string) => (op.current.dist || cityDist)(n); // open city: world distance · inside a building: distance inside the room
  const room = useRef<LkRoom | null>(null), micRef = useRef(false), ptt = useRef(false), ready = useRef(false);
  const trk = useRef<LocalAudioTrack | null>(null), pubbed = useRef(false), busy = useRef(false), again = useRef(false); // our own microphone track and whether it is in the room
  const note = (t: string) => { setMsg(t); setTimeout(() => setMsg(m => (m === t ? '' : m)), 6000); };
  const roomName = o.room || 'city';

  const readPerm = () => { try { const ua = navigator.userAgent || ''; const inApp = /FBAN|FBAV|Instagram|WhatsApp|Line\/|MicroMessenger|TikTok|Snapchat|; wv\)/i.test(ua); const secure = window.isSecureContext !== false && !!navigator.mediaDevices?.getUserMedia; (navigator as any).permissions?.query({ name: 'microphone' }).then((r: any) => { const sync = () => { lsSet(MIC_OK, r.state === 'granted' ? '1' : null); setMicState(m => ({ ...m, perm: r.state })); }; setMicState(m => ({ ...m, perm: r.state, secure, inApp })); lsSet(MIC_OK, r.state === 'granted' ? '1' : null); r.onchange = sync; }).catch(() => setMicState(m => ({ ...m, secure, inApp, perm: lsGet(MIC_OK) === '1' ? 'granted' : m.perm }))); setMicState(m => ({ ...m, secure, inApp })); } catch { /* ignore */ } };
  useEffect(readPerm, []); // eslint-disable-line react-hooks/exhaustive-deps

  const micError = (e: unknown) => { const n = (e as DOMException)?.name; if (n === 'NotAllowedError' || n === 'SecurityError') lsSet(MIC_OK, null); const m = n === 'NotFoundError' ? 'No microphone found on this device.' : n === 'NotReadableError' ? 'The microphone is being used by another app. Close it and try again.' : 'Microphone blocked. Tap the 🔒 by the address bar → Permissions → Microphone → Allow, then reload. On Android also check Settings → Apps → Chrome → Permissions → Microphone.'; note(m); setMicState(s => ({ ...s, err: m })); readPerm(); };
  // Ask the browser for the microphone now (shows the permission prompt if it has not been answered yet).
  const requestMic = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) { setMicState(m => ({ ...m, err: 'This browser cannot use the microphone here. Open the game in Chrome or Safari (not inside WhatsApp / Instagram / Facebook).' })); return false; }
    try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach(t => t.stop()); lsSet(MIC_OK, '1'); lsSet('arl-mic-hide', null); setMicState(m => ({ ...m, perm: 'granted', err: '' })); return true; } catch (e) { micError(e); return false; }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const permRef = useRef('unknown'), primed = useRef(false); permRef.current = mic.perm;
  useEffect(() => { // first key press (desktop only) asks once for the mic; phones ask from the 🎤 button / Allow card
    const first = () => { if (primed.current) return; primed.current = true; window.removeEventListener('pointerdown', first); window.removeEventListener('keydown', first); if (permRef.current !== 'granted' && !lsGet(MIC_ASKED) && !(window.matchMedia?.('(pointer:coarse)').matches)) { lsSet(MIC_ASKED, '1'); requestMic(); } };
    window.addEventListener('pointerdown', first); window.addEventListener('keydown', first);
    return () => { window.removeEventListener('pointerdown', first); window.removeEventListener('keydown', first); };
  }, [requestMic]);

  /* Turns the real microphone on or off to match "mic on or push-to-talk held". One getUserMedia call (inside the tap), then the track is published to the room.
     Turning the mic off stops the track, so the browser's recording indicator goes away. */
  const pub = useCallback(async () => {
    if (busy.current) { again.current = true; return; }
    busy.current = true;
    try {
      do {
        again.current = false;
        const want = micRef.current || ptt.current, r = room.current;
        if (want) {
          if (!trk.current) {
            const { createLocalAudioTrack } = await import('livekit-client');
            const t = await createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
            trk.current = t; lsSet(MIC_OK, '1'); setMicState(m => ({ ...m, perm: 'granted', err: '' }));
            t.mediaStreamTrack.addEventListener('ended', () => { if (trk.current !== t) return; micRef.current = false; setMicOnS(false); pub(); note('🎤 Microphone disconnected.'); }); // unplugged, or revoked by the system
            startMeter(t.mediaStreamTrack);
          }
          if (r && ready.current && !pubbed.current && trk.current) {
            const { Track } = await import('livekit-client');
            await r.localParticipant.publishTrack(trk.current, { source: Track.Source.Microphone, name: 'microphone' });
            pubbed.current = true;
          }
          setPublishing(pubbed.current);
        } else if (trk.current) {
          const t = trk.current; trk.current = null; stopMeter(); setPublishing(false);
          if (pubbed.current && room.current) { try { await room.current.localParticipant.unpublishTrack(t, true); } catch { /* already gone */ } }
          try { t.stop(); } catch { /* already stopped */ } pubbed.current = false;
        } else setPublishing(false);
      } while (again.current);
    } catch (e) {
      micRef.current = false; ptt.current = false; setMicOnS(false); setPublishing(false); stopMeter();
      const t = trk.current; trk.current = null; pubbed.current = false; try { t?.stop(); } catch { /* ignore */ }
      micError(e);
    } finally { busy.current = false; }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── connect to the LiveKit room for where we are (city or a building) ──
  useEffect(() => {
    let dead = false, lk: LkRoom | null = null, iv: ReturnType<typeof setInterval> | undefined;
    ready.current = false; setTurn({ ok: null, provider: 'livekit', error: '' });
    (async () => {
      try {
        const res = await fetch('/api/livekit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ room: roomName }) });
        const d = await res.json().catch(() => ({}));
        if (dead) return;
        if (!res.ok || !d.token) { const e = d.error || `HTTP ${res.status}`; setTurn({ ok: false, provider: 'livekit', error: e }); if (res.status !== 401) note('Voice is unavailable: ' + e); return; }
        const { Room, RoomEvent, Track } = await import('livekit-client');
        if (dead) return;
        lk = new Room({ dynacast: true, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        const audioEls = new Map<string, HTMLMediaElement[]>();
        lk.on(RoomEvent.TrackSubscribed, (track, _p, part) => { if (track.kind !== Track.Kind.Audio) return; const el = track.attach(); el.style.display = 'none'; document.body.appendChild(el); audioEls.set(part.identity, [...(audioEls.get(part.identity) || []), el]); });
        lk.on(RoomEvent.TrackUnsubscribed, (track, _p, part) => { track.detach().forEach(el => el.remove()); audioEls.delete(part.identity); });
        lk.on(RoomEvent.ActiveSpeakersChanged, sp => { const until = Date.now() + 350; sp.forEach(s => { NET.talk[s.identity] = until; }); }); // the green "speaking" indicator
        lk.on(RoomEvent.Disconnected, () => { ready.current = false; pubbed.current = false; setPublishing(false); if (!dead) setTurn(t => ({ ...t, ok: false, error: 'Voice disconnected. Reconnecting…' })); });
        lk.on(RoomEvent.Reconnected, () => { ready.current = true; setTurn({ ok: true, provider: 'livekit', error: '' }); });
        lk.on(RoomEvent.AudioPlaybackStatusChanged, () => { if (!lk!.canPlaybackAudio) lk!.startAudio().catch(() => {}); });
        await lk.connect(d.url, d.token, { autoSubscribe: false }); // we pick who to hear ourselves (only nearby players)
        if (dead) { lk.disconnect(); return; }
        room.current = lk; ready.current = true; pubbed.current = false; setTurn({ ok: true, provider: 'livekit', error: '' });
        lk.startAudio().catch(() => {});
        if (micRef.current || ptt.current) pub();
        // proximity: subscribe to players in range, silence by distance, drop the ones that walked away
        iv = setInterval(() => {
          const p = op.current, cfg = getSettings(); let near = 0, flowing = 0;
          lk!.remoteParticipants.forEach(part => {
            const n = part.identity, d = dist(n), muted = p.isMuted(n) || cfg.muteAll;
            part.audioTrackPublications.forEach(tp => {
              const want = !muted && d <= (tp.isSubscribed ? VOICE_DROP : VOICE_MAX);
              if (tp.isSubscribed !== want && !(want && tp.isMuted)) tp.setSubscribed(want);
              if (tp.isSubscribed && tp.audioTrack) { const v = d <= VOICE_FULL ? 1 : 1 - (d - VOICE_FULL) / (VOICE_MAX - VOICE_FULL); (tp.audioTrack as RemoteAudioTrack).setVolume(clamp(v * cfg.voice)); flowing++; }
              if (want) near++;
            });
          });
          setLinked(near); setLive(flowing);
        }, 500);
      } catch (e) { if (!dead) { const m = (e as Error)?.message || 'could not connect'; setTurn({ ok: false, provider: 'livekit', error: m }); note('Voice is unavailable: ' + m); } }
    })();
    const unlock = () => { room.current?.startAudio().catch(() => {}); };
    ['pointerdown', 'touchend', 'click'].forEach(ev => window.addEventListener(ev, unlock));
    return () => { dead = true; ready.current = false; if (iv) clearInterval(iv); ['pointerdown', 'touchend', 'click'].forEach(ev => window.removeEventListener(ev, unlock)); { const t = trk.current; trk.current = null; pubbed.current = false; stopMeter(); setPublishing(false); try { t?.stop(); } catch { /* ignore */ } } lk?.disconnect(); if (room.current === lk) room.current = null; setLinked(0); setLive(0); };
  }, [roomName]); // eslint-disable-line react-hooks/exhaustive-deps

  const setMic = useCallback(async (on: boolean) => {
    if (on && !navigator.mediaDevices?.getUserMedia) { await requestMic(); return; } // shows "this browser cannot use the microphone"
    micRef.current = on; setMicOnS(on);
    if (on) note('🎤 Starting microphone…');
    await pub(); // asks for the mic here, inside the tap
    if (on && micRef.current) { setMicState(s => ({ ...s, err: '' })); note(ready.current ? '🎤 Mic on: nearby players can hear you.' : '🎤 Mic on. Connecting to voice…'); }
  }, [pub, requestMic]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleMic = useCallback(() => setMic(!micRef.current), [setMic]);

  // hold V = push-to-talk (works while the mic is off)
  useEffect(() => {
    const typing = (e: Event) => { const t = e.target as HTMLElement | null; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
    const dn = (e: KeyboardEvent) => { if (e.key.toLowerCase() !== 'v' || e.repeat || typing(e)) return; ptt.current = true; pub(); };
    const up = (e: KeyboardEvent) => { if (e.key.toLowerCase() !== 'v') return; ptt.current = false; pub(); };
    const blur = () => { if (ptt.current) { ptt.current = false; pub(); } };
    window.addEventListener('keydown', dn); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { micOn, micLive: publishing, toggleMic, setMic, msg, clearMsg: () => setMsg(''), linked, live, turn, relayOn: false, mic, requestMic };
}

// Chosen at build time, so the hook order never changes: LiveKit by default, NEXT_PUBLIC_VOICE=mesh keeps the old peer-to-peer voice.
export const useCityVoice: (o: Opts) => VoiceApi = process.env.NEXT_PUBLIC_VOICE === 'mesh' ? (useCityVoiceMesh as unknown as (o: Opts) => VoiceApi) : useLiveKitVoice;