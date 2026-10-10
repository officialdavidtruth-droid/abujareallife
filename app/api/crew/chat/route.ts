import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { currentUser, err, serverError } from '../../../../lib/auth';
import { CREW } from '../../../../lib/crews';
export const dynamic = 'force-dynamic';

/* Crew chat: members only. GET ?after=<ms> returns newer lines (and marks the chat read); POST sends one. */
export async function GET(req: Request) {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    const m = await prisma.crewMember.findUnique({ where: { userId: u.id } }); if (!m) return err('You are not in a crew.', 403);
    const after = Number(new URL(req.url).searchParams.get('after')) || 0;
    const rows = await prisma.crewMessage.findMany({ where: { crewId: m.crewId, ...(after ? { createdAt: { gt: new Date(after) } } : {}) }, orderBy: { createdAt: 'desc' }, take: after ? 100 : 60 });
    await prisma.crewMember.update({ where: { id: m.id }, data: { chatReadAt: new Date() } });
    return NextResponse.json({ messages: rows.reverse().map(r => ({ id: r.id, from: r.fromName, sys: r.kind === 'sys', body: r.body, at: r.createdAt.getTime(), mine: r.fromName === u.username && r.kind === 'chat' })) });
  } catch (e) { return serverError(e); }
}
export async function POST(req: Request) {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    const m = await prisma.crewMember.findUnique({ where: { userId: u.id } }); if (!m) return err('You are not in a crew.', 403);
    const b = await req.json().catch(() => ({})), body = String(b.body || '').replace(/\s+/g, ' ').trim().slice(0, CREW.chatMax); if (!body) return err('Type a message first.');
    const [last, recent] = await Promise.all([
      prisma.crewMessage.findFirst({ where: { crewId: m.crewId, fromName: u.username, kind: 'chat' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      prisma.crewMessage.count({ where: { crewId: m.crewId, fromName: u.username, kind: 'chat', createdAt: { gt: new Date(Date.now() - 60_000) } } }),
    ]);
    if (last && Date.now() - last.createdAt.getTime() < CREW.chatCooldownMs) return err('Slow down a little.', 429);
    if (recent >= CREW.chatPerMin) return err('You are sending too fast. Wait a minute.', 429);
    const r = await prisma.crewMessage.create({ data: { crewId: m.crewId, fromName: u.username, body } });
    prisma.crewMessage.deleteMany({ where: { crewId: m.crewId, createdAt: { lt: new Date(Date.now() - 7 * 86400_000) } } }).catch(() => {}); // keep a week
    return NextResponse.json({ ok: true, message: { id: r.id, from: r.fromName, sys: false, body: r.body, at: r.createdAt.getTime(), mine: true } });
  } catch (e) { return serverError(e); }
}
