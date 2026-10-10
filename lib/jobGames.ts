/* Job mini-games: optional skill play during a shift. Shared by the server (/api/shift is the authority) and the client.
   The shift timer and base pay do NOT change. Playing well earns a capped pay bonus and extra skill XP at clock-out.
   Tune everything here. */
export type GameKind = 'cook' | 'drive' | 'repair';

export const GAME_LABEL: Record<GameKind, { e: string; name: string }> = {
  cook: { e: '🍳', name: 'Kitchen Rush' },
  drive: { e: '🚚', name: 'Delivery Run' },
  repair: { e: '🔧', name: 'Garage Fix' },
};

/** which mini-game a job gets (null = the job is just the classic timer) */
export function gameFor(bizType: string, jobTitle = ''): GameKind | null {
  if (/Taxi|Bike|Driver|Courier|Dispatch|Delivery/i.test(jobTitle)) return 'drive';
  if (bizType === 'Restaurant' || bizType === 'Hotel') return 'cook';
  if (bizType === 'Logistics') return 'drive';
  if (bizType === 'Mechanic') return 'repair';
  return null;
}

export const MAX_ROUNDS = 24;       // rounds that count per shift
export const MIN_ROUND_SECS = 10;   // the server refuses a result sooner than this after the previous one (stops spam)
export const PCT_PER_STAR = 2;      // each star = +2% of the shift pay ...
export const MAX_BONUS_PCT = 50;    // ... capped at +50%  (24 rounds x 3 stars = 72 stars; 25 stars already maxes it out)
export const bonusPct = (stars: number) => Math.min(MAX_BONUS_PCT, Math.max(0, Math.floor(stars)) * PCT_PER_STAR);
export const SCORE_KEY = 'shiftscore'; // hidden inventory row (quantity 0), one per user, holds { at, pts, rounds, last }
