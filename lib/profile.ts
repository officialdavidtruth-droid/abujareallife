// Shared (client + server) catalog and rules. The server is the authority for money, crime, jail and access.
/* ───────── Origin wheel: LAPO (poor) or NEPO (rich) ───────── */
export type Origin = 'LAPO' | 'NEPO';
export const NEPO_CASH = 5_000_000;   // nepo babies start rich
export const LAPO_CASH = 50_000;      // lapo babies start with almost nothing
export const NEPO_CHANCE = 0.3;       // 3 in 10 spins land on NEPO (the wheel shows 10 slices: 3 NEPO, 7 LAPO)
export const WHEEL_SLICES: Origin[] = ['LAPO', 'LAPO', 'NEPO', 'LAPO', 'LAPO', 'NEPO', 'LAPO', 'LAPO', 'NEPO', 'LAPO'];
export const startCash = (o: Origin) => (o === 'NEPO' ? NEPO_CASH : LAPO_CASH);
export const CAR_PRICE = 2_500_000;   // nobody starts with a car: buy one at a Car Dealer

/* ───────── Fame / popularity ───────── */
export const FAME_TIERS = [
  { id: 'nobody', label: 'Nobody', e: '👤', at: 0 },
  { id: 'local', label: 'Local', e: '🙂', at: 50 },
  { id: 'known', label: 'Known', e: '⭐', at: 200 },
  { id: 'influencer', label: 'Influencer', e: '📱', at: 600 },
  { id: 'elite', label: 'Elite', e: '👑', at: 1500 },
] as const;
export type FameTierId = (typeof FAME_TIERS)[number]['id'];
export function fameTier(fame: number) {
  let i = 0; for (let k = 0; k < FAME_TIERS.length; k++) if (fame >= FAME_TIERS[k].at) i = k;
  const cur = FAME_TIERS[i], next = FAME_TIERS[i + 1] || null;
  return { ...cur, next, pct: next ? Math.min(100, Math.round(((fame - cur.at) / (next.at - cur.at)) * 100)) : 100 };
}
export const FAME_DAILY_CAP = 120;       // most fame you can earn per day (stops farming)
export const FAME_QUEST = 3;             // finishing a legal quest
export const FAME_SHIFT = 2;             // finishing a work shift
export const FAME_ACTIVE_SECS = 600;     // +1 fame for every 10 minutes you are active
export const HELP_TIP = 5_000;           // you give this to a player you help
export const HELP_FAME = 4;              // fame for the helper
export const HELP_THANKS_FAME = 1;       // fame for the person helped
export const HELP_PER_DAY = 5;           // max helps per day
export const HELP_PER_TARGET_MS = 60 * 60_000; // same person at most once per hour

export const SKILLS = [
  { id: 'hustling', label: 'Hustling', e: '💼' }, { id: 'driving', label: 'Driving', e: '🚗' },
  { id: 'tech', label: 'Tech', e: '💻' }, { id: 'business', label: 'Business', e: '📈' },
  { id: 'fitness', label: 'Fitness', e: '🏋️' }, { id: 'charisma', label: 'Charisma', e: '🗣️' },
  { id: 'stealth', label: 'Stealth', e: '🥷' }, { id: 'combat', label: 'Combat', e: '🥊' },
  { id: 'medicine', label: 'Medicine', e: '🩺' }, { id: 'law', label: 'Law & Order', e: '⚖️' },
] as const;
export type SkillId = (typeof SKILLS)[number]['id'];
export type Skills = Record<SkillId, number>;
export const zeroSkills = (): Skills => Object.fromEntries(SKILLS.map(s => [s.id, 0])) as Skills; // every skill starts at ZERO

// A profession is a starting direction. The chosen skill is only a focus: it still starts at 0 and grows by doing quests/work.
export const PROFESSIONS = [
  { id: 'citizen', label: 'Citizen', e: '🧍', rank: 1, blurb: 'No strings attached. Do anything.' },
  { id: 'trader', label: 'Trader', e: '🛍️', rank: 1, blurb: 'Buy, sell and hustle.' },
  { id: 'developer', label: 'Developer', e: '💻', rank: 1, blurb: 'Tech jobs and freelance gigs.' },
  { id: 'driver', label: 'Driver', e: '🚕', rank: 1, blurb: 'Deliveries, rides and logistics.' },
  { id: 'doctor', label: 'Doctor', e: '🩺', rank: 1, blurb: 'Hospitals and clinics.' },
  { id: 'artist', label: 'Artist', e: '🎤', rank: 1, blurb: 'Music, content, nightlife.' },
  { id: 'criminal', label: 'Street Hustler', e: '🕶️', rank: 1, blurb: 'Risky money. Police are real players.' },
  { id: 'police', label: 'Police Officer', e: '👮', rank: 2, blurb: 'Real officers: patrol, chase, arrest, run the station.' },
] as const;
export type ProfessionId = (typeof PROFESSIONS)[number]['id'];

