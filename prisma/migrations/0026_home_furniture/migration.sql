-- Placed furniture gets its own table, one row per piece (HOME-SAVE.md, step 3). Safe to re-run. Then `npm run db:generate`.
-- Existing houses are moved over automatically the first time anyone opens or edits their furniture; nothing to backfill here.
CREATE TABLE IF NOT EXISTS "HomeFurniture" (
  "id" TEXT PRIMARY KEY,
  "homeId" TEXT NOT NULL,
  "byId" TEXT NOT NULL,
  "itemKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "e" TEXT NOT NULL DEFAULT '',
  "cat" TEXT NOT NULL DEFAULT '',
  "cost" INTEGER NOT NULL DEFAULT 0,
  "condition" INTEGER NOT NULL DEFAULT 100,
  "x" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "z" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "r" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "fpW" DOUBLE PRECISION,
  "fpD" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "HomeFurniture_homeId_createdAt_idx" ON "HomeFurniture"("homeId","createdAt");
