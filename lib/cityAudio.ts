// Tiny procedural audio for the city: engine, horn and crash thud. No audio files needed.
// Browsers only allow sound after a user gesture, so call unlockAudio() from a key press / tap.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
type Engine = { o1: OscillatorNode; o2: OscillatorNode; g: GainNode; f: BiquadFilterNode };
let eng: Engine | null = null;

export function unlockAudio() {
  if (typeof window === 'undefined') return;
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.6;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { /* audio is optional */ }
}
export function setMuted(m: boolean) {
  muted = m;
  if (ctx && master) master.gain.setTargetAtTime(m ? 0 : 0.6, ctx.currentTime, 0.05);
}
export const isMuted = () => muted;

export function engineStart() {
  unlockAudio();
  if (!ctx || !master || eng) return;
  const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  o1.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 500; g.gain.value = 0.0001;
  o1.frequency.value = 48; o2.frequency.value = 96;
  o1.connect(f); o2.connect(f); f.connect(g); g.connect(master);
  o1.start(); o2.start();
  eng = { o1, o2, g, f };
}
// speed: 0..1 of top speed, throttle: 0..1
export function engineSet(speed: number, throttle: number) {
  if (!eng || !ctx) return;
  const t = ctx.currentTime;
  eng.o1.frequency.setTargetAtTime(48 + speed * 150 + throttle * 14, t, 0.08);
  eng.o2.frequency.setTargetAtTime(96 + speed * 300, t, 0.08);
  eng.f.frequency.setTargetAtTime(380 + speed * 900 + throttle * 400, t, 0.1);
  eng.g.gain.setTargetAtTime(0.05 + throttle * 0.05 + speed * 0.05, t, 0.1);
}
export function engineStop() {
  if (!eng || !ctx) { eng = null; return; }
  const e = eng; eng = null;
  try { e.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05); e.o1.stop(ctx.currentTime + 0.3); e.o2.stop(ctx.currentTime + 0.3); } catch { /* already stopped */ }
}
export function honk() {
  if (!ctx || !master) return;
  const t = ctx.currentTime, g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.02); g.gain.setValueAtTime(0.18, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
  g.connect(master);
  for (const f of [392, 494]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + 0.4); }
}
export function thud(strength = 1) {
  if (!ctx || !master) return;
  const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
  g.gain.setValueAtTime(0.35 * Math.min(1, strength), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.25);
}
