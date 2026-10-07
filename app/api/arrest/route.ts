import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, throttled } from '../../../lib/auth';
import { loadState } from '../../../lib/game';
import { JAIL_SECS_PER_HEAT, POLICE_REWARD, WANTED_AT } from '../../../lib/profile';
// A REAL officer arrests a REAL wanted player. Server checks: caller is police, target is wanted and not already jailed.
export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  if (throttled('arrest:' + u.id, 12, 60_000)) return err('Slow down.', 429);
  const me = await loadState(u.id); if (!me || me.profile.profession !== 'police') return err('Only police officers can arrest.', 403);
  if (me.jailLeft) return err('You are in jail.', 403);
  const name = String((await req.json().catch(() => ({}))).target || '').toLowerCase();
  const t = await prisma.user.findUnique({ where: { usernameKey: name } });
  if (!t || t.id === u.id) return err('No such player.');
  const ts = await loadState(t.id); if (!ts) return err('No such player.');
  if (ts.jailLeft || ts.save.heat < WANTED_AT) return err('That player is not wanted.', 409);
  const secs = Math.ceil(ts.save.heat * JAIL_SECS_PER_HEAT);
  await prisma.save.update({ where: { userId: t.id }, data: { jailUntil: new Date(Date.now() + secs * 1000), cash: { decrement: Math.floor(ts.save.cash * 0.1) } } }); // 10% fine
  await prisma.save.update({ where: { userId: u.id }, data: { cash: { increment: POLICE_REWARD } } });
  await prisma.transaction.create({ data: { userId: u.id, type: 'EARN', amount: POLICE_REWARD, description: 'arrest:' + t.username } });
  return NextResponse.json({ ok: true, jailed: t.username, secs, reward: POLICE_REWARD });
}
