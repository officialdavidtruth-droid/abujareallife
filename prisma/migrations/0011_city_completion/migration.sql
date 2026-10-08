ALTER TABLE "Vehicle" ADD COLUMN "paint" TEXT NOT NULL DEFAULT 'factory';
ALTER TABLE "Vehicle" ADD COLUMN "rims" TEXT NOT NULL DEFAULT 'factory';
ALTER TABLE "Vehicle" ADD COLUMN "tint" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Vehicle" ADD COLUMN "stolen" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "PlayerPosition" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "x" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "z" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "r" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "district" TEXT NOT NULL DEFAULT 'Wuse',
  "driving" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlayerPosition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlayerPosition_userId_key" ON "PlayerPosition"("userId");
CREATE UNIQUE INDEX "PlayerPosition_username_key" ON "PlayerPosition"("username");
CREATE INDEX "PlayerPosition_district_updatedAt_idx" ON "PlayerPosition"("district", "updatedAt");
ALTER TABLE "PlayerPosition" ADD CONSTRAINT "PlayerPosition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "DriverProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "vehicleType" TEXT NOT NULL DEFAULT 'taxi',
  "baseFare" INTEGER NOT NULL DEFAULT 1500,
  "perKm" INTEGER NOT NULL DEFAULT 450,
  "rating" INTEGER NOT NULL DEFAULT 50,
  "trips" INTEGER NOT NULL DEFAULT 0,
  "earnings" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "DriverProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DriverProfile_userId_key" ON "DriverProfile"("userId");
ALTER TABLE "DriverProfile" ADD CONSTRAINT "DriverProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
