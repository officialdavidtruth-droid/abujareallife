/* Wallet top-up packages: real money (₦, paid through Paystack) -> in-game money (added to the player's cash).
   The SERVER is the only place that decides what a payment is worth: the client just names a package id. */
export type TopUp = { id: string; naira: number; coins: number; tag?: string };
export const TOPUPS: TopUp[] = [
  { id: 'p5k', naira: 5_000, coins: 80_000 },
  { id: 'p10k', naira: 10_000, coins: 170_000 },
  { id: 'p25k', naira: 25_000, coins: 400_000 },
  { id: 'p37k', naira: 37_000, coins: 585_000 },
  { id: 'p50k', naira: 50_000, coins: 1_500_000, tag: 'Popular' },
  { id: 'p100k', naira: 100_000, coins: 10_000_000, tag: 'Best value' },
];
export const topUpById = (id: unknown) => TOPUPS.find(t => t.id === id);
export const toKobo = (naira: number) => Math.round(naira * 100);
