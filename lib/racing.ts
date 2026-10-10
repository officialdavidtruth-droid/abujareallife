/* Street racing + car tuning. Shared by the server (/api/race is the authority for money, wear and results) and the client (display).
   Tune every number here. */
import { vehicleByName, type VehicleSpec } from './vehicles';

/* ───────── tuning parts: 3 levels each, bought per car ───────── */
export type TuneId = 'engine' | 'tires' | 'weight';
export const TUNES: { id: TuneId; e: string; name: string; what: string; perf: number; costs: [number, number, number] }[] = [
  { id: 'engine', e: '🔥', name: 'Engine', what: 'More power: faster through the gears', perf: .07, costs: [1_500_000, 3_500_000, 8_000_000] },
  { id: 'tires', e: '🛞', name: 'Tyres', what: 'More grip: a stronger launch', perf: .05, costs: [1_000_000, 2_500_000, 6_000_000] },
  { id: 'weight', e: '🪶', name: 'Lightweight kit', what: 'Less weight: quicker everywhere', perf: .04, costs: [1_000_000, 2_500_000, 6_000_000] },
];
export type Tune = Record<TuneId, number>;
export const NO_TUNE: Tune = { engine: 0, tires: 0, weight: 0 };
export const cleanTune = (m: unknown): Tune => { const x = (m || {}) as Partial<Tune>; const c = (v: unknown) => Math.max(0, Math.min(3, Math.floor(Number(v) || 0))); return { engine: c(x.engine), tires: c(x.tires), weight: c(x.weight) }; };
export const tuneKey = (vehicleId: string) => `tune_${vehicleId}`;

/* ───────── car performance → quarter-mile time ───────── */
/** 0 .. ~1.35. Stock cars sit between ~0.4 (Camry) and ~0.95 (BMW 530i). */
export function perf(spec: VehicleSpec, tune: Tune): number {
  const launch = (10 - spec.accel) / 4.2, power = (spec.topSpeed - 190) / 60, grip = (spec.handling - 70) / 20;
  const base = .4 * Math.max(0, launch) + .3 * Math.max(0, power) + .3 * Math.max(0, grip);
  return base + TUNES.reduce((a, t) => a + t.perf * tune[t.id], 0);
}
export const carPerf = (name: string, tune: Tune) => perf(vehicleByName(name), tune);
export const baseTime = (p: number, drivingLevel = 0) => 15.5 - 3 * p - .04 * Math.min(10, Math.max(0, drivingLevel));

/** what the player did: reaction in ms after the green light (null = jumped the light) and 3 gear-change accuracies 0..1 */
export type Inputs = { reaction: number | null; shifts: number[] };
export function cleanInputs(b: unknown): Inputs {
  const x = (b || {}) as { reaction?: unknown; shifts?: unknown };
  const r = Number(x.reaction), reaction = x.reaction == null || !Number.isFinite(r) || r < 100 ? null : Math.min(2000, r); // under 100ms is not humanly possible: treated as jumping the light
  const sh = Array.isArray(x.shifts) ? x.shifts : [], shifts = [0, 1, 2].map(i => Math.max(0, Math.min(1, Number(sh[i]) || 0)));
  return { reaction, shifts };
}
export function raceTime(p: number, drivingLevel: number, i: Inputs): number {
  const launch = i.reaction == null ? .6 : i.reaction < 180 ? -.25 : i.reaction < 260 ? -.12 : i.reaction < 400 ? 0 : .15;
  const gears = i.shifts.reduce((a, s) => a + (1 - s) * .35, 0);
  return Math.max(9.5, baseTime(p, drivingLevel) + launch + gears);
}

/* ───────── race tiers ───────── */
export type Tier = { id: string; e: string; name: string; fee: number; ai: number; spread: number; prize: [number, number, number, number]; heat: number; blurb: string };
export const TIERS: Tier[] = [
  { id: 'street', e: '🌙', name: 'Street Run', fee: 500_000, ai: 14.8, spread: .6, prize: [2, 1, 0, 0], heat: 6, blurb: 'Back-road kids and borrowed cars.' },
  { id: 'club', e: '🏁', name: 'Club Night', fee: 2_000_000, ai: 13.7, spread: .5, prize: [2, 1, 0, 0], heat: 8, blurb: 'Tuned cars, serious money.' },
  { id: 'pro', e: '👑', name: 'Kings of Abuja', fee: 5_000_000, ai: 12.7, spread: .4, prize: [1.8, 1, 0, 0], heat: 10, blurb: 'Only the quickest cars show up.' },
];
export const tierById = (id: string) => TIERS.find(t => t.id === id);

/* ───────── limits (the economy safety rails) ───────── */
export const MAX_RACES_PER_DAY = 12;
export const DAILY_NET_CAP = 8_000_000;  // most net profit (prize minus entry) you can bank per day; beyond it a win only refunds your entry
export const RACE_COOLDOWN_SECS = 45;
export const MIN_RACE_SECS = 6;          // a real run (lights + three gears) takes longer than this
export const TICKET_MAX_SECS = 240;
export const MIN_FUEL = 15, MIN_CONDITION = 25;
export const WEAR = { fuel: 6, condition: 1, lastPlaceCondition: 2 };
export const DRIVING_XP = { run: 6, win: 3 };

export const RACERS = ['Ayo', 'Chidi', 'Zainab', 'Bako', 'Tunde', 'Ngozi', 'Femi', 'Hauwa', 'Emeka', 'Kemi'];
export const PAINTS = [
  { id: '#123b63', name: 'Ocean blue' }, { id: '#b91c1c', name: 'Racing red' }, { id: '#111111', name: 'Midnight black' }, { id: '#f5f5f4', name: 'Pearl white' },
  { id: '#15803d', name: 'Naija green' }, { id: '#d99a42', name: 'Gold' }, { id: '#6d28d9', name: 'Violet' }, { id: '#ea580c', name: 'Burnt orange' }, { id: '#475569', name: 'Gunmetal' }, { id: 'factory', name: 'Factory' },
];
export const RIMS = [{ id: 'factory', name: 'Stock' }, { id: 'sport', name: 'Chrome sport' }, { id: 'black', name: 'Gloss black' }];
export const TINTS = [{ v: 0, name: 'None' }, { v: 25, name: 'Light' }, { v: 45, name: 'Dark' }, { v: 70, name: 'Limo' }];
export const STYLE_COST = { paint: 35_000, rims: 60_000, tint: 25_000 }; // mirrors /api/vehicles, display only
