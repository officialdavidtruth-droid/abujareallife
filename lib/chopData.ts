/* Chop shop: data shared by the client (HUD, yard scenery, catalog) and the server. No Node-only imports here. */
export type YardSite = { id: string; name: string; x: number; z: number };
/* World coordinates (the 22 m street grid, see lib/roadRoute.ts). All four sit on open ground just outside the street grid, between two roads,
   so they are not marked on the map and no building is in the way. They are only revealed (and given a waypoint) to a player who has a hot car. */
export const YARDS: YardSite[] = [
  { id: 'lugbe',    name: 'Lugbe back lot',        x: 124,   z: -32.5 },
  { id: 'kubwa',    name: 'Kubwa scrapyard',       x: -124,  z: 32.5 },
  { id: 'asokoro',  name: 'Asokoro lock-up',       x: 32.5,  z: 124 },
  { id: 'gwarinpa', name: "Gwarinpa breaker's yard", x: -32.5, z: -124 },
];
export const yardById = (id: string) => YARDS.find(y => y.id === id);

export const CHOP = {
  heat: 60,                                  // you are WANTED the moment the car is taken
  deadlineSecs: 240,                         // after this the hot car is just yours (it can never be sold; only a chop shop takes it)
  minSecs: 6,                                // fastest believable delivery
  stealCooldownMs: 4 * 60_000,               // one theft per player per 4 min (the job keeps the cooldown even if it fails)
  yardRadius: 9, yardSlack: 6,               // you must be this close (server-side position + slack for the 5 s position updates)
  posMaxAgeMs: 20_000,                       // the server needs a fresh position report
  cps: [[6, 11], [13, 21], [24, 36]] as const,   // seconds after the theft at which each police checkpoint is manned (rolled in these ranges)
  passBase: 0.65, passPerStealth: 0.05, passSpeed: 400, passPerOfficer: 0.08, passMin: 0.25, passMax: 0.92,
  stealBase: 0.35, stealPerStealth: 0.04, stealPerCop: 0.12,   // chance the owner / a patrol stops you before you even drive off
  cashRate: 0.006, cashMin: 80_000, cashMax: 400_000,           // cash = 0.6% of the car's price (scaled by its condition), clamped
  jailSecsPerHeat: 1.2, fineRate: 0.1, caughtHeat: 20,
  stealthXp: 8, drivingXp: 8,
};

/* The parts you can get instead of cash. They are normal inventory items (see lib/catalog.ts), so they can be sold back, listed on the Market,
   or fitted to your own car at a yard (condition points). Shelf cost is what the catalog says; sell-back is half of it. */
export const PARTS = [
  { id: 'part_engine', name: 'Engine block', e: '🛠️', cost: 90_000, fit: 10 },
  { id: 'part_body',   name: 'Body panels',  e: '🚪', cost: 60_000, fit: 8 },
  { id: 'part_wheels', name: 'Wheel set',    e: '🛞', cost: 50_000, fit: 6 },
  { id: 'part_ecu',    name: 'ECU module',   e: '💾', cost: 40_000, fit: 4 },
] as const;
export const partById = (id: string) => PARTS.find(p => p.id === id);

/** What the yard pays in cash for a car (pure, so the HUD can show the same number the server will pay). */
export const chopCash = (price: number, condition: number) =>
  Math.max(CHOP.cashMin, Math.min(CHOP.cashMax, Math.round(price * CHOP.cashRate * (0.6 + 0.4 * Math.max(0, Math.min(100, condition)) / 100) / 1000) * 1000));
/** How many parts the same car would give instead (which parts is rolled by the server). */
export const chopPartCount = (price: number) => (price >= 55_000_000 ? 4 : price >= 25_000_000 ? 3 : 2);
