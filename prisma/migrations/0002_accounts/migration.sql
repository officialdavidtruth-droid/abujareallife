-- Accounts: username + password, optional verified email, saved games.
ALTER TABLE "User" ADD COLUMN "username" TEXT, ADD COLUMN "usernameKey" TEXT, ADD COLUMN "passwordHash" TEXT, ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
-- Old email-only rows (if any) get placeholder names and an unusable password hash.
UPDATE "User" SET "username" = "id", "usernameKey" = lower("id"), "passwordHash" = '!' WHERE "username" IS NULL;
ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL, ALTER COLUMN "usernameKey" SET NOT NULL, ALTER COLUMN "passwordHash" SET NOT NULL, ALTER COLUMN "email" DROP NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_usernameKey_key" ON "User"("usernameKey");

CREATE TABLE "EmailCode" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailCode_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmailCode_userId_idx" ON "EmailCode"("userId");
ALTER TABLE "EmailCode" ADD CONSTRAINT "EmailCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Save" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "look" JSONB NOT NULL,
  "state" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Save_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Save_userId_key" ON "Save"("userId");
ALTER TABLE "Save" ADD CONSTRAINT "Save_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
