CREATE TABLE IF NOT EXISTS "Deal" (
  "id" TEXT PRIMARY KEY,
  "building" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "price" INTEGER NOT NULL,
  "fromId" TEXT NOT NULL,
  "fromName" TEXT NOT NULL,
  "toId" TEXT NOT NULL,
  "toName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Deal_toId_status_idx" ON "Deal"("toId","status");
CREATE INDEX IF NOT EXISTS "Deal_fromId_status_idx" ON "Deal"("fromId","status");
