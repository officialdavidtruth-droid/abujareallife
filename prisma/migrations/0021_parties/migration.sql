-- Parties, hangouts, owambes and club nights hosted by players (PARTIES.md). Safe to re-run. Then `npm run db:generate`.
CREATE TABLE IF NOT EXISTS "Party" (
  "id" TEXT PRIMARY KEY,
  "hostId" TEXT NOT NULL,
  "hostName" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "occasion" TEXT,
  "dress" TEXT,
  "genre" TEXT NOT NULL DEFAULT 'afrobeats',
  "venueId" TEXT,
  "venueName" TEXT NOT NULL,
  "district" TEXT NOT NULL,
  "cover" INTEGER NOT NULL DEFAULT 0,
  "markup" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "friendsOnly" BOOLEAN NOT NULL DEFAULT false,
  "cap" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'LIVE',
  "vibe" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "vibeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "peak" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "guestsTotal" INTEGER NOT NULL DEFAULT 0,
  "hostEarned" INTEGER NOT NULL DEFAULT 0,
  "sprayTotal" INTEGER NOT NULL DEFAULT 0,
  "musicAt" TIMESTAMP(3),
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "Party_status_endsAt_idx" ON "Party"("status","endsAt");
CREATE INDEX IF NOT EXISTS "Party_hostId_status_idx" ON "Party"("hostId","status");
CREATE INDEX IF NOT EXISTS "Party_venueId_status_idx" ON "Party"("venueId","status");

CREATE TABLE IF NOT EXISTS "PartyGuest" (
  "id" TEXT PRIMARY KEY,
  "partyId" TEXT NOT NULL REFERENCES "Party"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'IN',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leftAt" TIMESTAMP(3),
  "spent" INTEGER NOT NULL DEFAULT 0,
  "sprayed" INTEGER NOT NULL DEFAULT 0,
  "received" INTEGER NOT NULL DEFAULT 0,
  "dances" INTEGER NOT NULL DEFAULT 0,
  "lastDanceAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "PartyGuest_partyId_userId_key" ON "PartyGuest"("partyId","userId");
CREATE INDEX IF NOT EXISTS "PartyGuest_userId_status_idx" ON "PartyGuest"("userId","status");
CREATE INDEX IF NOT EXISTS "PartyGuest_partyId_status_idx" ON "PartyGuest"("partyId","status");
