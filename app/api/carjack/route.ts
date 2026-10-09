import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, throttled } from '../../../lib/auth';
import { loadState } from '../../../lib/game';
import { CARJACK_HEAT, CARJACK_RANGE } from '../../../lib/profile';
import { downState } from '../../../lib/downed';
import { checkNear } from '../../../lib/proximity';
export const dynamic = 'force-dynamic';

/* Steal a real player's car while they are driving it. The newest car they own changes owner, loses its registration and
   insurance and is marked stolen; the driver is thrown out (their client sees hasCar flip). The thief gets heat. */
export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({}));
  const target = String(b.target || '').trim(); if (!target) return err('Nobody to carjack.');
  if (throttled('carjack:' + u.id, 4, 10 * 60_000)) return err('Slow down.', 429);
  const me = await loadState(u.id); if (!me) return err('Create your character first.', 409);
  if (me.jailLeft) return err('You are in jail.', 403);
  if (downState(me.save.downUntil).down) return err('You are out cold.', 403);
  if (me.profile.profession === 'police') return err('Officers cannot commit crimes on duty.', 403);
  const near = await checkNear(u.id, target, { x: Number(b.sx), z: Number(b.sz) }, { x: Number(b.tx), z: Number(b.tz) }, CARJACK_RANGE);
  if (!near.ok) return err(near.reason, 409);
  if (!near.him.driving) return err('They are not driving.', 409);
  const car = await prisma.vehicle.findFirst({ where: { userId: near.him.userId }, orderBy: { purchasedAt: 'desc' } });
  if (!car) return err('They have no car to steal.', 409);
  const heat = Math.min(200, me.save.heat + CARJACK_HEAT);
  await prisma.$transaction(async tx => {
    await tx.vehicle.update({ where: { id: car.id }, data: { userId: u.id, stolen: true, registered: false, insured: false, parkedAt: null, purchasedAt: new Date() } });
    await tx.save.update({ where: { userId: u.id }, data: { hasCar: true, heat, heatAt: new Date() } });
    const left = await tx.vehicle.count({ where: { userId: near.him.userId } });
    await tx.save.update({ where: { userId: near.him.userId }, data: { hasCar: left > 0 } });
    await tx.crime.create({ data: { userId: u.id, kind: 'carjack_player', caught: false, loot: car.price } });
  });
  return NextResponse.json({ ok: true, car: car.name, heat, wanted: heat >= 40, victim: near.him.username });
}
