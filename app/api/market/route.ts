import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';
import { loadState } from '../../../lib/game';
import { MAX_STACK, isStaple, itemById } from '../../../lib/catalog';
import { mallPrice } from '../../../lib/sell';
export const dynamic = 'force-dynamic';

// Player-to-player marketplace. The server owns every rule: items are held in escrow while listed, prices are bounded
// around the catalog price (so it can't be used to move money around for free), and the market keeps a small fee.
const FEE = 0.05, MAX_LISTINGS = 15, MIN_X = 0.1, MAX_X = 5;
const bounds = (cost: number) => ({ min: Math.max(1, Math.floor(cost * MIN_X)), max: Math.max(1, Math.floor(cost * MAX_X)) });
const fail = (m: string, code = 400) => err(m, code);
class Stop extends Error { constructor(public msg: string, public code = 400) { super(msg); } }

type Row = { id: string; sellerId: string; sellerName: string; itemKey: string; qty: number; price: number; soldQty: number; earned: number; status: string; createdAt: Date; updatedAt: Date };
const view = (r: Row, me: string) => { const it = itemById(r.itemKey); return it ? { id: r.id, itemKey: r.itemKey, name: it.name, e: it.e, cat: it.cat, cost: it.cost, qty: r.qty, price: r.price, seller: r.sellerName, mine: r.sellerId === me, soldQty: r.soldQty, earned: r.earned, at: r.createdAt.getTime() } : null; };

export async function GET(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const url = new URL(req.url), cat = url.searchParams.get('cat') || '', q = (url.searchParams.get('q') || '').toLowerCase().trim(), seller = (url.searchParams.get('seller') || '').toLowerCase().trim();
  const [open, mine, sold, save] = await Promise.all([
    prisma.listing.findMany({ where: { status: 'ACTIVE', qty: { gt: 0 } }, orderBy: { createdAt: 'desc' }, take: 300 }),
    prisma.listing.findMany({ where: { sellerId: u.id, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } }),
    prisma.listing.findMany({ where: { sellerId: u.id, soldQty: { gt: 0 } }, orderBy: { updatedAt: 'desc' }, take: 15 }),
    prisma.save.findUnique({ where: { userId: u.id }, select: { cash: true } }),
  ]);
  const browse = (open as Row[]).map(r => view(r, u.id)).filter((x): x is NonNullable<typeof x> => !!x)
    .filter(x => !isStaple(x) && (!cat || x.cat === cat) && (!q || x.name.toLowerCase().includes(q) || x.seller.toLowerCase().includes(q)) && (!seller || x.seller.toLowerCase() === seller));
  const b = Object.fromEntries(Array.from(new Set((open as Row[]).map(r => r.itemKey))).map(k => [k, itemById(k) ? bounds(itemById(k)!.cost) : null]));
  return NextResponse.json({ listings: browse, mine: (mine as Row[]).map(r => view(r, u.id)).filter(Boolean), sold: (sold as Row[]).map(r => view(r, u.id)).filter(Boolean), cash: save?.cash ?? 0, fee: FEE, bounds: b });
}

