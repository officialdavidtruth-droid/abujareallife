# Step 6: real police response

## What changed
- **Patrol cars (CityWorld.tsx, `PolicePatrol`, replaces `NpcPolice`)**: a witness phoning it in (event `arl-witness-report` from step 5) or you becoming WANTED
  sends a patrol car. It spawns on a road at least 60 m from the target and out of your sight, then DRIVES there on the real road grid
  (same `planRide`/`stepRide` the taxis use, ignores red lights, siren on). It parks, officers get out.
  - Crime but not wanted: 1 car, 1 officer who looks around the scene for ~16 s, then goes back and the car drives off.
  - Wanted: heat 40 / 70 / 110 -> 1 / 2 / 3 cars and 2 / 3 / 4 officers (max 5 cars, 4 officers alive).
- **Officers**: chase you (path-finding around buildings; straight at you when close with a clear view), sprint when far.
  Arrest = reach you (1.2 s), same as before, or box in your stopped car. You still cannot be arrested while riding a taxi/bus.
- **Line of sight**: buildings now block sight (`lib/police.ts lineBlocked`). Out of sight -> they run to your last seen spot, then SEARCH around it for 22 s, then walk back to their car.
- **Car chase**: if you run and a patrol car is parked far away, it re-plans a route to you. Police cars are solid for you (on foot and in a car) and AI traffic.
- **Roadblocks**: heat >= 110 while you drive fast: two police cars across the road ~60 m ahead for 35 s (once per 45 s). AI traffic stops for them too.
- **Heat cools when you hide**: once the police have lost you and nobody has seen you for 8 s, the client calls `POST /api/evade` every 12 s;
  the server takes 4 heat off each time (`EVADE_HEAT`, `EVADE_MIN_MS` in `lib/profile.ts`), on top of the normal 3 per minute. Heat, arrests and fines are still decided on the server.
- **Siren** that gets louder as a patrol car nears (`lib/cityAudio.ts sirenSet`).

## Files
- NEW `lib/police.ts` (numbers in `PATROL`, `carsFor`, `copsFor`, `lineBlocked`), NEW `app/api/evade/route.ts`
- EDITED `components/CityWorld.tsx`, `lib/profile.ts`, `lib/cityAudio.ts`, `components/GameLayer.tsx` (one hint sentence)
- `components/CityLook.tsx` (step 8) is included too, because `CityWorld.tsx` contains both steps' edits.

## Tuning
`PATROL` in `lib/police.ts` (ranges, search time, roadblock heat/life, park time). `EVADE_HEAT` / `EVADE_MIN_MS` in `lib/profile.ts`. Speeds are in `PolicePatrol` (`vmax`, `COP_SPEED`, `COP_CATCHUP`).

## Tested here
- `lineBlocked`, `carsFor`, `copsFor`: unit tests pass.
- Routes: 194 random dispatches from random kerbs to random targets all arrived (slowest 30 s), and every re-plan from the parked spot (chase / drive-off) also arrived.

## Known limits
- Not run in a browser, and `next build` was not run (no dependencies / network here). The TSX was only syntax-checked, so imports of three/react were not type-checked. Run `npm run build` and send me any errors.
- Positions are client-reported, so "line of sight" and "lost them" are client-side; the server only allows a small rate-limited cool-down per call.
- Real police players are unchanged. Cops do not enter buildings.
- The rate limit for `/api/evade` is in-memory (like your other routes), so on serverless it is best-effort.
- Officers can still catch on a building corner if the grid path-finder has no route; they fall back to heading straight at the target.
