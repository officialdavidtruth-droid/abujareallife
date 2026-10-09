import { SignJWT, jwtVerify } from 'jose';
import { createHmac } from 'crypto';
import { VEHICLE_CATALOG, type VehicleSpec } from './vehicles';
import { CHOP, PARTS, YARDS, chopCash, chopPartCount, type YardSite } from './chopData';
export { CHOP, PARTS, YARDS, partById, yardById } from './chopData';
export type { YardSite } from './chopData';

/* ───────── Step 6: the chop shop ─────────
   Steal a car off the street, drive it to a hidden yard before the police pin you down, then take cash or parts.
   A job TICKET (signed) says who stole which car, when, and which yard it must go to. What the client can NOT read from it:
   the police checkpoints (when they appear and whether you slip through) and the parts haul. Those are derived from the ticket id
   with a server-only key, exactly like the hold-up's police arrival time. */

const secret = () => {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error('AUTH_SECRET must be set (32+ characters).');
  return s;
};
const jwtKey = () => new TextEncoder().encode(secret() + ':chop-ticket');
const rnd = (jti: string, tag: string) => createHmac('sha256', secret() + ':chop-roll').update(tag + jti).digest().readUInt32BE(0) / 0x100000000;
const lerp = (r: readonly [number, number], t: number) => r[0] + (r[1] - r[0]) * t;

export type ChopTicket = { userId: string; start: number; vehicleId: string; yard: string; stealth: number; officers: number; speed: number; jti: string };
export async function signChop(t: Omit<ChopTicket, 'jti'> & { jti?: string }) {
  const jti = t.jti || crypto.randomUUID();
  const token = await new SignJWT({ t: t.start, v: t.vehicleId, y: t.yard, s: t.stealth, o: t.officers, p: t.speed })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(t.userId).setJti(jti).sign(jwtKey());
  return { token, jti };
}
export async function verifyChop(token: string): Promise<ChopTicket | null> {
  try {
    const { payload } = await jwtVerify(token, jwtKey(), { algorithms: ['HS256'] });
    if (!payload.sub || !payload.jti || typeof payload.t !== 'number' || typeof payload.v !== 'string' || typeof payload.y !== 'string' || typeof payload.s !== 'number' || typeof payload.o !== 'number' || typeof payload.p !== 'number') return null;
    return { userId: payload.sub, start: payload.t, vehicleId: payload.v, yard: payload.y, stealth: payload.s, officers: payload.o, speed: payload.p, jti: payload.jti };
  } catch { return null; }
}

/** The car being stolen, rolled from the ticket id (so the client cannot choose a Lexus LX). Cheap family cars are common, luxury is rare. */
const WEIGHTS: Record<string, number> = { 'toyota-corolla-2024': 22, 'toyota-camry-2024': 20, 'honda-accord-2024': 18, 'lexus-es-2024': 12, 'mercedes-c200-2024': 9, 'bmw-530i-2024': 7, 'land-rover-discovery-2024': 8, 'lexus-lx-2024': 4 };
export function rollCar(jti: string): { spec: VehicleSpec; condition: number; fuel: number; yard: YardSite } {
  const total = VEHICLE_CATALOG.reduce((a, v) => a + (WEIGHTS[v.id] || 5), 0);
  let r = rnd(jti, 'car') * total, spec = VEHICLE_CATALOG[0];
  for (const v of VEHICLE_CATALOG) { r -= WEIGHTS[v.id] || 5; if (r < 0) { spec = v; break; } }
  return { spec, condition: Math.floor(55 + rnd(jti, 'cond') * 40), fuel: Math.floor(45 + rnd(jti, 'fuel') * 40), yard: YARDS[Math.floor(rnd(jti, 'yard') * YARDS.length) % YARDS.length] };
}

/** Police checkpoints on the way: when each one is manned (seconds after the theft) and whether you slip through it. */
export function chopPlan(t: Pick<ChopTicket, 'jti' | 'stealth' | 'officers' | 'speed'>) {
  const C = CHOP;
  const pass = Math.max(C.passMin, Math.min(C.passMax, C.passBase + t.stealth * C.passPerStealth + (t.speed - 200) / C.passSpeed - t.officers * C.passPerOfficer));
  return { chance: pass, checkpoints: C.cps.map((r, i) => ({ at: lerp(r, rnd(t.jti, 'cp' + i)), ok: rnd(t.jti, 'pass' + i) < pass })) };
}

/** What the car is worth to the yard in cash, and the parts you would get instead. Both depend only on the stolen car, so the choice is yours at the gate. */
export function chopPayout(jti: string, price: number, condition: number) {
  const parts: Record<string, number> = {};
  for (let i = 0; i < chopPartCount(price); i++) { const p = PARTS[Math.floor(rnd(jti, 'part' + i) * PARTS.length) % PARTS.length]; parts[p.id] = (parts[p.id] || 0) + 1; }
  return { cash: chopCash(price, condition), parts: Object.entries(parts).map(([id, qty]) => ({ id, qty })) };
}
