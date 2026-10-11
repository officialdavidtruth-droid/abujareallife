-- House plots are stored per player (HOUSE-PLOTS.md). Safe to re-run. Then `npm run db:generate`.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "houseSlot" INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS "User_houseSlot_key" ON "User"("houseSlot");
-- One-time backfill: the first 105 accounts keep exactly the plots they have now (sign-up order). Skipped once any plot is stored.
UPDATE "User" u SET "houseSlot" = r.rn - 1
FROM (SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") AS rn FROM "User") r
WHERE u."id" = r."id" AND r.rn <= 105 AND NOT EXISTS (SELECT 1 FROM "User" WHERE "houseSlot" IS NOT NULL);
