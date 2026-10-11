import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, throttled } from '../../../lib/auth';
import { clampHeat, loadState } from '../../../lib/game';
import { downState } from '../../../lib/downed';
import { MAX_STACK } from '../../../lib/catalog';
import { ITEM, ITEM_NAME, MAX_PER_DEAL, buyPrice } from '../../../lib/dealers';
import { DEALS } from '../../../lib/nightlife';
import { NPC_DEALER_HEAT, NPC_DEALER_MARKUP, NPC_ESCORT_COOLDOWN_MS, NPC_ESCORT_HEAT, NPC_RANGE, STREET_NPCS, streetNpc } from '../../../lib/streetNpc';
export const dynamic = 'force-dynamic';
class Stop extends Error { constructor(public msg: string, public code = 400) { super(msg); } }

/* Street NPCs: weed dealers and escorts standing on the pavement. Same rules as the building dealers: officers cannot take part, jailed or knocked-out players cannot,
   heat is added, money moves in one transaction. The server checks that you are really standing next to the NPC (your last reported position must be
   plausible, and the position you send must be within range of the NPC). Mature content: the account must have confirmed it is 18+ (a date of birth is asked once for older accounts). */
const MAX_SPEED = 30, POS_SLACK = 12, POS_MAX_AGE = 30_000;
async function nearNpc(userId: string, b: Record<string, unknown>, npc: { x: number; z: number }) {
  const sx = Number(b.sx), sz = Number(b.sz); if (!Number.isFinite(sx) || !Number.isFinite(sz)) return 'Bad position.';
  const row = await prisma.playerPosition.findUnique({ where: { userId } }), now = Date.now();
  if (!row || now - row.updatedAt.getTime() > POS_MAX_AGE) return 'Move a little and try again.';
  if (Math.hypot(sx - row.x, sz - row.z) > MAX_SPEED * ((now - row.updatedAt.getTime()) / 1000) + POS_SLACK) return 'Position check failed.';
  if (Math.hypot(sx - npc.x, sz - npc.z) > NPC_RANGE + 1.5) return 'Too far away: walk up to them first.';
  return '';
}
const adultOk = (u: { dateOfBirth: Date | null; adultContentAcceptedAt: Date | null } | null) => {
  if (!u?.dateOfBirth || !u.adultContentAcceptedAt) return false;
  const n = new Date(), cut = new Date(Date.UTC(n.getUTCFullYear() - 18, n.getUTCMonth(), n.getUTCDate())); return u.dateOfBirth <= cut;
};

