-- Player marketplace listings (run once in the Supabase SQL editor, then redeploy so `prisma generate` picks up the model).
CREATE TABLE IF NOT EXISTS "Listing" (
  "id" TEXT PRIMARY KEY,
  "sellerId" TEXT NOT NULL,
  "sellerName" TEXT NOT NULL,
  "itemKey" TEXT NOT NULL,
  "qty" INTEGER NOT NULL,
  "price" INTEGER NOT NULL,
  "soldQty" INTEGER NOT NULL DEFAULT 0,
  "earned" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Listing_status_createdAt_idx" ON "Listing"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "Listing_sellerId_status_idx" ON "Listing"("sellerId", "status");
