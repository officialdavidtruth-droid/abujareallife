# Step 9: house break-ins and home security

## How it plays
- **Break in**: walk up to any house that is not yours. A 🔓 **Break in** button appears (or press **E** at the door) with a chip showing who is on guard
  (🐕 dogs, 💂 guards, 🛡️ armed guard) and a risk label: Easy target / Risky / Dangerous / Fortress.
  A lock bar fills for 8 s while you stand at the door (walk away and it cancels).
- **In**: you take 20% of the owner's cash (max ₦400k), +30 heat, the owner gets a "broke into your house" message (same 🚨 robbery message as a mugging),
  and that house is safe from break-ins for 15 min. Under ₦5k there is nothing worth taking (+15 heat).
- **Caught by guards**: +45 heat. If the house has any guards you are knocked down (15 s, or 30 s with an armed guard) and the owner is told who it was.
  With no guards the only way to fail is a neighbour spotting you (heat, no knockout).
- **Fortify**: menu -> **🛡️ Home security**. Guard dog ₦1.5M (max 2), Security guard ₦4M (max 2), Armed response guard ₦9M (max 1, needs a guard first).
  Chance a burglar gets in: no guards 80%, 1 dog 64%, 2 dogs 48%, dog + guard 36%, full team 6% (floor). Stealth skill adds up to +12% for the burglar.
- **Alerts**: if the house has guards, the owner's phone gets "🚨 your dogs spotted someone working on your front door" the moment the lock starts
  (once a minute at most). Guards also reveal the burglar's name; dogs alone do not.
- **You can see them**: dogs circle the house, guards pace the front yard, the armed guard watches the door. The house sign shows 🐕×2 💂×1.
  Only the nearest 8 watched houses get actors, so phones stay smooth.

## Server rules (everything is decided on the server)
- Two steps like the shop hold-up: `start` gives a signed ticket, `finish` rolls the outcome (server-only key, client cannot see or pick it).
  `finish` must come after the 8 s wait and within 2 min, the ticket works once, and your last reported position must be at the door both times.
- Robbery cooldown is shared with the other robberies: `burgle` is now a kind in `ROB_KIND_COOLDOWN_MS` (120 s), so one cooldown covers street mugging, carjacking and break-ins.
- No migration: guards are hidden inventory rows `sec_dog`, `sec_guard`, `sec_armed` (quantity = how many), like the `home_*` upgrades. Break-in markers are `Crime` rows.

## Files
- NEW `lib/security.ts` (prices, limits, odds, `BREAKIN` numbers), NEW `lib/burgle.ts` (ticket + roll)
- NEW `app/api/security/route.ts` (buy guards), NEW `app/api/burgle/route.ts` (start / finish)
- NEW `components/BreakIn.tsx` (button, lock bar), NEW `components/HomeSecurity.tsx` (guard shop)
- EDITED `lib/houses.ts` (houses carry `sec`), `app/api/houses/route.ts` (sends each house's guards), `lib/profile.ts` (one cooldown entry),
  `components/PlayerHouses.tsx` (patrols + guard line on the sign), `components/CityWorld.tsx` (E at a stranger's door),
  `components/GameLayer.tsx` (mounts BreakIn), `components/Sim.tsx` (menu button + modal)
- No `prisma/schema.prisma` change and no new SQL.

## Tuning
All numbers are in `lib/security.ts`: `GUARDS` (price, max, power) and `BREAKIN` (lock time, loot %, cap, heat, shield, KO multiplier).

## Tested here
- Odds maths (`winChance`, `riskLabel`, row/pack helpers) run under `tsc --strict` with the table above.
- Every changed file parses. I could NOT run the full Next build or the API routes here (no node_modules, no network), so deploy and try it: buy a dog, then break into a friend's house.

## Known limits
- Loot comes out of the owner's cash even when they are offline (capped at ₦400k, 15 min shield per house). If that feels harsh, lower `pct` / `lootMax`.
- Guards have no wages and cannot be shot, killed or sold back yet.
- Houses reload every 90 s, so other players may take up to a minute and a half to see a brand-new guard (your own screen updates at once).
