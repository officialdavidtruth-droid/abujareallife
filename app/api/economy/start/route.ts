import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { currentUser, err } from '../../../../lib/auth';
import { ACTS } from '../../../../lib/economy';

// Charges the cost of an action (atomically) and opens a job ticket for paid work.
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return err('Not signed in.', 401);
  const key = String((await req.json().catch(() => ({}))).act || ''), a = ACTS[key];
  if (!a) return err('Unknown action.');
  const save = await prisma.save.findUnique({ where: { userId: u.id } });
  if (!save) return err('Create your character first.', 409);
  if (a.cost) {
    const r = await prisma.save.updateMany({ where: { userId: u.id, cash: { gte: a.cost } }, data: { cash: { decrement: a.cost } } });
    if (!r.count) { const s = await prisma.save.findUnique({ where: { userId: u.id } }); return NextResponse.json({ error: "You can't afford that.", cash: s?.cash ?? 0 }, { status: 402 }); }
    await prisma.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -a.cost, description: key } });
  }
  if (a.pay) await prisma.save.update({ where: { userId: u.id }, data: { jobAct: key, jobAt: new Date() } });
  const s = await prisma.save.findUnique({ where: { userId: u.id } });
  return NextResponse.json({ cash: s?.cash ?? 0 });
}
