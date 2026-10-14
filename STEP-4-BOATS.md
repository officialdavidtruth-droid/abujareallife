# Abuja Real Life — Step 4: Boats

## Included
- Yamaha 242X Sport Boat and Bayliner VR5 Bowrider catalogue entries.
- `BOAT` added to the Prisma `VehicleType` enum and PostgreSQL migration `0034_boat_vehicle_type`.
- Procedural 3D boat silhouette with hull, windshield, cockpit trim and lights.
- Boat icon in dealership and inventory.

## Important limitation
This step covers the boat catalogue, visual rendering and UI classification. It does not implement water physics, boat spawning at water, steering/throttle controls, boarding, docking, or multiplayer synchronization. Do not treat boats as fully drivable yet; those are the next gameplay milestone.

## Database
Back up the database and apply the migration with the project's normal Prisma migration workflow (`npx prisma migrate deploy`). For fresh database setup, the setup SQL also includes the new enum value.

## Validation
Source changes have been prepared but a production build and live in-game test have not been run here. Validate Prisma generation, TypeScript build, dealership listing and model orientation before deploying.
