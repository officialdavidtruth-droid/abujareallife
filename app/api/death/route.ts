import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, throttled } from '../../../lib/auth';
import { loadState } from '../../../lib/game';
import { KILL_HEAT, OFFICER_HEAT } from '../../../lib/profile';
import { recentShot } from '../../../lib/combatLog';
export const dynamic = 'force-dynamic';

/* The VICTIM's client reports dying from gunfire. A death only ever costs the victim: all cash is lost and they respawn at
   home. The killer only gets heat if the server really accepted a shot from them at this victim in the last 30 s. */
export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  if (throttled('death:' + u.id, 1, 15_000)) return NextResponse.json({ ok: true, ignored: true, respawn: 'home' });
  const b = await req.json().catch(() => ({}));
  const st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
  const lost = st.save.cash;
  await prisma.save.update({ where: { userId: u.id }, data: { cash: 0, inside: null, insideAt: null } });
  if (lost > 0) await prisma.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -lost, description: 'death:' + String(b.killer || 'unknown').slice(0, 30) } });
  let killerHeat = false;
  const key = String(b.killer || '').toLowerCase().trim();
  const k = key ? await prisma.user.findUnique({ where: { usernameKey: key } }) : null;
  if (k && k.id !== u.id && recentShot(k.id, u.id, 30_000)) {
    const ks = await loadState(k.id);
    if (ks) {
      const heat = Math.min(200, ks.save.heat + KILL_HEAT + (st.profile.profession === 'police' ? OFFICER_HEAT : 0));
      await prisma.save.update({ where: { userId: k.id }, data: { heat, heatAt: new Date() } });
      await prisma.crime.create({ data: { userId: k.id, kind: 'murder', caught: false, loot: 0 } });
      killerHeat = true;
    }
  }
  return NextResponse.json({ ok: true, respawn: 'home', lost, killerHeat });
}
