import type { BusinessType } from './cityTypes';

/* Drunk and high. Both are 0-100 levels owned by the server (Save.drunk / Save.high) and they fade on their own.
   Pure data + maths here; /api/intox is the only writer. Weed itself is supplied by the dealer system (step 2): a joint is an inventory item. */
export const DRINKS = [
  { id: 'palm_wine', label: 'Palm wine', e: '🥥', cost: 1500, drunk: 10 },
  { id: 'beer', label: 'Star lager', e: '🍺', cost: 2000, drunk: 14 },
  { id: 'whisky', label: 'Whisky shot', e: '🥃', cost: 4000, drunk: 22 },
  { id: 'champagne', label: 'Champagne bottle', e: '🍾', cost: 25_000, drunk: 35 },
] as const;
export type DrinkId = (typeof DRINKS)[number]['id'];
export const drinkById = (id: string) => DRINKS.find(d => d.id === id) || null;
/** Buildings that serve alcohol. */
export const BAR_TYPES: BusinessType[] = ['Nightclub', 'Restaurant', 'Hotel'];

export const JOINT_ITEM = 'drug_weed';       // inventory key; the dealer sells it in step 2
export const JOINT_HIGH = 35;                // high added per joint
export const DRUNK_DECAY_PER_MIN = 3, HIGH_DECAY_PER_MIN = 4;
export const BLACKOUT_AT = 100;              // drunk or high reaching 100 = you pass out
export const BLACKOUT_PENALTY = { energy: -40, fun: -10 } as const;
export const SOBER_ROB_NOTE = 'Passed-out players are easy to rob (step 3).';

export const clamp100 = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
export function decayIntox(drunk: number, high: number, ms: number) {
  const min = Math.floor(ms / 60_000);
  return { drunk: clamp100(drunk - min * DRUNK_DECAY_PER_MIN), high: clamp100(high - min * HIGH_DECAY_PER_MIN) };
}
export type Stage = 'sober' | 'buzzed' | 'drunk' | 'wasted';
export const stageOf = (v: number): Stage => v >= 75 ? 'wasted' : v >= 45 ? 'drunk' : v >= 15 ? 'buzzed' : 'sober';
/** What the client does with the levels: screen blur/hue, walking sway (radians of heading drift) and a speed multiplier. */
export function effects(drunk: number, high: number) {
  const d = drunk / 100, h = high / 100;
  return { blurPx: +(d * 3.5 + h * 1.5).toFixed(2), hue: Math.round(h * 70), sway: +(d * 0.5).toFixed(2), speed: +(1 - d * 0.25 - h * 0.1).toFixed(2) };
}
