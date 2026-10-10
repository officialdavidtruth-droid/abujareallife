/* Parties and hangouts hosted by real players (PARTIES.md). Pure rules shared by the server (app/api/party, the only authority on money)
   and the Party panel (which only displays them). Tune every number here. */
export type PartyKind = 'hangout' | 'house' | 'owambe' | 'club';
export type MenuId = 'chapman' | 'zobo' | 'smallchops' | 'jollof' | 'poundedyam' | 'palmwine' | 'beer' | 'whisky' | 'champagne';
export type NeedFx = Partial<Record<'hunger' | 'energy' | 'hygiene' | 'bladder' | 'fun' | 'social', number>>;
export type MenuItem = { id: MenuId; label: string; e: string; base: number; fx: NeedFx; drunk: number };
export const MENU: Record<MenuId, MenuItem> = {
  chapman: { id: 'chapman', label: 'Chapman', e: '🍹', base: 1_500, fx: { fun: 4, hunger: 3 }, drunk: 0 },
  zobo: { id: 'zobo', label: 'Zobo', e: '🥤', base: 1_000, fx: { fun: 3, bladder: -3 }, drunk: 0 },
  smallchops: { id: 'smallchops', label: 'Small chops', e: '🍢', base: 3_000, fx: { hunger: 25, fun: 3 }, drunk: 0 },
  jollof: { id: 'jollof', label: 'Party jollof & chicken', e: '🍛', base: 5_000, fx: { hunger: 55, fun: 6 }, drunk: 0 },
  poundedyam: { id: 'poundedyam', label: 'Pounded yam & egusi', e: '🍲', base: 6_000, fx: { hunger: 60, fun: 4 }, drunk: 0 },
  palmwine: { id: 'palmwine', label: 'Palm wine', e: '🥥', base: 1_500, fx: { fun: 5 }, drunk: 10 },
  beer: { id: 'beer', label: 'Star lager', e: '🍺', base: 2_000, fx: { fun: 6 }, drunk: 14 },
  whisky: { id: 'whisky', label: 'Whisky shot', e: '🥃', base: 4_000, fx: { fun: 8 }, drunk: 22 },
  champagne: { id: 'champagne', label: 'Champagne bottle', e: '🍾', base: 25_000, fx: { fun: 14, social: 4 }, drunk: 35 },
};
export const menuById = (id: string): MenuItem | null => (Object.prototype.hasOwnProperty.call(MENU, id) ? MENU[id as MenuId] : null);

export type PartyKindDef = {
  id: PartyKind; e: string; label: string; blurb: string;
  setup: number;            // what the host pays to put it on (venue, decor, DJ or band): spent, not refunded
  cap: number;              // most people inside, host included
  durationMs: number;       // the party ends by itself after this long
  coverMax: number;         // highest door fee the host may ask
  friendsOnly: boolean;     // forced: only friends may join
  menu: MenuId[];
  sprayMult: number;        // how hard spraying money lifts the vibe here (an owambe is all about spraying)
  danceMult: number;        // how much the dance floor lifts the vibe here
  needsOccasion: boolean;   // owambe: you must say what you are celebrating
  needsClub: boolean;       // club night: held in a real Nightclub of the city
  hostFameCap: number;      // most fame the host can earn from one party
};
export const PARTY_KINDS: Record<PartyKind, PartyKindDef> = {
  hangout: { id: 'hangout', e: '🛋️', label: 'Hang out', blurb: 'Friends only. Free and easy: chat, chill, dance a little.', setup: 0, cap: 8, durationMs: 2 * 3600_000, coverMax: 0, friendsOnly: true, menu: ['chapman', 'zobo', 'smallchops'], sprayMult: 0.5, danceMult: 0.8, needsOccasion: false, needsClub: false, hostFameCap: 0 },
  house: { id: 'house', e: '🏠', label: 'House party', blurb: 'Your place, your playlist. Small, loud and personal.', setup: 25_000, cap: 15, durationMs: 3 * 3600_000, coverMax: 20_000, friendsOnly: false, menu: ['chapman', 'smallchops', 'jollof', 'palmwine', 'beer'], sprayMult: 0.8, danceMult: 1, needsOccasion: false, needsClub: false, hostFameCap: 8 },
  owambe: { id: 'owambe', e: '🎊', label: 'Owambe', blurb: 'Asoebi, jollof, live band and money in the air. Spray the celebrant.', setup: 150_000, cap: 60, durationMs: 5 * 3600_000, coverMax: 0, friendsOnly: false, menu: ['zobo', 'chapman', 'smallchops', 'jollof', 'poundedyam', 'palmwine', 'whisky', 'champagne'], sprayMult: 1.6, danceMult: 1.1, needsOccasion: true, needsClub: false, hostFameCap: 20 },
  club: { id: 'club', e: '🪩', label: 'Club night', blurb: 'Book a Nightclub, set the door and the DJ. Bottle service pays.', setup: 500_000, cap: 80, durationMs: 5 * 3600_000, coverMax: 100_000, friendsOnly: false, menu: ['beer', 'whisky', 'champagne', 'chapman', 'smallchops'], sprayMult: 1, danceMult: 1.4, needsOccasion: false, needsClub: true, hostFameCap: 20 },
};
export const kindDef = (id: string): PartyKindDef | null => (Object.prototype.hasOwnProperty.call(PARTY_KINDS, id) ? PARTY_KINDS[id as PartyKind] : null);

