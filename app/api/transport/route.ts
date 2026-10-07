import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';

const PRICE = { taxi: 2500, bike: 800 } as const;
export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({}));
  const kind = String(b.kind || '') as keyof typeof PRICE;
  if (!(kind in PRICE)) return err('Transport unavailable.', 400);
  const price = PRICE[kind];
  const save = await prisma.save.findUnique({ where: { userId: u.id } });
  if (!save) return err('Create your character first.', 409);
  if (save.cash < price) return err(`You need ₦${price.toLocaleString()} for this ride.`, 402);
  await prisma.$transaction([
    prisma.save.update({ where: { userId: u.id }, data: { cash: { decrement: price } } }),
    prisma.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -price, description: `${kind}:city transport` } }),
  ]);
  return NextResponse.json({ ok: true, price, cash: save.cash - price });
}
