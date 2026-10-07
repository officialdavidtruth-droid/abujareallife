-- Server-owned money and job tickets.
ALTER TABLE "Save" ADD COLUMN "cash" INTEGER NOT NULL DEFAULT 20000, ADD COLUMN "jobAct" TEXT, ADD COLUMN "jobAt" TIMESTAMP(3);
-- Carry over existing browser-reported cash, capped at 1,000,000 (old values were not verified).
UPDATE "Save" SET "cash" = LEAST(GREATEST(COALESCE(("state"->>'cash')::numeric, 20000), 0), 1000000)::int;