export const OCCASIONS = ['Wedding', 'Birthday', 'Naming ceremony', 'Graduation', 'Housewarming', 'Chieftaincy', 'Anniversary', 'Promotion'] as const;
export const GENRES = [
  { id: 'afrobeats', e: '🎧', label: 'Afrobeats' }, { id: 'amapiano', e: '🎹', label: 'Amapiano' }, { id: 'highlife', e: '🎺', label: 'Highlife' },
  { id: 'fuji', e: '🥁', label: 'Fuji / live band' }, { id: 'afrohouse', e: '🪩', label: 'Afro house' }, { id: 'gospel', e: '🎤', label: 'Gospel' },
] as const;
export const genreOk = (g: string) => GENRES.some(x => x.id === g);
export const ASOEBI = ['Royal blue', 'Emerald green', 'Gold', 'Wine', 'Coral', 'White & silver', 'Purple', 'No dress code'] as const;

export const PARTY = {
  titleMin: 3, titleMax: 40,
  markupMin: 0.5, markupMax: 2,          // host's drink & food price level (1 = list price)
  cogsRate: 0.5,                         // supplier cost: half of the list price is spent, the rest is the host's margin (same as player businesses)
  maxLive: 25,                           // parties shown in the list
  minStayMs: 3 * 60_000,                 // a guest only counts toward the host's fame after this long
  joinDistrictFreshMs: 120_000,          // the position the game last reported must be this fresh for the "same district" check
  decayPerMin: 1.2,                      // vibe fades without people dancing and spraying
  danceCooldownMs: 10_000, danceFloorWindowMs: 60_000, danceFloorMin: 3, danceFloorBonus: 1.5, // 3+ dancers in the last minute = "the floor is full"
  danceVibe: 1.2,
  joinVibe: 2, orderVibe: 1.5, musicVibe: 4, musicCooldownMs: 10 * 60_000,
  sprayTiers: [1_000, 5_000, 20_000, 100_000, 500_000],
  sprayFee: 0.08,                        // the city takes this share of every spray (nobody can launder money through parties)
  sprayVibeMax: 8,
  invitesPerMin: 10, actionsPerMin: 40,
  baseFx: { fun: 8, social: 4, energy: -4, hygiene: -2 } as NeedFx,   // one dance at vibe 50, before the multipliers
  maxCash: 2_000_000_000,
} as const;

export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
/** Vibe now, after fading since it was last stored. */
export const vibeNow = (vibe: number, at: number, now = Date.now()) => clamp(vibe - PARTY.decayPerMin * Math.max(0, now - at) / 60_000, 0, 100);
/** 0.6 (dead room) to 1.4 (peak vibe): scales every need gain a guest gets from the party. */
export const vibeMult = (v: number) => 0.6 + 0.8 * clamp(v, 0, 100) / 100;
export const sprayVibe = (amount: number, kind: PartyKindDef) => clamp((1 + Math.log10(Math.max(1000, amount) / 1000) * 2) * kind.sprayMult, 0, PARTY.sprayVibeMax);
export const sprayOk = (n: number) => (PARTY.sprayTiers as readonly number[]).includes(n);
/** What a guest pays for one unit at this party. */
export const menuPrice = (id: MenuId, markup: number) => Math.max(1, Math.round(MENU[id].base * clamp(markup, PARTY.markupMin, PARTY.markupMax)));
/** Need changes for one dance: scaled by the vibe and (for a full floor) the group bonus. Energy and hygiene costs are not boosted. */
export function danceFx(vibe: number, kind: PartyKindDef, floorFull: boolean): NeedFx {
  const m = vibeMult(vibe) * (floorFull ? PARTY.danceFloorBonus : 1), out: NeedFx = {};
  for (const [k, v] of Object.entries(PARTY.baseFx) as [keyof NeedFx, number][]) out[k] = Math.round(v > 0 ? v * m * (k === 'fun' ? kind.danceMult : 1) : v);
  return out;
}
/** Scale the need gains of a menu item by the vibe (gains only; nothing is ever made worse by a good party). */
export function menuFx(item: MenuItem, vibe: number): NeedFx {
  const m = vibeMult(vibe), out: NeedFx = {};
  for (const [k, v] of Object.entries(item.fx) as [keyof NeedFx, number][]) out[k] = Math.round(v > 0 ? v * m : v);
  return out;
}
/** Fame the host earns when the party ends: peak vibe x how many guests really stayed. Capped per kind, and awardFame() applies the daily cap on top. */
export function hostFame(peak: number, stayed: number, kind: PartyKindDef) {
  if (!kind.hostFameCap || stayed < 2) return 0;
  return Math.min(kind.hostFameCap, Math.round((clamp(peak, 0, 100) / 100) * Math.min(stayed, 30) * 0.6));
}
export const cleanTitle = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, PARTY.titleMax);
export const titleOk = (s: string) => s.length >= PARTY.titleMin && /^[A-Za-z0-9][A-Za-z0-9 &'’!.,_-]*$/.test(s);
