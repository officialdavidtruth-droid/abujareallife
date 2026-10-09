-- Abuja Real Life: bring the database up to date with prisma/schema.prisma.
-- Safe to re-run. Paste into Supabase > SQL Editor > New query > Run.
-- Run AFTER prisma/setup-database.sql (it never deletes data).

-- Save: columns added by migrations 0004 and 0005 that setup-database.sql is missing
ALTER TABLE "Save"
  ADD COLUMN IF NOT EXISTS "profile"   JSONB,
  ADD COLUMN IF NOT EXISTS "heat"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "heatAt"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "jailUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "questId"   TEXT,
  ADD COLUMN IF NOT EXISTS "questAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "inside"    TEXT,
  ADD COLUMN IF NOT EXISTS "insideAt"  TIMESTAMP(3);
ALTER TABLE "Save" ALTER COLUMN "cash" SET DEFAULT 1000000;

-- Invite
CREATE TABLE IF NOT EXISTS "Invite" (
  "id" TEXT PRIMARY KEY,
  "fromId" TEXT NOT NULL,
  "toName" TEXT NOT NULL,
  "building" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Invite_toName_building_key" ON "Invite"("toName","building");

-- Relationship
CREATE TABLE IF NOT EXISTS "Relationship" (
  "id" TEXT PRIMARY KEY,
  "aName" TEXT NOT NULL,
  "bName" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "accepted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Relationship_aName_bName_key" ON "Relationship"("aName","bName");

-- Crime
CREATE TABLE IF NOT EXISTS "Crime" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "caught" BOOLEAN NOT NULL DEFAULT false,
  "loot" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Crime_userId_createdAt_idx" ON "Crime"("userId","createdAt");

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

-- Phone messages between players (safe to re-run). Without this table the Messages app cannot load or send.
CREATE TABLE IF NOT EXISTS "Message" (
  "id" TEXT PRIMARY KEY,
  "fromId" TEXT NOT NULL,
  "fromName" TEXT NOT NULL,
  "toName" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'text',
  "body" TEXT NOT NULL,
  "data" JSONB,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Message_toName_readAt_idx" ON "Message"("toName", "readAt");
CREATE INDEX IF NOT EXISTS "Message_fromName_createdAt_idx" ON "Message"("fromName", "createdAt");
CREATE INDEX IF NOT EXISTS "Message_toName_createdAt_idx" ON "Message"("toName", "createdAt");

-- auto work / free will
ALTER TABLE "Save" ADD COLUMN IF NOT EXISTS "freeWill" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Save" ADD COLUMN IF NOT EXISTS "workBiz" TEXT;
ALTER TABLE "Save" ADD COLUMN IF NOT EXISTS "workJob" INTEGER;
ALTER TABLE "Save" ADD COLUMN IF NOT EXISTS "seenAt" TIMESTAMP(3);

-- RideRequest (migration 0014): rides one player orders for another, which the rider must accept
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
