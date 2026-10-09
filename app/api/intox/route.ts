import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, throttled } from '../../../lib/auth';
import { insideBiz, loadState } from '../../../lib/game';
import { PASSOUT_DOWN_MS, PASSOUT_LEVEL_AFTER, downState } from '../../../lib/downed';
import { BAR_TYPES, BLACKOUT_AT, BLACKOUT_PENALTY, JOINT_HIGH, JOINT_ITEM, clamp100, drinkById } from '../../../lib/intoxication';
export const dynamic = 'force-dynamic';

/* GET: how many joints you carry (they are not in the store catalog, so /api/inventory does not list them). */
export async function GET() {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const row = await prisma.inventoryItem.findUnique({ where: { userId_itemKey: { userId: u.id, itemKey: JOINT_ITEM } } });
  return NextResponse.json({ joints: row?.quantity || 0 });
}

/* POST { action: 'drink', id } : buy and drink alcohol inside a bar / club / restaurant / hotel.
   POST { action: 'smoke' }     : smoke one joint from your inventory (you get weed from dealers, step 2).
   The server owns the levels. Hitting 100 means you pass out: the response says blackout:true and the need penalty to apply. */
export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  if (throttled('intox:' + u.id, 20, 60_000)) return err('Slow down.', 429);
  const st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
  if (st.jailLeft) return err('You are in jail.', 403);
  if (downState(st.save.downUntil).down) return err('You are out cold.', 403);
  const b = await req.json().catch(() => ({}));
  let drunk = st.save.drunk, high = st.save.high, spent = 0, label = '';

  if (b.action === 'drink') {
    const biz = insideBiz(st.save);
    if (!biz || !BAR_TYPES.includes(biz.type)) return err('Alcohol is only served in a club, restaurant or hotel.', 403);
    const d = drinkById(String(b.id)); if (!d) return err('Not on the menu.');
    const took = await prisma.save.updateMany({ where: { userId: u.id, cash: { gte: d.cost } }, data: { cash: { decrement: d.cost } } });
    if (!took.count) return err("You can't afford that.", 402);
    await prisma.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -d.cost, description: `drink:${d.id}` } });
    drunk = clamp100(drunk + d.drunk); spent = d.cost; label = d.label;
  } else if (b.action === 'smoke') {
    const used = await prisma.inventoryItem.updateMany({ where: { userId: u.id, itemKey: JOINT_ITEM, quantity: { gte: 1 } }, data: { quantity: { decrement: 1 } } });
    if (!used.count) return err('You have no weed. Find a dealer.', 409);
    high = clamp100(high + JOINT_HIGH); label = 'joint';
  } else return err('Unknown action.');

  const blackout = drunk >= BLACKOUT_AT || high >= BLACKOUT_AT;
  // passing out: you lie there for PASSOUT_DOWN_MS (easy to rob) and wake up groggy, not at 100% again
  if (blackout) { drunk = Math.min(drunk, PASSOUT_LEVEL_AFTER); high = Math.min(high, PASSOUT_LEVEL_AFTER); }
  await prisma.save.update({ where: { userId: u.id }, data: { drunk, high, intoxAt: new Date(), ...(blackout ? { downUntil: new Date(Date.now() + PASSOUT_DOWN_MS), downKind: 'passout' } : {}) } });
  const n = await loadState(u.id);
  return NextResponse.json({ ok: true, label, spent, drunk, high, cash: n!.save.cash, blackout, downMs: blackout ? PASSOUT_DOWN_MS : 0, penalty: blackout ? BLACKOUT_PENALTY : null });
}
