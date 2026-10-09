import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { prisma } from './prisma';

const COOKIE = 'arl_session';
const secret = () => {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error('AUTH_SECRET must be set (32+ characters).');
  return new TextEncoder().encode(s);
};
export const err = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
export const authConfigured = () => (process.env.AUTH_SECRET || '').length >= 32;
// Always answer with JSON (never an empty 500) so the UI can show the real reason.
export function serverError(e: unknown) {
  console.error('[auth] server error:', e);
  const x = e as { code?: string; message?: string };
  if (x?.code === 'P2021' || x?.code === 'P2022') return err('Database is not set up yet (migrations not applied). Run: npm run db:migrate:deploy', 500);
  if (x?.code && ['P1000', 'P1001', 'P1002', 'P1017', 'P2024'].includes(x.code)) return err('The database is busy or unreachable right now. Please try again in a moment.', 503);
  if (x?.message?.includes('AUTH_SECRET')) return err('Server is missing AUTH_SECRET (32+ characters).', 500);
  return err('Server error. Please try again.', 500);
}
export async function startSession(userId: string) {
  const token = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setIssuedAt().setExpirationTime('30d').sign(secret());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 30 });
}
export async function endSession() { (await cookies()).delete(COOKIE); }
const TRANSIENT_DB = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2028']);
export async function currentUser() {
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return null;
  let sub: string | undefined;
  try { const { payload } = await jwtVerify(t, secret()); sub = payload.sub; } catch { return null; } // a bad or expired token really is "signed out"
  if (!sub) return null;
  // A database hiccup is NOT "signed out": retry briefly, then raise the real error instead of pretending the player is logged out.
  for (let i = 0; ; i++) {
    try { return await prisma.user.findUnique({ where: { id: sub } }); }
    catch (e) {
      const c = (e as { code?: string })?.code, transient = (!!c && TRANSIENT_DB.has(c)) || /can.t reach|connection pool|timed out|ECONN|terminating connection/i.test(String((e as Error)?.message));
      if (i >= 2 || !transient) throw e;
      await new Promise(r => setTimeout(r, 200 * (i + 1) * (i + 1)));
    }
  }
}
export const publicUser = (u: { username: string; email: string | null; emailVerifiedAt: Date | null }) => ({ username: u.username, email: u.email, emailVerified: !!u.emailVerifiedAt });

// Simple in-memory throttle (per server instance). Use a shared store (e.g. Upstash) for strict limits.
const hits = new Map<string, { n: number; t: number }>();
export function throttled(key: string, max = 8, windowMs = 10 * 60_000) {
  const now = Date.now(), h = hits.get(key);
  if (!h || now - h.t > windowMs) { hits.set(key, { n: 1, t: now }); return false; }
  return ++h.n > max;
}
