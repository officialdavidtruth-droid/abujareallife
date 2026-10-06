import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';
import { addSkillXp, insideBiz, loadState, lvl } from '../../../lib/game';
import { CRIMES, JAIL_SECS_PER_HEAT, catchChance, type CrimeId } from '../../../lib/profile';
// Anything is allowed. Crime only has consequences: heat (wanted), being caught on the spot, and real police players.
export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({})), st = await loadState(u.id);
  if (!st) return err('Create your character first.', 409);
  if (st.jailLeft) return err('You are in jail.', 403);
  const kind = b.kind as CrimeId, c = CRIMES[kind]; if (!c) return err('Unknown action.');
  if (c.at && !c.at.includes(insideBiz(st.save)?.type || '')) return err('You have to be inside the right building for that.', 403);
  if (st.profile.profession === 'police') return err('Officers cannot commit crimes on duty.', 403);
  const nearCops = Math.max(0, Math.min(3, Math.floor(Number(b.policeNearby) || 0)));
  const caught = Math.random() < catchChance(kind, lvl(st.profile, c.skill), nearCops);
  const loot = caught ? 0 : c.loot[0] + Math.floor(Math.random() * (c.loot[1] - c.loot[0]));
  const heat = Math.min(200, st.save.heat + c.heat);
  const data: Record<string, unknown> = { heat, heatAt: new Date() };
  if (!caught) { data.cash = { increment: loot }; data.profile = addSkillXp(st.profile, c.skill, 6); }
  let jailSecs = 0;
  if (caught && nearCops > 0) { jailSecs = Math.ceil(heat * JAIL_SECS_PER_HEAT); data.jailUntil = new Date(Date.now() + jailSecs * 1000); }
  await prisma.save.update({ where: { userId: u.id }, data });
  await prisma.crime.create({ data: { userId: u.id, kind, caught, loot } });
  if (loot) await prisma.transaction.create({ data: { userId: u.id, type: 'CRIME', amount: loot, description: kind } });
  const n = await loadState(u.id);
  return NextResponse.json({ caught, loot, heat: n!.save.heat, wanted: n!.save.heat >= 40, jailSecs, cash: n!.save.cash });
}
