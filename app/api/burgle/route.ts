import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, throttled } from '../../../lib/auth';
import { clampHeat, loadState, lvl } from '../../../lib/game';
import { downState, KO_DOWN_MS } from '../../../lib/downed';
import { DOOR_R, PLOTS, PLOT_COUNT } from '../../../lib/houses';
import { ROB_ANY_COOLDOWN_MS } from '../../../lib/profile';
import { ROBBERY_KINDS, robCooldownLeft, secs } from '../../../lib/robbery';
import { BREAKIN, GUARDS, hasGuards, riskLabel, secFromRows, winChance, type Sec } from '../../../lib/security';
import { burgleRoll, signBurgle, verifyBurgle } from '../../../lib/burgle';
import { resolveHome } from '../../../lib/housemates';
export const dynamic = 'force-dynamic';

/* Break into another player's house. Two steps, like the shop hold-up:
   start  : you stand at their front door. The server checks you, the house, the cooldowns and your real position, tells the owner's phone if they
            have guards, and hands you a lock ticket + the risk label. The lock takes BREAKIN.secs seconds.
   finish : after the wait the server rolls the outcome (the ticket id seeds the roll, the client cannot see or pick it). Guards cut your chance.
            In: you take 20% of the owner's cash (max ₦400k), heat goes on you, the owner gets a message and the house is safe for 15 min.
            Caught: the guards put you on the ground (twice as long with an armed guard) and you are wanted.
   Everything is database-backed (Crime / Message rows), so it holds on every server instance and a modified client cannot skip it. */
const HOME_NAME = 'Home security';
const POS_MAX_AGE = 30_000;

