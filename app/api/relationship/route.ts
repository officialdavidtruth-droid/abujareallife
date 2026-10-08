import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';
import { loadState } from '../../../lib/game';
import { RELATIONSHIPS, FRIEND_STATUSES } from '../../../lib/profile';
const isSocial = (st: string) => (FRIEND_STATUSES as readonly string[]).includes(st);
// Two-sided: one player proposes, the other accepts. Both profiles update together.
export const dynamic = 'force-dynamic';
export async function GET() {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const me = u.username, rows = await prisma.relationship.findMany({ where: { OR: [{ aName: me }, { bName: me }] } });
  return NextResponse.json({ requests: rows.filter((r: { accepted: boolean; bName: string }) => !r.accepted && r.bName === me), mine: rows.filter((r: { accepted: boolean; status: string }) => r.accepted && !isSocial(r.status)), friends: rows.filter((r: { accepted: boolean; status: string }) => r.accepted && isSocial(r.status)) });
}
export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({})), me = u.username;
  const set = async (name: string, status: string, partner: string | null) => {
    const t = await prisma.user.findUnique({ where: { username: name } }), s = t && await loadState(t.id);
    if (t && s) await prisma.save.update({ where: { userId: t.id }, data: { profile: { ...s.profile, relationship: status, partner } } });
  };
  if (b.action === 'propose' && isSocial(String(b.status))) {
    const other = await prisma.user.findUnique({ where: { usernameKey: String(b.to || '').toLowerCase() } });
    if (!other || other.username === me) return err('No such player.');
    const dup = await prisma.relationship.findFirst({ where: { status: { in: [...FRIEND_STATUSES] }, OR: [{ aName: me, bName: other.username }, { aName: other.username, bName: me }] } });
    if (dup) await prisma.relationship.delete({ where: { id: dup.id } }); // upgrading friends -> best friends replaces the old link
    await prisma.relationship.create({ data: { aName: me, bName: other.username, status: String(b.status), accepted: false } }).catch(() => null);
    return NextResponse.json({ ok: true });
  }
  if (b.action === 'gift') {
    const to = await prisma.user.findUnique({ where: { usernameKey: String(b.to || '').toLowerCase() } }); const amt = Math.round(Number(b.amount) || 0);
    if (!to || to.username === me) return err('No such player.'); if (amt < 1000 || amt > 5_000_000) return err('Gift must be ₦1,000 to ₦5,000,000.');
    const link = await prisma.relationship.findFirst({ where: { accepted: true, OR: [{ aName: me, bName: to.username }, { aName: to.username, bName: me }] } }); if (!link) return err('You can only gift friends or your partner.');
    const mine = await prisma.save.findUnique({ where: { userId: u.id } }); if (!mine || mine.cash < amt) return err('Not enough cash.', 402);
    await prisma.$transaction([
      prisma.save.update({ where: { userId: u.id }, data: { cash: { decrement: amt } } }), prisma.save.update({ where: { userId: to.id }, data: { cash: { increment: amt } } }),
      prisma.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -amt, description: `gift:${to.username}` } }), prisma.transaction.create({ data: { userId: to.id, type: 'EARN', amount: amt, description: `gift-from:${me}` } }),
      prisma.reputation.upsert({ where: { userId: u.id }, update: { social: { increment: 2 } }, create: { userId: u.id, social: 52 } }),
    ]);
    return NextResponse.json({ ok: true });
  }
  if (b.action === 'unfriend') {
    const r = await prisma.relationship.findFirst({ where: { status: { in: [...FRIEND_STATUSES] }, OR: [{ aName: me, bName: String(b.with) }, { aName: String(b.with), bName: me }] } });
    if (r) await prisma.relationship.delete({ where: { id: r.id } });
    return NextResponse.json({ ok: true });
  }
  if (b.action === 'propose') {
    const status = String(b.status);
    if (!['dating', 'engaged', 'married'].includes(status)) return err('Invalid status.');
    const other = await prisma.user.findUnique({ where: { usernameKey: String(b.to || '').toLowerCase() } });
    if (!other || other.username === me) return err('No such player.');
    const existing = await prisma.relationship.findFirst({ where: { OR: [{ aName: me, bName: other.username }, { aName: other.username, bName: me }] } });
    if (status === 'engaged' && (!existing || !existing.accepted || existing.status !== 'dating')) return err('You must both accept the dating relationship before getting engaged.');
    if (status === 'married' && (!existing || !existing.accepted || existing.status !== 'engaged')) return err('You must both accept the engagement before getting married.');
    if (existing && existing.aName === other.username && !existing.accepted) return err('This player has already sent you the current relationship request. Respond to it first.');
    if (existing && existing.aName === other.username) await prisma.relationship.delete({ where: { id: existing.id } });
    await prisma.relationship.upsert({ where: { aName_bName: { aName: me, bName: other.username } }, create: { aName: me, bName: other.username, status, accepted: false }, update: { status, accepted: false } });
    return NextResponse.json({ ok: true });
  }
  if (b.action === 'accept') {
    const r = await prisma.relationship.findFirst({ where: { bName: me, aName: String(b.from), accepted: false } }); if (!r) return err('No request.');
    await prisma.relationship.update({ where: { id: r.id }, data: { accepted: true } });
    if (!isSocial(r.status)) { await set(me, r.status, r.aName); await set(r.aName, r.status, me); }
    return NextResponse.json({ ok: true });
  }
  if (b.action === 'end') {
    const mine = await prisma.relationship.findMany({ where: { accepted: true, status: { in: ['dating', 'engaged', 'married'] }, OR: [{ aName: me }, { bName: me }] } });
    for (const r of mine) { await prisma.relationship.delete({ where: { id: r.id } }); await set(r.aName, 'single', null); await set(r.bName, 'single', null); }
    return NextResponse.json({ ok: true });
  }
  return err('Unknown action.');
}
