-- Player-run businesses with staff (BIZJOBS.md). Safe to re-run. Then `npm run db:generate`.
ALTER TABLE "PlayerBusiness" ADD COLUMN IF NOT EXISTS "markup" DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE "PlayerBusiness" ADD COLUMN IF NOT EXISTS "prices" JSONB;
ALTER TABLE "PlayerBusiness" ADD COLUMN IF NOT EXISTS "settledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "BusinessEmployee" (
  "id" TEXT PRIMARY KEY,
  "businessId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "wage" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OFFERED',
  "clockedInAt" TIMESTAMP(3),
  "clockWage" INTEGER NOT NULL DEFAULT 0,
  "owed" INTEGER NOT NULL DEFAULT 0,
  "earned" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "hiredAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "BusinessEmployee_businessId_userId_key" ON "BusinessEmployee"("businessId","userId");
CREATE INDEX IF NOT EXISTS "BusinessEmployee_userId_status_idx" ON "BusinessEmployee"("userId","status");
CREATE INDEX IF NOT EXISTS "BusinessEmployee_businessId_status_idx" ON "BusinessEmployee"("businessId","status");
