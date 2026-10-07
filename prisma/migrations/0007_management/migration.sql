-- Manager seats (7-day terms) + management-task progress.
ALTER TABLE "Save" ADD COLUMN IF NOT EXISTS "mgrTasks" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS "Management" (
  "id" TEXT PRIMARY KEY,
  "businessId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "since" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastPaidAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "Management_businessId_key" ON "Management"("businessId");
CREATE UNIQUE INDEX IF NOT EXISTS "Management_userId_key" ON "Management"("userId");
CREATE INDEX IF NOT EXISTS "Management_expiresAt_idx" ON "Management"("expiresAt");
DO $$ BEGIN ALTER TABLE "Management" ADD CONSTRAINT "Management_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
