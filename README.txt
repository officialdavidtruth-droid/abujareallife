ARL Vercel TRAIN VehicleType Build Fix

File included:
  prisma/schema.prisma

Apply:
1. Back up your current prisma/schema.prisma.
2. Copy this file into your repository at prisma/schema.prisma.
3. Confirm enum VehicleType contains TRAIN (and preserve any additional enum values specific to your current branch).
4. Run: npx prisma generate
5. Run: npm run build
6. Commit and push the schema change to the branch Vercel deploys.

Important:
This schema is from the ARL Step 9 project archive. Compare it with your current schema before replacing it, so you do not overwrite newer project-specific schema changes. If your database has not had the TRAIN enum migration applied, deploy the appropriate existing migration separately with your normal database migration workflow.
