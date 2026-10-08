-- Abuja Real Life: one-shot, safe-to-re-run database setup.
-- Paste into Supabase > SQL Editor > New query > Run.
-- Creates anything missing and upgrades older tables; it will not delete data.

-- ---------- Enums ----------
DO $$ BEGIN CREATE TYPE "Gender" AS ENUM ('MALE','FEMALE','OTHER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "JobStatus" AS ENUM ('ACTIVE','INACTIVE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PropertyType" AS ENUM ('ROOM','APARTMENT','HOUSE','MANSION'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "VehicleType" AS ENUM ('CAR','SUV','MOTORCYCLE','BUS'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "MissionStatus" AS ENUM ('AVAILABLE','ACTIVE','COMPLETED','FAILED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- User (create, then upgrade older versions) ----------
CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL,
  "username" TEXT,
  "usernameKey" TEXT,
  "passwordHash" TEXT,
  "email" TEXT,
  "emailVerifiedAt" TIMESTAMP(3),
  "name" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "username" TEXT,
  ADD COLUMN IF NOT EXISTS "usernameKey" TEXT,
  ADD COLUMN IF NOT EXISTS "passwordHash" TEXT,
  ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "name" TEXT,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "User" SET "username" = "id", "usernameKey" = lower("id"), "passwordHash" = '!' WHERE "username" IS NULL;
ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL, ALTER COLUMN "usernameKey" SET NOT NULL, ALTER COLUMN "passwordHash" SET NOT NULL, ALTER COLUMN "email" DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX IF NOT EXISTS "User_usernameKey_key" ON "User"("usernameKey");
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

-- ---------- Job ----------
CREATE TABLE IF NOT EXISTS "Job" (
  "id" TEXT NOT NULL, "title" TEXT NOT NULL, "company" TEXT NOT NULL, "district" TEXT NOT NULL,
  "salary" INTEGER NOT NULL, "energyCost" INTEGER NOT NULL DEFAULT 15, "xpReward" INTEGER NOT NULL DEFAULT 50,
  "status" "JobStatus" NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Job_title_key" ON "Job"("title");

-- ---------- Character ----------
CREATE TABLE IF NOT EXISTS "Character" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "firstName" TEXT NOT NULL, "lastName" TEXT NOT NULL,
  "gender" "Gender" NOT NULL DEFAULT 'OTHER', "age" INTEGER NOT NULL DEFAULT 24, "level" INTEGER NOT NULL DEFAULT 1,
  "xp" INTEGER NOT NULL DEFAULT 0, "cash" INTEGER NOT NULL DEFAULT 50000, "bankBalance" INTEGER NOT NULL DEFAULT 0,
  "health" INTEGER NOT NULL DEFAULT 100, "energy" INTEGER NOT NULL DEFAULT 100, "hunger" INTEGER NOT NULL DEFAULT 100,
  "mood" INTEGER NOT NULL DEFAULT 75, "fitness" INTEGER NOT NULL DEFAULT 50, "district" TEXT NOT NULL DEFAULT 'Wuse',
  "appearance" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "jobId" TEXT,
  CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Character_userId_key" ON "Character"("userId");

-- ---------- Property ----------
CREATE TABLE IF NOT EXISTS "Property" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "name" TEXT NOT NULL, "district" TEXT NOT NULL, "type" "PropertyType" NOT NULL,
  "price" INTEGER NOT NULL, "rent" INTEGER NOT NULL DEFAULT 0,
  "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Property_userId_idx" ON "Property"("userId");
CREATE INDEX IF NOT EXISTS "Property_district_idx" ON "Property"("district");

-- ---------- Vehicle ----------
CREATE TABLE IF NOT EXISTS "Vehicle" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "name" TEXT NOT NULL, "type" "VehicleType" NOT NULL, "price" INTEGER NOT NULL,
  "fuel" INTEGER NOT NULL DEFAULT 100, "condition" INTEGER NOT NULL DEFAULT 100,
  "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Vehicle_userId_idx" ON "Vehicle"("userId");

-- ---------- InventoryItem ----------
CREATE TABLE IF NOT EXISTS "InventoryItem" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "itemKey" TEXT NOT NULL, "name" TEXT NOT NULL, "quantity" INTEGER NOT NULL DEFAULT 1,
  "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryItem_userId_itemKey_key" ON "InventoryItem"("userId","itemKey");

-- ---------- Mission / PlayerMission ----------
CREATE TABLE IF NOT EXISTS "Mission" (
  "id" TEXT NOT NULL, "key" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT NOT NULL,
  "rewardCash" INTEGER NOT NULL DEFAULT 0, "rewardXp" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Mission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Mission_key_key" ON "Mission"("key");
CREATE TABLE IF NOT EXISTS "PlayerMission" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "missionId" TEXT NOT NULL, "status" "MissionStatus" NOT NULL DEFAULT 'AVAILABLE',
  "progress" INTEGER NOT NULL DEFAULT 0, "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlayerMission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlayerMission_userId_missionId_key" ON "PlayerMission"("userId","missionId");
CREATE INDEX IF NOT EXISTS "PlayerMission_userId_status_idx" ON "PlayerMission"("userId","status");

-- ---------- Transaction ----------
CREATE TABLE IF NOT EXISTS "Transaction" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "type" TEXT NOT NULL, "amount" INTEGER NOT NULL, "description" TEXT NOT NULL,
  "balanceType" TEXT NOT NULL DEFAULT 'CASH', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Transaction_userId_createdAt_idx" ON "Transaction"("userId","createdAt");

-- ---------- EmailCode ----------
CREATE TABLE IF NOT EXISTS "EmailCode" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "codeHash" TEXT NOT NULL, "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailCode_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "EmailCode_userId_idx" ON "EmailCode"("userId");

-- ---------- Save (game saves + server-owned cash) ----------
CREATE TABLE IF NOT EXISTS "Save" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "look" JSONB NOT NULL, "state" JSONB NOT NULL,
  "cash" INTEGER NOT NULL DEFAULT 20000, "jobAct" TEXT, "jobAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Save_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Save" ADD COLUMN IF NOT EXISTS "cash" INTEGER NOT NULL DEFAULT 20000, ADD COLUMN IF NOT EXISTS "jobAct" TEXT, ADD COLUMN IF NOT EXISTS "jobAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "Save_userId_key" ON "Save"("userId");

-- ---------- Foreign keys ----------
DO $$ BEGIN ALTER TABLE "Character" ADD CONSTRAINT "Character_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Character" ADD CONSTRAINT "Character_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Property" ADD CONSTRAINT "Property_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "PlayerMission" ADD CONSTRAINT "PlayerMission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "PlayerMission" ADD CONSTRAINT "PlayerMission_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "EmailCode" ADD CONSTRAINT "EmailCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Save" ADD CONSTRAINT "Save_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Phone messages between players (run once in the Supabase SQL editor, then redeploy so `prisma generate` picks up the model).
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
