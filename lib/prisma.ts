import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Serverless + Supabase pooler: one connection per function instance and a longer wait for a free slot,
// so bursts of polling from many players don't exhaust the pool ("Can't reach database" / "Timed out fetching a connection").
function dbUrl(): string | undefined {
  const u = process.env.DATABASE_URL;
  if (!u || !/pooler\.supabase\.com|pgbouncer=true/.test(u)) return u;
  const add = [!/connection_limit=/.test(u) && "connection_limit=1", !/pool_timeout=/.test(u) && "pool_timeout=20"].filter(Boolean).join("&");
  return add ? u + (u.includes("?") ? "&" : "?") + add : u;
}
const url = dbUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(url ? { datasources: { db: { url } } } : {}),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

globalForPrisma.prisma = prisma;
