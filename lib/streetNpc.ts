import { BUILDS_WORLD } from './destinations';
import type { Look } from './characterModels';

/* Street NPCs (step 9): dealers and escorts who stand on the pavement outside certain buildings. Positions are derived from the building layout,
   so server and client always agree. Everything that matters (price, heat, cash, distance) is decided by /api/street-npc; this file is the shared data. */
export type StreetNpcRole = 'dealer' | 'escort';
export type StreetNpc = { id: string; role: StreetNpcRole; name: string; e: string; line: string; at: string; x: number; z: number; price: number; look: Look };

export const NPC_RANGE = 4;            // metres you must be within to talk to one (the server allows a little slack)
export const NPC_DEALER_MARKUP = 1.25;  // street weed costs 25% more than Mama Put's price
export const NPC_DEALER_HEAT = 3;       // heat per unit bought on the street (Mama Put is 2)
export const NPC_ESCORT_HEAT = 5;       // heat for hiring an escort on the street
export const NPC_ESCORT_COOLDOWN_MS = 0;       // no wait between visits (the 30-per-10-minutes rate limit in the route still applies)

const base = (o: Partial<Look> & { name: string }): Look => ({ model: 'citizen', gender: 'm', hair: 'short', hairColor: '#0d0907', skin: '#8b552f', outfit: '#126c4b', pants: '#2b3a55', height: 1, ...o });

type Def = { id: string; role: StreetNpcRole; name: string; e: string; line: string; type: string; nth: number; dx: number; price: number; look: Look };
const DEFS: Def[] = [
  { id: 'npc:tunde', role: 'dealer', name: 'Tunde', e: '🌿', line: 'Psst. Good stuff, no wahala. Cash only.', type: 'Market', nth: 1, dx: 3.2, price: 0, look: base({ name: 'Tunde', hair: 'fade', outfit: '#3a3f45', pants: '#1c1f24', outfitModel: 'hoodie' }) },
  { id: 'npc:yaro', role: 'dealer', name: 'Yaro', e: '🌿', line: 'You look like you need something. I have it.', type: 'Nightclub', nth: 1, dx: -3.2, price: 0, look: base({ name: 'Yaro', hair: 'cornrows', skin: '#6b3f21', outfit: '#7a1f1f', pants: '#14161a', outfitModel: 'bomber' }) },
  { id: 'npc:chioma', role: 'escort', name: 'Chioma', e: '💃', line: 'Looking for company tonight, handsome?', type: 'Nightclub', nth: 0, dx: 3.2, price: 35_000, look: base({ name: 'Chioma', gender: 'f', hair: 'knotless', hairColor: '#120b08', skin: '#7a4a28', outfit: '#c026d3', pants: '#c026d3', outfitModel: 'dress' }) },
  { id: 'npc:zainab', role: 'escort', name: 'Zainab', e: '💃', line: 'The night is young. Take me somewhere nice.', type: 'Nightclub', nth: 2, dx: -3.2, price: 45_000, look: base({ name: 'Zainab', gender: 'f', hair: 'bob', hairColor: '#0d0907', skin: '#9a6238', outfit: '#0f766e', pants: '#0f766e', outfitModel: 'dress' }) },
  { id: 'npc:ngozi', role: 'escort', name: 'Ngozi', e: '💃', line: 'Hotels are boring alone. Join me?', type: 'Hotel', nth: 0, dx: 3.2, price: 80_000, look: base({ name: 'Ngozi', gender: 'f', hair: 'puffs', hairColor: '#0d0907', skin: '#6b3f21', outfit: '#b91c1c', pants: '#b91c1c', outfitModel: 'gown' }) },
];

/** The NPCs that exist in this city. A def whose building type has too few buildings falls back to the last one that does. */
export const STREET_NPCS: StreetNpc[] = DEFS.flatMap(d => {
  const list = BUILDS_WORLD.filter(b => b.business?.type === d.type); if (!list.length) return [];
  const b = list[Math.min(d.nth, list.length - 1)];
  const edge = b.front ?? (b.z + b.d / 2);   // z of the street edge of the plot (lot buildings are pushed back behind a fence)
  return [{ id: d.id, role: d.role, name: d.name, e: d.e, line: d.line, at: b.business?.name ?? d.type, x: b.x + d.dx, z: edge + 1.5, price: d.price, look: d.look }];
});
export const streetNpc = (id: string) => STREET_NPCS.find(n => n.id === id) || null;
