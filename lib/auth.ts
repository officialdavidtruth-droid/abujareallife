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
export async function startSession(userId: string) {
  const token = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setIssuedAt().setExpirationTime('30d').sign(secret());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 30 });
}
export async function endSession() { (await cookies()).delete(COOKIE); }
export async function currentUser() {
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return null;
  try { const { payload } = await jwtVerify(t, secret()); return payload.sub ? await prisma.user.findUnique({ where: { id: payload.sub } }) : null; } catch { return null; }
}
export const publicUser = (u: { username: string; email: string | null; emailVerifiedAt: Date | null }) => ({ username: u.username, email: u.email, emailVerified: !!u.emailVerifiedAt });

// Simple in-memory throttle (per server instance). Use a shared store (e.g. Upstash) for strict limits.
const hits = new Map<string, { n: number; t: number }>();
export function throttled(key: string, max = 8, windowMs = 10 * 60_000) {
  const now = Date.now(), h = hits.get(key);
  if (!h || now - h.t > windowMs) { hits.set(key, { n: 1, t: now }); return false; }
  return ++h.n > max;
}
