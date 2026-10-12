-- Billboard advertising (abujareallife.online/adbooking). Safe to re-run.
CREATE TABLE IF NOT EXISTS "AdAccount" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "business" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "sessionVersion" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "AdAccount_email_key" ON "AdAccount"("email");
CREATE TABLE IF NOT EXISTS "AdBooking" (
  "id" TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL REFERENCES "AdAccount"("id") ON DELETE CASCADE,
  "slot" INTEGER NOT NULL,
  "startDate" DATE NOT NULL,
  "days" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "sub" TEXT NOT NULL,
  "contact" TEXT NOT NULL DEFAULT '',
  "website" TEXT NOT NULL DEFAULT '',
  "color" TEXT NOT NULL DEFAULT '#1d7654',
  "priceNaira" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
  "reference" TEXT,
  "paidAt" TIMESTAMP(3),
  "refund" TEXT NOT NULL DEFAULT '',
  "note" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "AdBooking_reference_key" ON "AdBooking"("reference");
CREATE INDEX IF NOT EXISTS "AdBooking_accountId_idx" ON "AdBooking"("accountId");
CREATE INDEX IF NOT EXISTS "AdBooking_slot_startDate_idx" ON "AdBooking"("slot","startDate");
CREATE INDEX IF NOT EXISTS "AdBooking_status_idx" ON "AdBooking"("status");
