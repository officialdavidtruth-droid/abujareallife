import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';
import { addSkillXp, insideBiz, loadState } from '../../../lib/game';
import { SHOP } from '../../../lib/interiors';
import { MAX_STACK, storeItem } from '../../../lib/catalog';
import { MEALS_KEY, PANTRY_MAX, SUPPLIES_KEY } from '../../../lib/pantry';
import { VEHICLE_CATALOG } from '../../../lib/vehicles';
import { COGS_RATE, priceOf, sellable } from '../../../lib/bizEconomy';
import { CITY } from '../../../lib/cityData';
// Prices live on the server. You can only buy what the building you are inside sells.
// Two kinds of goods: the building's own services (food, courses, the car dealer) and the big store catalog (lib/catalog.ts).
export const dynamic = 'force-dynamic';
type Tx = Prisma.TransactionClient;
/* A player-run business sells at its owner's prices and keeps the sale (minus the supplier's cut). Unowned buildings sell at list price. */
const cfg = (b: { markup: number; prices: unknown }) => ({ markup: b.markup, prices: b.prices });
async function creditOwner(tx: Tx, bizRowId: string, total: number, listTotal: number) {
  const cogs = Math.round(listTotal * COGS_RATE);
  await tx.playerBusiness.update({ where: { id: bizRowId }, data: { balance: { increment: total - cogs }, revenue: { increment: total }, expenses: { increment: cogs } } });
}
// GET /api/shop            -> who runs the building you are inside and what they charge
// GET /api/shop?compare=ID -> every player-run shop selling ID, cheapest first (so players can shop around, and owners can see who to undercut)
export async function GET(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const cmp = new URL(req.url).searchParams.get('compare');
  if (cmp) {
    const rows = await prisma.playerBusiness.findMany({ select: { businessId: true, name: true, type: true, district: true, markup: true, prices: true, user: { select: { username: true } } } });
    let list: number | null = null;
    const shops = rows.flatMap(r => { const p = priceOf(r.type, cfg(r), cmp), b = CITY.businesses.find(x => x.id === r.businessId); if (p == null || !b) return []; list = sellable(r.type).find(x => x.id === cmp)?.base ?? list; return [{ businessId: r.businessId, name: r.name, district: r.district, owner: r.user.username, price: p, x: b.x, z: b.z }]; }).sort((a, b) => a.price - b.price).slice(0, 12);
    return NextResponse.json({ item: cmp, list, shops });
  }
  const st = await loadState(u.id); const biz = st && insideBiz(st.save); if (!biz) return NextResponse.json({ owner: null });
  const row = await prisma.playerBusiness.findUnique({ where: { businessId: biz.id }, select: { markup: true, prices: true, user: { select: { username: true } } } });
  if (!row) return NextResponse.json({ owner: null });
  return NextResponse.json({ owner: row.user.username, markup: row.markup, prices: Object.fromEntries(sellable(biz.type).map(s => [s.id, priceOf(biz.type, cfg(row), s.id) ?? s.base])) });
}

