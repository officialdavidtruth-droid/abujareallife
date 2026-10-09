import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';
import { paystackConfigured } from '../../../lib/paystack';
import { TOPUPS } from '../../../lib/wallet';
export const dynamic = 'force-dynamic';
export async function GET() {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const [save, history] = await Promise.all([
    prisma.save.findUnique({ where: { userId: u.id }, select: { cash: true } }),
    prisma.transaction.findMany({ where: { userId: u.id, type: 'TOPUP' }, orderBy: { createdAt: 'desc' }, take: 8, select: { amount: true, description: true, createdAt: true } }),
  ]);
  return NextResponse.json({ ok: true, cash: save?.cash ?? 0, packages: TOPUPS, hasEmail: !!u.email, configured: paystackConfigured(),
    history: history.map(h => ({ coins: h.amount, pkg: h.description.split(':')[1] || '', at: h.createdAt })) });
}
