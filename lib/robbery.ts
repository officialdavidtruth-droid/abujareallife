import { prisma } from './prisma';
import { ROB_ANY_COOLDOWN_MS, ROB_KIND_COOLDOWN_MS, ROB_VICTIM_SHIELD_MS } from './profile';

/* Robbery cooldowns, decided by the server and stored in the database (Crime / Message rows), so they hold across serverless
   instances and cannot be skipped by a modified client. */
export const ROBBERY_KINDS = Object.keys(ROB_KIND_COOLDOWN_MS);
const LONGEST = Math.max(ROB_ANY_COOLDOWN_MS, ...Object.values(ROB_KIND_COOLDOWN_MS));

/** Milliseconds this player must still wait before attempting `kind` (0 = go ahead). */
export async function robCooldownLeft(userId: string, kind: string): Promise<number> {
  const now = Date.now();
  const rows = await prisma.crime.findMany({ where: { userId, kind: { in: ROBBERY_KINDS }, createdAt: { gt: new Date(now - LONGEST) } }, orderBy: { createdAt: 'desc' }, select: { kind: true, createdAt: true } });
  let left = 0;
  for (const r of rows) {
    const need = r.kind === kind ? Math.max(ROB_ANY_COOLDOWN_MS, ROB_KIND_COOLDOWN_MS[kind] ?? 0) : ROB_ANY_COOLDOWN_MS;
    left = Math.max(left, need - (now - r.createdAt.getTime()));
  }
  return Math.max(0, left);
}

/** Milliseconds a player stays untouchable after being robbed (0 = can be robbed). */
export async function victimShieldLeft(victimName: string): Promise<number> {
  const m = await prisma.message.findFirst({ where: { toName: victimName, kind: 'robbed', createdAt: { gt: new Date(Date.now() - ROB_VICTIM_SHIELD_MS) } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
  return m ? Math.max(0, ROB_VICTIM_SHIELD_MS - (Date.now() - m.createdAt.getTime())) : 0;
}
export const secs = (ms: number) => Math.max(1, Math.ceil(ms / 1000));