export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
  if (st.jailLeft) return err('You are in jail.', 403);
  const biz = insideBiz(st.save); if (!biz) return err('You are not inside a building.', 403);
  const body = await req.json().catch(() => ({})), want = String(body.item);
  const own = await prisma.playerBusiness.findUnique({ where: { businessId: biz.id } });
  const unit = (id: string, list: number) => (own ? priceOf(biz.type, cfg(own), id) ?? list : list);

  const item = (SHOP[biz.type] || []).find(i => i.id === want);
  if (!item) { // not a service: maybe it is something from the store catalog
    const g = storeItem(biz.type, want); if (!g) return err('Not sold here.');
    const qty = Math.max(1, Math.min(g.use ? 10 : g.pantry ? 10 : 20, Math.floor(Number(body.qty) || 1))), total = unit(g.id, g.cost) * qty;
    const pKey = g.pantry === 'meals' ? MEALS_KEY : g.pantry === 'supplies' ? SUPPLIES_KEY : '', pUnits = (g.units || 0) * qty;
    if (pKey) { const have = await prisma.inventoryItem.findUnique({ where: { userId_itemKey: { userId: u.id, itemKey: pKey } } }); if ((have?.quantity || 0) + pUnits > PANTRY_MAX) return err(`Your ${g.pantry === 'meals' ? 'pantry' : 'bathroom cupboard'} is full. Use some up first.`, 409); }
    else if (!g.use) { const have = await prisma.inventoryItem.findUnique({ where: { userId_itemKey: { userId: u.id, itemKey: g.id } } }); if ((have?.quantity || 0) + qty > MAX_STACK) return err(`You can carry at most ${MAX_STACK} of those.`, 409); }
    const ok = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const r = await tx.save.updateMany({ where: { userId: u.id, cash: { gte: total } }, data: { cash: { decrement: total } } }); if (!r.count) return false;
      if (pKey) await tx.inventoryItem.upsert({ where: { userId_itemKey: { userId: u.id, itemKey: pKey } }, create: { userId: u.id, itemKey: pKey, name: g.pantry === 'meals' ? 'Pantry meals' : 'Toiletry supplies', quantity: pUnits }, update: { quantity: { increment: pUnits } } });
      else if (!g.use) await tx.inventoryItem.upsert({ where: { userId_itemKey: { userId: u.id, itemKey: g.id } }, create: { userId: u.id, itemKey: g.id, name: g.name, quantity: qty }, update: { quantity: { increment: qty } } });
      await tx.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -total, description: `store:${biz.type}:${g.id}x${qty}` } });
      if (own) await creditOwner(tx, own.id, total, g.cost * qty);
      return true;
    });
    if (!ok) return err("You can't afford that.", 402);
    const n = await loadState(u.id), fx = g.use && g.fx ? Object.fromEntries(Object.entries(g.fx).map(([k, v]) => [k, (v as number) * qty])) : {};
    const owned = g.use || pKey ? 0 : (await prisma.inventoryItem.findUnique({ where: { userId_itemKey: { userId: u.id, itemKey: g.id } } }))?.quantity || 0;
    const pantryRows = pKey ? await prisma.inventoryItem.findMany({ where: { userId: u.id, itemKey: { in: [MEALS_KEY, SUPPLIES_KEY] } }, select: { itemKey: true, quantity: true } }) : [];
    const pantry = pKey ? { meals: pantryRows.find((r: { itemKey: string }) => r.itemKey === MEALS_KEY)?.quantity || 0, supplies: pantryRows.find((r: { itemKey: string }) => r.itemKey === SUPPLIES_KEY)?.quantity || 0 } : undefined;
    return NextResponse.json({ ok: true, hasCar: n!.save.hasCar, cash: n!.save.cash, fx, profile: n!.profile, owned, spent: total, pantry, units: pUnits });
  }

  if (item.grant === 'car' && st.save.hasCar) return err('You already own a car.', 409);
  const cost = unit(item.id, item.cost);
  const bought = await prisma.$transaction(async (tx: Tx) => {
    const r = await tx.save.updateMany({ where: { userId: u.id, cash: { gte: cost }, ...(item.grant === 'car' ? { hasCar: false } : {}) }, data: { cash: { decrement: cost }, ...(item.grant === 'car' ? { hasCar: true } : {}), ...(item.xp ? { profile: addSkillXp(st.profile, item.xp.skill, item.xp.amt) } : {}) } });
    if (!r.count) return false;
    if (item.grant === 'car') { const base = VEHICLE_CATALOG[0]; await tx.vehicle.create({ data: { userId: u.id, name: `${base.brand} ${base.model}`, type: base.type, price: base.price } }); }
    await tx.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -cost, description: `shop:${biz.type}:${item.id}` } });
    if (own) await creditOwner(tx, own.id, cost, item.cost);
    return true;
  });
  if (!bought) return err("You can't afford that.", 402);
  const n = await loadState(u.id);
  return NextResponse.json({ ok: true, hasCar: n!.save.hasCar, cash: n!.save.cash, fx: item.fx || {}, profile: n!.profile });
}
