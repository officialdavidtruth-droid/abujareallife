import type { BusinessType } from './cityTypes';
import { JOINT_ITEM } from './intoxication';

/* Weed trade between you and two NPC dealers in DIFFERENT places. The supplier sells you stock; the buyer pays more for it.
   Prices drift every 15 minutes (deterministic, so server and client agree), the buyer's price drops if you flood him,
   and every deal adds heat and carries a bust risk. All rules live here; /api/dealer is the only writer. */
export type DealerRole = 'supplier' | 'buyer';
export type Dealer = { id: string; role: DealerRole; name: string; e: string; at: BusinessType; line: string };
export const DEALERS: Dealer[] = [
  { id: 'npc:plug', role: 'supplier', name: 'Mama Put', e: '🌿', at: 'Market', line: 'Back of the stall. Cash only, no questions.' },
  { id: 'npc:corner', role: 'buyer', name: 'Slim', e: '🕶️', at: 'Nightclub', line: 'I move it through the club. Bring me product.' },
];
export const dealerAt = (type: string) => DEALERS.find(d => d.at === type) || null;

export const ITEM = JOINT_ITEM;
export const ITEM_NAME = 'Weed (joint)';
export const BUY_RANGE: [number, number] = [5_000, 7_000];      // supplier price per unit
export const SELL_RANGE: [number, number] = [9_000, 13_000];    // buyer price per unit before saturation
export const MAX_PER_DEAL = 10;
export const SAT_WINDOW_MS = 10 * 60_000, SAT_PER_UNIT = 0.04, SAT_FLOOR = 0.55;   // each unit sold in the last 10 min cuts the price 4% (min 55%)
export const HEAT_BUY = 2, HEAT_SELL = 5;                        // heat per unit
export const BUST_BASE = 0.06, BUST_PER_HEAT = 0.002, BUST_PER_UNIT = 0.01, BUST_MAX = 0.6;
export const BUST_HEAT = 30;                                     // extra heat when busted (goods are seized, no money)

const bucket = (now: number) => Math.floor(now / (15 * 60_000));
const wave = (b: number, salt: number) => { const x = Math.sin(b * 12.9898 + salt * 78.233) * 43758.5453; return x - Math.floor(x); };   // 0..1
export const buyPrice = (now = Date.now()) => Math.round(BUY_RANGE[0] + (BUY_RANGE[1] - BUY_RANGE[0]) * wave(bucket(now), 1));
export const sellBase = (now = Date.now()) => Math.round(SELL_RANGE[0] + (SELL_RANGE[1] - SELL_RANGE[0]) * wave(bucket(now), 2));
export const saturation = (soldRecently: number) => Math.max(SAT_FLOOR, 1 - soldRecently * SAT_PER_UNIT);
export const sellPrice = (soldRecently: number, now = Date.now()) => Math.round(sellBase(now) * saturation(soldRecently));
export const bustChance = (heat: number, qty: number) => Math.min(BUST_MAX, BUST_BASE + heat * BUST_PER_HEAT + qty * BUST_PER_UNIT);
