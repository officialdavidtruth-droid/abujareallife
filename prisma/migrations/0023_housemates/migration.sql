-- Housemates: invite other players to live in your house (HOUSEMATES.md). Safe to re-run. Then `npm run db:generate`.
CREATE TABLE IF NOT EXISTS "HouseMate" (
  "id" TEXT PRIMARY KEY,
  "ownerId" TEXT NOT NULL,
  "ownerName" TEXT NOT NULL,
  "mateId" TEXT NOT NULL,
  "mateName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "HouseMate_ownerId_mateId_key" ON "HouseMate"("ownerId","mateId");
CREATE INDEX IF NOT EXISTS "HouseMate_mateId_status_idx" ON "HouseMate"("mateId","status");
CREATE INDEX IF NOT EXISTS "HouseMate_ownerId_status_idx" ON "HouseMate"("ownerId","status");
