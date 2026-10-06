# Update: origins, popularity, calmer HUD

## Run these first
1. Supabase > SQL Editor: run `prisma/setup-database.sql`, then `prisma/fix-database.sql` (safe to re-run).
2. Redeploy (the build runs `prisma generate`).

## What changed
- **Wheel of Luck (sign-up only)**: when you create an account the server spins LAPO (poor, ₦50,000) or NEPO (rich, ₦5,000,000)
  and stores it on the account (`User.origin`). The wheel is shown once, as part of sign-up, before the character creator.
  There is no way to re-spin or change it. 3 in 10 land on NEPO. Tune in `lib/profile.ts`.
- **Men and women now have different bodies** (`lib/humanRig.ts`): men get a broad V-shaped chest, wide shoulders, thicker neck/arms/legs;
  women get narrower shoulders, a small waist, bust, wider rounder hips, slimmer limbs, smaller hands/feet, lashes and a softer jaw.
- **No starting car**: players own a house only. The Car Dealer sells a car for ₦2,500,000 (`CAR_PRICE`).
  CAR/horn buttons and the E key only work once you own one.
- **Popularity (fame)**: bar top-right, tiers Nobody > Local > Known > Influencer > Elite.
  Earn: quests +3, shifts +2, helping a nearby player +4 (costs ₦5,000, goes to them), active play +1 per 10 min. Daily cap 120.
  🏆 Fame panel shows the ranking grouped into Elites / Influencers / Rising.
- **HUD declutter**: one ☰ dock (Map, Jobs, Shops, Quests, Fame, Me, Love, Crime); Enter and Help appear only when relevant.
  Install button is smaller and hides itself after 10 s.
- **Jobs list**: card layout with filter chips (near you / top paid / category) and the real pay per shift.
- Fixed: `City.tsx` never passed the nearby building up, so the 🚪 Enter button could not appear.

## Not done yet
- Timed city "events" that give fame (no event system exists yet).
- Existing players keep their cash but lose the car and start at 0 fame.
