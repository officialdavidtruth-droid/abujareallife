# Step 12 — Vehicle system stabilization

## Changes
- `VehicleSpec.type` now uses Prisma's generated `VehicleType` type instead of a manually duplicated string union.
- Added a Toyota Coaster bus catalogue entry so `BUS` is represented in the catalogue as well as the Prisma enum and garage UI.
- Added an explicit `BUS` rendering branch using the existing `BusBody` implementation.
- Added `ROAD_TRAFFIC_CATALOG` so street traffic and vehicle-jacking ghost sequences use only road-capable vehicle models. Boats, helicopters, trains and bicycles no longer get selected as ordinary traffic cars.
- Added a guarded PostgreSQL migration to add `BUS` to `VehicleType` on databases where it is missing.
- Added `npm run check:vehicles` to check catalogue IDs, enum coverage, numeric fields, and road-traffic categories.

## Validation
Run:

```bash
npm ci
npm run check:vehicles
npm run build
```

For a deployed database with pending migrations, run `npx prisma migrate deploy` using the intended environment.

The source edits have been inspected, but a full build was not completed in this environment. The live game still needs runtime testing for dealership purchases, garage actions, each vehicle model, and road traffic.
