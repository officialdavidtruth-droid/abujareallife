import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, throttled } from '../../../lib/auth';
import { insideBiz, loadState } from '../../../lib/game';
import { MAX_STACK } from '../../../lib/catalog';
import { BUST_HEAT, HEAT_BUY, HEAT_SELL, ITEM, ITEM_NAME, MAX_PER_DEAL, SAT_WINDOW_MS, bustChance, buyPrice, dealerAt, sellPrice } from '../../../lib/dealers';
export const dynamic = 'force-dynamic';
class Stop extends Error { constructor(public msg: string, public code = 400) { super(msg); } }

const owned = async (userId: string) => (await prisma.inventoryItem.findUnique({ where: { userId_itemKey: { userId, itemKey: ITEM } } }))?.quantity || 0;
// Units sold to the buyer in the last 10 minutes (read from the transaction log, so it survives restarts).
async function soldRecently(userId: string) {
  const rows = await prisma.transaction.findMany({ where: { userId, description: { startsWith: 'dealer:sell:' }, createdAt: { gt: new Date(Date.now() - SAT_WINDOW_MS) } }, select: { description: true } });
  return rows.reduce((a: number, r: { description: string }) => a + (Number(r.description.split(':')[2]) || 0), 0);
}

/* POST { action: 'poll' | 'buy' | 'sell', qty }.  You must be inside the building where that dealer works (server-tracked).
   Supplier (Market): you buy weed. Buyer (Nightclub): you sell it, at a price that falls if you flood him.
   Selling can get you busted: the weed is seized, no money, extra heat. Officers cannot deal. */
export async function POST(req: Request) {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    const st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
    if (st.jailLeft) return err('You are in jail.', 403);
    const b = await req.json().catch(() => ({})), action = String(b.action || 'poll');
    const biz = insideBiz(st.save), dealer = biz ? dealerAt(biz.type) : null;
    if (!dealer) return err('No dealer here.', 403);
    if (action === 'poll') {
      const sold = await soldRecently(u.id);
      return NextResponse.json({ dealer, price: dealer.role === 'supplier' ? buyPrice() : sellPrice(sold), soldRecently: sold, have: await owned(u.id), cash: st.save.cash, heat: st.save.heat, cop: st.profile.profession === 'police' });
    }
    if (st.profile.profession === 'police') return err('Officers cannot deal.', 403);
    if (throttled('dealer:' + u.id, 30, 10 * 60_000)) return err('Slow down.', 429);
    const qty = Math.floor(Number(b.qty) || 0); if (!(qty >= 1 && qty <= MAX_PER_DEAL)) return err(`Choose 1 to ${MAX_PER_DEAL}.`);

    if (action === 'buy') {
      if (dealer.role !== 'supplier') return err(`${dealer.name} does not sell. He only buys.`, 409);
      const have = await owned(u.id); if (have + qty > MAX_STACK) return err(`You can carry at most ${MAX_STACK}.`, 409);
      const cost = buyPrice() * qty, heat = Math.min(200, st.save.heat + HEAT_BUY * qty);
      try {
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          const r = await tx.save.updateMany({ where: { userId: u.id, cash: { gte: cost } }, data: { cash: { decrement: cost }, heat, heatAt: new Date() } });
          if (!r.count) throw new Stop("You can't afford that.", 402);
          await tx.inventoryItem.upsert({ where: { userId_itemKey: { userId: u.id, itemKey: ITEM } }, create: { userId: u.id, itemKey: ITEM, name: ITEM_NAME, quantity: qty }, update: { quantity: { increment: qty } } });
          await tx.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -cost, description: `dealer:buy:${qty}` } });
          await tx.crime.create({ data: { userId: u.id, kind: 'drug_buy', caught: false, loot: 0 } });
        });
      } catch (e) { if (e instanceof Stop) return err(e.msg, e.code); throw e; }
      const n = await loadState(u.id);
      return NextResponse.json({ ok: true, qty, spent: cost, have: await owned(u.id), cash: n!.save.cash, heat: n!.save.heat, wanted: n!.save.heat >= 40 });
    }

    if (action === 'sell') {
      if (dealer.role !== 'buyer') return err(`${dealer.name} does not buy. Find your buyer.`, 409);
      const sold = await soldRecently(u.id), price = sellPrice(sold), pay = price * qty;
      const busted = Math.random() < bustChance(st.save.heat, qty), heat = Math.min(200, st.save.heat + (busted ? BUST_HEAT : HEAT_SELL * qty));
      try {
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          const t = await tx.inventoryItem.updateMany({ where: { userId: u.id, itemKey: ITEM, quantity: { gte: qty } }, data: { quantity: { decrement: qty } } });
          if (!t.count) throw new Stop("You don't have that much weed.", 409);
          await tx.save.update({ where: { userId: u.id }, data: { heat, heatAt: new Date(), ...(busted ? {} : { cash: { increment: pay } }) } });
          if (!busted) await tx.transaction.create({ data: { userId: u.id, type: 'CRIME', amount: pay, description: `dealer:sell:${qty}` } });
          await tx.crime.create({ data: { userId: u.id, kind: 'drug_sell', caught: busted, loot: busted ? 0 : pay } });
        });
      } catch (e) { if (e instanceof Stop) return err(e.msg, e.code); throw e; }
      const n = await loadState(u.id);
      return NextResponse.json({ ok: true, busted, qty, earned: busted ? 0 : pay, price, have: await owned(u.id), cash: n!.save.cash, heat: n!.save.heat, wanted: n!.save.heat >= 40 });
    }
    return err('Unknown action.');
  } catch (e) { console.error(e); return err('Server error.', 500); }
}
