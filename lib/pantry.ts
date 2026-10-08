/* Pantry: groceries and toiletries you buy at the Market, Supermarket or Pharmacy fill two counters. Cooking, showering etc. use them up.
   Stored as hidden inventory rows (like home upgrades), so no database migration is needed and they never show up as sellable stuff. */
export const MEALS_KEY = 'pantry_meals', SUPPLIES_KEY = 'pantry_supplies', PANTRY_MAX = 400;
export type Use = { meals?: number; supplies?: number; soft?: boolean }; // soft = you can still do it when the supplies run out, just worse
/** What each home action uses up. Keys are the action ids in components/Sim.tsx. */
export const USES: Record<string, Use> = {
  cook: { meals: 1 }, snack: { meals: 1 }, meal: { meals: 1 }, famdinner: { meals: 4 },
  shower: { supplies: 1, soft: true }, wc: { supplies: 1, soft: true },
};
