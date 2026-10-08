import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, serverError } from '../../../lib/auth';
import { loadState } from '../../../lib/game';
import { UPGRADES, homeKey, upgradeById } from '../../../lib/homeUpgrades';
// Home upgrades (rooms + luxury items). Permanent, bought once, paid on the server.
export const dynamic = 'force-dynamic';
class Stop extends Error { constructor(public msg: string, public code = 400) { super(msg); } }
async function snapshot(userId: string) {
  const [rows, save] = await Promise.all([prisma.inventoryItem.findMany({ where: { userId, itemKey: { startsWith: 'home_' }, quantity: { gt: 0 } }, select: { itemKey: true } }), prisma.save.findUnique({ where: { userId }, select: { cash: true } })]);
  const keys = new Set((rows as { itemKey: string }[]).map(r => r.itemKey));
  return { owned: UPGRADES.filter(u => keys.has(homeKey(u.id))).map(u => u.id), cash: save?.cash ?? 0 };
}
export async function GET() {
  try { const u = await currentUser(); if (!u) return err('Not signed in.', 401); return NextResponse.json({ catalog: UPGRADES, ...(await snapshot(u.id)) }); } catch (e) { return serverError(e); }
}
export async function POST(req: Request) {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    const st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
    if (st.jailLeft) return err('You are in jail.', 403);
    const b = await req.json().catch(() => ({})), up = upgradeById(String(b.id)); if (!up) return err('Unknown upgrade.', 404);
    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        if (await tx.inventoryItem.findUnique({ where: { userId_itemKey: { userId: u.id, itemKey: homeKey(up.id) } } })) throw new Stop('You already have that.', 409);
        if (up.needs && !(await tx.inventoryItem.findUnique({ where: { userId_itemKey: { userId: u.id, itemKey: homeKey(up.needs) } } }))) throw new Stop(`Build the ${upgradeById(up.needs)?.name || 'required room'} first.`, 409);
        const r = await tx.save.updateMany({ where: { userId: u.id, cash: { gte: up.price } }, data: { cash: { decrement: up.price } } }); if (!r.count) throw new Stop("You can't afford that.", 402);
        await tx.inventoryItem.create({ data: { userId: u.id, itemKey: homeKey(up.id), name: up.name, quantity: 1 } });
        await tx.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -up.price, description: `home:${up.id}` } });
      });
    } catch (e) { if (e instanceof Stop) return err(e.msg, e.code); throw e; }
    return NextResponse.json({ ok: true, bought: up.name, ...(await snapshot(u.id)) });
  } catch (e) { return serverError(e); }
}
