# Step 7: street crime in the world

No database migration. No new packages. Replace the files listed at the bottom, then `npm run build`.

## What changed

### 1. Point-and-demand robbery (pedestrians)
- Pull your gun out (G). Pedestrians now react to a **drawn** gun, not only after you fire (Step 5 needed a shot in the last 6 s).
- Aim at someone within 5 m until their **hands go up**. A **🔫 Demand their cash** button appears (it replaces Pickpocket / Mug for that person).
- The server decides the result (`/api/crime`, kind `demand_npc`): loot ₦60k–180k, +50 heat, 75 s cooldown, needs a gun in your inventory, witnesses add heat like other street crimes.
- The pedestrian then plays it out:
  - **robbed** → holds the cash out toward you for 1.7 s ("Take am, take am!"), then runs.
  - **failed + brave** → squares up and shouts ("You think say I be small boy?!"). You are WANTED.
  - **failed + anyone else** → bolts without paying ("Help! Armed robber!"). You are WANTED.
- Other pedestrians who saw it react as in Step 5 (flee, film, call the police), and a witness call sends a patrol (Step 6).

### 2. Stolen cars: the owner reacts
- Carjack an AI driver (street button): after being thrown out, the owner **gets up and chases you** for 7 s (on foot, ~5 m/s, follows your car too), shouting ("My car! Thief!").
- Then stops, says "Hello? Police!", and 3 s later **phones the police** from where they stand. That fires the Step 6 event, so a patrol car is dispatched to that spot.
- Chop-shop theft (🔧 Steal it for the chop shop): the owner also phones the police after ~10 s (no body on screen there), same patrol dispatch.
- Carjacking a real player is unchanged (their own character reacts).

### 3. Shop clerks in a hold-up
- During a hold-up the clerk (nearest staff member) **puts their hands up**; other non-patrol staff do too.
- **25% of clerks keep a gun** (stealth lowers it to a minimum of 8%). The server rolls it per hold-up and tells the client WHEN the gun comes out (6–14 s in), never the police time or the loot.
- 2.5 s before that moment the clerk reaches under the counter, you get a warning ("RUN!"). **Press 🏃 Take it & run before then** and you keep the partial share.
- If you are still there when the gun comes out the server resolves it: **haul gone, knocked out for 15 s, thrown out of the shop, 5% hospital bill, +10 heat**. The client also lies you down (`goDown`).
- The police arrival time still works as before and wins if it is earlier.

## Files
- NEW `STEP7-STREET-CRIME.md`
- EDITED `lib/profile.ts` (demand_npc, DEMAND_RANGE, clerk numbers in `HOLDUP`, owner timings), `lib/witness.ts` (PEDSTATE, aimedAt, demandResult, owner speech + alarm, `give` reaction), `lib/holdup.ts` (clerk in `holdupPlan`), `lib/humanRig.ts` (`handsup`, `reach` poses)
- EDITED `app/api/crime/route.ts` (gun check for demand_npc), `app/api/holdup/route.ts` (clerk info on start, shot on finish)
- EDITED `components/CrimeActions.tsx`, `components/CityWorld.tsx`, `components/Interior.tsx`, `components/ChopShop.tsx`

## Tuning
`CRIMES.demand_npc`, `ROB_KIND_COOLDOWN_MS.demand_npc`, `DEMAND_RANGE`, `OWNER_CHASE_SECS`, `OWNER_REPORT_SECS`, `HOLDUP.clerk*` (all `lib/profile.ts`). Owner chase speed is `5.2` in `JackNpc` (CityWorld.tsx).

## Tested here
- `aimedAt` (front / behind / side), `demandResult`, and `holdupPlan` clerk roll: 24.5% armed at stealth 0, 9.1% at stealth 8, shot time always 6–14 s.
- Whole project type-checks with no errors in the edited files (the remaining errors are `Parameter implicitly has an 'any' type` because the Prisma client could not be generated offline).

## Known limits
- Not run in a browser or against a database. Please play it once: aim at a pedestrian, demand cash, carjack a car, hold up a shop.
- The demand button needs the pedestrian's hands to be up first; a brave pedestrian sometimes just freezes instead (Step 5 odds), so aim again or move on.
- A drawn gun now makes nearby pedestrians react all the time you hold it (before: only after shooting or reloading). Step 5's `brandishing` line in CityWorld.tsx is where to revert that.
- Loot, catch chance and heat are server-side, but "which pedestrian" and "who saw it" are client-reported (same as Steps 5–6); the server caps the effect.
- Armed-clerk timing is visible to the client by design (it is the warning); a modified client gains nothing from it because the shot is resolved on the server when you finish.
- The clerk's shot uses a short KO; there is no health bar or damage model in shops.
- The owner's chase does not hurt you and the owner stops at 45 m.
