import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, serverError, throttled } from '../../../lib/auth';
import { VISIT, resolveHome } from '../../../lib/housemates';
// Visitors: knock on a door, let people in, invite people, ask them to leave (HOME-DOOR.md).
// GET = what the door says to me (host: knocks; guest: invites and the answer to my knock; ?visit=<owner>: am I still welcome there, keeps the visit fresh).
// POST = knock | answer | invite | kick | enter | leave
export const dynamic = 'force-dynamic';
const now = () => Date.now();
const fresh = (d: Date, ms: number) => now() - d.getTime() <= ms;
const note = (fromId: string, from: string, to: string, body: string) => prisma.message.create({ data: { fromId, fromName: from, toName: to, kind: 'text', body: body.slice(0, 300) } }).catch(() => null);

export async function GET(req: Request) {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    const visit = new URL(req.url).searchParams.get('visit');
    const home = await resolveHome(u.id, u.username);
    const [knocks, mine] = await Promise.all([
      prisma.homeVisit.findMany({ where: { ownerId: home.id, status: 'pending' }, orderBy: { createdAt: 'asc' }, select: { guestName: true, createdAt: true } }),
      prisma.homeVisit.findMany({ where: { guestId: u.id, status: { in: ['pending', 'allowed', 'denied'] } }, orderBy: { updatedAt: 'desc' }, take: 8 }),
    ]);
    let welcome: boolean | undefined;
    if (visit) {
      const v = mine.find(m => m.ownerName.toLowerCase() === visit.trim().toLowerCase());
      welcome = !!v && v.status === 'allowed' && fresh(v.updatedAt, VISIT.allowMs);
      if (welcome && v) await prisma.homeVisit.update({ where: { id: v.id }, data: { updatedAt: new Date() } }).catch(() => null);   // still inside: keep the welcome fresh
    }
    const slotOf = async (ownerId: string) => (await prisma.user.findUnique({ where: { id: ownerId }, select: { houseSlot: true } }))?.houseSlot ?? null;
    const cards = [];
    for (const m of mine) if (m.status === 'allowed' && m.kind !== 'used' && fresh(m.updatedAt, VISIT.cardMs)) cards.push({ owner: m.ownerName, slot: await slotOf(m.ownerId), invited: m.kind === 'invite' });
    const k = mine.find(m => m.kind === 'knock' && m.status !== 'allowed' && fresh(m.updatedAt, VISIT.knockMs));
    return NextResponse.json({
      knocks: knocks.filter(x => fresh(x.createdAt, VISIT.knockMs)).map(x => x.guestName),
      cards, knock: k ? { owner: k.ownerName, status: k.status } : null, welcome,
    });
  } catch (e) { return serverError(e); }
}

export async function POST(req: Request) {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    if (throttled('visit:' + u.id, 60, 5 * 60_000)) return err('Slow down.', 429);
    const b = await req.json().catch(() => ({})), action = String(b.action || ''), name = String(b.name || '').trim().slice(0, 40);
    const home = await resolveHome(u.id, u.username);
    const find = (n: string) => prisma.user.findUnique({ where: { usernameKey: n.toLowerCase() }, select: { id: true, username: true, houseSlot: true } });

    if (action === 'knock') {
      const slot = Number(b.slot), o = await prisma.user.findFirst({ where: { houseSlot: Number.isInteger(slot) ? slot : -1 }, select: { id: true, username: true } });
      if (!o) return err('Nobody lives there.', 404);
      if (o.id === home.id) return err("That's your own home.", 409);
      const cur = await prisma.homeVisit.findUnique({ where: { ownerId_guestId: { ownerId: o.id, guestId: u.id } } });
      if (cur?.status === 'allowed' && fresh(cur.updatedAt, VISIT.allowMs)) return NextResponse.json({ ok: true, status: 'allowed', owner: o.username });
      if (cur?.status === 'pending' && fresh(cur.updatedAt, 8_000)) return NextResponse.json({ ok: true, status: 'pending', owner: o.username });
      if (cur?.status === 'denied' && fresh(cur.updatedAt, 20_000)) return err(`${o.username} is not answering. Try again in a moment.`, 429);
      await prisma.homeVisit.upsert({ where: { ownerId_guestId: { ownerId: o.id, guestId: u.id } }, create: { ownerId: o.id, ownerName: o.username, guestId: u.id, guestName: u.username, status: 'pending', kind: 'knock' }, update: { status: 'pending', kind: 'knock', updatedAt: new Date() } });
      return NextResponse.json({ ok: true, status: 'pending', owner: o.username });
    }
    if (action === 'answer' || action === 'kick') {
      const v = await prisma.homeVisit.findFirst({ where: { ownerId: home.id, guestName: { equals: name, mode: 'insensitive' } } });
      if (!v) return err('Nobody by that name.', 404);
      const allow = action === 'answer' && b.allow === true;
      if (action === 'answer' && v.status !== 'pending') return err('That knock is gone.', 409);
      await prisma.homeVisit.update({ where: { id: v.id }, data: { status: allow ? 'allowed' : 'denied', kind: allow ? 'knock' : v.kind, updatedAt: new Date() } });
      if (!allow && action === 'kick') await note(u.id, u.username, v.guestName, `🚪 ${u.username} asked you to leave their house.`);
      return NextResponse.json({ ok: true });
    }
    if (action === 'invite') {
      if (!name) return err('Type a player name.');
      const t = await find(name); if (!t) return err('No such player.', 404);
      if (t.id === u.id) return err("That's you.");
      if (t.id === home.id) return err(`${t.username} owns this house.`, 409);
      if (await prisma.houseMate.findFirst({ where: { ownerId: home.id, mateId: t.id, status: 'live' } })) return err(`${t.username} already lives here.`, 409);
      await prisma.homeVisit.upsert({ where: { ownerId_guestId: { ownerId: home.id, guestId: t.id } }, create: { ownerId: home.id, ownerName: home.username, guestId: t.id, guestName: t.username, status: 'allowed', kind: 'invite' }, update: { status: 'allowed', kind: 'invite', updatedAt: new Date() } });
      await note(u.id, u.username, t.username, `🚪 ${u.username} invited you into ${home.username}'s house. Open the game to come in.`);
      return NextResponse.json({ ok: true });
    }
    if (action === 'enter') {
      const o = await find(name); if (!o) return err('No such house.', 404);
      const v = await prisma.homeVisit.findUnique({ where: { ownerId_guestId: { ownerId: o.id, guestId: u.id } } });
      if (!v || v.status !== 'allowed' || !fresh(v.updatedAt, VISIT.allowMs)) return err("You haven't been let in.", 403);
      await prisma.homeVisit.update({ where: { id: v.id }, data: { kind: 'used', updatedAt: new Date() } });
      return NextResponse.json({ ok: true, owner: o.username, slot: o.houseSlot });
    }
    if (action === 'leave') {
      const o = await find(name); if (!o) return NextResponse.json({ ok: true });
      await prisma.homeVisit.deleteMany({ where: { ownerId: o.id, guestId: u.id } });
      return NextResponse.json({ ok: true });
    }
    return err('Unknown action.');
  } catch (e) { return serverError(e); }
}
