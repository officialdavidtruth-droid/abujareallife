import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, throttled } from '../../../lib/auth';
import { addSkillXp, insideBiz, loadState } from '../../../lib/game';
import { DEALS, DEAL_OFFERS_PER_MIN, DEAL_TTL_MS, NIGHTCLUB, STING_HEAT, dealFor, type DealKind } from '../../../lib/nightlife';
import { PROFESSIONS, type Profile } from '../../../lib/profile';

// Underworld deals between two REAL players inside the same Nightclub. The server checks who is where, who may sell what,
// moves the money atomically and applies heat. There is no NPC side to any deal.
const FRESH = () => new Date(Date.now() - 30 * 60_000);
const prof = (p: unknown) => PROFESSIONS.find(x => x.id === (p as Profile | null)?.profession);

export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({})), action = String(b.action || 'poll');
  const me = await loadState(u.id); if (!me) return err('Create your character first.', 409);
  if (me.jailLeft) return err('You are in jail.', 403);
  const biz = insideBiz(me.save);
  if (!biz || biz.type !== NIGHTCLUB) return err('You have to be inside the Nightclub.', 403);
  const now = Date.now();

  if (action === 'poll') {
    const [here, incoming, outgoing] = await Promise.all([
      prisma.save.findMany({ where: { inside: biz.id, insideAt: { gt: FRESH() }, userId: { not: u.id }, OR: [{ jailUntil: null }, { jailUntil: { lt: new Date() } }] }, select: { profile: true, user: { select: { username: true } } }, take: 40 }),
      prisma.deal.findMany({ where: { toId: u.id, building: biz.id, status: 'pending', createdAt: { gt: new Date(now - DEAL_TTL_MS) } }, orderBy: { createdAt: 'desc' }, take: 10 }),
      prisma.deal.findMany({ where: { fromId: u.id, building: biz.id, createdAt: { gt: new Date(now - DEAL_TTL_MS) } }, orderBy: { createdAt: 'desc' }, take: 10 }),
    ]);
    const sells = dealFor(me.profile.profession);
    return NextResponse.json({
      ok: true, cash: me.save.cash, sells,
      players: here.map((h: { profile: unknown; user: { username: string } }) => { const p = prof(h.profile); return { name: h.user.username, e: p?.e || '🧍', role: p?.label || 'Citizen', cop: p?.id === 'police' }; }),
      incoming: incoming.map((d: { id: string; kind: string; price: number; fromName: string }) => ({ id: d.id, kind: d.kind, price: d.price, from: d.fromName, label: DEALS[d.kind as DealKind]?.label, e: DEALS[d.kind as DealKind]?.e })),
      outgoing: outgoing.map((d: { id: string; kind: string; price: number; toName: string; status: string }) => ({ id: d.id, kind: d.kind, price: d.price, to: d.toName, status: d.status })),
    });
  }

  if (action === 'offer') {
    const def = dealFor(me.profile.profession);
    if (!def) return err('Only escorts, dealers and gang members can make offers here.', 403);
    if (throttled('deal:' + u.id, DEAL_OFFERS_PER_MIN, 60_000)) return err('Slow down.', 429);
    const price = Math.floor(Number(b.price)); if (!(price >= def.min && price <= def.max)) return err(`Ask between ₦${def.min.toLocaleString()} and ₦${def.max.toLocaleString()}.`);
    const to = String(b.to || '').trim().toLowerCase(); if (!to || to === u.username.toLowerCase()) return err('Pick another player.');
    const t = await prisma.user.findUnique({ where: { usernameKey: to } }); if (!t) return err('No such player.');
    const ts = await prisma.save.findUnique({ where: { userId: t.id } });
    if (!ts || ts.inside !== biz.id || !ts.insideAt || ts.insideAt < FRESH() || (ts.jailUntil && ts.jailUntil.getTime() > now)) return err('That player is not in the club right now.', 409);
    const dup = await prisma.deal.findFirst({ where: { fromId: u.id, toId: t.id, status: 'pending', createdAt: { gt: new Date(now - DEAL_TTL_MS) } } });
    if (dup) return err('You already have an open offer to that player.', 409);
    await prisma.deal.create({ data: { building: biz.id, kind: def.kind, price, fromId: u.id, fromName: u.username, toId: t.id, toName: t.username } });
    return NextResponse.json({ ok: true });
  }

  const id = String(b.id || ''), d = await prisma.deal.findUnique({ where: { id } });
  if (!d || d.toId !== u.id || d.building !== biz.id) return err('No such offer.', 404);

  if (action === 'decline') { await prisma.deal.updateMany({ where: { id, status: 'pending' }, data: { status: 'declined' } }); return NextResponse.json({ ok: true }); }
  if (action !== 'accept') return err('Unknown action.');

  const def = DEALS[d.kind as DealKind]; if (!def) return err('Unknown offer.');
  if (now - d.createdAt.getTime() > DEAL_TTL_MS) { await prisma.deal.updateMany({ where: { id, status: 'pending' }, data: { status: 'expired' } }); return err('That offer expired.', 410); }
  const seller = await loadState(d.fromId), ss = seller?.save;
  if (!ss || ss.inside !== biz.id || !ss.insideAt || ss.insideAt < FRESH() || (ss.jailUntil && ss.jailUntil.getTime() > now)) return err('The seller has left the club.', 409);

  // A real officer accepting a dealer/escort offer is a sting: nothing changes hands, the seller is busted.
  if (me.profile.profession === 'police' && def.sting) {
    const r = await prisma.deal.updateMany({ where: { id, status: 'pending' }, data: { status: 'accepted' } }); if (!r.count) return err('That offer is gone.', 409);
    await prisma.save.update({ where: { userId: d.fromId }, data: { heat: { increment: STING_HEAT }, heatAt: new Date() } });
    return NextResponse.json({ ok: true, sting: true, cash: me.save.cash, fx: {} });
  }
  if (me.profile.profession === 'police') return err('Officers cannot pay protection.', 403);

  const ok = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const claim = await tx.deal.updateMany({ where: { id, status: 'pending' }, data: { status: 'accepted' } }); if (!claim.count) return false; // double-accept guard
    const pay = await tx.save.updateMany({ where: { userId: u.id, cash: { gte: d.price } }, data: { cash: { decrement: d.price }, ...(def.buyerHeat ? { heat: { increment: def.buyerHeat }, heatAt: new Date() } : {}) } });
    if (!pay.count) throw new Error('broke');
    await tx.save.update({ where: { userId: d.fromId }, data: { cash: { increment: d.price }, heat: { increment: def.sellerHeat }, heatAt: new Date(), profile: addSkillXp(seller!.profile, def.skill, def.xp) as unknown as Prisma.InputJsonValue } });
    await tx.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -d.price, description: `club:${def.kind}:${d.fromName}` } });
    await tx.transaction.create({ data: { userId: d.fromId, type: 'EARN', amount: d.price, description: `club:${def.kind}:${u.username}` } });
    return true;
  }).catch((e: Error) => (e.message === 'broke' ? 'broke' : false));
  if (ok === 'broke') return err("You can't afford that.", 402);
  if (!ok) return err('That offer is gone.', 409);
  const n = await loadState(u.id);
  return NextResponse.json({ ok: true, cash: n!.save.cash, fx: def.fx });
}
