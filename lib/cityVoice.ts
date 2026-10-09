import { useCallback, useEffect, useRef, useState } from 'react';
import type { Room as LkRoom, RemoteAudioTrack } from 'livekit-client';
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

function useLiveKitVoice(o: Opts) {
  const [micOn, setMicOnS] = useState(false), [msg, setMsg] = useState(''), [linked, setLinked] = useState(0), [live, setLive] = useState(0);
  const [turn, setTurn] = useState<{ ok: boolean | null; provider: string; error: string }>({ ok: null, provider: 'livekit', error: '' });
  const [mic, setMicState] = useState<{ perm: string; secure: boolean; inApp: boolean; err: string }>(() => ({ perm: lsGet(MIC_OK) === '1' ? 'granted' : 'unknown', secure: true, inApp: false, err: '' }));
  const op = useRef(o); op.current = o;
  const dist = (n: string) => (op.current.dist || cityDist)(n); // open city: world distance · inside a building: distance inside the room
  const room = useRef<LkRoom | null>(null), micRef = useRef(false), ptt = useRef(false), ready = useRef(false);
  const note = (t: string) => { setMsg(t); setTimeout(() => setMsg(m => (m === t ? '' : m)), 6000); };
  const roomName = o.room || 'city';

  const readPerm = () => { try { const ua = navigator.userAgent || ''; const inApp = /FBAN|FBAV|Instagram|WhatsApp|Line\/|MicroMessenger|TikTok|Snapchat|; wv\)/i.test(ua); const secure = window.isSecureContext !== false && !!navigator.mediaDevices?.getUserMedia; (navigator as any).permissions?.query({ name: 'microphone' }).then((r: any) => { const sync = () => { lsSet(MIC_OK, r.state === 'granted' ? '1' : null); setMicState(m => ({ ...m, perm: r.state })); }; setMicState(m => ({ ...m, perm: r.state, secure, inApp })); lsSet(MIC_OK, r.state === 'granted' ? '1' : null); r.onchange = sync; }).catch(() => setMicState(m => ({ ...m, secure, inApp, perm: lsGet(MIC_OK) === '1' ? 'granted' : m.perm }))); setMicState(m => ({ ...m, secure, inApp })); } catch { /* ignore */ } };
  useEffect(readPerm, []); // eslint-disable-line react-hooks/exhaustive-deps

  const micError = (e: unknown) => { const n = (e as DOMException)?.name; if (n === 'NotAllowedError' || n === 'SecurityError') lsSet(MIC_OK, null); const m = n === 'NotFoundError' ? 'No microphone found on this device.' : n === 'NotReadableError' ? 'The microphone is being used by another app. Close it and try again.' : 'Microphone blocked. Tap the lock icon next to the address, set Microphone to Allow, then reload the page.'; note(m); setMicState(s => ({ ...s, err: m })); readPerm(); };
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

  const pub = useCallback(async () => { // publish / unpublish the mic to match "mic on or push-to-talk held"
    const r = room.current; if (!r || !ready.current) return;
    try { await r.localParticipant.setMicrophoneEnabled(micRef.current || ptt.current); } catch (e) { micError(e); }
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
        lk.on(RoomEvent.Disconnected, () => { ready.current = false; if (!dead) setTurn(t => ({ ...t, ok: false, error: 'Voice disconnected. Reconnecting…' })); });
        lk.on(RoomEvent.Reconnected, () => { ready.current = true; setTurn({ ok: true, provider: 'livekit', error: '' }); });
        lk.on(RoomEvent.AudioPlaybackStatusChanged, () => { if (!lk!.canPlaybackAudio) lk!.startAudio().catch(() => {}); });
        await lk.connect(d.url, d.token, { autoSubscribe: false }); // we pick who to hear ourselves (only nearby players)
        if (dead) { lk.disconnect(); return; }
        room.current = lk; ready.current = true; setTurn({ ok: true, provider: 'livekit', error: '' });
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
    return () => { dead = true; ready.current = false; if (iv) clearInterval(iv); ['pointerdown', 'touchend', 'click'].forEach(ev => window.removeEventListener(ev, unlock)); lk?.disconnect(); if (room.current === lk) room.current = null; setLinked(0); setLive(0); };
  }, [roomName]); // eslint-disable-line react-hooks/exhaustive-deps

  const setMic = useCallback(async (on: boolean) => {
    if (on && !(await requestMic())) return;
    micRef.current = on; setMicOnS(on); await pub();
    if (on) { setMicState(s => ({ ...s, err: '' })); note(ready.current ? '🎤 Mic on: nearby players can hear you.' : '🎤 Mic on. Connecting to voice…'); }
  }, [pub, requestMic]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleMic = useCallback(() => setMic(!micRef.current), [setMic]);

  // hold V = push-to-talk (works while the mic is off)
  useEffect(() => {
    const typing = (e: Event) => { const t = e.target as HTMLElement | null; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
    const dn = async (e: KeyboardEvent) => { if (e.key.toLowerCase() !== 'v' || e.repeat || typing(e)) return; if (await requestMic()) { ptt.current = true; pub(); } };
    const up = (e: KeyboardEvent) => { if (e.key.toLowerCase() !== 'v') return; ptt.current = false; pub(); };
    const blur = () => { if (ptt.current) { ptt.current = false; pub(); } };
    window.addEventListener('keydown', dn); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { micOn, toggleMic, setMic, msg, clearMsg: () => setMsg(''), linked, live, turn, relayOn: false, mic, requestMic };
}

// Chosen at build time, so the hook order never changes: LiveKit by default, NEXT_PUBLIC_VOICE=mesh keeps the old peer-to-peer voice.
export const useCityVoice: (o: Opts) => VoiceApi = process.env.NEXT_PUBLIC_VOICE === 'mesh' ? (useCityVoiceMesh as unknown as (o: Opts) => VoiceApi) : useLiveKitVoice;
