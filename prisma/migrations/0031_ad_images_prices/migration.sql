-- Billboard flyers + admin-set prices (abujareallife.online/adbooking and /adminad). Safe to re-run.
ALTER TABLE "AdBooking" ADD COLUMN IF NOT EXISTS "hasImage" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS "AdImage" (
  "bookingId" TEXT PRIMARY KEY REFERENCES "AdBooking"("id") ON DELETE CASCADE,
  "mime" TEXT NOT NULL DEFAULT 'image/jpeg',
  "data" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "AdSlotPrice" (
  "slot" INTEGER PRIMARY KEY,
  "perDay" INTEGER NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
