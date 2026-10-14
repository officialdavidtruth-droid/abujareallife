ARL Vercel build fix: BUS vehicle type

Replace lib/vehicles.ts in your current project with the included file.
This expands VehicleSpec.type to include BUS, matching the existing Prisma VehicleType enum and GameLayer.tsx garage/dealership icon checks.

Then run:
  npx prisma generate
  npm run build

If the build passes, commit and push the change to GitHub to trigger Vercel.
Only replace this one file; do not overwrite your entire project with an older ZIP.
