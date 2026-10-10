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

-- Deal (migration 0015): property deals between players
CREATE TABLE IF NOT EXISTS "Deal" (
  "id" TEXT PRIMARY KEY,
  "building" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "price" INTEGER NOT NULL,
  "fromId" TEXT NOT NULL,
  "fromName" TEXT NOT NULL,
  "toId" TEXT NOT NULL,
  "toName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Deal_toId_status_idx" ON "Deal"("toId","status");
CREATE INDEX IF NOT EXISTS "Deal_fromId_status_idx" ON "Deal"("fromId","status");

-- intoxication (migration 0016)
ALTER TABLE "Save" ADD COLUMN IF NOT EXISTS "drunk" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Save" ADD COLUMN IF NOT EXISTS "high" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Save" ADD COLUMN IF NOT EXISTS "intoxAt" TIMESTAMP(3);

-- down state (migration 0017)
ALTER TABLE "Save" ADD COLUMN IF NOT EXISTS "downUntil" TIMESTAMP(3);
ALTER TABLE "Save" ADD COLUMN IF NOT EXISTS "downKind" TEXT;

-- holdup (migration 0018)
CREATE INDEX IF NOT EXISTS "Crime_kind_createdAt_idx" ON "Crime"("kind", "createdAt");

-- crews (migration 0019)
CREATE TABLE IF NOT EXISTS "Crew" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "nameKey" TEXT NOT NULL,
  "tag" TEXT NOT NULL,
  "tagKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'crew',
  "motto" TEXT NOT NULL DEFAULT '',
  "open" BOOLEAN NOT NULL DEFAULT false,
  "treasury" INTEGER NOT NULL DEFAULT 0,
  "rating" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Crew_nameKey_key" ON "Crew"("nameKey");
CREATE UNIQUE INDEX IF NOT EXISTS "Crew_tagKey_key" ON "Crew"("tagKey");
CREATE INDEX IF NOT EXISTS "Crew_rating_idx" ON "Crew"("rating");

CREATE TABLE IF NOT EXISTS "CrewMember" (
  "id" TEXT PRIMARY KEY,
  "crewId" TEXT NOT NULL REFERENCES "Crew"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'member',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "chatReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "CrewMember_userId_key" ON "CrewMember"("userId");
CREATE INDEX IF NOT EXISTS "CrewMember_crewId_idx" ON "CrewMember"("crewId");

CREATE TABLE IF NOT EXISTS "CrewInvite" (
  "id" TEXT PRIMARY KEY,
  "crewId" TEXT NOT NULL REFERENCES "Crew"("id") ON DELETE CASCADE,
  "toName" TEXT NOT NULL,
  "fromName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "CrewInvite_crewId_toName_key" ON "CrewInvite"("crewId","toName");
CREATE INDEX IF NOT EXISTS "CrewInvite_toName_idx" ON "CrewInvite"("toName");

CREATE TABLE IF NOT EXISTS "CrewMessage" (
  "id" TEXT PRIMARY KEY,
  "crewId" TEXT NOT NULL REFERENCES "Crew"("id") ON DELETE CASCADE,
  "fromName" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'chat',
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CrewMessage_crewId_createdAt_idx" ON "CrewMessage"("crewId","createdAt");

CREATE TABLE IF NOT EXISTS "CrewTurf" (
  "id" TEXT PRIMARY KEY,
  "district" TEXT NOT NULL,
  "crewId" TEXT NOT NULL REFERENCES "Crew"("id") ON DELETE CASCADE,
  "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastPaidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "CrewTurf_district_key" ON "CrewTurf"("district");
CREATE INDEX IF NOT EXISTS "CrewTurf_crewId_idx" ON "CrewTurf"("crewId");

-- kind: 'cup' (daily, every crew) | 'war' (one crew attacks another's district). status: active | done
CREATE TABLE IF NOT EXISTS "CrewEvent" (
  "id" TEXT PRIMARY KEY,
  "key" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "attackerId" TEXT,
  "defenderId" TEXT,
  "district" TEXT,
  "data" JSONB,
  "result" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "CrewEvent_key_key" ON "CrewEvent"("key");
CREATE INDEX IF NOT EXISTS "CrewEvent_status_endsAt_idx" ON "CrewEvent"("status","endsAt");
CREATE INDEX IF NOT EXISTS "CrewEvent_attackerId_idx" ON "CrewEvent"("attackerId");
CREATE INDEX IF NOT EXISTS "CrewEvent_defenderId_idx" ON "CrewEvent"("defenderId");

-- Scoring reads these two tables over a time window.
CREATE INDEX IF NOT EXISTS "Transaction_type_createdAt_idx" ON "Transaction"("type","createdAt");

-- 0020: player-run businesses with staff and prices
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
