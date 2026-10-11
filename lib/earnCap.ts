import type { Prisma } from '@prisma/client';
import { dayStart } from './goals';

/* Daily income limits for repeatable, minted income (money that comes from nowhere, not from another player).
   Pay is computed on the SERVER from the player's own EARN rows since midnight WAT, so it needs no migration and cannot be bypassed from the browser.
   Two layers:
   1. Diminishing returns: each block of `size` runs pays a smaller share of the base pay (tiers).
   2. A hard ceiling on the group's total pay per game day (`dailyMax`). When it is reached the pay is 0 and the action is refused.
   Tune everything here. The day rolls over at midnight Nigerian time, same as the daily missions. */
export type CapTier = { upTo: number; mult: number };   // runs 1..upTo today pay `mult` of base (upTo = Infinity for the last tier)
export type CapGroup = { id: string; label: string; where: Prisma.TransactionWhereInput; tiers: CapTier[]; dailyMax: number };

export const HOME_JOBS: CapGroup = {
  id: 'homejob', label: 'home work',
  where: { description: { in: ['work', 'hustle', 'bizplan'] } },
  tiers: [{ upTo: 6, mult: 1 }, { upTo: 12, mult: 0.5 }, { upTo: 18, mult: 0.25 }, { upTo: Infinity, mult: 0.1 }],
  dailyMax: 120_000,
};
export const DRIVER_FARES: CapGroup = {
  id: 'driverfare', label: 'driver fares',
  where: { description: { startsWith: 'driver-fare' } },
  tiers: [{ upTo: 12, mult: 1 }, { upTo: 24, mult: 0.5 }, { upTo: 36, mult: 0.25 }, { upTo: Infinity, mult: 0.1 }],
  dailyMax: 120_000,
};

export type EarnQuote = { pay: number; mult: number; runs: number; earned: number; remaining: number; capped: boolean; note: string };

const round50 = (n: number) => Math.round(n / 50) * 50;
const naira = (n: number) => '₦' + n.toLocaleString('en-NG');

/** What the NEXT run of this group is worth to this player right now. Pass the transaction client when you hold the player's row lock. */
export async function quoteEarn(db: Pick<Prisma.TransactionClient, 'transaction'>, userId: string, g: CapGroup, base: number, now = Date.now()): Promise<EarnQuote> {
  const agg = await db.transaction.aggregate({ where: { userId, type: 'EARN', createdAt: { gte: dayStart(now) }, ...g.where }, _count: { _all: true }, _sum: { amount: true } });
  const runs = agg._count._all, earned = agg._sum.amount ?? 0, remaining = Math.max(0, g.dailyMax - earned);
  const mult = (g.tiers.find(t => runs < t.upTo) ?? g.tiers[g.tiers.length - 1]).mult;
  const pay = Math.min(remaining, Math.max(0, round50(base * mult)));
  const capped = remaining <= 0;
  const note = capped ? `Daily ${g.label} limit reached (${naira(g.dailyMax)}). Come back after midnight.`
    : pay < round50(base) ? `Reduced pay (${Math.round(mult * 100)}%${pay < round50(base * mult) ? ', daily limit' : ''}) - you have done a lot of ${g.label} today.` : '';
  return { pay, mult, runs, earned, remaining, capped, note };
}

/** Lock the player's Save row so two parallel requests cannot both read the same "runs so far" and both be paid at the higher rate. */
export const lockPlayer = (tx: Prisma.TransactionClient, userId: string) => tx.$queryRaw`SELECT 1 FROM "Save" WHERE "userId" = ${userId} FOR UPDATE`;
