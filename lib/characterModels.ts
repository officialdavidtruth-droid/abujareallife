// Character look: fully customisable procedural human (see lib/humanRig.ts). No external model files needed.
export type Hair = 'short' | 'afro' | 'braids' | 'bun' | 'bald';
export type Look = {
  name: string; model: string; gender: 'm' | 'f'; hair: Hair; hairColor: string;
  skin: string; outfit: string; pants: string; height: number; outfitModel?: string;
};
export const HAIRS: { id: Hair; label: string }[] = [
  { id: 'short', label: 'Short' }, { id: 'afro', label: 'Afro' }, { id: 'braids', label: 'Braids' }, { id: 'bun', label: 'Bun' }, { id: 'bald', label: 'Bald' },
];
export const SKIN_TONES = ['#f1c9a5', '#d9a577', '#b87a4b', '#8b552f', '#5e3a22', '#3b2416'];
export const OUTFITS = ['#126c4b', '#b43c35', '#d18a22', '#3d5a80', '#6b4a8a', '#222831', '#f2f2f2', '#e07aa1'];
export const PANTS = ['#2b3a55', '#222831', '#6b5a48', '#3a5a40', '#7a2e2e', '#cfc9bd'];
export const HAIR_COLORS = ['#0d0907', '#2b1a12', '#5a3a22', '#9a6a3a', '#c9a25a', '#8f2d2d', '#3d5a80'];

export const DEFAULT_LOOK: Look = { name: 'David', model: 'citizen', gender: 'm', hair: 'short', hairColor: '#0d0907', skin: '#8b552f', outfit: '#126c4b', pants: '#2b3a55', height: 1 };

const HEX = /^#[0-9a-f]{6}$/i;
const hex = (v: unknown, d: string) => (typeof v === 'string' && HEX.test(v) ? v : d);
// Used on the server (save route) and for other players' looks: never trust raw input.
export function sanitizeLook(l: Partial<Look> | undefined | null, name: string): Look {
  const x = l || {};
  return {
    name, model: 'citizen', outfitModel: typeof x.outfitModel === 'string' && /^[a-z]{2,12}$/.test(x.outfitModel) ? x.outfitModel : 'tee',
    gender: x.gender === 'f' ? 'f' : 'm',
    hair: HAIRS.some(h => h.id === x.hair) ? (x.hair as Hair) : x.gender === 'f' ? 'braids' : 'short',
    hairColor: hex(x.hairColor, DEFAULT_LOOK.hairColor), skin: hex(x.skin, DEFAULT_LOOK.skin),
    outfit: hex(x.outfit, DEFAULT_LOOK.outfit), pants: hex(x.pants, DEFAULT_LOOK.pants),
    height: typeof x.height === 'number' && isFinite(x.height) ? Math.max(0.9, Math.min(1.1, x.height)) : 1,
  };
}

// Each outfit model sets the look colours (and is sent to other players). Distinct 3D garment shapes can be added later in humanRig.
export const MODEL_COLORS: Record<string, { outfit: string; pants: string }> = {
  tee: { outfit: '#3d5a80', pants: '#2b3a55' }, hoodie: { outfit: '#222831', pants: '#222831' }, suit: { outfit: '#1a1f2b', pants: '#1a1f2b' },
  agbada: { outfit: '#f2f2f2', pants: '#cfc9bd' }, jersey: { outfit: '#126c4b', pants: '#f2f2f2' }, designer: { outfit: '#6b4a8a', pants: '#222831' },
  uniform: { outfit: '#1e3a8a', pants: '#111827' },
};
export const applyOutfitModel = (l: Look, model: string): Look => ({ ...l, outfitModel: model, ...(MODEL_COLORS[model] || {}) });
