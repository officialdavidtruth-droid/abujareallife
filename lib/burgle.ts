import { SignJWT, jwtVerify } from 'jose';
import { createHmac } from 'crypto';
/* A break-in ticket binds ONE player to ONE house and a start time. The outcome is rolled on the server from the ticket id with a
   server-only key, so the client can neither read nor choose it, and a ticket works once (the route marks it used). */
const secret = () => { const s = process.env.AUTH_SECRET; if (!s || s.length < 32) throw new Error('AUTH_SECRET must be set (32+ characters).'); return s; };
const jwtKey = () => new TextEncoder().encode(secret() + ':burgle-ticket');
export const burgleRoll = (jti: string, tag: string) => createHmac('sha256', secret() + ':burgle-roll').update(tag + jti).digest().readUInt32BE(0) / 0x100000000;
export type BurgleTicket = { userId: string; slot: number; start: number; jti: string };
export async function signBurgle(t: Omit<BurgleTicket, 'jti'>) {
  const jti = crypto.randomUUID();
  return { jti, token: await new SignJWT({ s: t.slot, t: t.start }).setProtectedHeader({ alg: 'HS256' }).setSubject(t.userId).setJti(jti).sign(jwtKey()) };
}
export async function verifyBurgle(token: string): Promise<BurgleTicket | null> {
  try {
    const { payload } = await jwtVerify(token, jwtKey(), { algorithms: ['HS256'] });
    if (!payload.sub || !payload.jti || typeof payload.s !== 'number' || typeof payload.t !== 'number') return null;
    return { userId: payload.sub, slot: payload.s, start: payload.t, jti: payload.jti };
  } catch { return null; }
}
