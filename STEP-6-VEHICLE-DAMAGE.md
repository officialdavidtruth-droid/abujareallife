# Step 6 — Vehicle damage foundation

This stage adds a reusable damage state model and cosmetic damage rendering for car models.

## Added
- `lib/vehicleDamage.ts`: deterministic collision-damage rules, damage zones, health, dents, broken lights, windshield damage and damage-stage helpers.
- `components/CityCars.tsx`: optional `damageLevel` (0–100) prop and visual damage layers for dents/scrapes, broken front lights and windshield cracks.

## Integration contract
The game must pass a vehicle's saved/current damage level to `<CarModel damageLevel={...} />`. Call `applyVehicleCollisionDamage(state, { speedKph, zone, severity })` from the vehicle collision handler and persist/broadcast the returned state for multiplayer consistency. This repository stage does not yet wire every vehicle movement/collision path to this state, nor does it persist damage to the database; it is the first implementation layer for that work.

## Verify
1. Run `npx prisma generate` only if your normal workflow requires it (this step adds no Prisma schema or migration).
2. Run `npm run build`.
3. In a development harness, render a `CarModel` with `damageLevel={55}` to inspect visible damage; use `0` for a clean vehicle.
4. Unit-test collision rules for low-speed bumps, broken lights at higher speed, and windshield cracking.

No database migration is required for this stage.
