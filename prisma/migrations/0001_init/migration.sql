-- Initial Abuja Real Life schema.
-- Run `npm run db:migrate` locally to let Prisma validate/regenerate migrations.
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');
CREATE TYPE "JobStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "PropertyType" AS ENUM ('ROOM', 'APARTMENT', 'HOUSE', 'MANSION');
CREATE TYPE "VehicleType" AS ENUM ('CAR', 'SUV', 'MOTORCYCLE', 'BUS');
CREATE TYPE "MissionStatus" AS ENUM ('AVAILABLE', 'ACTIVE', 'COMPLETED', 'FAILED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "Job" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "company" TEXT NOT NULL,
  "district" TEXT NOT NULL,
  "salary" INTEGER NOT NULL,
  "energyCost" INTEGER NOT NULL DEFAULT 15,
  "xpReward" INTEGER NOT NULL DEFAULT 50,
  "status" "JobStatus" NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Job_title_key" ON "Job"("title");

CREATE TABLE "Character" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "gender" "Gender" NOT NULL DEFAULT 'OTHER',
  "age" INTEGER NOT NULL DEFAULT 24,
  "level" INTEGER NOT NULL DEFAULT 1,
  "xp" INTEGER NOT NULL DEFAULT 0,
  "cash" INTEGER NOT NULL DEFAULT 50000,
  "bankBalance" INTEGER NOT NULL DEFAULT 0,
  "health" INTEGER NOT NULL DEFAULT 100,
  "energy" INTEGER NOT NULL DEFAULT 100,
  "hunger" INTEGER NOT NULL DEFAULT 100,
  "mood" INTEGER NOT NULL DEFAULT 75,
  "fitness" INTEGER NOT NULL DEFAULT 50,
  "district" TEXT NOT NULL DEFAULT 'Wuse',
  "appearance" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "jobId" TEXT,
  CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Character_userId_key" ON "Character"("userId");
CREATE INDEX "Character_jobId_idx" ON "Character"("jobId");

CREATE TABLE "Property" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "district" TEXT NOT NULL,
  "type" "PropertyType" NOT NULL,
  "price" INTEGER NOT NULL,
  "rent" INTEGER NOT NULL DEFAULT 0,
  "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Property_userId_idx" ON "Property"("userId");
CREATE INDEX "Property_district_idx" ON "Property"("district");

CREATE TABLE "Vehicle" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "VehicleType" NOT NULL,
  "price" INTEGER NOT NULL,
  "fuel" INTEGER NOT NULL DEFAULT 100,
  "condition" INTEGER NOT NULL DEFAULT 100,
  "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Vehicle_userId_idx" ON "Vehicle"("userId");

CREATE TABLE "InventoryItem" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "itemKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InventoryItem_userId_itemKey_key" ON "InventoryItem"("userId", "itemKey");

CREATE TABLE "Mission" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "rewardCash" INTEGER NOT NULL DEFAULT 0,
  "rewardXp" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Mission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Mission_key_key" ON "Mission"("key");

CREATE TABLE "PlayerMission" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "missionId" TEXT NOT NULL,
  "status" "MissionStatus" NOT NULL DEFAULT 'AVAILABLE',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlayerMission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlayerMission_userId_missionId_key" ON "PlayerMission"("userId", "missionId");
CREATE INDEX "PlayerMission_userId_status_idx" ON "PlayerMission"("userId", "status");

CREATE TABLE "Transaction" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "balanceType" TEXT NOT NULL DEFAULT 'CASH',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Transaction_userId_createdAt_idx" ON "Transaction"("userId", "createdAt");

ALTER TABLE "Character" ADD CONSTRAINT "Character_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Character" ADD CONSTRAINT "Character_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Property" ADD CONSTRAINT "Property_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlayerMission" ADD CONSTRAINT "PlayerMission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlayerMission" ADD CONSTRAINT "PlayerMission_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
