# ARL Step 11 — Car Door Entry/Exit Fix

## Fixes
- Adds an animated hinged driver-side door to the GLB vehicle render path, which previously did not pass `doorRef` to any door object.
- Opens the driver's door before moving the player out of the vehicle, then closes it after the exit animation starts.
- Prioritizes the parked car prompt/interaction over nearby house-door interaction when the player is within the car interaction radius.

## Files changed
- `components/CityCars.tsx`
- `components/CityWorld.tsx`

## Test
1. Run `npm ci` and `npm run build`.
2. Start the game and approach a parked owned car near a house door.
3. Confirm the car prompt is shown instead of the house prompt while inside the car interaction radius.
4. Press E and confirm the driver-side door swings outward, the player enters, and the door closes.
5. Press E to exit and confirm the door opens before the player appears outside, then closes.

The GLB door is a procedural overlay because source GLBs do not consistently expose named/rigged door meshes. Its alignment may need per-model tuning. A full production build and live browser test were not run in this environment.
