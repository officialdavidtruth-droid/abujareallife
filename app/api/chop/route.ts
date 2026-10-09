import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, serverError, throttled } from '../../../lib/auth';
import { addSkillXp, loadState, lvl } from '../../../lib/game';
import { downState } from '../../../lib/downed';
import { CHOP, YARDS, chopPayout, chopPlan, partById, rollCar, signChop, verifyChop, yardById, type ChopTicket } from '../../../lib/chop';
import { itemById, MAX_STACK } from '../../../lib/catalog';
export const dynamic = 'force-dynamic';

/* Step 6: chop shop. Steal a car -> drive it to a hidden yard -> take cash or parts. Police checkpoints can stop you on the way.
   steal   : (client says it is next to an AI car and how many officers are near.) Server rolls whether the owner/patrol stops you on the spot,
             otherwise it gives you a real (stolen) Vehicle row, +heat, a signed ticket, and the yard you must reach.
   poll    : while you drive, the server reveals checkpoints as they come up. A checkpoint you fail ends the job right then (arrested, car impounded).
   deliver : you must be INSIDE the yard (server-held position, driving), the ticket unused and in time. Then pick cash or parts.
   fit     : at a yard, burn a part to repair your own car a little.
   Everything is stored as Crime rows + the Vehicle row, so there is NO schema change:
     chop:<jti> = job started (also the cooldown marker) · chopwin:<jti> / chopcaught:<jti> = job over (one of them, once). */
class Stop extends Error { constructor(public msg: string, public code = 400) { super(msg); } }
const ctl = (c: unknown) => Math.max(0, Math.min(3, Math.floor(Number(c) || 0)));

/** Fresh server-side position of the player, or null. The yard check uses what /api/position stored, never what this request claims. */
async function myPos(userId: string) {
  const row = await prisma.playerPosition.findUnique({ where: { userId } });
  if (!row || Date.now() - row.updatedAt.getTime() > CHOP.posMaxAgeMs) return null;
  return row;
}
const inYard = (p: { x: number; z: number }, y: { x: number; z: number }, extra = 0) => Math.hypot(p.x - y.x, p.z - y.z) <= CHOP.yardRadius + CHOP.yardSlack + extra;

type State = NonNullable<Awaited<ReturnType<typeof loadState>>>;
const finished = (userId: string, jti: string) => prisma.crime.findFirst({ where: { userId, kind: { in: ['chopwin:' + jti, 'chopcaught:' + jti] } }, select: { kind: true } });

/** Apply every checkpoint that has come up by now. If one is failed the job is over: the car is impounded, you are jailed. Safe to call twice. */
async function runCheckpoints(u: { id: string }, st: State, t: ChopTicket, now: number) {
  const elapsed = (now - t.start) / 1000, plan = chopPlan(t);
  const due = plan.checkpoints.map((c, i) => ({ i, ...c })).filter(c => c.at <= elapsed);
  const bad = due.find(c => !c.ok);
  const events = due.filter(c => !bad || c.i <= bad.i).map(c => ({ i: c.i, ok: c.ok }));
  if (!bad) return { caught: false as const, events };
  const heat = Math.min(200, st.save.heat + CHOP.caughtHeat), secs = Math.ceil(heat * CHOP.jailSecsPerHeat), fine = Math.floor(st.save.cash * CHOP.fineRate);
  let applied = false;
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const gone = await tx.vehicle.deleteMany({ where: { id: t.vehicleId, userId: u.id } });   // the atomic guard: only the call that impounds the car punishes you
    if (gone.count !== 1) return;
    applied = true;
    const left = await tx.vehicle.count({ where: { userId: u.id } });
    await tx.save.update({ where: { userId: u.id }, data: { hasCar: left > 0, heat, heatAt: new Date(now), jailUntil: new Date(now + secs * 1000), inside: null, insideAt: null, ...(fine ? { cash: { decrement: fine } } : {}) } });
    await tx.crime.create({ data: { userId: u.id, kind: 'chopcaught:' + t.jti, caught: true, loot: 0 } });
    if (fine) await tx.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -fine, description: 'fine:chop' } });
  });
  return { caught: true as const, applied, events, jailSecs: secs, fine, heat };
}

