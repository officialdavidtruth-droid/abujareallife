import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, serverError } from '../../../lib/auth';
import { FREE_PHONE, MAX_SEND_CASH, MSG_COOLDOWN_MS } from '../../../lib/phone';
// Phone messages. Chat is free for everyone: no phone grade, no chat limit.
export const dynamic = 'force-dynamic';
const find = (name: string) => prisma.user.findUnique({ where: { usernameKey: name.trim().toLowerCase() } });
type Row = { id: string; fromName: string; toName: string; kind: string; body: string; data: unknown; readAt: Date | null; createdAt: Date };
const shape = (m: Row, me: string) => ({ id: m.id, mine: m.fromName === me, kind: m.kind, body: m.body, data: m.data || null, at: m.createdAt.getTime(), read: !!m.readAt });

export async function GET(req: Request) {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    const me = u.username, q = new URL(req.url).searchParams;
    if (q.get('count')) { // cheap poll: how many unread, and the newest one (for the pop-up)
      const [unread, latest] = await Promise.all([prisma.message.count({ where: { toName: me, readAt: null } }), prisma.message.findFirst({ where: { toName: me, readAt: null }, orderBy: { createdAt: 'desc' } })]);
      return NextResponse.json({ unread, latest: latest ? { id: latest.id, from: latest.fromName, kind: latest.kind, body: latest.body } : null });
    }
    const withName = q.get('with');
    if (withName) { // one thread; opening it marks their messages as read
      const other = await find(withName); if (!other || other.id === u.id) return err('No such player.', 404);
      const rows = await prisma.message.findMany({ where: { OR: [{ fromName: me, toName: other.username }, { fromName: other.username, toName: me }] }, orderBy: { createdAt: 'desc' }, take: 150 });
      await prisma.message.updateMany({ where: { fromName: other.username, toName: me, readAt: null }, data: { readAt: new Date() } });
      return NextResponse.json({ name: other.username, tier: 3, messages: rows.reverse().map((m: Row) => shape(m, me)) });
    }
    const [rows, unread] = await Promise.all([
      prisma.message.findMany({ where: { OR: [{ fromName: me }, { toName: me }] }, orderBy: { createdAt: 'desc' }, take: 400 }),
      prisma.message.count({ where: { toName: me, readAt: null } }),
    ]);
    const by = new Map<string, { name: string; last: ReturnType<typeof shape>; unread: number }>();
    for (const m of rows as Row[]) { const p = m.fromName === me ? m.toName : m.fromName; let c = by.get(p); if (!c) { c = { name: p, last: shape(m, me), unread: 0 }; by.set(p, c); } if (m.toName === me && !m.readAt) c.unread++; }
    const s = await prisma.save.findUnique({ where: { userId: u.id }, select: { cash: true } });
    return NextResponse.json({ convs: [...by.values()], unread, tier: 3, cash: s?.cash ?? 0 });
  } catch (e) { return serverError(e); }
}

export async function POST(req: Request) {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    const b = await req.json().catch(() => ({})), me = u.username;
    const kind = b.kind === 'loc' ? 'loc' : b.kind === 'cash' ? 'cash' : 'text';
    const text = String(b.body || '').replace(/\s+/g, ' ').trim().slice(0, FREE_PHONE.maxLen);
    if (kind === 'text' && !text) return err('Type a message first.');
    // one round trip for everything we need to check, instead of five in a row
    const [to, last, recent] = await Promise.all([
      find(String(b.to || '')),
      prisma.message.findFirst({ where: { fromName: me }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      prisma.message.count({ where: { fromName: me, createdAt: { gt: new Date(Date.now() - 60_000) } } }),
    ]);
    if (!to || to.id === u.id) return err('No such player.', 404);
    if (last && Date.now() - last.createdAt.getTime() < MSG_COOLDOWN_MS) return err('Slow down a little.', 429);
    if (recent >= 60) return err('You are sending too fast. Wait a minute.', 429);
    if (kind === 'loc') {
      const x = Number(b.x), z = Number(b.z); if (!isFinite(x) || !isFinite(z)) return err('No location.');
      const m = await prisma.message.create({ data: { fromId: u.id, fromName: me, toName: to.username, kind, body: text || '📍 My location', data: { x: Math.round(Math.max(-400, Math.min(400, x)) * 10) / 10, z: Math.round(Math.max(-400, Math.min(400, z)) * 10) / 10 } } });
      return NextResponse.json({ ok: true, message: shape(m, me) });
    }
    if (kind === 'cash') {
      const amt = Math.floor(Number(b.amount)); if (!(amt >= 1) || amt > MAX_SEND_CASH) return err(`Send between ₦1 and ₦${MAX_SEND_CASH.toLocaleString()}.`);
      try {
        const m = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          const r = await tx.save.updateMany({ where: { userId: u.id, cash: { gte: amt } }, data: { cash: { decrement: amt } } }); if (!r.count) throw new Error('FUNDS');
          const t = await tx.save.updateMany({ where: { userId: to.id }, data: { cash: { increment: amt } } }); if (!t.count) throw new Error('NOSAVE');
          await tx.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -amt, description: `sent:${to.username}` } });
          await tx.transaction.create({ data: { userId: to.id, type: 'EARN', amount: amt, description: `received:${me}` } });
          return tx.message.create({ data: { fromId: u.id, fromName: me, toName: to.username, kind, body: text, data: { amount: amt } } });
        });
        const s = await prisma.save.findUnique({ where: { userId: u.id }, select: { cash: true } });
        return NextResponse.json({ ok: true, message: shape(m, me), cash: s?.cash ?? 0 });
      } catch (e) { const t = (e as Error).message; if (t === 'FUNDS') return err("You don't have that much cash.", 402); if (t === 'NOSAVE') return err('That player has no character yet.', 409); throw e; }
    }
    const m = await prisma.message.create({ data: { fromId: u.id, fromName: me, toName: to.username, kind: 'text', body: text } });
    return NextResponse.json({ ok: true, message: shape(m, me) });
  } catch (e) { return serverError(e); }
}
