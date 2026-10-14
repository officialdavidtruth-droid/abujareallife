# Step 9 — Helicopter integration, collision and multiplayer

This update builds on Step 8 and connects the helicopter to ownership and garage state while adding client multiplayer pose replication and low-altitude building collision checks.

## Implemented in source

- The game reads the signed-in player's owned vehicles and enables helicopter boarding only when a `HELICOPTER` vehicle is owned.
- Boarding calls the authenticated `/api/vehicles` `takeout` action. The server verifies ownership, fuel and condition before releasing the aircraft from its parked state.
- Safe exit calls the existing `park` action and stores the helicopter at `Airport Helipad`.
- Helicopter pose is included in the existing city position broadcast (x, z, heading, altitude, pitch, roll, speed and vertical speed). Remote clients interpolate the pose and render the aircraft rather than a walking avatar.
- Low-altitude movement is blocked by building footprints using the city building dimensions. Impact requests use the existing server-side vehicle collision damage action with a cooldown to avoid a request every frame.
- A visible seated pilot proxy is rendered while flying and follows the aircraft with a subtle vibration/bob.

## Manual runtime test plan

1. Install dependencies with `npm ci`; ensure database and Supabase environment variables are configured.
2. Run `npx prisma generate`, then `npm run build`.
3. Sign in with a character that owns a helicopter, open the city, and approach the airport helipad.
4. Press `E`; verify the API succeeds and the seated pilot appears.
5. Hold `Shift` for take-off, release it to hover, steer with `W/S` and `A/D`, then descend with `Space`.
6. Test low-altitude approach to a building; verify the helicopter stops and the owned vehicle's condition/damage changes no more than once per impact cooldown.
7. Land, stop, press `E`, and verify the helicopter is parked in the garage state at `Airport Helipad`.
8. Open a second browser session in the same city room. Verify it sees the flying helicopter interpolate smoothly, and that the pilot avatar is not duplicated on foot.
9. Repeat on mobile touch controls and test exiting while airborne (must be blocked).

## Verification status / limitations

The modified TypeScript/JSX files passed TypeScript transpilation syntax checks. A full `tsc`/Next production build and live multiplayer test could not be completed in this environment because `node_modules` is not installed. The existing Supabase city broadcast is client-originated, so this is pose replication, not server-authoritative flight simulation; authoritative server-side flight validation would be a separate hardening task. Building collision uses building footprints and approximate building heights, not a full 3D physics collider. The pilot is a lightweight procedural seated proxy, not a rigged animation.
