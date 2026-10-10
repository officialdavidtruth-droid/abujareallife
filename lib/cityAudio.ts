// Car sounds for the city (engine, horn, crash thud). They play through the shared audio engine, so the
// Settings panel (effects volume, mute) controls them too. Browsers only allow sound after a user gesture.
import { audioParts, ensureAudio, unlockAudio as unlock } from './audio';
import { getSettings, setSetting } from './settings';

type Engine = { o1: OscillatorNode; o2: OscillatorNode; g: GainNode; f: BiquadFilterNode };
let eng: Engine | null = null;

export const unlockAudio = unlock;
export function setMuted(m: boolean) { setSetting({ muteAll: m }); }
export const isMuted = () => getSettings().muteAll;

export function engineStart() {
  unlock();
  const A = ensureAudio(); if (!A || eng) return;
  const { ctx, sfx } = A, o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  o1.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 500; g.gain.value = 0.0001;
  o1.frequency.value = 48; o2.frequency.value = 96;
  o1.connect(f); o2.connect(f); f.connect(g); g.connect(sfx);
  o1.start(); o2.start();
  eng = { o1, o2, g, f };
}
// speed: 0..1 of top speed, throttle: 0..1
export function engineSet(speed: number, throttle: number) {
  const A = audioParts(); if (!eng || !A) return;
  const t = A.ctx.currentTime;
  eng.o1.frequency.setTargetAtTime(48 + speed * 150 + throttle * 14, t, 0.08);
  eng.o2.frequency.setTargetAtTime(96 + speed * 300, t, 0.08);
  eng.f.frequency.setTargetAtTime(380 + speed * 900 + throttle * 400, t, 0.1);
  eng.g.gain.setTargetAtTime(0.05 + throttle * 0.05 + speed * 0.05, t, 0.1);
}
export function engineStop() {
  const A = audioParts(); if (!eng || !A) { eng = null; return; }
  const e = eng; eng = null;
  try { e.g.gain.setTargetAtTime(0.0001, A.ctx.currentTime, 0.05); e.o1.stop(A.ctx.currentTime + 0.3); e.o2.stop(A.ctx.currentTime + 0.3); } catch { /* already stopped */ }
}
export function honk() {
  const A = audioParts(); if (!A) return;
  const { ctx, sfx } = A, t = ctx.currentTime, g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.02); g.gain.setValueAtTime(0.18, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
  g.connect(sfx);
  for (const f of [392, 494]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + 0.4); }
}
export function thud(strength = 1) {
  const A = audioParts(); if (!A) return;
  const { ctx, sfx } = A, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
  g.gain.setValueAtTime(0.35 * Math.min(1, strength), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  o.connect(g); g.connect(sfx); o.start(t); o.stop(t + 0.25);
}

/* Step 6: police siren. One looping wail whose volume follows how close the nearest siren is (0 = silent). */
let sir: { o: OscillatorNode; lfo: OscillatorNode; g: GainNode } | null = null;
export function sirenSet(vol: number) {
  const A = audioParts();
  if (vol <= 0.01) { if (sir && A) sir.g.gain.setTargetAtTime(0.0001, A.ctx.currentTime, 0.15); return; }
  if (!A) return;
  if (!sir) {
    const { ctx, sfx } = A, o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = 880; lfo.type = 'sine'; lfo.frequency.value = 0.55; lg.gain.value = 260; g.gain.value = 0.0001;
    lfo.connect(lg); lg.connect(o.frequency); o.connect(g); g.connect(sfx); o.start(); lfo.start();
    sir = { o, lfo, g };
  }
  sir.g.gain.setTargetAtTime(Math.min(1, vol) * 0.07, A.ctx.currentTime, 0.2);
}
export function sirenStop() {
  const A = audioParts(); if (!sir) return; const s = sir; sir = null;
  try { if (A) s.g.gain.setTargetAtTime(0.0001, A.ctx.currentTime, 0.05); s.o.stop((A?.ctx.currentTime ?? 0) + 0.3); s.lfo.stop((A?.ctx.currentTime ?? 0) + 0.3); } catch { /* already stopped */ }
}
