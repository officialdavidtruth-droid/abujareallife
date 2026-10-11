-- Age gate and mature-content disclosure for new accounts. Safe to re-run.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dateOfBirth" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "adultContentAcceptedAt" TIMESTAMP(3);
