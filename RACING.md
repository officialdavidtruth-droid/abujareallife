# Street racing + car tuning + paint shop

NEW:  lib/racing.ts, app/api/race/route.ts, components/Racing.tsx
EDIT: components/GameLayer.tsx (☰ 🏁 Racing menu entry + panel)
No database migration, no new packages.

How it works
- ☰ Racing → pick one of your cars. Three tabs: 🏁 Race, 🔧 Tune, 🎨 Style.
- Race: 3 tiers (Street Run ₦500k, Club Night ₦2M, Kings of Abuja ₦5M entry) against 3 hidden opponents.
  Lights → tap GO on green (reaction time) → three gear changes (tap SHIFT in the green zone). Your car, tuning, driving skill and
  inputs decide your time; the server ranks you against the opponents it rolled when you entered. 1st wins 2x (1.8x in Kings), 2nd gets the entry back.
- Every race: +heat (6/8/10, wanted at 40), -6% fuel, -1% condition (-2% if last), +driving XP. Needs 15% fuel and 25% condition.
- Tune: Engine / Tyres / Lightweight kit, 3 levels each, per car. Stored in a hidden inventory row "tune_<vehicleId>".
- Style: paint, rims, tint through the existing /api/vehicles actions (same prices). Shows a live preview.
- Safety rails (lib/racing.ts): 12 races/day, 45s cooldown, net profit capped at ₦8M/day (beyond that a win only refunds the entry),
  a race that "finishes" in under 6s is rejected, one ticket pays once. Entry is charged at start; abandoning a race loses it.
- Race ticket and daily log are hidden inventory rows ("race_ticket", "race_day", quantity 0), like Goals claims.

Tuning: everything (prices, tiers, AI speed, caps, wear) is in lib/racing.ts.
Note: like the job mini-games, the browser reports the inputs (reaction + shift accuracy). Their effect on your time is small (about 1.3s at best)
and the daily caps bound any abuse.
