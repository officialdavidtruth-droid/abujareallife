# Abuja Real Life — Step 2: Bicycles

## Included
- Trek Marlin 7 mountain bicycle and Giant Escape 3 city bicycle in the vehicle catalogue.
- Dedicated procedural bicycle model (wheels, spokes, frame, fork, handlebars, seat, crank and rider).
- Dealership/garage and inventory icons distinguish bicycles from motorcycles and cars.
- Prisma `BICYCLE` vehicle enum update and PostgreSQL migration for existing databases.

## Important
This step adds bicycle catalogue entries and a separate visual model. It does not claim that bicycle-specific mounting/dismounting, pedalling animation, balance/steering physics, or multiplayer synchronization have been fully implemented or tested in a running game.

## Database migration
Before deploying this version to an existing database, apply Prisma migrations using the project's normal deployment workflow (`npx prisma migrate deploy`). Back up the database first. The migration adds `BICYCLE` to the existing PostgreSQL `VehicleType` enum.

## Build/test status
The project source was updated, but a production build and in-game test were not run in this environment because dependencies are not installed here. Test purchase, garage display, spawning/rendering, movement and database migration in development before deploying.
