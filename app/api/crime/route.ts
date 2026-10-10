import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';
import { robCooldownLeft, secs } from '../../../lib/robbery';
import { downState } from '../../../lib/downed';
import { addSkillXp, insideBiz, loadState, lvl } from '../../../lib/game';
import { CRIMES, JAIL_SECS_PER_HEAT, ROB_KIND_COOLDOWN_MS, catchChance, type CrimeId } from '../../../lib/profile';
import { VEHICLE_CATALOG } from '../../../lib/vehicles';
// Anything is allowed. Crime only has consequences: heat (wanted), being caught on the spot, and real police players.
export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({})), st = await loadState(u.id);
  if (!st) return err('Create your character first.', 409);
  if (st.jailLeft) return err('You are in jail.', 403);
  if (downState(st.save.downUntil).down) return err('You are out cold.', 403);
  const kind = b.kind as CrimeId, c = CRIMES[kind]; if (!c) return err('Unknown action.');
  if (kind === 'rob_shop') return err('Shops are held up now: walk in and use the hold-up option.', 400);
  if (c.at && !c.at.includes(insideBiz(st.save)?.type || '')) return err('You have to be inside the right building for that.', 403);
  if (st.profile.profession === 'police') return err('Officers cannot commit crimes on duty.', 403);
  if (ROB_KIND_COOLDOWN_MS[kind] !== undefined) {   // street robbery kinds (pickpocket, mug, NPC carjack) share the database-backed cooldown
    const wait = await robCooldownLeft(u.id, kind);
    if (wait > 0) return NextResponse.json({ error: `Lie low for ${secs(wait)}s before your next one.`, retryIn: wait }, { status: 429 });
  }
  const nearCops = Math.max(0, Math.min(3, Math.floor(Number(b.policeNearby) || 0)));
  const caught = Math.random() < catchChance(kind, lvl(st.profile, c.skill), nearCops);
  const loot = caught ? 0 : c.loot[0] + Math.floor(Math.random() * (c.loot[1] - c.loot[0]));
  const jackRole = kind === 'carjack' ? String(b.role || '') : '';
  const heat = Math.min(200, st.save.heat + c.heat + (jackRole === 'police' ? 30 : 0));   // jacking a police car draws extra heat
  const data: Record<string, unknown> = { heat, heatAt: new Date() };
  if (!caught) { data.cash = { increment: loot }; data.profile = addSkillXp(st.profile, c.skill, 6); }
  let jailSecs = 0;
  if (caught && nearCops > 0) { jailSecs = Math.ceil(heat * JAIL_SECS_PER_HEAT); data.jailUntil = new Date(Date.now() + jailSecs * 1000); }
  // NPC carjack: a stolen car / taxi / police car is yours for real (it lands in your garage, unregistered and uninsured).
  // Buses and okadas have no catalogue model, so those only pay loot. The model comes from the client but is checked against the catalogue.
  let car: string | null = null;
  if (kind === 'carjack' && !caught && ['car', 'taxi', 'police'].includes(jackRole)) {
    const spec = VEHICLE_CATALOG.find(v => v.id === String(b.model || ''));
    if (spec && (await prisma.vehicle.count({ where: { userId: u.id } })) < 20) {
      await prisma.vehicle.create({ data: { userId: u.id, name: `${spec.brand} ${spec.model}`, type: spec.type, price: spec.price, stolen: true, registered: false, insured: false, fuel: 30 + Math.floor(Math.random() * 60), condition: 70 + Math.floor(Math.random() * 30), purchasedAt: new Date() } });
      data.hasCar = true; car = `${spec.brand} ${spec.model}`;
    }
  }
  await prisma.save.update({ where: { userId: u.id }, data });
  await prisma.crime.create({ data: { userId: u.id, kind, caught, loot } });
  if (loot) await prisma.transaction.create({ data: { userId: u.id, type: 'CRIME', amount: loot, description: kind } });
  const n = await loadState(u.id);
  return NextResponse.json({ caught, loot, car, heat: n!.save.heat, wanted: n!.save.heat >= 40, jailSecs, cash: n!.save.cash });
}