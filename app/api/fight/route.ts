import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, throttled } from '../../../lib/auth';
import { loadState } from '../../../lib/game';
import { ASSAULT_HEAT, FIGHT_FINE_MAX, FIGHT_FINE_PCT, KO_HEAT, OFFICER_HEAT, WANTED_AT } from '../../../lib/profile';
// The VICTIM of a fight reports who started it (the game has no authoritative server yet, so the victim is the one with a reason to report).
//  assault: the aggressor gains heat.   ko: the aggressor gains more heat AND pays a fine to the victim.
//  Hitting a police officer adds extra heat. Mutual brawls are never reported (the client skips them). Reports are throttled per pair.
export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({}));
  const kind = b.kind === 'ko' ? 'ko' : b.kind === 'assault' ? 'assault' : '';
  if (!kind) return err('Unknown action.');
  const key = String(b.attacker || '').toLowerCase().trim();
  if (!key) return err('No such player.');
  const a = await prisma.user.findUnique({ where: { usernameKey: key } });
  if (!a || a.id === u.id) return err('No such player.');
  if (throttled(`fight:${kind}:${u.id}:${a.id}`, 1, kind === 'ko' ? 45_000 : 30_000)) return NextResponse.json({ ok: true, ignored: true });
  if (throttled('fight:any:' + u.id, 20, 10 * 60_000)) return err('Slow down.', 429);
  const [vs, as] = await Promise.all([loadState(u.id), loadState(a.id)]);
  if (!vs || !as) return err('No such player.');
  if (vs.jailLeft) return err('You are in jail.', 403);
  if (as.jailLeft) return NextResponse.json({ ok: true, ignored: true }); // already locked up
  const officer = vs.profile.profession === 'police';
  const heat = Math.min(200, as.save.heat + (kind === 'ko' ? KO_HEAT : ASSAULT_HEAT) + (officer ? OFFICER_HEAT : 0));
  const fine = kind === 'ko' ? Math.min(FIGHT_FINE_MAX, Math.floor(as.save.cash * FIGHT_FINE_PCT)) : 0;
  await prisma.save.update({ where: { userId: a.id }, data: { heat, heatAt: new Date(), ...(fine ? { cash: { decrement: fine } } : {}) } });
  if (fine) {
    await prisma.save.update({ where: { userId: u.id }, data: { cash: { increment: fine } } });
    await prisma.transaction.createMany({ data: [
      { userId: a.id, type: 'SPEND', amount: -fine, description: 'fine:knockout' },
      { userId: u.id, type: 'EARN', amount: fine, description: 'compensation:knockout' },
    ] });
  }
  await prisma.crime.create({ data: { userId: a.id, kind: kind === 'ko' ? 'assault_ko' : 'assault', caught: false, loot: 0 } });
  return NextResponse.json({ ok: true, kind, fine, wanted: heat >= WANTED_AT });
}
