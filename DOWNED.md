# Step 4: knocked out / passed out, easy to rob, safe window after waking

Run after pulling: `npm run db:migrate:deploy` (applies 0017_down_state: `Save.downUntil`, `Save.downKind`), then `npm run db:generate`.

## The states (rules in `lib/downed.ts`, owned by the server)
- **Down** (`now < downUntil`): you lie on the ground and cannot move, fight, rob, carjack, shoot or drink.
  - Knocked out by punches: **15 s** (was 10 s on the client).
  - Passed out from drink or weed (hitting 100): **45 s**. You wake groggy: drunk/high are capped at 60.
- **Safe** (8 s after waking, same as the respawn protection): cannot be robbed, shot or hit.
- Header HUD shows `😵 Knocked out: wakes in Ns` / `🥴 Passed out: wakes in Ns`, then `🛡️ Protected Ns`.

## Robbing someone who is out cold
- `/api/rob` takes **50%** of their cash (max **₦300k**) instead of 30% / ₦150k. The button reads `💰 Rob NAME (out cold)`.
- Freshly woken players do not get a rob button, and the server refuses it anyway.
- A robbed player is also shielded for 120 s (step 3), so one person cannot be looted over and over. They get the "robbed you ... while you were out cold" message.
- `/api/shot` refuses shots at a player in the safe window.

## Passing out in a bar
If a drink or joint takes you to 100 inside a venue, security drags you out to the street (the building exit) and you lie there for
the full 45 s. That is what makes it dangerous: players outside can rob you.

## Why the server owns the timer
- `/api/status` returns `downLeft`, `safeLeft`, `downKind`; the game copies them onto the local player, so refreshing the page does not cancel a knockout.
- Passing out is set by `/api/intox` itself.
- Punch knockouts are still detected in the victim's browser (fights are client-side), which then calls `/api/down`. To stop anyone
  calling it on purpose to earn the safe window, a new report is ignored until 60 s after the previous knockout ended
  (`DOWN_REPEAT_MS`). Tradeoff: a second, honest KO inside that minute is not "out cold" on the server.

## Not done / honest limits
- Being KO'd by punches in a fight is still decided on the client, so the server only trusts it with that cooldown.
- A player inside a building cannot be robbed (interiors are solo), which is why blackouts there end on the street.
- Not run in a browser or against a database here; type-checked only (Prisma client could not be generated offline).
