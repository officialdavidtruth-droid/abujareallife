# Wuse Market Tail (stealth mission)

Copy this folder over your project root (same paths, overwrite when asked). No database or schema change, no new packages.

## Files
- lib/missions.ts (replaces) adds the `tail` mission, the `TailSpec` type and the tuning table `TAIL_RULES`
- lib/tailRoute.ts (new) all the rules: route planning, dealer movement, alertness, win/lose
- components/TailTarget.tsx (new) the dealer's black SUV in the 3D scene
- components/TailHud.tsx (new) distance, alertness bar and hints on screen
- components/MissionsCombat.tsx (replaces) wires the tail stage into the mission flow
- components/CityWorld.tsx (replaces) mounts the car; a stage with no waypoint now clears the old route
- components/CityUi.tsx (replaces) the dealer shows as a cyan dot on the minimap

## How it plays
1. Open Missions (M) and start **Wuse Market Tail**. A black SUV is parked outside Wuse Supermarket.
2. Go there. After 6 seconds he drives off: Garki Restaurant (parks 14 s), then Maitama Hotel (the handover).
3. Follow him. Alertness rises when you are closer than 12 m, in front of him, or near him while he is parked. It cools when you keep a safe distance.
4. Win: at the handover, watch from 12-55 m for 6 seconds. Reward ₦48,000.
5. Lose: alertness hits 100% (spotted), you stay over 100 m away for 8 s (lost him), any gunshot within 90 m, or the 10-minute deadline.

## Tuning
Everything is in `TAIL_RULES` in lib/missions.ts (distances, rates, lose time, witness time). The route is the `tail` entry on the mission (stops, wait times, speed, car model).

## Checked
Type-checks with no errors in the files above. The rules were also run in a simulation: following at 35-55 m wins in about 93 s after the car sets off; standing still loses him; staying 6 m away, 20 m away, or firing a shot gets you spotted.

## Not done / known limits
- The server only checks the usual minimum time and deadline (same as every other mission); it cannot see the tail itself.
- The dealer is not on the big map, only the minimap and in the world.
- If you reload mid-mission the contract restarts from stage 1 (same as the other multi-stage missions).
- Existing issue, not changed: the Wuse Delivery mission points at a building called "Wuse Market", which does not exist in the city data, so it gets no waypoint. Use `{ name: 'Wuse Supermarket' }` there.
