// Character look: fully customisable procedural human (see lib/humanRig.ts). No external model files needed.
export type Hair =
  | 'short' | 'afro' | 'braids' | 'bun' | 'bald'                       // original five (kept so old saves still load)
  | 'fade' | 'flattop' | 'waves' | 'twists' | 'locs' | 'cornrows' | 'fadebeard' // men
  | 'bob' | 'long' | 'ponytail' | 'puffs' | 'knotless' | 'pixie';        // women
export type Look = {
  name: string; model: string; gender: 'm' | 'f'; hair: Hair; hairColor: string;
  skin: string; outfit: string; pants: string; height: number; outfitModel?: string;
};
// for: 'm' men, 'f' women, 'b' both
export const HAIRS: { id: Hair; label: string; for: 'm' | 'f' | 'b' }[] = [
  { id: 'fade', label: 'Low fade', for: 'm' }, { id: 'fadebeard', label: 'Fade + beard', for: 'm' }, { id: 'flattop', label: 'Flat top', for: 'm' },
  { id: 'waves', label: '360 waves', for: 'm' }, { id: 'twists', label: 'Twists', for: 'm' }, { id: 'locs', label: 'Dreadlocks', for: 'm' },
  { id: 'cornrows', label: 'Cornrows', for: 'm' }, { id: 'short', label: 'Short crop', for: 'm' },
  { id: 'bob', label: 'Bob', for: 'f' }, { id: 'long', label: 'Long straight', for: 'f' }, { id: 'ponytail', label: 'High ponytail', for: 'f' },
  { id: 'puffs', label: 'Afro puffs', for: 'f' }, { id: 'knotless', label: 'Knotless braids', for: 'f' }, { id: 'pixie', label: 'Pixie cut', for: 'f' },
  { id: 'braids', label: 'Box braids', for: 'f' }, { id: 'bun', label: 'Top bun', for: 'f' },
  { id: 'afro', label: 'Afro', for: 'b' }, { id: 'bald', label: 'Bald', for: 'b' },
];
export const hairsFor = (g: 'm' | 'f') => HAIRS.filter(h => h.for === 'b' || h.for === g);
export const defaultHair = (g: 'm' | 'f'): Hair => (g === 'f' ? 'knotless' : 'fade');
export const hairOk = (h: unknown, g: 'm' | 'f') => HAIRS.some(x => x.id === h && (x.for === 'b' || x.for === g));
export const SKIN_TONES = ['#f1c9a5', '#d9a577', '#b87a4b', '#8b552f', '#5e3a22', '#3b2416'];
export const OUTFITS = ['#126c4b', '#b43c35', '#d18a22', '#3d5a80', '#6b4a8a', '#222831', '#f2f2f2', '#e07aa1', '#0f766e', '#c2410c', '#1e3a8a', '#a21caf', '#facc15', '#7c2d12'];
export const PANTS = ['#2b3a55', '#222831', '#6b5a48', '#3a5a40', '#7a2e2e', '#cfc9bd', '#111111', '#1e3a8a', '#d18a22', '#f2f2f2'];
export const HAIR_COLORS = ['#0d0907', '#2b1a12', '#5a3a22', '#9a6a3a', '#c9a25a', '#8f2d2d', '#3d5a80'];

export const DEFAULT_LOOK: Look = { name: 'David', model: 'citizen', gender: 'm', hair: 'short', hairColor: '#0d0907', skin: '#8b552f', outfit: '#126c4b', pants: '#2b3a55', height: 1 };

const HEX = /^#[0-9a-f]{6}$/i;
const hex = (v: unknown, d: string) => (typeof v === 'string' && HEX.test(v) ? v : d);
// Used on the server (save route) and for other players' looks: never trust raw input.
export function sanitizeLook(l: Partial<Look> | undefined | null, name: string): Look {
  const x = l || {};
  return {
    name, model: 'citizen', outfitModel: typeof x.outfitModel === 'string' && /^[a-z]{2,12}$/.test(x.outfitModel) && outfitOk(x.outfitModel, x.gender === 'f' ? 'f' : 'm') ? x.outfitModel : 'tee',
    gender: x.gender === 'f' ? 'f' : 'm',
    hair: hairOk(x.hair, x.gender === 'f' ? 'f' : 'm') ? (x.hair as Hair) : defaultHair(x.gender === 'f' ? 'f' : 'm'),
    hairColor: hex(x.hairColor, DEFAULT_LOOK.hairColor), skin: hex(x.skin, DEFAULT_LOOK.skin),
    outfit: hex(x.outfit, DEFAULT_LOOK.outfit), pants: hex(x.pants, DEFAULT_LOOK.pants),
    height: typeof x.height === 'number' && isFinite(x.height) ? Math.max(0.9, Math.min(1.1, x.height)) : 1,
  };
}

// Outfit models. Each one has its own 3D garment (see lib/humanRig.ts) and is gendered: 'm' men, 'f' women, 'b' both.
export const OUTFIT_GENDER: Record<string, 'm' | 'f' | 'b'> = {
  tee: 'm', polo: 'm', hoodie: 'b', bomber: 'm', suit: 'm', agbada: 'm', kaftan: 'm', jersey: 'm', designer: 'b', uniform: 'b',
  crop: 'f', dress: 'f', gown: 'f', ankara: 'f', blazer: 'f', active: 'f',
};
export const outfitOk = (id: string, g: 'm' | 'f') => { const o = OUTFIT_GENDER[id]; return !!o && (o === 'b' || o === g); };
export const defaultOutfitModel = (g: 'm' | 'f') => (g === 'f' ? 'dress' : 'tee');

// Each outfit model sets the starting look colours (and is sent to other players).
export const MODEL_COLORS: Record<string, { outfit: string; pants: string }> = {
  tee: { outfit: '#3d5a80', pants: '#2b3a55' }, polo: { outfit: '#0f766e', pants: '#cfc9bd' }, hoodie: { outfit: '#222831', pants: '#222831' },
  bomber: { outfit: '#3a5a40', pants: '#111111' }, suit: { outfit: '#1a1f2b', pants: '#1a1f2b' }, agbada: { outfit: '#f2f2f2', pants: '#cfc9bd' },
  kaftan: { outfit: '#7c2d12', pants: '#7c2d12' }, jersey: { outfit: '#126c4b', pants: '#f2f2f2' }, designer: { outfit: '#6b4a8a', pants: '#222831' },
  uniform: { outfit: '#1e3a8a', pants: '#111827' },
  crop: { outfit: '#e07aa1', pants: '#2b3a55' }, dress: { outfit: '#b43c35', pants: '#222831' }, gown: { outfit: '#6b4a8a', pants: '#d9a22b' },
  ankara: { outfit: '#d18a22', pants: '#126c4b' }, blazer: { outfit: '#f2f2f2', pants: '#f2f2f2' }, active: { outfit: '#a21caf', pants: '#222831' },
};
export const applyOutfitModel = (l: Look, model: string): Look => ({ ...l, outfitModel: model, ...(MODEL_COLORS[model] || {}) });
