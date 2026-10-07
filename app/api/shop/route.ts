import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';
import { addSkillXp, insideBiz, loadState } from '../../../lib/game';
import { SHOP } from '../../../lib/interiors';
import { MAX_STACK, storeItem } from '../../../lib/catalog';
import { VEHICLE_CATALOG } from '../../../lib/vehicles';
// Prices live on the server. You can only buy what the building you are inside sells.
// Two kinds of goods: the building's own services (food, courses, the car dealer) and the big store catalog (lib/catalog.ts).
export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
  if (st.jailLeft) return err('You are in jail.', 403);
  const biz = insideBiz(st.save); if (!biz) return err('You are not inside a building.', 403);
  const body = await req.json().catch(() => ({})), want = String(body.item);

  const item = (SHOP[biz.type] || []).find(i => i.id === want);
  if (!item) { // not a service: maybe it is something from the store catalog
    const g = storeItem(biz.type, want); if (!g) return err('Not sold here.');
    const qty = Math.max(1, Math.min(g.use ? 10 : 20, Math.floor(Number(body.qty) || 1))), total = g.cost * qty;
    if (!g.use) { const have = await prisma.inventoryItem.findUnique({ where: { userId_itemKey: { userId: u.id, itemKey: g.id } } }); if ((have?.quantity || 0) + qty > MAX_STACK) return err(`You can carry at most ${MAX_STACK} of those.`, 409); }
    const ok = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const r = await tx.save.updateMany({ where: { userId: u.id, cash: { gte: total } }, data: { cash: { decrement: total } } }); if (!r.count) return false;
      if (!g.use) await tx.inventoryItem.upsert({ where: { userId_itemKey: { userId: u.id, itemKey: g.id } }, create: { userId: u.id, itemKey: g.id, name: g.name, quantity: qty }, update: { quantity: { increment: qty } } });
      await tx.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -total, description: `store:${biz.type}:${g.id}x${qty}` } });
      return true;
    });
    if (!ok) return err("You can't afford that.", 402);
    const n = await loadState(u.id), fx = g.use && g.fx ? Object.fromEntries(Object.entries(g.fx).map(([k, v]) => [k, (v as number) * qty])) : {};
    const owned = g.use ? 0 : (await prisma.inventoryItem.findUnique({ where: { userId_itemKey: { userId: u.id, itemKey: g.id } } }))?.quantity || 0;
    return NextResponse.json({ ok: true, hasCar: n!.save.hasCar, cash: n!.save.cash, fx, profile: n!.profile, owned, spent: total });
  }

  if (item.grant === 'car' && st.save.hasCar) return err('You already own a car.', 409);
  const r = await prisma.save.updateMany({ where: { userId: u.id, cash: { gte: item.cost }, ...(item.grant === 'car' ? { hasCar: false } : {}) }, data: { cash: { decrement: item.cost }, ...(item.grant === 'car' ? { hasCar: true } : {}), ...(item.xp ? { profile: addSkillXp(st.profile, item.xp.skill, item.xp.amt) } : {}) } });
  if (!r.count) return err("You can't afford that.", 402);
  if (item.grant === 'car') {
    const base = VEHICLE_CATALOG[0];
    await prisma.vehicle.create({ data: { userId: u.id, name: `${base.brand} ${base.model}`, type: base.type, price: base.price } });
  }
  await prisma.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -item.cost, description: `shop:${biz.type}:${item.id}` } });
  const n = await loadState(u.id);
  return NextResponse.json({ ok: true, hasCar: n!.save.hasCar, cash: n!.save.cash, fx: item.fx || {}, profile: n!.profile });
}
