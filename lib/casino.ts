/* Casino: in-game cash only, with hard limits. Shared by the server (/api/casino is the authority: RNG, money, limits) and the client (display).
   Tune every number here. */

/* ───────── limits ───────── */
export const MIN_BET = 10_000, MAX_BET = 500_000;
export const BET_CHIPS = [10_000, 25_000, 50_000, 100_000, 250_000, 500_000];
export const LIMIT_DEFAULT = 2_000_000;   // max NET LOSS per game day (resets at midnight Nigerian time)
export const LIMIT_MIN = 100_000, LIMIT_MAX = 10_000_000;
export const RAISE_DELAY_MS = 24 * 3600_000; // lowering your limit is instant; raising it only takes effect after 24h
export const BREAK_MS = 24 * 3600_000;       // "take a break": the casino is closed to you for 24h and it cannot be undone
export const MAX_WIN = 20_000_000;           // most a single round can pay out
export const REALITY_EVERY = 10;             // the client interrupts every N rounds with a session summary
/** Safety switch: game money can be bought with real money (Paystack), so by default anyone who has EVER topped up is kept out of the casino.
    Set to false only if you are sure that is legal and allowed by your app stores. */
export const BLOCK_IF_TOPPED_UP = true;

/* ───────── slots (about 92% return) ───────── */
export const SYMBOLS = [
  { s: '🍒', w: 30, x3: 5 }, { s: '🍋', w: 25, x3: 8 }, { s: '🔔', w: 18, x3: 15 }, { s: '🍉', w: 14, x3: 25 }, { s: '⭐', w: 9, x3: 50 }, { s: '7️⃣', w: 4, x3: 150 },
];
export const SLOT_TWO_CHERRY = 1.5, SLOT_ONE_CHERRY = .4;
export function slotMult(r: string[]): number {
  if (r[0] === r[1] && r[1] === r[2]) return SYMBOLS.find(x => x.s === r[0])?.x3 || 0;
  const ch = r.filter(x => x === '🍒').length;
  return ch === 2 ? SLOT_TWO_CHERRY : ch === 1 ? SLOT_ONE_CHERRY : 0;
}

/* ───────── roulette (European, single zero: about 97.3% return) ───────── */
export const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const colorOf = (n: number) => n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black';
export type RoulettePick = { type: 'red' | 'black' | 'even' | 'odd' | 'low' | 'high' | 'number'; n?: number };
export function rouletteMult(p: RoulettePick, n: number): number {
  if (p.type === 'number') return p.n === n ? 36 : 0;
  if (n === 0) return 0;
  const win = p.type === 'red' ? REDS.has(n) : p.type === 'black' ? !REDS.has(n) : p.type === 'even' ? n % 2 === 0 : p.type === 'odd' ? n % 2 === 1 : p.type === 'low' ? n <= 18 : n >= 19;
  return win ? 2 : 0;
}

/* ───────── dice: roll 1-100, win if the roll is UNDER your target (97% return) ───────── */
export const DICE_MIN = 3, DICE_MAX = 95;
export const diceChance = (t: number) => (t - 1) / 100;
export const diceMult = (t: number) => Math.floor(.97 / diceChance(t) * 100) / 100;
