-- Home visits: knock / invite guests into a house (HOME-DOOR.md). Safe to re-run. Then `npm run db:generate`.
CREATE TABLE IF NOT EXISTS "HomeVisit" (
  "id" TEXT PRIMARY KEY,
  "ownerId" TEXT NOT NULL,
  "ownerName" TEXT NOT NULL,
  "guestId" TEXT NOT NULL,
  "guestName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "kind" TEXT NOT NULL DEFAULT 'knock',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "HomeVisit_ownerId_guestId_key" ON "HomeVisit"("ownerId","guestId");
CREATE INDEX IF NOT EXISTS "HomeVisit_guestId_status_idx" ON "HomeVisit"("guestId","status");
CREATE INDEX IF NOT EXISTS "HomeVisit_ownerId_status_idx" ON "HomeVisit"("ownerId","status");
