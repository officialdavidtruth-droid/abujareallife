# Step 5: shop hold-ups (timed, with police response)

Run after pulling: `npm run db:migrate:deploy` (applies 0018_holdup: an index on `Crime(kind, createdAt)`), then `npm run db:generate`.
No new columns. Cooldowns and results are stored as `Crime` rows (`holdup:<shopId>`, `holdup_win`, `holdup_caught`, `holdup_fled`).

## How it plays
1. Walk into any shop type that had the old "Rob the till" (Supermarket, Pharmacy, Market, Petrol Station, Restaurant, Salon, Barber, Car Dealer, Cinema, Gym).
   The counter spot now says **Counter (hold-up)** with **🔫 Hold up the clerk**. Banks keep the vault job.
2. **Heat goes on immediately** (+45, so you are WANTED from the moment you pull it; NPC patrols and police players can come for you).
3. A HUD shows the bag filling for **20 s**. You can **🏃 Take it & run** after 5 s for a partial share (0% at 5 s, 100% at 20 s), or wait for the full haul.
   Walking out the door counts as running.
4. **The police arrive at a secret time** (14-38 s, rolled by the server):
   - +1.5 s per stealth level (max +8 s);
   - -25% for every police PLAYER online (max -50%).
   If they get there before you finish: you are **arrested**, the haul is gone, +20 heat, 10% cash fine and jail time from your heat.
   Beating them pays the haul (₦40k-160k, set per hold-up) and a little stealth XP.
5. After a win you are still WANTED: leave before the NPC patrol reaches you.

## Limits and cooldowns (database-backed, `lib/profile.ts` -> `HOLDUP`)
- One hold-up per player per **5 min**, and a shop's till stays empty for **10 min** after anyone robs it.
- Officers cannot do it; you cannot do it while out cold or in jail.
- The old instant till grab (`/api/crime` kind `rob_shop`) is disabled: it had no time limit and no risk of being caught inside.

## Why it cannot be cheated from the browser
The ticket only says who/where/when. The police time and the loot size are derived on the server with a key the client never sees,
and `/api/holdup` checks that you are still inside that shop, the ticket was not used before, and it is not older than 90 s.

## Not done / honest limits
- Closing the app mid hold-up pays nothing, but the heat stays and the shop's cooldown has started.
- Police players are not told a hold-up is happening; they only see you on the wanted board.
- Shop staff and managers do not react. The "police on the way" text is flavour: the real arrival time is hidden.
- Not run in a browser or against a database here; type-checked only (the Prisma client could not be generated offline).
