import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, serverError } from '../../../lib/auth';
import { loadState } from '../../../lib/game';
import { MAX_STACK, itemById } from '../../../lib/catalog';
import { itemSellValue, propertySellValue, vehicleSellValue } from '../../../lib/sell';
// Everything you own: store items, vehicles and properties, plus selling any of it back for cash (see lib/sell.ts for the values).
export const dynamic = 'force-dynamic';
class Stop extends Error { constructor(public msg: string, public code = 400) { super(msg); } }

async function snapshot(userId: string) {
  const [rows, vehicles, properties, save] = await Promise.all([
    prisma.inventoryItem.findMany({ where: { userId, quantity: { gt: 0 } }, orderBy: { updatedAt: 'desc' } }),
    prisma.vehicle.findMany({ where: { userId }, orderBy: { purchasedAt: 'desc' } }),
    prisma.property.findMany({ where: { userId }, orderBy: { purchasedAt: 'desc' } }),
    prisma.save.findUnique({ where: { userId }, select: { cash: true } }),
  ]);
  const items = (rows as { itemKey: string; quantity: number }[]).flatMap(r => { const it = itemById(r.itemKey); return it ? [{ id: r.itemKey, qty: r.quantity, name: it.name, e: it.e, cat: it.cat, cost: it.cost, sell: itemSellValue(it.cost) }] : []; });
  return {
    items, cash: save?.cash ?? 0,
    vehicles: (vehicles as { id: string; name: string; type: string; price: number; condition: number; fuel: number }[]).map(v => ({ id: v.id, name: v.name, type: v.type, price: v.price, condition: v.condition, fuel: v.fuel, sell: vehicleSellValue(v.price, v.condition) })),
    properties: (properties as { id: string; name: string; district: string; type: string; price: number; rent: number }[]).map(p => ({ id: p.id, name: p.name, district: p.district, type: p.type, price: p.price, rent: p.rent, sell: propertySellValue(p.price) })),
  };
}

export async function GET() {
  try { const u = await currentUser(); if (!u) return err('Not signed in.', 401); return NextResponse.json(await snapshot(u.id)); } catch (e) { return serverError(e); }
}

export async function POST(req: Request) {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    const st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
    if (st.jailLeft) return err('You are in jail.', 403);
    const b = await req.json().catch(() => ({})); if (b.action !== 'sell') return err('Unknown action.');
    const kind = String(b.kind), id = String(b.id || '');
    let gain = 0, label = '';
    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        if (kind === 'item') {
          const it = itemById(id); if (!it || it.use || it.cat === 'food') throw new Stop('That item cannot be sold.');
          const qty = Math.floor(Number(b.qty) || 1); if (!(qty >= 1 && qty <= MAX_STACK)) throw new Stop('Choose how many to sell.');
          const t = await tx.inventoryItem.updateMany({ where: { userId: u.id, itemKey: it.id, quantity: { gte: qty } }, data: { quantity: { decrement: qty } } });
          if (!t.count) throw new Stop("You don't have that many.", 409);
          gain = itemSellValue(it.cost) * qty; label = `${it.name} x${qty}`;
        } else if (kind === 'vehicle') {
          const v = await tx.vehicle.findFirst({ where: { id, userId: u.id } }); if (!v) throw new Stop('Vehicle not found.', 404);
          const d = await tx.vehicle.deleteMany({ where: { id: v.id, userId: u.id } }); if (!d.count) throw new Stop('Vehicle not found.', 404);
          gain = vehicleSellValue(v.price, v.condition); label = v.name;
          if ((await tx.vehicle.count({ where: { userId: u.id } })) === 0) await tx.save.update({ where: { userId: u.id }, data: { hasCar: false } });
        } else if (kind === 'property') {
          const p = await tx.property.findFirst({ where: { id, userId: u.id } }); if (!p) throw new Stop('Property not found.', 404);
          const d = await tx.property.deleteMany({ where: { id: p.id, userId: u.id } }); if (!d.count) throw new Stop('Property not found.', 404);
          gain = propertySellValue(p.price); label = p.name;
        } else throw new Stop('Unknown thing to sell.');
        await tx.save.update({ where: { userId: u.id }, data: { cash: { increment: gain } } });
        await tx.transaction.create({ data: { userId: u.id, type: 'EARN', amount: gain, description: `sold:${kind}:${label}`.slice(0, 120) } });
      });
    } catch (e) { if (e instanceof Stop) return err(e.msg, e.code); throw e; }
    return NextResponse.json({ ok: true, gained: gain, label, ...(await snapshot(u.id)) });
  } catch (e) { return serverError(e); }
}
