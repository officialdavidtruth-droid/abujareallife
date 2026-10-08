-- Phone messages between players (run once in the Supabase SQL editor, then redeploy so `prisma generate` picks up the model).
CREATE TABLE IF NOT EXISTS "Message" (
  "id" TEXT PRIMARY KEY,
  "fromId" TEXT NOT NULL,
  "fromName" TEXT NOT NULL,
  "toName" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'text',
  "body" TEXT NOT NULL,
  "data" JSONB,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Message_toName_readAt_idx" ON "Message"("toName", "readAt");
CREATE INDEX IF NOT EXISTS "Message_fromName_createdAt_idx" ON "Message"("fromName", "createdAt");
CREATE INDEX IF NOT EXISTS "Message_toName_createdAt_idx" ON "Message"("toName", "createdAt");