export async function POST(req: Request) {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    const st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
    const b = await req.json().catch(() => ({})), action = String(b.action || 'poll');
    const acct = await prisma.user.findUnique({ where: { id: u.id }, select: { dateOfBirth: true, adultContentAcceptedAt: true } });

    if (action === 'poll') return NextResponse.json({ ok: true, adult: adultOk(acct), cash: st.save.cash, heat: st.save.heat, cop: st.profile.profession === 'police', dealerPrice: Math.round(buyPrice() * NPC_DEALER_MARKUP), npcs: STREET_NPCS.map(n => ({ id: n.id, role: n.role, name: n.name, e: n.e, line: n.line, price: n.price })) });

    if (action === 'adult') {   // one-time confirmation for accounts made before the age gate existed
      const t = String(b.dateOfBirth || ''), dob = new Date(`${t}T00:00:00.000Z`), n = new Date();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || Number.isNaN(dob.getTime()) || dob.toISOString().slice(0, 10) !== t || dob > n) return err('Enter a valid date of birth.');
      if (dob > new Date(Date.UTC(n.getUTCFullYear() - 18, n.getUTCMonth(), n.getUTCDate()))) return err('This content is for players aged 18 and older.', 403);
      if (b.accept !== true) return err('Please confirm that you understand this game contains mature fictional themes.');
      if (acct?.dateOfBirth && acct.dateOfBirth.toISOString().slice(0, 10) !== t) return err('That does not match the date of birth on your account.', 403);
      await prisma.user.update({ where: { id: u.id }, data: { dateOfBirth: acct?.dateOfBirth ?? dob, adultContentAcceptedAt: new Date() } });
      return NextResponse.json({ ok: true, adult: true });
    }

    if (action !== 'buy' && action !== 'hire') return err('Unknown action.');
    if (st.jailLeft) return err('You are in jail.', 403);
    if (downState(st.save.downUntil).down) return err('You are out cold.', 403);
    if (st.profile.profession === 'police') return err('Officers cannot do this.', 403);
    if (!adultOk(acct)) return err('Confirm that you are 18 or older first.', 403);
    const npc = streetNpc(String(b.npc || '')); if (!npc) return err('Nobody there.', 404);
    const far = await nearNpc(u.id, b, npc); if (far) return err(far, 409);
    if (throttled('street-npc:' + u.id, 30, 10 * 60_000)) return err('Slow down.', 429);

    if (action === 'buy') {
      if (npc.role !== 'dealer') return err(`${npc.name} does not sell that.`, 409);
      const qty = Math.floor(Number(b.qty) || 0); if (!(qty >= 1 && qty <= MAX_PER_DEAL)) return err(`Choose 1 to ${MAX_PER_DEAL}.`);
      const have = (await prisma.inventoryItem.findUnique({ where: { userId_itemKey: { userId: u.id, itemKey: ITEM } } }))?.quantity || 0;
      if (have + qty > MAX_STACK) return err(`You can carry at most ${MAX_STACK}.`, 409);
      const cost = Math.round(buyPrice() * NPC_DEALER_MARKUP) * qty, addHeat = NPC_DEALER_HEAT * qty;
      try {
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          const r = await tx.save.updateMany({ where: { userId: u.id, cash: { gte: cost } }, data: { cash: { decrement: cost }, heat: { increment: addHeat }, heatAt: new Date() } });
          if (!r.count) throw new Stop("You can't afford that.", 402);
          await clampHeat(tx, [u.id]);
          await tx.inventoryItem.upsert({ where: { userId_itemKey: { userId: u.id, itemKey: ITEM } }, create: { userId: u.id, itemKey: ITEM, name: ITEM_NAME, quantity: qty }, update: { quantity: { increment: qty } } });
          await tx.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -cost, description: `street-npc:buy:${npc.id}:${qty}` } });
          await tx.crime.create({ data: { userId: u.id, kind: 'drug_buy', caught: false, loot: 0 } });
        });
      } catch (e) { if (e instanceof Stop) return err(e.msg, e.code); throw e; }
      const n = await loadState(u.id);
      return NextResponse.json({ ok: true, qty, spent: cost, cash: n!.save.cash, heat: n!.save.heat, wanted: n!.save.heat >= 40 });
    }

    // hire an escort: pay, a short fade-to-black scene on the client, needs go up, heat goes up
    if (npc.role !== 'escort') return err(`${npc.name} is not that kind of company.`, 409);
    if (NPC_ESCORT_COOLDOWN_MS > 0 && await prisma.transaction.findFirst({ where: { userId: u.id, description: `street-npc:company:${npc.id}`, createdAt: { gt: new Date(Date.now() - NPC_ESCORT_COOLDOWN_MS) } }, select: { id: true } })) return err(`${npc.name} needs a break. Try again in a few minutes.`, 429);   // read from the transaction log, so it survives restarts
    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const r = await tx.save.updateMany({ where: { userId: u.id, cash: { gte: npc.price } }, data: { cash: { decrement: npc.price }, heat: { increment: NPC_ESCORT_HEAT }, heatAt: new Date() } });
        if (!r.count) throw new Stop("You can't afford that.", 402);
        await clampHeat(tx, [u.id]);
        await tx.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -npc.price, description: `street-npc:company:${npc.id}` } });
      });
    } catch (e) { if (e instanceof Stop) return err(e.msg, e.code); throw e; }
    const n = await loadState(u.id);
    return NextResponse.json({ ok: true, spent: npc.price, cash: n!.save.cash, heat: n!.save.heat, wanted: n!.save.heat >= 40, fx: DEALS.company.fx });
  } catch (e) { console.error(e); return err('Server error.', 500); }
}
