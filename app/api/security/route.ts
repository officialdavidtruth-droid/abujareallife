import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, serverError } from '../../../lib/auth';
import { loadState } from '../../../lib/game';
import { GUARDS, guardById, secFromRows, winChance } from '../../../lib/security';
// Home security: buy guard dogs and security guards that patrol your plot. The server owns prices and limits; guards are hidden inventory rows (sec_<id>).
export const dynamic = 'force-dynamic';
class Stop extends Error { constructor(public msg: string, public code = 400) { super(msg); } }
async function snapshot(userId: string) {
  const [rows, save] = await Promise.all([prisma.inventoryItem.findMany({ where: { userId, itemKey: { startsWith: 'sec_' }, quantity: { gt: 0 } }, select: { itemKey: true, quantity: true } }), prisma.save.findUnique({ where: { userId }, select: { cash: true } })]);
  const owned = secFromRows(rows as { itemKey: string; quantity: number }[]);
  return { owned, cash: save?.cash ?? 0, intruderOdds: Math.round(winChance(owned, 0) * 100) };   // chance a stranger with no skill gets in
}
export async function GET() {
  try { const u = await currentUser(); if (!u) return err('Not signed in.', 401); return NextResponse.json({ catalog: GUARDS, ...(await snapshot(u.id)) }); } catch (e) { return serverError(e); }
}
export async function POST(req: Request) {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    const st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
    if (st.jailLeft) return err('You are in jail.', 403);
    const b = await req.json().catch(() => ({})), g = guardById(String(b.id)); if (!g) return err('Unknown guard.', 404);
    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.$queryRaw`SELECT 1 FROM "Save" WHERE "userId" = ${u.id} FOR UPDATE`;   // parallel taps cannot buy past the limit or spend the same cash twice
        const mine = (await tx.inventoryItem.findMany({ where: { userId: u.id, itemKey: { startsWith: 'sec_' } }, select: { itemKey: true, quantity: true } })) as { itemKey: string; quantity: number }[];
        const have = secFromRows(mine);
        if (have[g.id] >= g.max) throw new Stop(`You already have the most ${g.name.toLowerCase()}s a plot can hold (${g.max}).`, 409);
        if (g.needs && have[g.needs] < 1) throw new Stop(`Hire a ${guardById(g.needs)?.name.toLowerCase()} first.`, 409);
        const r = await tx.save.updateMany({ where: { userId: u.id, cash: { gte: g.price } }, data: { cash: { decrement: g.price } } }); if (!r.count) throw new Stop("You can't afford that.", 402);
        await tx.inventoryItem.upsert({ where: { userId_itemKey: { userId: u.id, itemKey: g.key } }, create: { userId: u.id, itemKey: g.key, name: g.name, quantity: 1 }, update: { quantity: { increment: 1 } } });
        await tx.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -g.price, description: `security:${g.id}` } });
      });
    } catch (e) { if (e instanceof Stop) return err(e.msg, e.code); throw e; }
    return NextResponse.json({ ok: true, bought: g.name, ...(await snapshot(u.id)) });
  } catch (e) { return serverError(e); }
}
