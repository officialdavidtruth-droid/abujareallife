-- Crews / gangs / companies (CREW.md). Safe to re-run. Then `npm run db:generate`.
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
