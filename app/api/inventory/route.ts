import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';
import { itemById } from '../../../lib/catalog';
// What you own (from the store). Only items that exist in the catalog are returned.
export const dynamic = 'force-dynamic';
export async function GET() {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const rows = await prisma.inventoryItem.findMany({ where: { userId: u.id, quantity: { gt: 0 } }, orderBy: { updatedAt: 'desc' } });
  return NextResponse.json({ items: rows.filter((r: { itemKey: string }) => itemById(r.itemKey)).map((r: { itemKey: string; quantity: number }) => ({ id: r.itemKey, qty: r.quantity })) });
}
