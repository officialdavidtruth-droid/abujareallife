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
