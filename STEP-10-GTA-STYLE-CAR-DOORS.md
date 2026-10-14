# Step 10 — GTA-style automatic car doors

## Changes
- Added a smooth, frame-rate-independent driver door swing on the player's procedural car.
- Entering the car triggers the door to open while the avatar reaches for the handle, then closes after seating.
- Exiting triggers the door to open and closes it shortly after the avatar steps out.
- The door animation uses a custom browser event (`arl-car-door`) so the world interaction and rendered vehicle stay decoupled.

## Files changed
- `components/CityPeds.tsx`
- `components/CityWorld.tsx`

## Test
1. Run `npm run build`.
2. In the game, walk to the driver's side of the parked car and press E / Interact.
3. Confirm the driver's door swings outward, the avatar enters, and the door closes.
4. Press E to exit; confirm the door opens, the avatar appears beside the car, and the door closes.
5. Repeat on desktop and mobile.

Note: the current procedural car body includes a hinged driver-side door. Some imported GLB vehicle models render through a separate branch and may need their own door bones/meshes for identical animation. This change has not been tested in a live Vercel deployment.
