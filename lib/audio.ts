'use client';
import { getSettings, subscribeSettings } from './settings';

/* Everything you hear in Abuja Real Life is generated here with the Web Audio API: no audio files to download.
   Buses:  music ─┐
           sfx  ──┼─> master ─> speakers          (volumes + mutes come from lib/settings.ts)
   Browsers only start audio after a tap/keypress, so <AudioRoot/> calls unlockAudio() on the first gesture. */
type Parts = { ctx: AudioContext; master: GainNode; music: GainNode; sfx: GainNode; trackGain: GainNode; wet: GainNode };
let P: Parts | null = null;
export type Mood = 'city' | 'chill';
let mood: Mood = 'chill';

export function ensureAudio(): Parts | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!P) {
      const AC = window.AudioContext || (window as any).webkitAudioContext; if (!AC) return null;
      const ctx: AudioContext = new AC(), master = ctx.createGain(), music = ctx.createGain(), sfx = ctx.createGain(), trackGain = ctx.createGain(), wet = ctx.createGain();
      // a soft echo on the music only (gives the pluck notes some space)
      const dl = ctx.createDelay(1), fb = ctx.createGain(), lp = ctx.createBiquadFilter();
      dl.delayTime.value = 0.3; fb.gain.value = 0.32; lp.type = 'lowpass'; lp.frequency.value = 2400; wet.gain.value = 0.35;
      wet.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(trackGain);
      trackGain.connect(music); music.connect(master); sfx.connect(master); master.connect(ctx.destination);
      P = { ctx, master, music, sfx, trackGain, wet };
      applyVolumes(); subscribeSettings(() => { applyVolumes(); syncMusic(); });
      document.addEventListener('visibilitychange', syncMusic);
    }
    if (P.ctx.state === 'suspended') void P.ctx.resume();
    return P;
  } catch { return null; }
}
export const audioParts = () => P;
function applyVolumes() {
  if (!P) return; const s = getSettings(), t = P.ctx.currentTime;
  P.master.gain.setTargetAtTime(s.muteAll ? 0 : s.master, t, 0.04);
  P.music.gain.setTargetAtTime(s.musicOn ? s.music * 0.55 : 0, t, 0.08);
  P.sfx.gain.setTargetAtTime(s.sfxOn ? s.sfx : 0, t, 0.04);
}
export function unlockAudio() { if (!ensureAudio()) return; syncMusic(); }

