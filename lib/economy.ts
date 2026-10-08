// Server-side price list. The browser never decides amounts, only which action it started.
export const ACTS: Record<string, { cost?: number; pay?: number }> = {
  cook: { cost: 1500 }, snack: { cost: 500 }, gen: { cost: 2000 }, meal: { cost: 1000 }, order: { cost: 6500 }, work: { pay: 6000 }, hustle: { pay: 3500 }, bizplan: { pay: 14000 }, famdinner: { cost: 3000 }, datenight: { cost: 8000 },
};
export const MIN_JOB_MS = 8000; // a paid gig can't be claimed faster than this (3x speed takes ~10s)
