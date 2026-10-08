import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, serverError } from '../../../lib/auth';
import { MEALS_KEY, SUPPLIES_KEY, USES } from '../../../lib/pantry';
export const dynamic = 'force-dynamic';

async function counts(userId: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  const rows = await db.inventoryItem.findMany({ where: { userId, itemKey: { in: [MEALS_KEY, SUPPLIES_KEY] } }, select: { itemKey: true, quantity: true } });
  const q = (k: string) => Math.max(0, (rows as { itemKey: string; quantity: number }[]).find(r => r.itemKey === k)?.quantity || 0);
  return { meals: q(MEALS_KEY), supplies: q(SUPPLIES_KEY) };
}
export async function GET() {
  try { const u = await currentUser(); if (!u) return err('Not signed in.', 401); return NextResponse.json(await counts(u.id)); } catch (e) { return serverError(e); }
}
// POST { act }: use up what that home action needs. Meals are required; toiletries are "soft" (you can still shower, just without soap).
export async function POST(req: Request) {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    const act = String((await req.json().catch(() => ({}))).act || ''), use = USES[act]; if (!use) return err('Unknown action.');
    const out = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let short = false;
      if (use.meals) { const r = await tx.inventoryItem.updateMany({ where: { userId: u.id, itemKey: MEALS_KEY, quantity: { gte: use.meals } }, data: { quantity: { decrement: use.meals } } }); if (!r.count) return { ok: false as const, ...(await counts(u.id, tx)) }; }
      if (use.supplies) { const r = await tx.inventoryItem.updateMany({ where: { userId: u.id, itemKey: SUPPLIES_KEY, quantity: { gte: use.supplies } }, data: { quantity: { decrement: use.supplies } } }); if (!r.count) short = true; }
      return { ok: true as const, short, ...(await counts(u.id, tx)) };
    });
    if (!out.ok) return NextResponse.json({ error: 'You have no groceries left. Buy some at the Market or a Supermarket.', meals: out.meals, supplies: out.supplies }, { status: 409 });
    return NextResponse.json(out);
  } catch (e) { return serverError(e); }
}
