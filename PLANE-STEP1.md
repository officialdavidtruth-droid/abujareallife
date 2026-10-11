# Plane — STEP 1: the plane flies (single pilot)

Copy over the project root (same paths). No new npm packages, no database change.

NEW:  components/cityPlane.tsx
EDIT: components/CityWorld.tsx (plane rendered, E to board, flight block, ground enlarged), components/CityScenery.tsx (longer runway + centre-line dashes)

## How to fly
- Walk to the plane on the runway (east edge of the city, Nnamdi Azikiwe Airport) and press **E**.
- **Shift** (hold) throttle up · **Space** (hold) throttle down / wheel brake · **W / S** nose down / up · **A / D** bank (turns in the air, steers on the ground).
- Phone: **Sprint** = throttle up, **Jump** = throttle down, joystick = pitch + bank.
- Roll past ~95 km/h and pull back (S) to take off. Below ~80 km/h in the air the plane stalls and the nose drops: add throttle.
- The nose HOLDS where you leave it (drifts back to level slowly), so a gentle descent is easy: tap W, then flare with S just above the ground.
- Land with a low sink rate, wings level, then hold Space. Below 8 km/h on the ground press **E** to step out.
- Hitting a building or a hard landing = crash: the plane is towed back to the runway and you are put beside it.
- A plane left away from the runway is towed back after 90 s.
- Speed / altitude / throttle show in the hint line at the bottom.

## Not in this step (coming next)
- STEP 2: cockpit (inside) and chase (outside) camera, toggled with a key / button. `PLANE.cam` already exists for it.
- STEP 3: other players see the plane fly, and several players can board the same plane (re-using the seat handshake in `cityPax.ts`).
- Right now other players still see your walking avatar sliding along the ground while you fly. That is fixed in step 3.
- No engine sound yet.

## Notes
- The runway was lengthened eastward (into open ground) to 180 m. The airport's reserved zone for player houses in `lib/houses.ts` was NOT touched on purpose: house plots are numbered in order, so changing it would shift existing players' homes.
- The ground plane is now 1900 m wide so you can fly out of the city; the flyable limit is `FLY_LIM` (850 m) in `cityPlane.tsx`.
- Tuning knobs at the top of `cityPlane.tsx`: `ROTATE`, `STALL`, `VMAX`, `CEILING`, and the thrust/drag numbers in `stepPlane`.
- Tested: type-checks, and a headless simulation of take-off, climb, turn, landing, braking and exit. I could not run the game in a browser from here, so please fly it once and tell me how it feels before step 2.
