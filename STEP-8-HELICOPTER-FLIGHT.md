# Step 8 — Helicopter flight controls

This stage adds the first playable helicopter loop to Abuja Real Life. It is intentionally limited to helicopter gameplay; railway tracks and train passenger gameplay are not changed in this stage.

## Controls

- **E**: board at the airport helipad; exit only after landing and stopping.
- **Shift**: increase collective / lift.
- **Space**: reduce collective / descend.
- **W / S**: pitch forward / backward to move.
- **A / D**: yaw left / right.
- **K**: toggle chase and cockpit camera.
- On touch devices, helicopter-specific Lift, Descend, Forward, Back, Yaw and View controls replace the normal action grid while piloting. The movement stick also supplies pitch/yaw input.

## Included

- Two marked helipads beside the airport.
- Parked helicopter rendered with animated main and tail rotors.
- Boarding and pilot-control state. The player avatar is hidden while seated in the helicopter.
- Collective, vertical speed, pitch, yaw, horizontal movement, altitude clamp and a smoothed chase camera / cockpit camera.
- Exit guard: the pilot must be near the ground, nearly stationary, and descending gently.

## Known limitations

- Helicopter state is local to the current client; multiplayer helicopter pose replication is not included yet. Other clients will not see the aircraft accurately while it is being flown.
- Building collision, rotor damage, fuel consumption, helicopter ownership selection, passenger seating, and server-authoritative flight are not implemented in this stage.
- Flight has not been tested in a live browser session or on mobile hardware. Dependencies are not installed in the working environment, so a production build could not be run here.

## Verification checklist

1. Run `npm ci`, then `npm run build`.
2. Start the game and approach the marked airport helipad.
3. Press E, hold Shift until lift-off, use W/S and A/D to manoeuvre, then descend with Space.
4. Land slowly and press E to exit. Attempting to exit while airborne should be blocked.
5. Test keyboard and touch controls at desktop, phone and tablet sizes.
