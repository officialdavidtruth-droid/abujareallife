import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { prisma } from './prisma';

/* Advertiser accounts for /adbooking. They are separate from game accounts: own table, own cookie. */
const COOKIE = 'arl_ad';
const secret = () => { const s = process.env.AUTH_SECRET; if (!s || s.length < 32) throw new Error('AUTH_SECRET must be set (32+ characters).'); return new TextEncoder().encode(s); };

export async function startAdSession(id: string, sv: number) {
  const token = await new SignJWT({ k: 'ad', sv }).setProtectedHeader({ alg: 'HS256' }).setSubject(id).setIssuedAt().setExpirationTime('30d').sign(secret());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 30 });
}
export async function endAdSession() { (await cookies()).delete(COOKIE); }
export async function currentAdvertiser() {
  const t = (await cookies()).get(COOKIE)?.value; if (!t) return null;
  try {
    const { payload } = await jwtVerify(t, secret()); if (payload.k !== 'ad' || !payload.sub) return null;
    const a = await prisma.adAccount.findUnique({ where: { id: payload.sub } });
    return a && a.sessionVersion === (Number(payload.sv) || 0) ? a : null;
  } catch { return null; }
}
/** Reviewers: the emails listed in the ADMIN_EMAILS environment variable (comma separated). */
export const isAdAdmin = (email: string) => (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean).includes(email.toLowerCase());
export const publicAccount = (a: { email: string; name: string; business: string; phone: string }) => ({ email: a.email, name: a.name, business: a.business, phone: a.phone, admin: isAdAdmin(a.email) });