export const STYLES = [
  { id: 'street', label: 'Streetwear' }, { id: 'corporate', label: 'Corporate' }, { id: 'traditional', label: 'Traditional (Agbada)' },
  { id: 'casual', label: 'Casual' }, { id: 'luxury', label: 'Luxury' }, { id: 'sporty', label: 'Sporty' },
] as const;
export type StyleId = (typeof STYLES)[number]['id'];

// Outfit "models": each is a full-body outfit type, shown in onboarding AND in the character profile.
export const OUTFIT_MODELS = [
  { id: 'tee', label: 'T-shirt & trousers', style: 'casual' }, { id: 'hoodie', label: 'Hoodie', style: 'street' },
  { id: 'suit', label: 'Suit', style: 'corporate' }, { id: 'agbada', label: 'Agbada', style: 'traditional' },
  { id: 'jersey', label: 'Jersey', style: 'sporty' }, { id: 'designer', label: 'Designer fit', style: 'luxury' },
  { id: 'uniform', label: 'Police uniform', style: 'corporate', police: true },
] as const;
export type OutfitModelId = (typeof OUTFIT_MODELS)[number]['id'];

export const RELATIONSHIPS = ['single', 'dating', 'engaged', 'married', 'complicated'] as const;
export type RelationshipStatus = (typeof RELATIONSHIPS)[number];

export type Profile = {
  profession: ProfessionId; focus: SkillId; style: StyleId; outfitModel: OutfitModelId;
  skills: Skills; relationship: RelationshipStatus; partner: string | null; bio: string;
};
export const DEFAULT_PROFILE: Profile = { profession: 'citizen', focus: 'hustling', style: 'casual', outfitModel: 'tee', skills: zeroSkills(), relationship: 'single', partner: null, bio: '' };

const has = <T extends readonly { id: string }[]>(l: T, v: unknown) => l.some(x => x.id === v);
export function sanitizeProfile(p: Partial<Profile> | null | undefined, prev?: Profile | null): Profile {
  const x = p || {}, base = prev || DEFAULT_PROFILE;
  const profession = (has(PROFESSIONS, x.profession) ? x.profession : base.profession) as ProfessionId;
  let outfitModel = (has(OUTFIT_MODELS, x.outfitModel) ? x.outfitModel : base.outfitModel) as OutfitModelId;
  if (outfitModel === 'uniform' && profession !== 'police') outfitModel = 'tee'; // uniform is police only
  return {
    profession, outfitModel,
    focus: (has(SKILLS, x.focus) ? x.focus : base.focus) as SkillId,
    style: (has(STYLES, x.style) ? x.style : base.style) as StyleId,
    // skills are NEVER taken from the client after creation: only the server raises them (see skills in quests)
    skills: prev ? prev.skills : zeroSkills(),
    relationship: base.relationship, partner: base.partner,
    bio: typeof x.bio === 'string' ? x.bio.slice(0, 120) : base.bio,
  };
}
export const skillLevel = (xp: number) => Math.floor(Math.sqrt(Math.max(0, xp) / 10)); // 0 xp = level 0

/* ───────── Quests (server-priced) ───────── */
export type Quest = { at?: string[]; id: string; title: string; blurb: string; reward: number; skill: SkillId; xp: number; secs: number; minSkill?: number; legal: boolean; profession?: ProfessionId[] };
export const QUESTS: Quest[] = [
  { at: ['Logistics', 'Petrol Station'], id: 'deliver', title: 'Deliver a parcel', blurb: 'Take a package across the city.', reward: 25_000, skill: 'driving', xp: 12, secs: 20, legal: true },
  { at: ['Tech Company', 'Office'], id: 'freelance', title: 'Freelance website', blurb: 'Build a quick landing page.', reward: 60_000, skill: 'tech', xp: 18, secs: 30, legal: true },
  { at: ['Market'], id: 'market', title: 'Market day', blurb: 'Buy low, sell high at Wuse Market.', reward: 35_000, skill: 'hustling', xp: 14, secs: 25, legal: true },
  { at: ['Gym'], id: 'gym', title: 'Train a client', blurb: 'Coach someone at the gym.', reward: 30_000, skill: 'fitness', xp: 12, secs: 25, legal: true },
  { at: ['Office', 'Bank'], id: 'negotiate', title: 'Close a deal', blurb: 'Negotiate a supplier contract.', reward: 90_000, skill: 'business', xp: 20, secs: 35, minSkill: 2, legal: true },
  { at: ['Police Station'], id: 'patrol', title: 'Beat patrol', blurb: 'Patrol your district.', reward: 70_000, skill: 'law', xp: 18, secs: 30, legal: true, profession: ['police'] },
  { at: ['Hospital'], id: 'shift', title: 'Clinic shift', blurb: 'Treat patients at the hospital.', reward: 80_000, skill: 'medicine', xp: 18, secs: 30, legal: true, profession: ['doctor'] },
  { at: ['Nightclub', 'Market'], id: 'smuggle', title: 'Run a shady package', blurb: 'High pay. If you are caught, you are caught.', reward: 150_000, skill: 'stealth', xp: 25, secs: 30, legal: false },
];

