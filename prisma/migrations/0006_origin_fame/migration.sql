-- Origin wheel (LAPO/NEPO), car ownership and fame/popularity.
ALTER TABLE "Save"
  ADD COLUMN IF NOT EXISTS "origin"    TEXT,
  ADD COLUMN IF NOT EXISTS "hasCar"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "fame"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "fameCarry" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "fameAt"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "fameDay"   TEXT,
  ADD COLUMN IF NOT EXISTS "fameToday" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "Save_fame_idx" ON "Save"("fame");

-- Origin is decided once at sign-up and stored on the account.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "origin" TEXT;
