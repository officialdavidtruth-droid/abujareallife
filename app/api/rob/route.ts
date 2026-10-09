import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, throttled } from '../../../lib/auth';
import { loadState } from '../../../lib/game';
import { OFFICER_HEAT, ROB_HEAT, ROB_MAX, ROB_MIN, ROB_PCT, ROB_RANGE } from '../../../lib/profile';
import { DOWN_ROB_MAX, DOWN_ROB_PCT, downState } from '../../../lib/downed';
import { checkNear } from '../../../lib/proximity';
import { robCooldownLeft, secs, victimShieldLeft } from '../../../lib/robbery';
export const dynamic = 'force-dynamic';

/* Mug a real player standing next to you. Server checks: you are signed in, free, not an officer on duty; the victim is
   online, not jailed, and really within reach (plausible reported positions). You take 30% of their cash (max ₦150k) and get heat. */
export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({}));
  const target = String(b.target || '').trim(); if (!target) return err('Nobody to rob.');
  if (throttled('rob:burst:' + u.id, 1, 3_000) || throttled('rob:any:' + u.id, 8, 10 * 60_000)) return err('Slow down.', 429);
  const wait = await robCooldownLeft(u.id, 'rob_player');   // database-backed, so it holds on every server instance
  if (wait > 0) return NextResponse.json({ error: `Lie low for ${secs(wait)}s before your next robbery.`, retryIn: wait }, { status: 429 });
  const me = await loadState(u.id); if (!me) return err('Create your character first.', 409);
  if (me.jailLeft) return err('You are in jail.', 403);
  if (downState(me.save.downUntil).down) return err('You are out cold.', 403);
  if (me.profile.profession === 'police') return err('Officers cannot commit crimes on duty.', 403);
  const near = await checkNear(u.id, target, { x: Number(b.sx), z: Number(b.sz) }, { x: Number(b.tx), z: Number(b.tz) }, ROB_RANGE);
  if (!near.ok) return err(near.reason, 409);
  const vs = await loadState(near.him.userId); if (!vs) return err('Nobody to rob.');
  if (vs.jailLeft) return err('They are locked up.', 409);
  const ds = downState(vs.save.downUntil);   // out cold = easy pickings; just woke up = untouchable for a few seconds
  if (ds.safe) return NextResponse.json({ error: 'They just woke up. Give them a moment.', retryIn: ds.safeLeft }, { status: 429 });
  const shield = await victimShieldLeft(near.him.username);   // someone just robbed them: leave them alone for a bit
  if (shield > 0) return NextResponse.json({ error: 'They were just robbed. Give them a break.', retryIn: shield }, { status: 429 });
  const amount = ds.down ? Math.min(DOWN_ROB_MAX, Math.floor(vs.save.cash * DOWN_ROB_PCT)) : Math.min(ROB_MAX, Math.floor(vs.save.cash * ROB_PCT));
  const heat = Math.min(200, me.save.heat + ROB_HEAT + (vs.profile.profession === 'police' ? OFFICER_HEAT : 0));
  if (amount < ROB_MIN) {   // nothing worth taking: still a crime attempt
    await prisma.$transaction([
      prisma.save.update({ where: { userId: u.id }, data: { heat, heatAt: new Date() } }),
      prisma.crime.create({ data: { userId: u.id, kind: 'rob_player', caught: false, loot: 0 } }),   // counts toward the cooldown
    ]);
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
      // victim notification: stored server-side, so they see it even if they were not looking (it pops up through the phone message ping)
      await tx.message.create({ data: { fromId: u.id, fromName: u.username, toName: near.him.username, kind: 'robbed', body: `💸 ${u.username} robbed you of ₦${amount.toLocaleString('en-US')}${ds.down ? ' while you were out cold' : ''}!`, data: { amount, down: ds.down } } });
    });
  } catch { return err('They slipped away. Try again.', 409); }
  const n = await loadState(u.id);
  return NextResponse.json({ ok: true, amount, heat: n!.save.heat, wanted: n!.save.heat >= 40, cash: n!.save.cash, victim: near.him.username, down: ds.down });
}
