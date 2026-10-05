// Add a real human model: drop the .glb in /public/models and add one entry here.
// `clips` maps game states -> animation clip names inside the file (Mixamo exports work).
// Missing sit/sleep clips fall back to idle. `skin`/`outfit` list material names to tint.
export type ModelDef = { id: string; label: string; url: string; clips: { idle: string; walk: string; sit?: string; sleep?: string }; skin: string[]; outfit: string[] };
export const MODELS: ModelDef[] = [
  { id: 'xbot', label: 'Mannequin (placeholder)', url: '/models/Xbot.glb', clips: { idle: 'idle', walk: 'walk' }, skin: ['asdf1:Beta_HighLimbsGeoSG2'], outfit: ['Beta_Joints_MAT'] },
];
export type Look = { name: string; model: string; skin: string; outfit: string; height: number };
export const DEFAULT_LOOK: Look = { name: 'David', model: 'xbot', skin: '#8b552f', outfit: '#126c4b', height: 1 };
export const SKIN_TONES = ['#f1c9a5', '#d9a577', '#b87a4b', '#8b552f', '#5e3a22', '#3b2416'];
export const OUTFITS = ['#126c4b', '#b43c35', '#d18a22', '#3d5a80', '#6b4a8a', '#222831'];
