import { SignJWT, jwtVerify } from 'jose';
/* A "hit ticket" is the server's signed permission for ONE shot to damage ONE player.
   The shooter cannot forge or edit it (damage, target and weapon are inside the signature), and the victim's client only
   applies damage that /api/shot/confirm returns for a valid, unexpired, unused ticket.
   It is signed with a key derived from AUTH_SECRET, so a session cookie can never be used as a ticket (or the other way round). */
const key = () => {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error('AUTH_SECRET must be set (32+ characters).');
  return new TextEncoder().encode(s + ':shot-ticket');
};
export const TICKET_TTL_SECS = 12;
export type Ticket = { shooterId: string; shooter: string; targetId: string; weapon: string; damage: number; jti: string };

export async function signTicket(t: Omit<Ticket, 'jti'>) {
  const jti = crypto.randomUUID();
  const token = await new SignJWT({ u: t.shooter, w: t.weapon, d: t.damage })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(t.shooterId).setAudience(t.targetId).setJti(jti).setIssuedAt().setExpirationTime(`${TICKET_TTL_SECS}s`).sign(key());
  return { token, jti };
}
export async function verifyTicket(token: string): Promise<Ticket | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    const aud = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
    if (!payload.sub || !aud || !payload.jti || typeof payload.d !== 'number' || typeof payload.w !== 'string' || typeof payload.u !== 'string') return null;
    return { shooterId: payload.sub, shooter: payload.u, targetId: aud, weapon: payload.w, damage: payload.d, jti: payload.jti };
  } catch { return null; }
}

/* single-use tracking (best effort per server instance; the victim's client also remembers ids it has applied) */
const used = new Map<string, number>();
export function consumeTicket(jti: string) {
  const now = Date.now();
  for (const [k, exp] of used) if (exp < now) used.delete(k);
  if (used.has(jti)) return false;
  used.set(jti, now + (TICKET_TTL_SECS + 5) * 1000); return true;
}
