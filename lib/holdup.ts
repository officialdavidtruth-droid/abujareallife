import { SignJWT, jwtVerify } from 'jose';
import { createHmac } from 'crypto';
import { CRIMES, HOLDUP } from './profile';
/* A hold-up ticket binds ONE player to ONE shop and a start time. The police arrival time and the loot size are NOT in it:
   they are derived from the ticket id with a server-only key, so the client cannot read them or pick better ones. */
const secret = () => {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error('AUTH_SECRET must be set (32+ characters).');
  return s;
};
const jwtKey = () => new TextEncoder().encode(secret() + ':holdup-ticket');
const rnd = (jti: string, tag: string) => createHmac('sha256', secret() + ':holdup-roll').update(tag + jti).digest().readUInt32BE(0) / 0x100000000;

export type HoldupTicket = { userId: string; biz: string; start: number; stealth: number; officers: number; jti: string };
export async function signHoldup(t: Omit<HoldupTicket, 'jti'>) {
  const jti = crypto.randomUUID();
  const token = await new SignJWT({ b: t.biz, t: t.start, s: t.stealth, o: t.officers }).setProtectedHeader({ alg: 'HS256' }).setSubject(t.userId).setJti(jti).sign(jwtKey());
  return { token, jti };
}
export async function verifyHoldup(token: string): Promise<HoldupTicket | null> {
  try {
    const { payload } = await jwtVerify(token, jwtKey(), { algorithms: ['HS256'] });
    if (!payload.sub || !payload.jti || typeof payload.b !== 'string' || typeof payload.t !== 'number' || typeof payload.s !== 'number' || typeof payload.o !== 'number') return null;
    return { userId: payload.sub, biz: payload.b, start: payload.t, stealth: payload.s, officers: payload.o, jti: payload.jti };
  } catch { return null; }
}
/** Seconds until the police arrive, and the full haul, for this ticket. */
export function holdupPlan(t: Pick<HoldupTicket, 'jti' | 'stealth' | 'officers'>) {
  const H = HOLDUP, [lo, hi] = CRIMES.rob_shop.loot;
  const base = H.etaMin + rnd(t.jti, 'eta') * (H.etaMax - H.etaMin) + Math.min(H.etaStealthMax, t.stealth * H.etaPerStealth);
  const eta = Math.max(H.etaFloor, base * (1 - Math.min(H.officerCutMax, t.officers * H.officerCut)));
  return { eta, loot: Math.floor(lo + rnd(t.jti, 'loot') * (hi - lo)) };
}
