# Step 1: getting drunk and high

Run after pulling: `npm run db:migrate:deploy` (applies 0016_intoxication), then `npm run db:generate`.

## What it does
- `Save.drunk` and `Save.high` (0-100) are server-owned and fade over time (drunk -3/min, high -4/min, see `lib/intoxication.ts`).
- Inside a **Nightclub, Restaurant or Hotel** a 🍹 Drinks button opens a bar menu (palm wine, lager, whisky, champagne). `/api/intox` charges the money and raises your level.
- Smoking: `/api/intox {action:'smoke'}` uses one `drug_weed` item from your inventory. Nothing sells weed yet; the dealers arrive in **Step 2**, and until then the smoke button stays hidden.
- Screen effect (blur, hue shift, sway) scales with your level; a small tag shows buzzed / drunk / wasted. `GAME.drunk` and `GAME.high` are exposed for the world to use.
- Reaching 100 = blackout: the server flags it and the client applies an energy/fun crash.

## Not done yet
- Walking sway and slower movement are not applied to the 3D controls yet (`effects()` already returns `sway` and `speed`). Hooking that into CityWorld's movement loop is the next small piece.
- Drunk driving / being easy to rob while passed out comes with Steps 3-4.
- Not run in a browser or against a database here.
