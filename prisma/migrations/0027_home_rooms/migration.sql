-- Build mode, step 1 (BUILD-MODE.md): rooms of a house are saved data, one row per room, like HomeFurniture. Safe to re-run. Then `npm run db:generate`.
-- x, z, w, d are whole tiles (1 tile = 1 m). Houses with no rows here keep the old fixed floor plan.
CREATE TABLE IF NOT EXISTS "HomeRoom" (
  "id" TEXT PRIMARY KEY,
  "homeId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "x" INTEGER NOT NULL,
  "z" INTEGER NOT NULL,
  "w" INTEGER NOT NULL,
  "d" INTEGER NOT NULL,
  "cost" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "HomeRoom_homeId_createdAt_idx" ON "HomeRoom"("homeId","createdAt");
