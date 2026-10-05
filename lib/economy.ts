// Server-side price list. The browser never decides amounts, only which action it started.
export const ACTS: Record<string, { cost?: number; pay?: number }> = {
  cook: { cost: 1500 }, snack: { cost: 500 }, gen: { cost: 2000 }, work: { pay: 6000 },
};
export const MIN_JOB_MS = 8000; // a paid gig can't be claimed faster than this (3x speed takes ~10s)
