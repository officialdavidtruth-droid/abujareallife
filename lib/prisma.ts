import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Serverless + Supabase pooler: one connection per function instance and a longer wait for a free slot,
// so bursts of polling from many players don't exhaust the pool ("Can't reach database" / "Timed out fetching a connection").
function dbUrl(): string | undefined {
  const u = process.env.DATABASE_URL;
  if (!u || !/pooler\.supabase\.com|pgbouncer=true/.test(u)) return u;
  // Supabase's pooler on port 5432 is SESSION mode: each serverless instance pins a database connection and the pool (about 15) runs out
  // as soon as a few players are online ("Can't reach database" / "max clients reached"). Port 6543 is TRANSACTION mode, built for serverless.
  // Same host and credentials, so switch at runtime and tell Prisma it is talking to PgBouncer (no prepared statements).
  let url = u;
  if (/pooler\.supabase\.com:5432/.test(url)) url = url.replace('pooler.supabase.com:5432', 'pooler.supabase.com:6543');
  if (!/pgbouncer=true/.test(url)) url += (url.includes('?') ? '&' : '?') + 'pgbouncer=true';
  const add = [!/connection_limit=/.test(url) && "connection_limit=1", !/pool_timeout=/.test(url) && "pool_timeout=20"].filter(Boolean).join("&");
  return add ? url + (url.includes("?") ? "&" : "?") + add : url;
}
const url = dbUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(url ? { datasources: { db: { url } } } : {}),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

globalForPrisma.prisma = prisma;
