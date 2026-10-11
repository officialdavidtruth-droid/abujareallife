import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, throttled } from '../../../lib/auth';
import { clampHeat, insideBiz, loadState, lockedSkillXp, lvl } from '../../../lib/game';
import { KO_DOWN_MS, downState } from '../../../lib/downed';
import { holdupPlan, signHoldup, verifyHoldup } from '../../../lib/holdup';
import { CRIMES, HOLDUP, JAIL_SECS_PER_HEAT } from '../../../lib/profile';
export const dynamic = 'force-dynamic';

/* Timed shop hold-up (replaces the old instant "rob the till").
   start  : you must be inside a shop. Heat goes on you right away (you are WANTED from the moment you pull it). You get a ticket.
   finish : you stay `bagSecs` to bag everything, or take a partial share by running after `minSecs`. But the police arrive at a secret time:
            if that has already passed when you finish, you are arrested and the haul is gone.
   Cooldowns (database-backed): one hold-up per player per 5 min, and a shop's till stays empty for 10 min after anyone robs it. */
const KINDS = ['holdup_win', 'holdup_caught', 'holdup_fled', 'holdup_shot'];
export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({}));
  const st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
  if (st.jailLeft) return err('You are in jail.', 403);
  if (downState(st.save.downUntil).down) return err('You are out cold.', 403);
  if (st.profile.profession === 'police') return err('Officers cannot commit crimes on duty.', 403);
  const biz = insideBiz(st.save), now = Date.now();

  if (b.action === 'start') {
    if (throttled('holdup:' + u.id, 4, 10 * 60_000)) return err('Slow down.', 429);
    if (!biz || !CRIMES.rob_shop.at?.includes(biz.type)) return err('You have to be inside a shop to hold it up.', 403);
    // real police players who are online right now shorten the time you have
    let officers = 0;
    try {
      const online = await prisma.playerPosition.findMany({ where: { updatedAt: { gt: new Date(now - 30_000) }, userId: { not: u.id } }, select: { userId: true }, take: 300 });
      if (online.length) officers = await prisma.save.count({ where: { userId: { in: online.map((o: { userId: string }) => o.userId) }, profile: { path: ['profession'], equals: 'police' } } });
    } catch { officers = 0; }
    // Both cooldowns are checked AND the marker is written under a lock (the player's row + the shop), so parallel requests cannot skip them.
    const gate = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 FROM "Save" WHERE "userId" = ${u.id} FOR UPDATE`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'holdup:' + biz.id}))`;
      const mine = await tx.crime.findFirst({ where: { userId: u.id, kind: { startsWith: 'holdup:' }, createdAt: { gt: new Date(now - HOLDUP.userCooldownMs) } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
      if (mine) return { error: `Lie low for ${Math.ceil((HOLDUP.userCooldownMs - (now - mine.createdAt.getTime())) / 1000)}s before your next hold-up.`, code: 429 };
      const shop = await tx.crime.findFirst({ where: { kind: 'holdup:' + biz.id, createdAt: { gt: new Date(now - HOLDUP.shopCooldownMs) } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
      if (shop) return { error: 'This till was just emptied. Try another shop.', code: 409 };
      await tx.save.update({ where: { userId: u.id }, data: { heat: { increment: HOLDUP.heat }, heatAt: new Date() } });
      await clampHeat(tx, [u.id]);
      await tx.crime.create({ data: { userId: u.id, kind: 'holdup:' + biz.id, caught: false, loot: 0 } });   // also the cooldown marker for you and the shop
      return { heat: (await tx.save.findUnique({ where: { userId: u.id }, select: { heat: true } }))?.heat ?? 0 };
    });
    if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.code });
    const heat = gate.heat;
    const { token, jti } = await signHoldup({ userId: u.id, biz: biz.id, start: now, stealth: lvl(st.profile, CRIMES.rob_shop.skill), officers });
    // step 7: the clerk is part of the scene, so the client is told who is behind the counter and WHEN a gun comes out (never the police time or the loot)
    const clerk = holdupPlan({ jti, stealth: lvl(st.profile, CRIMES.rob_shop.skill), officers }).clerk;
    return NextResponse.json({ ok: true, ticket: token, bagSecs: HOLDUP.bagSecs, minSecs: HOLDUP.minSecs, heat, wanted: heat >= 40, clerk });
  }

  if (b.action === 'finish') {
    const t = await verifyHoldup(String(b.ticket || '')); if (!t || t.userId !== u.id) return err('That hold-up is not valid.', 400);
    const elapsed = (now - t.start) / 1000;
    if (elapsed > HOLDUP.maxSecs) return err('The hold-up is long over.', 410);
    if (!biz || biz.id !== t.biz) return err('You left the shop. The hold-up is over.', 409);
    const plan = holdupPlan(t);
    // One finish per ticket: the "already ended?" check and every payout happen under a lock on the player's row,
    // so parallel finish requests cannot each collect the haul.
    return prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 FROM "Save" WHERE "userId" = ${u.id} FOR UPDATE`;
      const done = await tx.crime.findFirst({ where: { userId: u.id, kind: { in: KINDS }, createdAt: { gte: new Date(t.start) } }, select: { id: true } });
      if (done) return err('That hold-up already ended.', 409);
      const cur = await tx.save.findUnique({ where: { userId: u.id }, select: { heat: true, cash: true } }); if (!cur) return err('Create your character first.', 409);
      if (elapsed >= plan.eta) {   // the police got there first
        const heat = Math.min(200, cur.heat + HOLDUP.caughtHeat), secs = Math.ceil(heat * JAIL_SECS_PER_HEAT), fine = Math.floor(cur.cash * 0.1);
        await tx.save.update({ where: { userId: u.id }, data: { heat: { increment: HOLDUP.caughtHeat }, heatAt: new Date(), jailUntil: new Date(now + secs * 1000), inside: null, insideAt: null, ...(fine ? { cash: { decrement: fine } } : {}) } });
        await clampHeat(tx, [u.id]);
        await tx.crime.create({ data: { userId: u.id, kind: 'holdup_caught', caught: true, loot: 0 } });
        if (fine) await tx.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -fine, description: 'fine:holdup' } });
        return NextResponse.json({ ok: true, caught: true, jailSecs: secs, fine, heat, cash: cur.cash - fine });
      }
      if (plan.clerk.armed && elapsed >= plan.clerk.at) {   // step 7: the clerk pulled a gun and you were still there: haul gone, knocked out, thrown out of the shop
        const add = Math.floor(HOLDUP.caughtHeat / 2), heat = Math.min(200, cur.heat + add), bill = Math.floor(cur.cash * 0.05);
        await tx.save.update({ where: { userId: u.id }, data: { heat: { increment: add }, heatAt: new Date(), downUntil: new Date(now + KO_DOWN_MS), downKind: 'ko', inside: null, insideAt: null, ...(bill ? { cash: { decrement: bill } } : {}) } });
        await clampHeat(tx, [u.id]);
        await tx.crime.create({ data: { userId: u.id, kind: 'holdup_shot', caught: false, loot: 0 } });
        if (bill) await tx.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -bill, description: 'medical:holdup' } });
        return NextResponse.json({ ok: true, caught: false, shot: true, koMs: KO_DOWN_MS, bill, heat, wanted: heat >= 40, cash: cur.cash - bill });
      }
      const frac = Math.max(0, Math.min(1, (elapsed - HOLDUP.minSecs) / (HOLDUP.bagSecs - HOLDUP.minSecs)));
      const loot = Math.floor(plan.loot * frac);
      if (loot) {
        const profile = await lockedSkillXp(tx, u.id, CRIMES.rob_shop.skill, 10);
        await tx.save.update({ where: { userId: u.id }, data: { cash: { increment: loot }, profile } });
      }
      await tx.crime.create({ data: { userId: u.id, kind: loot ? 'holdup_win' : 'holdup_fled', caught: false, loot } });
      if (loot) await tx.transaction.create({ data: { userId: u.id, type: 'CRIME', amount: loot, description: 'holdup:' + t.biz } });
      return NextResponse.json({ ok: true, caught: false, loot, full: frac >= 1, heat: cur.heat, wanted: cur.heat >= 40, cash: cur.cash + loot });
    });
  }
  return err('Unknown action.');
}
