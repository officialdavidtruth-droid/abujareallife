CREATE TABLE IF NOT EXISTS "RideRequest" (
  "id" TEXT PRIMARY KEY,
  "fromUserId" TEXT NOT NULL,
  "fromName" TEXT NOT NULL,
  "toUserId" TEXT NOT NULL,
  "toName" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'taxi',
  "destName" TEXT NOT NULL,
  "destX" DOUBLE PRECISION NOT NULL,
  "destZ" DOUBLE PRECISION NOT NULL,
  "fare" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "RideRequest_toUserId_status_idx" ON "RideRequest"("toUserId","status");
CREATE INDEX IF NOT EXISTS "RideRequest_fromUserId_status_idx" ON "RideRequest"("fromUserId","status");