/* ───────── tiny synth helpers ───────── */
const hz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
function tone(out: AudioNode, c: AudioContext, f: number, t: number, dur: number, type: OscillatorType, vol: number, glideTo?: number, attack = 0.005) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.03);
}
let nbuf: AudioBuffer | null = null;
function noise(out: AudioNode, c: AudioContext, t: number, dur: number, vol: number, ft: BiquadFilterType, ff: number, q = 1, sweepTo?: number) {
  if (!nbuf) { nbuf = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = nbuf; s.loop = true; f.type = ft; f.frequency.setValueAtTime(ff, t); f.Q.value = q; if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
}

/* ───────── sound effects ───────── */
export type Sfx = 'click' | 'hover' | 'open' | 'close' | 'coin' | 'buy' | 'error' | 'success' | 'levelup' | 'notify' | 'door' | 'toggle' | 'pop' | 'whoosh' | 'sell';
const lastPlayed: Record<string, number> = {};
export function sfx(name: Sfx, opts: { ui?: boolean } = {}) {
  const s = getSettings(); if (s.muteAll || !s.sfxOn || (opts.ui && !s.uiSounds)) return;
  const A = ensureAudio(); if (!A || A.ctx.state !== 'running') return;
  const now = performance.now(); if (now - (lastPlayed[name] || 0) < (name === 'hover' ? 45 : 25)) return; lastPlayed[name] = now;
  const { ctx: c, sfx: o } = A, t = c.currentTime + 0.005;
  switch (name) {
    case 'click': tone(o, c, 720, t, 0.07, 'square', 0.1, 480); tone(o, c, 1440, t, 0.04, 'triangle', 0.05); break;
    case 'hover': tone(o, c, 1000, t, 0.03, 'triangle', 0.035); break;
    case 'toggle': tone(o, c, 600, t, 0.05, 'square', 0.08); tone(o, c, 900, t + 0.05, 0.07, 'square', 0.08); break;
    case 'open': tone(o, c, 392, t, 0.09, 'triangle', 0.14); tone(o, c, 587, t + 0.07, 0.14, 'triangle', 0.14); break;
    case 'close': tone(o, c, 587, t, 0.08, 'triangle', 0.12); tone(o, c, 392, t + 0.06, 0.13, 'triangle', 0.12); break;
    case 'coin': tone(o, c, 1319, t, 0.08, 'square', 0.11); tone(o, c, 1976, t + 0.07, 0.3, 'square', 0.11); break;
    case 'buy': tone(o, c, 1175, t, 0.07, 'square', 0.1); tone(o, c, 1568, t + 0.07, 0.07, 'square', 0.1); tone(o, c, 2349, t + 0.14, 0.34, 'square', 0.1); noise(o, c, t + 0.14, 0.25, 0.05, 'highpass', 6000); break;
    case 'sell': tone(o, c, 988, t, 0.08, 'square', 0.1); tone(o, c, 740, t + 0.08, 0.2, 'square', 0.1); break;
    case 'error': tone(o, c, 190, t, 0.16, 'sawtooth', 0.12, 120); tone(o, c, 150, t + 0.14, 0.22, 'sawtooth', 0.12, 90); break;
    case 'success': [523, 659, 784, 1047].forEach((f, i) => tone(o, c, f, t + i * 0.085, i === 3 ? 0.4 : 0.14, 'square', 0.09)); break;
    case 'levelup': [392, 494, 587, 784, 988, 1175, 1568].forEach((f, i) => tone(o, c, f, t + i * 0.08, i === 6 ? 0.6 : 0.16, 'square', 0.085)); noise(o, c, t + 0.5, 0.5, 0.04, 'highpass', 5000); break;
    case 'notify': tone(o, c, 880, t, 0.12, 'sine', 0.16); tone(o, c, 1175, t + 0.11, 0.25, 'sine', 0.16); break;
    case 'pop': tone(o, c, 480, t, 0.1, 'sine', 0.14, 900); break;
    case 'whoosh': noise(o, c, t, 0.25, 0.1, 'bandpass', 400, 0.8, 2600); break;
    case 'door': noise(o, c, t, 0.12, 0.2, 'lowpass', 500); tone(o, c, 110, t, 0.16, 'sine', 0.25, 50); noise(o, c, t + 0.1, 0.35, 0.04, 'bandpass', 900, 3, 300); break;
  }
}

/* phone ring while a voice call is ringing (looped until stopRing) */
let ringTimer: ReturnType<typeof setInterval> | null = null;
export function startRing(kind: 'incoming' | 'outgoing' = 'incoming') {
  stopRing();
  const beep = () => { const s = getSettings(); if (s.muteAll || !s.sfxOn) return; const A = ensureAudio(); if (!A || A.ctx.state !== 'running') return; const { ctx: c, sfx: o } = A, t = c.currentTime + 0.01;
    if (kind === 'incoming') [0, 0.22, 0.6, 0.82].forEach(d => { tone(o, c, 880, t + d, 0.16, 'sine', 0.13); tone(o, c, 1100, t + d, 0.16, 'sine', 0.09); });
    else { tone(o, c, 440, t, 0.9, 'sine', 0.07); tone(o, c, 480, t, 0.9, 'sine', 0.07); } };
  beep(); ringTimer = setInterval(beep, kind === 'incoming' ? 2200 : 3000);
}
export function stopRing() { if (ringTimer) { clearInterval(ringTimer); ringTimer = null; } }

/* ───────── background music: generated Afro-house / amapiano-style loop (city) and a calm lo-fi loop (indoors) ───────── */
type Track = { bpm: number; swing: number; roots: number[]; chords: number[][]; scale: number[]; kick: number[]; clap: number[]; hat: number[]; log: number[]; stab: number[]; pad: boolean; vol: number };
const TRACKS: Record<Mood, Track> = {
  city: { bpm: 108, swing: 0.1, roots: [45, 41, 36, 43], chords: [[57, 60, 64, 67], [53, 57, 60, 64], [52, 55, 59, 64], [50, 55, 59, 62]], scale: [69, 72, 74, 76, 79, 81, 84],
    kick: [0, 6, 10], clap: [4, 12], hat: [2, 6, 10, 14], log: [0, 3, 7, 10, 14], stab: [0, 3, 8, 11], pad: false, vol: 1 },
  chill: { bpm: 80, swing: 0.16, roots: [38, 34, 41, 36], chords: [[53, 57, 60, 64], [50, 53, 57, 62], [48, 53, 57, 60], [48, 52, 55, 62]], scale: [62, 65, 67, 69, 72, 74, 77],
    kick: [0, 10], clap: [8], hat: [4, 12], log: [0, 10], stab: [0, 6], pad: true, vol: 0.9 },
};
let timer: ReturnType<typeof setInterval> | null = null, step = 0, nextT = 0, seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let bar: number[] = [];  // melody notes for the current bar (index = step, 0 = rest)

function playStep(T: Track, st: number, t: number) {
  const A = P!, c = A.ctx, out = A.trackGain, wet = A.wet, b = Math.floor(st / 16) % 4, s = st % 16, root = T.roots[b], ch = T.chords[b];
  if (s === 0) { // compose this bar's melody: a short random walk on the scale, mostly on off-beats
    bar = new Array(16).fill(0); let k = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < 16; i++) if ((i % 2 === 0 ? 0.3 : 0.14) > rnd() && !(i === 0 && rnd() < 0.5)) { k = Math.max(0, Math.min(T.scale.length - 1, k + Math.floor(rnd() * 3) - 1)); bar[i] = T.scale[k]; }
  }
  const v = T.vol;
  if (T.kick.includes(s)) { tone(out, c, 150, t, 0.2, 'sine', 0.55 * v, 42); noise(out, c, t, 0.02, 0.1 * v, 'lowpass', 900); }
  if (T.clap.includes(s)) { noise(out, c, t, 0.12, 0.2 * v, 'bandpass', 1700, 0.9); noise(out, c, t + 0.012, 0.1, 0.12 * v, 'bandpass', 2400, 0.9); }
  if (T.hat.includes(s)) noise(out, c, t, 0.05, 0.09 * v, 'highpass', 7500);
  else if (T === TRACKS.city && s % 2 === 1) noise(out, c, t, 0.035, 0.04 + (s === 15 ? 0.03 : 0), 'highpass', 9000); // shaker
  if (T.log.includes(s)) { // amapiano "log drum" bass: a fast pitch-dropping sine with a body
    const n = hz(root + (s === 7 || s === 14 ? (T === TRACKS.city ? 7 : 12) : 0));
    tone(out, c, n * 1.8, t, 0.3, 'sine', 0.5 * v, n); tone(out, c, n * 2, t, 0.09, 'triangle', 0.12 * v, n * 1.4);
  }
  if (T.stab.includes(s)) ch.forEach((n, i) => tone(out, c, hz(n + 12), t + i * 0.012, T.pad ? 0.9 : 0.34, 'triangle', (T.pad ? 0.05 : 0.065) * v, undefined, T.pad ? 0.03 : 0.006));
  if (T.pad && s === 0) ch.forEach(n => tone(out, c, hz(n), t, 60 / T.bpm * 4, 'sine', 0.05 * v, undefined, 0.5));
  if (bar[s]) { const n = hz(bar[s]); tone(out, c, n, t, T.pad ? 0.5 : 0.22, T.pad ? 'sine' : 'square', (T.pad ? 0.1 : 0.05) * v); }
  if (bar[s] && wet) tone(wet, c, hz(bar[s]), t, 0.15, 'sine', 0.03 * v);
}
function loop() {
  if (!P) return; const T = TRACKS[mood], c = P.ctx, sd = 60 / T.bpm / 4;
  if (nextT < c.currentTime - 0.3) nextT = c.currentTime + 0.05; // tab was asleep: don't replay a burst of notes
  while (nextT < c.currentTime + 0.16) { playStep(T, step, nextT + (step % 2 ? T.swing * sd : 0)); nextT += sd; step++; }
}
function syncMusic() {
  if (!P) return; const s = getSettings(), on = s.musicOn && !s.muteAll && s.music > 0 && !document.hidden;
  if (on && !timer) { nextT = P.ctx.currentTime + 0.08; timer = setInterval(loop, 30); fadeIn(); }
  else if (!on && timer) { clearInterval(timer); timer = null; }
}
function fadeIn() { if (!P) return; const g = P.trackGain.gain, t = P.ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(0.0001, t); g.linearRampToValueAtTime(1, t + 1.6); }
export function setMusicMood(m: Mood) {
  if (m === mood) return; mood = m; step = 0; seed = 7 + (m === 'city' ? 1 : 2); bar = [];
  if (P && timer) fadeIn();
}
export const getMusicMood = () => mood;
