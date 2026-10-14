# Abuja Real Life — Step 3: Helicopters

## Included in this step
- Robinson R44 Raven II and Bell 407 entries in the vehicle catalogue.
- `HELICOPTER` vehicle type in Prisma and a PostgreSQL enum migration.
- Procedural helicopter silhouette with cabin glazing, tail boom, landing skids, main rotor and tail rotor.
- Main and tail rotor visual animation.
- Helicopter icons in the dealership, garage and inventory.

## Important limitation
This step adds the helicopter catalogue, rendering and rotor animation only. It does **not** yet implement aircraft-specific purchase-to-spawn flow validation, pilot seating, take-off/landing, flight physics, air controls, helipads or multiplayer aircraft synchronization. The existing generic vehicle movement may not be suitable for flight. Those should be implemented and tested as the next helicopter gameplay milestone before adding boats.

## Database
For an existing PostgreSQL database, back it up and apply the migration using the project's normal Prisma deployment process: `npx prisma migrate deploy`. The migration adds the `HELICOPTER` value to `VehicleType` and does not delete existing data.

## Build/test status
Source changes were made, but a production build and live in-game test were not run in this environment. Validate Prisma generation, TypeScript build, dealership purchase, garage/inventory display and model orientation before deployment.
