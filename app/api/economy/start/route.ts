import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { currentUser, err } from '../../../../lib/auth';
import { ACTS } from '../../../../lib/economy';
import { downState } from '../../../../lib/downed';

// Charges the cost of an action (atomically) and opens a job ticket for paid work.
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return err('Not signed in.', 401);
  const key = String((await req.json().catch(() => ({}))).act || ''), a = ACTS[key];
  if (!a) return err('Unknown action.');
  const save = await prisma.save.findUnique({ where: { userId: u.id } });
  if (!save) return err('Create your character first.', 409);
  if (save.jailUntil && save.jailUntil.getTime() > Date.now()) return err('You are in jail.', 403);
  if (downState(save.downUntil).down) return err('You are out cold.', 403);
  // charge + ticket + record in ONE transaction: a failure can no longer take the money without opening the job (or the reverse)
  const ok = await prisma.$transaction(async tx => {
    if (a.cost) {
      const r = await tx.save.updateMany({ where: { userId: u.id, cash: { gte: a.cost } }, data: { cash: { decrement: a.cost } } });
      if (!r.count) return false;
      await tx.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -a.cost, description: key } });
    }
    if (a.pay) await tx.save.update({ where: { userId: u.id }, data: { jobAct: key, jobAt: new Date() } });
    return true;
  });
  if (!ok) { const s = await prisma.save.findUnique({ where: { userId: u.id } }); return NextResponse.json({ error: "You can't afford that.", cash: s?.cash ?? 0 }, { status: 402 }); }
  const s = await prisma.save.findUnique({ where: { userId: u.id } });
  return NextResponse.json({ cash: s?.cash ?? 0 });
}
