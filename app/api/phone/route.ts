import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, serverError } from '../../../lib/auth';
import { itemById } from '../../../lib/catalog';
import { PHONES, tierFromItems } from '../../../lib/phone';
// Your phone = the best smartphone in your bag (the store sells the same ones). POST buys a better one straight from the phone.
export const dynamic = 'force-dynamic';
const ids = PHONES.map(p => p.itemId).filter(Boolean);
const tierOf = async (userId: string) => tierFromItems((await prisma.inventoryItem.findMany({ where: { userId, itemKey: { in: ids }, quantity: { gt: 0 } }, select: { itemKey: true } })).map((r: { itemKey: string }) => r.itemKey));
const price = (id: string) => itemById(id)?.cost ?? 0;
export async function GET() {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    const s = await prisma.save.findUnique({ where: { userId: u.id }, select: { cash: true } });
    return NextResponse.json({ tier: await tierOf(u.id), cash: s?.cash ?? 0, prices: PHONES.map(p => price(p.itemId)) });
  } catch (e) { return serverError(e); }
}
export async function POST(req: Request) {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    const b = await req.json().catch(() => ({})), want = PHONES.find(p => p.tier === Math.floor(Number(b.tier)));
    if (!want || !want.itemId) return err('No such phone.');
    const have = await tierOf(u.id); if (want.tier <= have) return err('You already have a phone this good.', 409);
    const cost = price(want.itemId); if (!cost) return err('That phone is not available.');
    const ok = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const r = await tx.save.updateMany({ where: { userId: u.id, cash: { gte: cost } }, data: { cash: { decrement: cost } } }); if (!r.count) return false;
      await tx.inventoryItem.upsert({ where: { userId_itemKey: { userId: u.id, itemKey: want.itemId } }, create: { userId: u.id, itemKey: want.itemId, name: want.name, quantity: 1 }, update: { quantity: { increment: 1 } } });
      await tx.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -cost, description: `phone:${want.itemId}` } });
      return true;
    });
    if (!ok) return err("You can't afford that phone.", 402);
    const s = await prisma.save.findUnique({ where: { userId: u.id }, select: { cash: true } });
    return NextResponse.json({ ok: true, tier: want.tier, cash: s?.cash ?? 0 });
  } catch (e) { return serverError(e); }
}
