import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, throttled } from '../../../lib/auth';
import { loadState } from '../../../lib/game';
import { OFFICER_HEAT, ROB_COOLDOWN_MS, ROB_HEAT, ROB_MAX, ROB_MIN, ROB_PCT, ROB_RANGE } from '../../../lib/profile';
import { checkNear } from '../../../lib/proximity';
export const dynamic = 'force-dynamic';

/* Mug a real player standing next to you. Server checks: you are signed in, free, not an officer on duty; the victim is
   online, not jailed, and really within reach (plausible reported positions). You take 30% of their cash (max ₦150k) and get heat. */
export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({}));
  const target = String(b.target || '').trim(); if (!target) return err('Nobody to rob.');
  if (throttled(`rob:${u.id}:${target.toLowerCase()}`, 1, ROB_COOLDOWN_MS)) return err('You just robbed them. Give it a minute.', 429);
  if (throttled('rob:any:' + u.id, 8, 10 * 60_000)) return err('Slow down.', 429);
  const me = await loadState(u.id); if (!me) return err('Create your character first.', 409);
  if (me.jailLeft) return err('You are in jail.', 403);
  if (me.profile.profession === 'police') return err('Officers cannot commit crimes on duty.', 403);
  const near = await checkNear(u.id, target, { x: Number(b.sx), z: Number(b.sz) }, { x: Number(b.tx), z: Number(b.tz) }, ROB_RANGE);
  if (!near.ok) return err(near.reason, 409);
  const vs = await loadState(near.him.userId); if (!vs) return err('Nobody to rob.');
  if (vs.jailLeft) return err('They are locked up.', 409);
  const amount = Math.min(ROB_MAX, Math.floor(vs.save.cash * ROB_PCT));
  const heat = Math.min(200, me.save.heat + ROB_HEAT + (vs.profile.profession === 'police' ? OFFICER_HEAT : 0));
  if (amount < ROB_MIN) {   // nothing worth taking: still a crime attempt
    await prisma.save.update({ where: { userId: u.id }, data: { heat, heatAt: new Date() } });
    return NextResponse.json({ ok: true, amount: 0, heat, wanted: heat >= 40, cash: me.save.cash, victim: near.him.username });
  }
  try {
    await prisma.$transaction(async tx => {
      const took = await tx.save.updateMany({ where: { userId: near.him.userId, cash: { gte: amount } }, data: { cash: { decrement: amount } } });
      if (took.count !== 1) throw new Error('moved');
      await tx.save.update({ where: { userId: u.id }, data: { cash: { increment: amount }, heat, heatAt: new Date() } });
      await tx.transaction.createMany({ data: [
        { userId: u.id, type: 'CRIME', amount, description: 'rob:' + near.him.username },
        { userId: near.him.userId, type: 'SPEND', amount: -amount, description: 'robbed:' + u.username },
      ] });
      await tx.crime.create({ data: { userId: u.id, kind: 'rob_player', caught: false, loot: amount } });
    });
  } catch { return err('They slipped away. Try again.', 409); }
  const n = await loadState(u.id);
  return NextResponse.json({ ok: true, amount, heat: n!.save.heat, wanted: n!.save.heat >= 40, cash: n!.save.cash, victim: near.him.username });
}
