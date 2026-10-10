# Step 2: crews, gangs & companies (players need each other)

Run after pulling: `npm run db:migrate:deploy` (applies `0019_crews`; it is also appended to `prisma/fix-database.sql` for the Supabase SQL editor), then `npm run db:generate`.
New tables: `Crew`, `CrewMember`, `CrewInvite`, `CrewMessage`, `CrewTurf`, `CrewEvent`, plus an index on `Transaction(type, createdAt)`. No existing columns changed.

## How it plays (open the dock → 🛡️ Crew)
- **Start one** for ₦250,000: pick Crew, Gang or Company, a name, a 2-4 letter tag, a motto, open or invite-only. Max 20 members, one crew per player.
  Leader > officers > members. Officers invite/kick members, claim turf and start wars; only the leader promotes, hands over leadership or drops turf.
  Invites also arrive as a phone message. When the leader leaves, the oldest officer (else oldest member) takes over; the last one out closes the crew.
- **Kinds are a real choice (they change how event points are counted):** Crew = street ×1 / honest ×1. Gang = street ×1.3 / honest ×0.8, and police cannot join. Company = honest ×1.3 / street ×0.5, and +25% turf income.
- **Treasury:** anyone can donate. Nobody can withdraw. It only pays for turf (₦3M) and wars (₦500k) and receives cup prizes and half the turf income.
- **Turf:** 11 districts, one crew each, max 4 per crew, needs 3+ members. Each district pays ₦120,000/hour: half to the treasury, half split between members seen in the last 24 h (so being online matters). Paid lazily when a member opens the panel, capped at 24 h of backlog. New turf is shielded 2 h.
- **Crew chat:** members only, polled every 2.5 s, system lines for joins/leaves/turf/wars/prizes, unread badge on the tab, 300 chars, spam limits.
- **Turf war (crew vs crew):** an officer picks a rival's district and pays ₦500k. It starts in 2 min and lasts 60 min. Both crews are scored on money their members earn in that window; attackers need 50+ points AND to beat the defenders (who get +5%). Win = the district moves to you, +25 rating (loser −10). One war per crew at a time, a district cools down 6 h after a war over it.
- **Crew Cup (every crew, daily, UTC):** every crew with 2+ members who joined *before* the day started competes. Top 3 get ₦2M / ₦1M / ₦500k in the treasury and +30/+20/+10 rating.
- **Leaderboard:** crews ranked by rating, then districts held, with today's live cup table beside it.

## Scoring (and why it is hard to farm)
Points = money earned in the window / ₦1,000, from shifts, quests, missions, races and uncaught crime loot (`Crime.loot`). It is read from the existing `Transaction` and `Crime` rows, so **no existing route had to change**.
Left out on purpose: gifts, sent money, market sales, club deals, rides, help tips, casino (crewmates could pass these around). Each member adds at most **600 points per event**, so one rich player cannot carry a crew and a bigger active roster wins. War rosters are frozen when war is declared; cup rosters only include people who joined before the day began.

## Why it cannot be cheated from the browser
Every rule (costs, roles, cooldowns, scoring, payouts) lives in `/api/crew*` and `lib/crewServer.ts`. Money moves are guarded updates inside transactions (no overdraft, no 32-bit overflow). Events settle lazily and exactly once: the status flip and the payouts share one transaction.

## Files
`lib/crews.ts` (all tunable numbers), `lib/crewServer.ts` (scoring, turf income, settlement), `app/api/crew/route.ts`, `app/api/crew/chat/route.ts`, `app/api/crew/board/route.ts`, `components/Crew.tsx` (phone-first panel), small edit in `components/GameLayer.tsx` (dock button + tab).

## Not done / honest limits
- Turf is a ledger, not a place: districts are not painted on the 3D map or the minimap, and holding one gives income only (no pay or heat perks yet).
- No friendly-fire rule: crewmates can still rob or knock each other out. Crew members are not shown with tags above their heads.
- Chat is polling, not push; the HUD does not ping for crew messages (only the tab badge inside the panel).
- Events settle when *anyone* hits a crew endpoint after the timer ends, so a result can appear a little late on a quiet server.
- Type-checked against a generated Prisma client (`tsc --noEmit` is clean). Not run in a browser or against a real database here, so the SQL migration and the UI are untested end to end.