export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
  if (st.jailLeft) return fail('You are in jail.', 403);
  const b = await req.json().catch(() => ({})), action = String(b.action || '');
  try {
    if (action === 'list') {
      const it = itemById(String(b.itemKey)); if (!it || it.use || isStaple(it)) throw new Stop('That item cannot be sold.');
      const qty = Math.floor(Number(b.qty)), price = Math.floor(Number(b.price)), r = bounds(it.cost);
      if (!(qty >= 1 && qty <= MAX_STACK)) throw new Stop('Choose how many to sell.');
      if (!(price >= r.min && price <= r.max)) throw new Stop(`Price must be between ₦${r.min.toLocaleString()} and ₦${r.max.toLocaleString()} each.`);
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        if ((await tx.listing.count({ where: { sellerId: u.id, status: 'ACTIVE' } })) >= MAX_LISTINGS) throw new Stop(`You can have at most ${MAX_LISTINGS} active listings.`);
        const t = await tx.inventoryItem.updateMany({ where: { userId: u.id, itemKey: it.id, quantity: { gte: qty } }, data: { quantity: { decrement: qty } } });
        if (!t.count) throw new Stop("You don't have that many.", 409);
        await tx.listing.create({ data: { sellerId: u.id, sellerName: u.username, itemKey: it.id, qty, price } });
      });
    } else if (action === 'shop') { // the Abuja Online Mall: always in stock, delivered to your bag
      const it = itemById(String(b.itemKey)); if (!it || it.use || isStaple(it) || it.tag === 'part') throw new Stop('The mall does not sell that. Groceries and toiletries are bought in person at the Market, Supermarket or Pharmacy.');
      const n = Math.floor(Number(b.qty) || 1); if (!(n >= 1 && n <= 20)) throw new Stop('Choose how many to buy.');
      const total = mallPrice(it.cost) * n;
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const have = await tx.inventoryItem.findUnique({ where: { userId_itemKey: { userId: u.id, itemKey: it.id } } });
        if ((have?.quantity || 0) + n > MAX_STACK) throw new Stop(`You can carry at most ${MAX_STACK} of those.`, 409);
        const pay = await tx.save.updateMany({ where: { userId: u.id, cash: { gte: total } }, data: { cash: { decrement: total } } }); if (!pay.count) throw new Stop("You can't afford that.", 402);
        await tx.inventoryItem.upsert({ where: { userId_itemKey: { userId: u.id, itemKey: it.id } }, create: { userId: u.id, itemKey: it.id, name: it.name, quantity: n }, update: { quantity: { increment: n } } });
        await tx.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -total, description: `mall:${it.id}x${n}` } });
      });
    } else if (action === 'cancel') {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const l = await tx.listing.findUnique({ where: { id: String(b.id) } });
        if (!l || l.sellerId !== u.id || l.status !== 'ACTIVE') throw new Stop('Listing not found.', 404);
        const w = await tx.listing.updateMany({ where: { id: l.id, status: 'ACTIVE' }, data: { status: 'CANCELLED' } }); if (!w.count) throw new Stop('Listing not found.', 404);
        if (l.qty > 0) await tx.inventoryItem.upsert({ where: { userId_itemKey: { userId: u.id, itemKey: l.itemKey } }, create: { userId: u.id, itemKey: l.itemKey, name: itemById(l.itemKey)?.name || l.itemKey, quantity: l.qty }, update: { quantity: { increment: l.qty } } });
      });
    } else if (action === 'buy') {
      const n = Math.floor(Number(b.qty) || 1); if (n < 1) throw new Stop('Choose how many to buy.');
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const l = await tx.listing.findUnique({ where: { id: String(b.id) } });
        if (!l || l.status !== 'ACTIVE' || l.qty < n) throw new Stop('That listing just changed. Refresh and try again.', 409);
        if (l.sellerId === u.id) throw new Stop("That's your own listing.");
        const it = itemById(l.itemKey); if (!it) throw new Stop('Unknown item.');
        const have = await tx.inventoryItem.findUnique({ where: { userId_itemKey: { userId: u.id, itemKey: l.itemKey } } });
        if ((have?.quantity || 0) + n > MAX_STACK) throw new Stop(`You can carry at most ${MAX_STACK} of those.`, 409);
        const total = l.price * n, fee = Math.floor(total * FEE), payout = total - fee;
        const pay = await tx.save.updateMany({ where: { userId: u.id, cash: { gte: total } }, data: { cash: { decrement: total } } }); if (!pay.count) throw new Stop("You can't afford that.", 402);
        const taken = await tx.listing.updateMany({ where: { id: l.id, status: 'ACTIVE', qty: { gte: n } }, data: { qty: { decrement: n }, soldQty: { increment: n }, earned: { increment: payout } } });
        if (!taken.count) throw new Stop('That listing just changed. Refresh and try again.', 409); // rolls the payment back
        if (l.qty - n === 0) await tx.listing.update({ where: { id: l.id }, data: { status: 'SOLD' } });
        await tx.save.update({ where: { userId: l.sellerId }, data: { cash: { increment: payout } } });
        await tx.inventoryItem.upsert({ where: { userId_itemKey: { userId: u.id, itemKey: l.itemKey } }, create: { userId: u.id, itemKey: l.itemKey, name: it.name, quantity: n }, update: { quantity: { increment: n } } });
        await tx.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -total, description: `market:buy:${l.itemKey}x${n}:from:${l.sellerName}` } });
        await tx.transaction.create({ data: { userId: l.sellerId, type: 'EARN', amount: payout, description: `market:sell:${l.itemKey}x${n}:to:${u.username}` } });
      });
    } else return fail('Unknown action.');
  } catch (e) {
    if (e instanceof Stop) return fail(e.msg, e.code);
    return fail('Marketplace error. Try again.', 500);
  }
  const s = await prisma.save.findUnique({ where: { userId: u.id }, select: { cash: true } });
  return NextResponse.json({ ok: true, cash: s?.cash ?? 0 });
}
