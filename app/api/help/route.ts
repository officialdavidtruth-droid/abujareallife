import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';
import { awardFame, loadState } from '../../../lib/game';
import { HELP_FAME, HELP_PER_DAY, HELP_PER_TARGET_MS, HELP_THANKS_FAME, HELP_TIP } from '../../../lib/profile';
// Help a player: you hand them a real tip (it leaves your balance), you both gain fame. Capped per day and per person.
export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
  if (st.jailLeft) return err('You are in jail.', 403);
  const name = String((await req.json().catch(() => ({}))).target || '').trim().toLowerCase();
  if (!name || name === u.username.toLowerCase()) return err('Pick another player to help.');
  const target = await prisma.user.findUnique({ where: { usernameKey: name }, select: { id: true, username: true } });
  if (!target || !(await prisma.save.findUnique({ where: { userId: target.id }, select: { id: true } }))) return err('Player not found.', 404);
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  const helpsToday = await prisma.transaction.count({ where: { userId: u.id, description: { startsWith: 'help:' }, createdAt: { gte: dayStart } } });
  if (helpsToday >= HELP_PER_DAY) return err(`You can help ${HELP_PER_DAY} people a day. Come back tomorrow.`, 429);
  const recent = await prisma.transaction.count({ where: { userId: u.id, description: `help:${target.id}`, createdAt: { gte: new Date(Date.now() - HELP_PER_TARGET_MS) } } });
  if (recent) return err(`You already helped ${target.username} recently.`, 429);
  const pay = await prisma.save.updateMany({ where: { userId: u.id, cash: { gte: HELP_TIP } }, data: { cash: { decrement: HELP_TIP } } });
  if (!pay.count) return err(`You need ₦${HELP_TIP.toLocaleString()} to help someone.`, 402);
  await prisma.save.update({ where: { userId: target.id }, data: { cash: { increment: HELP_TIP } } });
  await prisma.transaction.createMany({ data: [
    { userId: u.id, type: 'SPEND', amount: -HELP_TIP, description: `help:${target.id}` },
    { userId: target.id, type: 'EARN', amount: HELP_TIP, description: `helped-by:${u.id}` },
  ] });
  const fame = await awardFame(u.id, HELP_FAME); await awardFame(target.id, HELP_THANKS_FAME);
  const n = await loadState(u.id);
  return NextResponse.json({ ok: true, fame, tip: HELP_TIP, cash: n!.save.cash, target: target.username });
}