async function ownerOf(slot: number) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= PLOT_COUNT) return null;
  return (await prisma.user.findFirst({ where: { houseSlot: slot }, select: { id: true, username: true } })) ?? null;   // the plot is stored on the account (lib/housePlots.ts)
}
async function secOf(userId: string): Promise<Sec> {
  return secFromRows((await prisma.inventoryItem.findMany({ where: { userId, itemKey: { startsWith: 'sec_' }, quantity: { gt: 0 } }, select: { itemKey: true, quantity: true } })) as { itemKey: string; quantity: number }[]);
}
async function atDoor(userId: string, slot: number) {
  const pos = await prisma.playerPosition.findUnique({ where: { userId } }), d = PLOTS[slot]?.door;
  return !!pos && !!d && Date.now() - pos.updatedAt.getTime() <= POS_MAX_AGE && Math.hypot(pos.x - d.x, pos.z - d.z) <= DOOR_R + 4;
}
const shieldLeft = async (ownerId: string) => {
  const m = await prisma.crime.findFirst({ where: { kind: 'burgled:' + ownerId, createdAt: { gt: new Date(Date.now() - BREAKIN.shieldMs) } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
  return m ? Math.max(0, BREAKIN.shieldMs - (Date.now() - m.createdAt.getTime())) : 0;
};
const guardNames = (s: Sec) => [s.dog && `${s.dog > 1 ? 'dogs' : 'dog'}`, s.guard && `${s.guard > 1 ? 'guards' : 'guard'}`, s.armed && 'armed guard'].filter(Boolean).join(' and ');

export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({})), now = Date.now();
  if (throttled('burgle:' + u.id, 12, 10 * 60_000)) return err('Slow down.', 429);
  const me = await loadState(u.id); if (!me) return err('Create your character first.', 409);
  if (me.jailLeft) return err('You are in jail.', 403);
  if (downState(me.save.downUntil).down) return err('You are out cold.', 403);
  if (me.profile.profession === 'police') return err('Officers cannot commit crimes on duty.', 403);

  if (b.action === 'start') {
    const slot = Number(b.slot), owner = await ownerOf(slot); if (!owner) return err('There is nobody home to rob.', 404);
    if (owner.id === u.id || (await resolveHome(u.id, u.username)).id === owner.id) return err("That's your own house.", 400);
    const wait = await robCooldownLeft(u.id, 'burgle');
    if (wait > 0) return NextResponse.json({ error: `Lie low for ${secs(wait)}s before your next job.`, retryIn: wait }, { status: 429 });
    const sh = await shieldLeft(owner.id);
    if (sh > 0) return NextResponse.json({ error: 'That house was just cleaned out. Nothing left to take.', retryIn: sh }, { status: 429 });
    if (!(await atDoor(u.id, slot))) return err('Get to their front door first.', 409);
    const sec = await secOf(owner.id), odds = winChance(sec, lvl(me.profile, 'stealth'));
    if (hasGuards(sec)) {   // the guards raise the alarm the moment someone works on the lock (the dogs bark, the guard radios the owner); at most once a minute
      const recent = await prisma.message.findFirst({ where: { toName: owner.username, fromName: HOME_NAME, kind: 'text', createdAt: { gt: new Date(now - BREAKIN.alertGapMs) } }, select: { id: true } });
      if (!recent) await prisma.message.create({ data: { fromId: u.id, fromName: HOME_NAME, toName: owner.username, kind: 'text', body: `🚨 Your ${guardNames(sec)} spotted someone working on your front door${sec.guard + sec.armed ? ` (looks like ${u.username})` : ''}! Get home fast.` } }).catch(() => null);
    }
    const { token } = await signBurgle({ userId: u.id, slot, start: now });
    return NextResponse.json({ ok: true, token, secs: BREAKIN.secs, owner: owner.username, risk: riskLabel(odds).t, guards: { d: sec.dog, g: sec.guard, a: sec.armed } });
  }

  if (b.action === 'finish') {
    const t = await verifyBurgle(String(b.token || '')); if (!t || t.userId !== u.id) return err('That lock ticket is no good.', 403);
    const elapsed = now - t.start;
    if (elapsed < BREAKIN.secs * 1000 - 1500) return err('You are not done with the lock yet.', 409);
    if (elapsed > BREAKIN.maxAgeMs) return err('You hesitated too long. Start again.', 410);
    const owner = await ownerOf(t.slot); if (!owner || owner.id === u.id || (await resolveHome(u.id, u.username)).id === owner.id) return err('There is nobody home to rob.', 404);
    if (!(await atDoor(u.id, t.slot))) return err('You left the door.', 409);
    const sec = await secOf(owner.id), stealth = lvl(me.profile, 'stealth');
    const win = burgleRoll(t.jti, 'win') < winChance(sec, stealth);   // rolled here, from a key only the server knows
    let out: { result: 'win' | 'empty' | 'fail'; amount: number; down: boolean; koMs?: number } = { result: 'fail', amount: 0, down: false };
    try {
      await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT 1 FROM "Save" WHERE "userId" = ${u.id} FOR UPDATE`;   // one finish at a time per robber: the ticket is single-use and the cooldown holds
        if (await tx.crime.findFirst({ where: { userId: u.id, kind: 'burgle_done:' + t.jti }, select: { id: true } })) throw new Error('used');
        if (await tx.crime.findFirst({ where: { userId: u.id, kind: { in: ROBBERY_KINDS }, createdAt: { gt: new Date(now - ROB_ANY_COOLDOWN_MS) } }, select: { id: true } })) throw new Error('cooldown');
        if (await tx.crime.findFirst({ where: { kind: 'burgled:' + owner.id, createdAt: { gt: new Date(now - BREAKIN.shieldMs) } }, select: { id: true } })) throw new Error('shield');
        await tx.crime.create({ data: { userId: u.id, kind: 'burgle_done:' + t.jti, caught: false, loot: 0 } });
        if (!win) {
          const ko = KO_DOWN_MS * (sec.armed ? BREAKIN.koMult : 1), guarded = hasGuards(sec);
          await tx.save.update({ where: { userId: u.id }, data: { heat: { increment: BREAKIN.heatFail }, heatAt: new Date(), ...(guarded ? { downUntil: new Date(now + ko), downKind: 'ko' } : {}) } });
          await tx.crime.create({ data: { userId: u.id, kind: 'burgle', caught: false, loot: 0 } });
          out = { result: 'fail', amount: 0, down: guarded, koMs: guarded ? ko : 0 };
          if (guarded) await tx.message.create({ data: { fromId: u.id, fromName: HOME_NAME, toName: owner.username, kind: 'text', body: `🛡️ Your ${guardNames(sec)} caught ${u.username} breaking into your house and put them on the ground. Nothing was taken.` } });
          return;
        }
        const ownerSave = await tx.save.findUnique({ where: { userId: owner.id }, select: { cash: true } });
        const amount = Math.min(BREAKIN.lootMax, Math.floor((ownerSave?.cash ?? 0) * BREAKIN.pct));
        if (amount < BREAKIN.lootMin) {   // in, but nothing worth taking: still a crime
          await tx.save.update({ where: { userId: u.id }, data: { heat: { increment: BREAKIN.heatEmpty }, heatAt: new Date() } });
          await tx.crime.create({ data: { userId: u.id, kind: 'burgle', caught: false, loot: 0 } });
          out = { result: 'empty', amount: 0, down: false };
          return;
        }
        const took = await tx.save.updateMany({ where: { userId: owner.id, cash: { gte: amount } }, data: { cash: { decrement: amount } } });
        if (took.count !== 1) throw new Error('moved');
        await tx.save.update({ where: { userId: u.id }, data: { cash: { increment: amount }, heat: { increment: BREAKIN.heatWin }, heatAt: new Date() } });
        await tx.transaction.createMany({ data: [
          { userId: u.id, type: 'CRIME', amount, description: 'burgle:' + owner.username },
          { userId: owner.id, type: 'SPEND', amount: -amount, description: 'burgled:' + u.username },
        ] });
        await tx.crime.create({ data: { userId: u.id, kind: 'burgle', caught: false, loot: amount } });          // the robber's cooldown
        await tx.crime.create({ data: { userId: u.id, kind: 'burgled:' + owner.id, caught: false, loot: amount } });   // the house's shield
        await tx.message.create({ data: { fromId: u.id, fromName: u.username, toName: owner.username, kind: 'robbed', body: `🏚️ ${u.username} broke into your house and took ₦${amount.toLocaleString('en-US')}!`, data: { amount, home: true } } });
        out = { result: 'win', amount, down: false };
      });
      await clampHeat(prisma, [u.id]);
    } catch (e) {
      const m = (e as Error)?.message;
      return m === 'used' ? err('That lock ticket was already used.', 409) : m === 'cooldown' ? err('Slow down.', 429) : m === 'shield' ? err('That house was just cleaned out.', 429) : err('They moved the cash. Try again.', 409);
    }
    const n = await loadState(u.id);
    return NextResponse.json({ ok: true, ...out, owner: owner.username, heat: n!.save.heat, wanted: n!.save.heat >= 40, cash: n!.save.cash, guards: win ? undefined : GUARDS.filter(g => sec[g.id] > 0).map(g => g.e).join('') });
  }
  return err('Unknown action.', 400);
}
