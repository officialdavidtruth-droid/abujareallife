import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, serverError } from '../../../lib/auth';
import { defaultStyle, encodeStyle, sanitizeStyle, styleCost, withOwned } from '../../../lib/houseStyle';
// How your house on the street looks (components/HouseStyle.tsx, lib/houseStyle.ts). Colours are free; designs and extras are paid once on the server and can then be toggled for free.
// A NEPO baby already owns every design and extra. The look is one hidden inventory row (itemKey "home_style", metadata { s }), so there is no database migration.
export const dynamic = 'force-dynamic';
class Stop extends Error { constructor(public msg: string, public code = 400) { super(msg); } }
async function snapshot(userId: string, username: string) {
  const [u, row, save] = await Promise.all([prisma.user.findUnique({ where: { id: userId }, select: { origin: true } }), prisma.inventoryItem.findUnique({ where: { userId_itemKey: { userId, itemKey: 'home_style' } }, select: { metadata: true } }), prisma.save.findUnique({ where: { userId }, select: { cash: true } })]);
  const nepo = u?.origin === 'NEPO', saved = sanitizeStyle((row?.metadata as { s?: unknown } | null)?.s, nepo);
  return { nepo, style: saved ?? defaultStyle(username, nepo), cash: save?.cash ?? 0 };
}
export async function GET() {
  try { const u = await currentUser(); if (!u) return err('Not signed in.', 401); return NextResponse.json(await snapshot(u.id, u.username)); } catch (e) { return serverError(e); }
}
export async function POST(req: Request) {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    const cur = await snapshot(u.id, u.username);
    const b = await req.json().catch(() => ({})), want = sanitizeStyle(b.s, cur.nepo); if (!want) return err('That look is not valid.', 400);
    // ownership comes from the server, never from the request
    const cand = { ...want, od: cur.style.od, ox: cur.style.ox }, { cost, buys } = styleCost(cand, cur.nepo), final = withOwned(cand, cur.nepo);
    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        if (cost > 0) {
          const r = await tx.save.updateMany({ where: { userId: u.id, cash: { gte: cost } }, data: { cash: { decrement: cost } } }); if (!r.count) throw new Stop("You can't afford that.", 402);
          await tx.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -cost, description: `house-look:${buys.join('+').slice(0, 60)}` } });
        }
        await tx.inventoryItem.upsert({ where: { userId_itemKey: { userId: u.id, itemKey: 'home_style' } }, create: { userId: u.id, itemKey: 'home_style', name: 'House look', quantity: 1, metadata: { s: encodeStyle(final) } }, update: { metadata: { s: encodeStyle(final) } } });
      });
    } catch (e) { if (e instanceof Stop) return err(e.msg, e.code); throw e; }
    return NextResponse.json({ ok: true, paid: cost, bought: buys, ...(await snapshot(u.id, u.username)) });
  } catch (e) { return serverError(e); }
}
