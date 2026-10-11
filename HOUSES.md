# Player houses on the street

Every account has a house with its name on it, standing along the outer ring road with a driveway (GTA style).

- Drive or walk to your house. Park on the driveway, walk to the front door, press **E** (prompt: "E — Enter your house").
- Other players' doors show "🔒 name's house".
- Stepping out of your house (door, 🏙️ button, free-will work trip) puts you at your own front door; your car is delivered to your driveway the first time.
- Your house has a gold beacon and a ring at your door. Map → "📍 Route home" shows the way.
- Houses are solid for walking, cars and the route planner.

## How slots work (no database change)
`GET /api/houses` gives accounts a plot in sign-up order (first `PLOT_COUNT` accounts, currently 105).
Plot geometry is in `lib/houses.ts` (pure data, same on client and server). Lots on chop yards, the airport, lamp posts and utility poles are skipped.
If accounts before yours are deleted, later houses shift down. Accounts past `PLOT_COUNT` have no house yet and keep using the 🏠 Go home button.

## Files
- NEW `lib/houses.ts`, `app/api/houses/route.ts`, `components/PlayerHouses.tsx`
- EDITED `components/CityWorld.tsx`, `components/Sim.tsx`, `components/City.tsx`, `components/cityShared.ts`, `lib/cityNet.ts` (position clamp 150 → 210 so players at the houses are not pinned at 150 m for everyone else)
