import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, throttled } from '../../../lib/auth';
import { addSkillXp, loadState } from '../../../lib/game';
import { downState } from '../../../lib/downed';
import { checkNear } from '../../../lib/proximity';
import { DEALS, DEAL_TTL_MS, STING_HEAT, STREET } from '../../../lib/nightlife';
export const dynamic = 'force-dynamic';

/* Street escort service: a Club Escort offers company to a real player standing next to them on the street.
   Same rules as the club booth (/api/deal): the buyer decides, money moves atomically, both get heat (the escort more),
   an officer who accepts makes it a sting (no money, the escort gets STING_HEAT). Offers are Deal rows with building = 'street'.
   The "scene" is only a fade to black on the client. */
const pos = (b: Record<string, unknown>, a: string, c: string) => ({ x: Number(b[a]), z: Number(b[c]) });

export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({})), action = String(b.action || 'poll'), now = Date.now();
  const me = await loadState(u.id); if (!me) return err('Create your character first.', 409);
  if (me.jailLeft) return err('You are in jail.', 403);
  if (downState(me.save.downUntil).down) return err('You are out cold.', 403);
  const fresh = new Date(now - DEAL_TTL_MS);

  if (action === 'poll') {
    const [incoming, outgoing] = await Promise.all([
      prisma.deal.findMany({ where: { toId: u.id, building: STREET.building, status: 'pending', createdAt: { gt: fresh } }, orderBy: { createdAt: 'desc' }, take: 5 }),
      prisma.deal.findMany({ where: { fromId: u.id, building: STREET.building, createdAt: { gt: fresh } }, orderBy: { createdAt: 'desc' }, take: 5 }),
    ]);
    return NextResponse.json({ ok: true, isEscort: me.profile.profession === 'escort', min: STREET.min, max: STREET.max, cash: me.save.cash,
      incoming: incoming.map((d: { id: string; price: number; fromName: string }) => ({ id: d.id, price: d.price, from: d.fromName })),
      outgoing: outgoing.map((d: { id: string; price: number; toName: string; status: string }) => ({ id: d.id, price: d.price, to: d.toName, status: d.status })) });
  }

  if (action === 'offer') {
    if (me.profile.profession !== 'escort') return err('Only Club Escorts can offer this.', 403);
    if (throttled('street-escort:' + u.id, 8, 60_000)) return err('Slow down.', 429);
    const price = Math.floor(Number(b.price)); if (!(price >= STREET.min && price <= STREET.max)) return err(`Ask between ₦${STREET.min.toLocaleString()} and ₦${STREET.max.toLocaleString()}.`);
    const to = String(b.to || '').trim(); if (!to || to.toLowerCase() === u.username.toLowerCase()) return err('Pick another player.');
    const near = await checkNear(u.id, to, pos(b, 'sx', 'sz'), pos(b, 'tx', 'tz'), STREET.range);
    if (!near.ok) return err(near.reason, 409);
    if (near.me.driving || near.him.driving) return err('Get out of the car first.', 409);
    const t = await prisma.user.findUnique({ where: { usernameKey: to.toLowerCase() } }); if (!t) return err('No such player.');
    const ts = await prisma.save.findUnique({ where: { userId: t.id } });
    if (!ts || (ts.jailUntil && ts.jailUntil.getTime() > now) || downState(ts.downUntil).down) return err('They cannot answer right now.', 409);
    if (await prisma.deal.findFirst({ where: { fromId: u.id, toId: t.id, building: STREET.building, status: 'pending', createdAt: { gt: fresh } } })) return err('You already have an open offer to that player.', 409);
    await prisma.deal.create({ data: { building: STREET.building, kind: 'company', price, fromId: u.id, fromName: u.username, toId: t.id, toName: t.username } });
    return NextResponse.json({ ok: true });
  }

  const id = String(b.id || ''), d = await prisma.deal.findUnique({ where: { id } });
  if (!d || d.toId !== u.id || d.building !== STREET.building) return err('No such offer.', 404);
  if (action === 'decline') { await prisma.deal.updateMany({ where: { id, status: 'pending' }, data: { status: 'declined' } }); return NextResponse.json({ ok: true }); }
  if (action !== 'accept') return err('Unknown action.');
  if (now - d.createdAt.getTime() > DEAL_TTL_MS) { await prisma.deal.updateMany({ where: { id, status: 'pending' }, data: { status: 'expired' } }); return err('That offer expired.', 410); }
  const near = await checkNear(u.id, d.fromName, pos(b, 'sx', 'sz'), pos(b, 'tx', 'tz'), STREET.range);
  if (!near.ok) return err('Step closer to them first.', 409);
  const seller = await loadState(d.fromId), ss = seller?.save;
  if (!ss || (ss.jailUntil && ss.jailUntil.getTime() > now)) return err('They are gone.', 409);

  if (me.profile.profession === 'police') {   // sting: nothing changes hands, the escort is busted
    const r = await prisma.deal.updateMany({ where: { id, status: 'pending' }, data: { status: 'accepted' } }); if (!r.count) return err('That offer is gone.', 409);
    await prisma.save.update({ where: { userId: d.fromId }, data: { heat: { increment: STING_HEAT }, heatAt: new Date() } });
    return NextResponse.json({ ok: true, sting: true, cash: me.save.cash });
  }
  const def = DEALS.company;
  const ok = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const claim = await tx.deal.updateMany({ where: { id, status: 'pending' }, data: { status: 'accepted' } }); if (!claim.count) return false;
    const pay = await tx.save.updateMany({ where: { userId: u.id, cash: { gte: d.price } }, data: { cash: { decrement: d.price }, heat: { increment: STREET.buyerHeat }, heatAt: new Date() } });
    if (!pay.count) throw new Error('broke');
    await tx.save.update({ where: { userId: d.fromId }, data: { cash: { increment: d.price }, heat: { increment: STREET.sellerHeat }, heatAt: new Date(), profile: addSkillXp(seller!.profile, def.skill, STREET.xp) as unknown as Prisma.InputJsonValue } });
    await tx.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -d.price, description: `street:company:${d.fromName}` } });
    await tx.transaction.create({ data: { userId: d.fromId, type: 'EARN', amount: d.price, description: `street:company:${u.username}` } });
    return true;
  }).catch((e: Error) => (e.message === 'broke' ? 'broke' : false));
  if (ok === 'broke') { await prisma.deal.updateMany({ where: { id, status: 'pending' }, data: { status: 'declined' } }); return err("You can't afford that.", 402); }
  if (!ok) return err('That offer is gone.', 409);
  const n = await loadState(u.id);
  return NextResponse.json({ ok: true, cash: n!.save.cash, heat: n!.save.heat, wanted: n!.save.heat >= 40 });
}
