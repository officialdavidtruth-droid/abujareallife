'use client';
import { useSyncExternalStore } from 'react';

/* Player settings. One tiny store shared by the audio engine, the voice calls, the labels and the settings panel.
   Saved in the browser (localStorage), applied instantly, safe on the server (falls back to defaults). */
export type Settings = {
  master: number; music: number; sfx: number; voice: number;   // 0..1
  muteAll: boolean; musicOn: boolean; sfxOn: boolean; uiSounds: boolean;
  labelScale: number;      // 0.85 small, 1 normal, 1.2 large
  reduceMotion: boolean; showHints: boolean;
};
export const DEFAULTS: Settings = { master: 0.8, music: 0.55, sfx: 0.8, voice: 1, muteAll: false, musicOn: true, sfxOn: true, uiSounds: true, labelScale: 1, reduceMotion: false, showHints: true };
const KEY = 'arl.settings.v1';
const clamp01 = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(1, v)) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

function clean(x: Partial<Settings> | null | undefined): Settings {
  const s = x || {};
  return {
    master: clamp01(s.master, DEFAULTS.master), music: clamp01(s.music, DEFAULTS.music), sfx: clamp01(s.sfx, DEFAULTS.sfx), voice: clamp01(s.voice, DEFAULTS.voice),
    muteAll: bool(s.muteAll, DEFAULTS.muteAll), musicOn: bool(s.musicOn, DEFAULTS.musicOn), sfxOn: bool(s.sfxOn, DEFAULTS.sfxOn), uiSounds: bool(s.uiSounds, DEFAULTS.uiSounds),
    labelScale: s.labelScale === 0.85 || s.labelScale === 1.2 ? s.labelScale : 1,
    reduceMotion: bool(s.reduceMotion, DEFAULTS.reduceMotion), showHints: bool(s.showHints, DEFAULTS.showHints),
  };
}
let cur: Settings = DEFAULTS, loaded = false;
const subs = new Set<() => void>();
function load() {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  try { cur = clean(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch { cur = DEFAULTS; }
  applyDom();
}
function applyDom() {
  if (typeof document === 'undefined') return;
  const r = document.documentElement;
  r.style.setProperty('--gl-scale', String(cur.labelScale));
  r.dataset.reduceMotion = cur.reduceMotion ? '1' : '0';
  r.dataset.hints = cur.showHints ? '1' : '0';
}
export const getSettings = (): Settings => { load(); return cur; };
export function setSetting(p: Partial<Settings>) {
  load(); cur = clean({ ...cur, ...p });
  try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch { /* private mode: still works for this session */ }
  applyDom(); subs.forEach(f => f());
}
export const resetSettings = () => setSetting({ ...DEFAULTS });
export const subscribeSettings = (f: () => void) => { load(); subs.add(f); return () => { subs.delete(f); }; };
export const useSettings = (): Settings => useSyncExternalStore(subscribeSettings, getSettings, () => DEFAULTS);

/* Settings panel open/close (the panel itself lives once in <AudioRoot/>) */
let panel = false; const psubs = new Set<() => void>();
export const openSettings = () => { panel = true; psubs.forEach(f => f()); };
export const closeSettings = () => { panel = false; psubs.forEach(f => f()); };
export const usePanelOpen = () => useSyncExternalStore(f => { psubs.add(f); return () => { psubs.delete(f); }; }, () => panel, () => false);
