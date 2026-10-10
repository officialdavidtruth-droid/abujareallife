/* Crews, gangs and companies: shared rules for the server (which enforces them) and the Crew panel (which shows them). Tune the numbers here. */
export const CREW_KINDS = [
  { id: 'crew', e: '🛡️', label: 'Crew', blurb: 'Balanced. Street money and honest work count the same.', crime: 1, legit: 1 },
  { id: 'gang', e: '🔫', label: 'Gang', blurb: 'Street money counts ×1.3, honest work ×0.8. Police cannot join.', crime: 1.3, legit: 0.8 },
  { id: 'company', e: '🏢', label: 'Company', blurb: 'Honest work counts ×1.3, street money ×0.5.', crime: 0.5, legit: 1.3 },
] as const;
export type CrewKind = (typeof CREW_KINDS)[number]['id'];
export const kindOf = (id: string) => CREW_KINDS.find(k => k.id === id) || CREW_KINDS[0];

export const CREW = {
  createCost: 250_000,
  maxMembers: 20,
  minToClaim: 3,            // members eligible before the crew may claim turf or start a war
  nameMin: 3, nameMax: 20, tagMin: 2, tagMax: 4, mottoMax: 60,
  chatMax: 300, chatCooldownMs: 700, chatPerMin: 30, chatKeep: 200,
  claimCost: 3_000_000,     // paid from the treasury, for a district nobody holds
  maxTurf: 4,
  turfHourly: 120_000,      // per district per hour; half to the treasury, half split between members seen in the last 24h
  turfPayCapMs: 24 * 3600_000, turfPayMinMs: 10 * 60_000, activeMs: 24 * 3600_000,
  newTurfShieldMs: 2 * 3600_000,
  warFee: 500_000,          // from the treasury; not refunded
  warPrepMs: 2 * 60_000, warMs: 60 * 60_000, warMinScore: 50, warCooldownMs: 6 * 3600_000, // a district cannot be attacked again for 6 h after a war over it ends
  warDefenderBonus: 1.05,   // ties and near-ties go to the home crew
  memberCap: 600,           // most points one member can add to one event, so no single whale carries a crew
  pointNaira: 1_000,        // 1 point per this many naira earned
  cupPrizes: [2_000_000, 1_000_000, 500_000], cupRating: [30, 20, 10],
  warWinRating: 25, warLoseRating: 10,
  maxCash: 2_000_000_000,   // the database stores money as 32-bit numbers
} as const;

/* Earnings that count toward event scores. Player-to-player money (gifts, sends, market, deals, rides, help tips, casino) is left out on purpose: crewmates could pass it around to farm points. */
export const LEGIT_PREFIXES = ['shift:', 'quest:', 'mission:', 'race:'];
export const CAP_DISTRICTS = ['Central Area', 'Wuse', 'Garki', 'Maitama', 'Jabi', 'Gwarinpa', 'Asokoro', 'Utako', 'Kubwa', 'Lugbe', 'Airport Corridor']; // keep in step with lib/cityData.ts

export const cleanName = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
export const nameOk = (s: string) => s.length >= CREW.nameMin && s.length <= CREW.nameMax && /^[A-Za-z0-9][A-Za-z0-9 _'-]*$/.test(s);
export const tagOk = (s: string) => s.length >= CREW.tagMin && s.length <= CREW.tagMax && /^[A-Za-z0-9]+$/.test(s);
export const canManage = (role: string) => role === 'leader' || role === 'officer';
export const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
export const dayStart = (t = Date.now()) => Date.parse(dayKey(t) + 'T00:00:00.000Z');
