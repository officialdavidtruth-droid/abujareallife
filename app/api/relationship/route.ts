import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';
import { loadState } from '../../../lib/game';
import { RELATIONSHIPS } from '../../../lib/profile';
// Two-sided: one player proposes, the other accepts. Both profiles update together.
export const dynamic = 'force-dynamic';
export async function GET() {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const me = u.username, rows = await prisma.relationship.findMany({ where: { OR: [{ aName: me }, { bName: me }] } });
  return NextResponse.json({ requests: rows.filter((r: { accepted: boolean; bName: string }) => !r.accepted && r.bName === me), mine: rows.filter((r: { accepted: boolean; bName: string }) => r.accepted) });
}
export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({})), me = u.username;
  const set = async (name: string, status: string, partner: string | null) => {
    const t = await prisma.user.findUnique({ where: { username: name } }), s = t && await loadState(t.id);
    if (t && s) await prisma.save.update({ where: { userId: t.id }, data: { profile: { ...s.profile, relationship: status, partner } } });
  };
  if (b.action === 'propose') {
    const status = String(b.status);
    if (!['dating', 'engaged', 'married'].includes(status)) return err('Invalid status.');
    const other = await prisma.user.findUnique({ where: { usernameKey: String(b.to || '').toLowerCase() } });
    if (!other || other.username === me) return err('No such player.');
    await prisma.relationship.upsert({ where: { aName_bName: { aName: me, bName: other.username } }, create: { aName: me, bName: other.username, status }, update: { status, accepted: false } });
    return NextResponse.json({ ok: true });
  }
  if (b.action === 'accept') {
    const r = await prisma.relationship.findFirst({ where: { bName: me, aName: String(b.from), accepted: false } }); if (!r) return err('No request.');
    await prisma.relationship.update({ where: { id: r.id }, data: { accepted: true } });
    await set(me, r.status, r.aName); await set(r.aName, r.status, me);
    return NextResponse.json({ ok: true });
  }
  if (b.action === 'end') {
    const mine = await prisma.relationship.findMany({ where: { accepted: true, OR: [{ aName: me }, { bName: me }] } });
    for (const r of mine) { await prisma.relationship.delete({ where: { id: r.id } }); await set(r.aName, 'single', null); await set(r.bName, 'single', null); }
    return NextResponse.json({ ok: true });
  }
  return err('Unknown action.');
}
