import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, throttled } from '../../../lib/auth';
import { clampHeat, loadState } from '../../../lib/game';
import { downState } from '../../../lib/downed';
import { DEALS } from '../../../lib/nightlife';
import { NPC_ESCORT_COOLDOWN_MS, NPC_ESCORT_HEAT } from '../../../lib/streetNpc';
import { clubPerson } from '../../../lib/clubNpc';
import { CITY } from '../../../lib/cityData';
export const dynamic = 'force-dynamic';
class Stop extends Error { constructor(public msg: string, public code = 400) { super(msg); } }

/* Club companions, step 2: pay the companion you are talking to inside a Nightclub.
   The server decides everything that matters: the price comes from lib/clubNpc (never from the client), you must really be inside a nightclub,
   18+ confirmed, not an officer, not jailed or knocked out, you can afford it, and the same companion needs a break between clients.
   Money, heat and the receipt move in one transaction. Fictional adult nightlife; nothing explicit is shown anywhere. */
const adultOk = (u: { dateOfBirth: Date | null; adultContentAcceptedAt: Date | null } | null) => {
  if (!u?.dateOfBirth || !u.adultContentAcceptedAt) return false;
  const n = new Date(), cut = new Date(Date.UTC(n.getUTCFullYear() - 18, n.getUTCMonth(), n.getUTCDate())); return u.dateOfBirth <= cut;
};
export async function POST(req: Request) {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    const st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
    const b = await req.json().catch(() => ({})), npc = clubPerson(Number(b.npc));
    if (!npc || !npc.escort || !npc.price) return err('She is not that kind of company.', 409);
    if (st.jailLeft) return err('You are in jail.', 403);
    if (downState(st.save.downUntil).down) return err('You are out cold.', 403);
    if (st.profile.profession === 'police') return err('Officers cannot do this.', 403);
    const acct = await prisma.user.findUnique({ where: { id: u.id }, select: { dateOfBirth: true, adultContentAcceptedAt: true } });
    if (!adultOk(acct)) return err('Confirm that you are 18 or older first.', 403);
    const inside = st.save.inside ? CITY.businesses.find(x => x.id === st.save.inside) : null;
    if (!inside || inside.type !== 'Nightclub') return err('You need to be inside the club.', 409);
    if (throttled('club-company:' + u.id, 10, 10 * 60_000)) return err('Slow down.', 429);
    const tag = `club-company:${npc.idx}`;
    if (await prisma.transaction.findFirst({ where: { userId: u.id, description: tag, createdAt: { gt: new Date(Date.now() - NPC_ESCORT_COOLDOWN_MS) } }, select: { id: true } })) return err(`${npc.name} needs a break. Try again in a few minutes.`, 429);
    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const r = await tx.save.updateMany({ where: { userId: u.id, cash: { gte: npc.price! } }, data: { cash: { decrement: npc.price! }, heat: { increment: NPC_ESCORT_HEAT }, heatAt: new Date() } });
        if (!r.count) throw new Stop("You can't afford that.", 402);
        await clampHeat(tx, [u.id]);
        await tx.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -npc.price!, description: tag } });
      });
    } catch (e) { if (e instanceof Stop) return err(e.msg, e.code); throw e; }
    const n = await loadState(u.id);
    return NextResponse.json({ ok: true, spent: npc.price, cash: n!.save.cash, heat: n!.save.heat, wanted: n!.save.heat >= 40, fx: DEALS.company.fx });
  } catch (e) { console.error(e); return err('Server error.', 500); }
}
