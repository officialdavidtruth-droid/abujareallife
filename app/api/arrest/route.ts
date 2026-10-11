import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, throttled } from '../../../lib/auth';
import { loadState } from '../../../lib/game';
import { JAIL_SECS_PER_HEAT, POLICE_ARREST_RANGE, POLICE_REWARD, WANTED_AT } from '../../../lib/profile';
import { checkNear } from '../../../lib/proximity';
// A REAL officer arrests a REAL wanted player. Server checks: caller is police, target is wanted and not already jailed.
export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  if (throttled('arrest:' + u.id, 12, 60_000)) return err('Slow down.', 429);
  const me = await loadState(u.id); if (!me || me.profile.profession !== 'police') return err('Only police officers can arrest.', 403);
  if (me.jailLeft) return err('You are in jail.', 403);
  const body = await req.json().catch(() => ({})), name = String(body.target || '').toLowerCase();
  const t = await prisma.user.findUnique({ where: { usernameKey: name } });
  if (!t || t.id === u.id) return err('No such player.');
  const ts = await loadState(t.id); if (!ts) return err('No such player.');
  if (ts.jailLeft || ts.save.heat < WANTED_AT) return err('That player is not wanted.', 409);

  // The officer must really be next to the suspect: either their reported world positions are within range (same plausibility rules as shooting and robbing),
  // or both are inside the same building. The range check used to live only in the browser.
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  let near = false;
  if ([body.sx, body.sz, body.tx, body.tz].every(num)) near = (await checkNear(u.id, t.username, { x: body.sx, z: body.sz }, { x: body.tx, z: body.tz }, POLICE_ARREST_RANGE)).ok;
  if (!near) { const fresh = Date.now() - 30 * 60_000; near = !!me.save.inside && me.save.inside === ts.save.inside && !!me.save.insideAt && !!ts.save.insideAt && me.save.insideAt.getTime() > fresh && ts.save.insideAt.getTime() > fresh; }
  if (!near) return err(`Get within ${POLICE_ARREST_RANGE} m of them first.`, 409);

  const secs = Math.ceil(ts.save.heat * JAIL_SECS_PER_HEAT), fine = Math.floor(ts.save.cash * 0.1);
  // arresting the same person again within 30 min is still legal but pays nothing (stops officer + alt reward farming)
  const recent = await prisma.transaction.findFirst({ where: { userId: u.id, description: 'arrest:' + t.username, createdAt: { gt: new Date(Date.now() - 30 * 60_000) } }, select: { id: true } });
  const reward = recent ? 0 : POLICE_REWARD;
  // One arrest per suspect: the jail flag is claimed atomically, so parallel requests cannot each collect the reward and the fine.
  const ok = await prisma.$transaction(async tx => {
    const claim = await tx.save.updateMany({ where: { userId: t.id, heat: { gte: WANTED_AT }, OR: [{ jailUntil: null }, { jailUntil: { lte: new Date() } }] }, data: { jailUntil: new Date(Date.now() + secs * 1000), cash: { decrement: fine } } }); // 10% fine
    if (!claim.count) return false;
    if (reward > 0) {
      await tx.save.update({ where: { userId: u.id }, data: { cash: { increment: reward } } });
      await tx.transaction.create({ data: { userId: u.id, type: 'EARN', amount: reward, description: 'arrest:' + t.username } });
    }
    return true;
  });
  if (!ok) return err('That player is not wanted.', 409);
  return NextResponse.json({ ok: true, jailed: t.username, secs, reward });
}
