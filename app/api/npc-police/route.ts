import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, throttled } from '../../../lib/auth';
import { loadState } from '../../../lib/game';
import { JAIL_SECS_PER_HEAT, NPC_COP_DELAY_MS, WANTED_AT } from '../../../lib/profile';
export const dynamic = 'force-dynamic';

/* An NPC patrol caught you. The client reports the catch (it owns positions); the server only checks that the arrest is
   legitimate: you really are WANTED, you have been wanted long enough for a patrol to arrive, you are not already jailed. */
export async function POST() {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  if (throttled('npcpol:' + u.id, 6, 60_000)) return err('Slow down.', 429);
  const st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
  if (st.jailLeft) return NextResponse.json({ ok: false, reason: 'jailed' });
  if (st.profile.profession === 'police') return NextResponse.json({ ok: false, reason: 'officer' });
  if (st.save.heat < WANTED_AT) return NextResponse.json({ ok: false, reason: 'not-wanted' });
  if (st.save.heatAt && Date.now() - st.save.heatAt.getTime() < NPC_COP_DELAY_MS) return NextResponse.json({ ok: false, reason: 'too-soon' });
  const secs = Math.ceil(st.save.heat * JAIL_SECS_PER_HEAT), fine = Math.floor(st.save.cash * 0.1);
  await prisma.save.update({ where: { userId: u.id }, data: { jailUntil: new Date(Date.now() + secs * 1000), inside: null, insideAt: null, ...(fine ? { cash: { decrement: fine } } : {}) } });
  if (fine) await prisma.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -fine, description: 'fine:arrest' } });
  return NextResponse.json({ ok: true, secs, fine });
}