/* ───────── Crime & consequences (NO RULES, only consequences) ───────── */
type CrimeDef = { label: string; loot: readonly [number, number]; heat: number; skill: SkillId; base: number; at?: readonly string[] };
export const CRIMES: Record<'pickpocket' | 'rob_shop' | 'carjack' | 'rob_bank', CrimeDef> = {
  pickpocket: { label: 'Pickpocket someone', loot: [8_000, 40_000], heat: 20, skill: 'stealth' as SkillId, base: 0.35 },
  rob_shop: { at: ['Supermarket', 'Pharmacy', 'Market', 'Petrol Station', 'Restaurant', 'Salon', 'Barber', 'Car Dealer', 'Cinema', 'Gym'], label: 'Rob the till', loot: [40_000, 160_000], heat: 45, skill: 'stealth' as SkillId, base: 0.5 },
  carjack: { label: 'Carjack a vehicle', loot: [60_000, 200_000], heat: 55, skill: 'combat' as SkillId, base: 0.55 },
  rob_bank: { at: ['Bank'], label: 'Break into the vault', loot: [300_000, 900_000], heat: 90, skill: 'stealth' as SkillId, base: 0.8 },
};
export type CrimeId = keyof typeof CRIMES;
export const WANTED_AT = 40;                // heat at/above this makes you WANTED: police can arrest you
export const HEAT_DECAY_PER_MIN = 3;        // heat cools while you lie low
export const JAIL_SECS_PER_HEAT = 1.2;      // jail time scales with how hot you were
export const BAIL_PER_SEC = 400;            // optional bail price
export const catchChance = (c: CrimeId, skillLvl: number, policeNearby: number) =>
  Math.max(0.05, Math.min(0.95, CRIMES[c].base - skillLvl * 0.04 + policeNearby * 0.12));
export const POLICE_ARREST_RANGE = 6;       // metres
export const POLICE_REWARD = 40_000;        // paid to the officer for a valid arrest

/* ───────── Building access: rank / invitation / access ───────── */
export type AccessRule = { rank?: number; profession?: ProfessionId[]; inviteOnly?: boolean; open?: boolean; minCash?: number };
const OPEN: AccessRule = { open: true };
export const ACCESS_BY_TYPE: Record<string, AccessRule> = {
  Bank: { rank: 1 }, Restaurant: OPEN, Hotel: OPEN, Hospital: OPEN, Supermarket: OPEN, Salon: OPEN, Barber: OPEN, Gym: OPEN, Mechanic: OPEN,
  'Car Dealer': OPEN, School: OPEN, Office: { rank: 2 }, Nightclub: { minCash: 20_000 }, Market: OPEN, 'Petrol Station': OPEN, Pharmacy: OPEN,
  Cinema: OPEN, 'Tech Company': { rank: 2 }, 'Estate Agency': { rank: 2 }, Logistics: { rank: 2 }, Government: { rank: 3 },
  Airport: OPEN, 'Rail Station': OPEN, 'Police Station': { open: true }, Jail: { profession: ['police'], rank: 2 }, Mansion: { inviteOnly: true },
};
export type AccessResult = { ok: boolean; reason: string };
export function checkAccess(type: string, ctx: { rank: number; profession: ProfessionId; cash: number; invited: boolean; jailed: boolean }): AccessResult {
  if (ctx.jailed) return { ok: false, reason: 'You are in jail.' };
  if (ctx.invited) return { ok: true, reason: 'You have an invitation.' };
  const r = ACCESS_BY_TYPE[type] || OPEN;
  if (r.open) return { ok: true, reason: 'Open to everyone.' };
  if (r.inviteOnly) return { ok: false, reason: 'Invitation only. Ask the owner to invite you.' };
  if (r.profession && !r.profession.includes(ctx.profession)) return { ok: false, reason: 'Staff only.' };
  if (r.rank && ctx.rank < r.rank) return { ok: false, reason: `Requires rank ${r.rank} (you are rank ${ctx.rank}).` };
  if (r.minCash && ctx.cash < r.minCash) return { ok: false, reason: `Entry costs ₦${r.minCash.toLocaleString()}.` };
  return { ok: true, reason: 'Access granted.' };
}
export const rankFor = (profession: ProfessionId, totalXp: number) => (profession === 'police' ? 2 : 1) + Math.floor(totalXp / 400);

// Where the police station and jail sit in the city grid (see cityData.ts). Jail cell = inside the station compound.
export const POLICE_STATION_POS = { x: 16.5, z: -5.5 };
export const JAIL_CELL_POS = { x: 80, z: 80 }; // fenced cell on open ground; CityWorld locks jailed players inside it
