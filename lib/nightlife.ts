import type { ProfessionId, SkillId } from './profile';

/* The club underworld. Every deal is between TWO REAL PLAYERS standing in the same Nightclub: no NPC buyers or sellers exist.
   Prices, effects and heat live here so the server (app/api/deal) is the only authority. */
export type DealKind = 'company' | 'stash' | 'protection';
export type DealDef = {
  kind: DealKind; by: ProfessionId; label: string; e: string; blurb: string;
  min: number; max: number;                       // seller may ask any price in this range
  sellerHeat: number;                             // heat the seller gains when a deal completes
  buyerHeat: number;                              // heat the buyer gains
  fx: Partial<Record<'hunger' | 'energy' | 'hygiene' | 'bladder' | 'fun' | 'social', number>>; // what the buyer gets
  skill: SkillId; xp: number;                     // seller skill growth per completed deal
  sting: boolean;                                 // an officer accepting this is a sting: no money, no goods, seller gets busted heat
};
export const DEALS: Record<DealKind, DealDef> = {
  company: { kind: 'company', by: 'escort', label: 'Private booth & company', e: '💃', blurb: 'A VIP booth and a good night.', min: 15_000, max: 250_000, sellerHeat: 10, buyerHeat: 0, fx: { fun: 40, social: 30, energy: -10 }, skill: 'charisma', xp: 8, sting: true },
  stash: { kind: 'stash', by: 'dealer', label: 'Street package', e: '💊', blurb: 'Quiet hand-off in the corner.', min: 10_000, max: 200_000, sellerHeat: 25, buyerHeat: 8, fx: { fun: 45, social: 10, energy: -15, hygiene: -5 }, skill: 'hustling', xp: 8, sting: true },
  protection: { kind: 'protection', by: 'gang', label: 'Protection fee', e: '🔫', blurb: 'Pay up and stay on our good side.', min: 5_000, max: 150_000, sellerHeat: 15, buyerHeat: 0, fx: { social: 5 }, skill: 'combat', xp: 8, sting: false },
};
export const dealFor = (p: ProfessionId): DealDef | null => Object.values(DEALS).find(d => d.by === p) || null;
export const DEAL_TTL_MS = 2 * 60_000;     // an offer expires after 2 minutes
export const DEAL_OFFERS_PER_MIN = 8;
export const STING_HEAT = 45;              // heat the seller gets if the "buyer" was a police officer (>= WANTED_AT, so they become wanted)
export const NIGHTCLUB = 'Nightclub';