export async function POST(req: Request) {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    const b = await req.json().catch(() => ({}));
    const st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
    if (st.jailLeft) return err('You are in jail.', 403);
    if (downState(st.save.downUntil).down) return err('You are out cold.', 403);
    if (st.profile.profession === 'police') return err('Officers cannot run a chop job.', 403);
    const now = Date.now(), action = String(b.action || '');

    /* ───────── steal ───────── */
    if (action === 'steal') {
      if (throttled('chop:' + u.id, 6, 10 * 60_000)) return err('Slow down.', 429);
      const last = await prisma.crime.findFirst({ where: { userId: u.id, kind: { startsWith: 'chop:' }, createdAt: { gt: new Date(now - CHOP.stealCooldownMs) } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
      if (last) return NextResponse.json({ error: `Lie low for ${Math.ceil((CHOP.stealCooldownMs - (now - last.createdAt.getTime())) / 1000)}s before the next car.` }, { status: 429 });
      const stealth = lvl(st.profile, 'stealth'), cops = ctl(b.policeNearby);
      const jti = crypto.randomUUID();
      const stopped = Math.random() < Math.max(0.05, Math.min(0.9, CHOP.stealBase - stealth * CHOP.stealPerStealth + cops * CHOP.stealPerCop));
      if (stopped) {   // the owner fought back or a patrol saw it: no car. With officers right there you also go down.
        const heat = Math.min(200, st.save.heat + Math.round(CHOP.heat / 2)), secs = cops > 0 ? Math.ceil(heat * CHOP.jailSecsPerHeat) : 0;
        await prisma.$transaction([
          prisma.save.update({ where: { userId: u.id }, data: { heat, heatAt: new Date(), ...(secs ? { jailUntil: new Date(now + secs * 1000), inside: null, insideAt: null } : {}) } }),
          prisma.crime.create({ data: { userId: u.id, kind: 'chop:' + jti, caught: true, loot: 0 } }),
        ]);
        return NextResponse.json({ ok: true, stopped: true, jailSecs: secs, heat, wanted: heat >= 40 });
      }
      const car = rollCar(jti);
      let officers = 0;
      try {   // real police players online right now make every checkpoint harder to slip through
        const online = await prisma.playerPosition.findMany({ where: { updatedAt: { gt: new Date(now - 30_000) }, userId: { not: u.id } }, select: { userId: true }, take: 300 });
        if (online.length) officers = Math.min(3, await prisma.save.count({ where: { userId: { in: online.map((o: { userId: string }) => o.userId) }, profile: { path: ['profession'], equals: 'police' } } }));
      } catch { officers = 0; }
      const heat = Math.min(200, st.save.heat + CHOP.heat);
      const veh = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const row = await tx.vehicle.create({ data: { userId: u.id, name: `${car.spec.brand} ${car.spec.model}`, type: car.spec.type, price: car.spec.price, fuel: car.fuel, condition: car.condition, stolen: true, registered: false, insured: false, parkedAt: null } });
        await tx.save.update({ where: { userId: u.id }, data: { hasCar: true, heat, heatAt: new Date() } });
        await tx.crime.create({ data: { userId: u.id, kind: 'chop:' + jti, caught: false, loot: 0 } });
        return row;
      });
      const { token } = await signChop({ userId: u.id, start: now, vehicleId: veh.id, yard: car.yard.id, stealth, officers, speed: car.spec.topSpeed, jti });
      return NextResponse.json({ ok: true, ticket: token, car: { name: veh.name, price: veh.price, condition: veh.condition }, yard: car.yard, deadlineSecs: CHOP.deadlineSecs, heat, wanted: heat >= 40, startedAt: now });
    }

    /* ───────── fit a part (no ticket needed, any yard works) ───────── */
    if (action === 'fit') {
      const part = partById(String(b.itemKey || '')); if (!part) return err('That is not a car part.');
      const pos = await myPos(u.id);
      if (!pos || !YARDS.some(y => inYard(pos, y))) return err('You can only fit parts at a chop yard.', 409);
      const car = await prisma.vehicle.findFirst({ where: { userId: u.id, stolen: false }, orderBy: { purchasedAt: 'desc' } });
      if (!car) return err('You have no car of your own to fit it to.', 409);
      if (car.condition >= 100) return err('Your car is already in perfect shape.', 409);
      try {
        const row = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          const took = await tx.inventoryItem.updateMany({ where: { userId: u.id, itemKey: part.id, quantity: { gte: 1 } }, data: { quantity: { decrement: 1 } } });
          if (!took.count) throw new Stop("You don't have that part.", 409);
          return tx.vehicle.update({ where: { id: car.id }, data: { condition: Math.min(100, car.condition + part.fit) } });
        });
        return NextResponse.json({ ok: true, car: row.name, condition: row.condition, gained: row.condition - car.condition });
      } catch (e) { if (e instanceof Stop) return err(e.msg, e.code); throw e; }
    }

    /* ───────── the rest need a ticket ───────── */
    const t = await verifyChop(String(b.ticket || '')); if (!t || t.userId !== u.id) return err('That job is not valid.', 400);
    const yard = yardById(t.yard); if (!yard) return err('That job is not valid.', 400);
    const elapsed = (now - t.start) / 1000;

    if (action === 'poll') {
      const done = await finished(u.id, t.jti);
      if (done) return NextResponse.json({ ok: true, state: done.kind.startsWith('chopwin') ? 'done' : 'caught', events: [] });
      const veh = await prisma.vehicle.findFirst({ where: { id: t.vehicleId, userId: u.id, stolen: true }, select: { id: true } });
      if (!veh) return NextResponse.json({ ok: true, state: 'lost', events: [] });   // someone carjacked it off you
      const r = await runCheckpoints(u, st, t, now);
      if (r.caught) return NextResponse.json({ ok: true, state: 'caught', events: r.events, jailSecs: r.jailSecs, fine: r.fine, heat: r.heat });
      if (elapsed > CHOP.deadlineSecs) return NextResponse.json({ ok: true, state: 'expired', events: r.events });
      return NextResponse.json({ ok: true, state: 'active', events: r.events, secsLeft: Math.max(0, Math.ceil(CHOP.deadlineSecs - elapsed)) });
    }

    if (action === 'deliver') {
      const take = b.take === 'parts' ? 'parts' : 'cash';
      if (elapsed < CHOP.minSecs) return err('Too fast. Nobody is at the gate yet.', 429);
      if (elapsed > CHOP.deadlineSecs) return err('The yard gave up on you. Nobody takes that car now.', 410);
      if (await finished(u.id, t.jti)) return err('That job is already over.', 409);
      const veh = await prisma.vehicle.findFirst({ where: { id: t.vehicleId, userId: u.id, stolen: true } });
      if (!veh) return err('You no longer have that car.', 409);
      const pos = await myPos(u.id);
      if (!pos || !pos.driving || !inYard(pos, yard)) return err('Drive the stolen car right up to the yard gate.', 409);
      const r = await runCheckpoints(u, st, t, now);   // a checkpoint you did not clear on the way ends it here
      if (r.caught) { const n = await loadState(u.id); return NextResponse.json({ ok: true, caught: true, events: r.events, jailSecs: r.jailSecs, fine: r.fine, heat: r.heat, cash: n!.save.cash }); }
      const pay = chopPayout(t.jti, veh.price, veh.condition);
      const parts = pay.parts.map(p => ({ ...p, name: partById(p.id)!.name, e: partById(p.id)!.e }));
      try {
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          const gone = await tx.vehicle.deleteMany({ where: { id: veh.id, userId: u.id } });
          if (gone.count !== 1) throw new Stop('You no longer have that car.', 409);
          const left = await tx.vehicle.count({ where: { userId: u.id } });
          const prof = addSkillXp(addSkillXp(st.profile, 'stealth', CHOP.stealthXp), 'driving', CHOP.drivingXp);
          await tx.save.update({ where: { userId: u.id }, data: { hasCar: left > 0, profile: prof as object, ...(take === 'cash' ? { cash: { increment: pay.cash } } : {}) } });
          if (take === 'cash') await tx.transaction.create({ data: { userId: u.id, type: 'CRIME', amount: pay.cash, description: 'chop:' + veh.name } });
          else for (const p of pay.parts) {
            const it = itemById(p.id)!;
            const have = await tx.inventoryItem.findUnique({ where: { userId_itemKey: { userId: u.id, itemKey: p.id } } });
            const q = Math.min(MAX_STACK, (have?.quantity || 0) + p.qty);
            await tx.inventoryItem.upsert({ where: { userId_itemKey: { userId: u.id, itemKey: p.id } }, create: { userId: u.id, itemKey: p.id, name: it.name, quantity: q }, update: { quantity: q } });
          }
          await tx.crime.create({ data: { userId: u.id, kind: 'chopwin:' + t.jti, caught: false, loot: take === 'cash' ? pay.cash : 0 } });
        });
      } catch (e) { if (e instanceof Stop) return err(e.msg, e.code); throw e; }
      const n = await loadState(u.id);
      return NextResponse.json({ ok: true, caught: false, take, cash: n!.save.cash, paid: take === 'cash' ? pay.cash : 0, parts: take === 'parts' ? parts : [], heat: n!.save.heat, wanted: n!.save.heat >= 40, events: r.events });
    }
    return err('Unknown action.');
  } catch (e) { return serverError(e); }
}
