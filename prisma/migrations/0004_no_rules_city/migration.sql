-- Profile (profession/skills/style/outfit/relationship), heat & jail, quests, invites, relationships, crime log.
ALTER TABLE "Save" ALTER COLUMN "cash" SET DEFAULT 1000000,
  ADD COLUMN "profile" JSONB, ADD COLUMN "heat" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "heatAt" TIMESTAMP(3),
  ADD COLUMN "jailUntil" TIMESTAMP(3), ADD COLUMN "questId" TEXT, ADD COLUMN "questAt" TIMESTAMP(3);
CREATE TABLE "Invite" ("id" TEXT PRIMARY KEY, "fromId" TEXT NOT NULL, "toName" TEXT NOT NULL, "building" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX "Invite_toName_building_key" ON "Invite"("toName","building");
CREATE TABLE "Relationship" ("id" TEXT PRIMARY KEY, "aName" TEXT NOT NULL, "bName" TEXT NOT NULL, "status" TEXT NOT NULL, "accepted" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX "Relationship_aName_bName_key" ON "Relationship"("aName","bName");
CREATE TABLE "Crime" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "kind" TEXT NOT NULL, "caught" BOOLEAN NOT NULL DEFAULT false, "loot" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "Crime_userId_createdAt_idx" ON "Crime"("userId","createdAt");
