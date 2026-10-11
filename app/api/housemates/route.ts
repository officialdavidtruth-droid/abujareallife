import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, serverError, throttled } from '../../../lib/auth';
import { PLOT_COUNT } from '../../../lib/houses';
import { MAX_MATES, resolveHome } from '../../../lib/housemates';
// Housemates: invite other players to live in your house. GET = my house situation, POST = invite | accept | decline | cancel | remove | leave.
export const dynamic = 'force-dynamic';
const note = (fromId: string, from: string, to: string, body: string) => prisma.message.create({ data: { fromId, fromName: from, toName: to, kind: 'text', body: body.slice(0, 300) } }).catch(() => null);
const same = (name: string) => ({ equals: name, mode: 'insensitive' as const });

async function snapshot(userId: string) {
  const [live, mates, invites] = await Promise.all([
    prisma.houseMate.findFirst({ where: { mateId: userId, status: 'live' }, select: { ownerName: true } }),
    prisma.houseMate.findMany({ where: { ownerId: userId }, orderBy: { createdAt: 'asc' }, select: { mateName: true, status: true } }),
    prisma.houseMate.findMany({ where: { mateId: userId, status: 'pending' }, orderBy: { createdAt: 'desc' }, select: { ownerName: true } }),
  ]);
  return { livesAt: live?.ownerName ?? null, mates: mates.map(m => ({ name: m.mateName, status: m.status })), invites: invites.map(i => i.ownerName), max: MAX_MATES };
}
const hasPlot = async (id: string) => (await prisma.user.findMany({ select: { id: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: PLOT_COUNT })).some(r => r.id === id);

export async function GET() {
  try { const u = await currentUser(); if (!u) return err('Not signed in.', 401); return NextResponse.json(await snapshot(u.id)); } catch (e) { return serverError(e); }
}
export async function POST(req: Request) {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    if (throttled('housemates:' + u.id, 30, 10 * 60_000)) return err('Slow down.', 429);
    const b = await req.json().catch(() => ({})), action = String(b.action || ''), name = String(b.name || '').trim().slice(0, 40);
    const home = await resolveHome(u.id, u.username);

    if (action === 'invite') {
      if (home.shared) return err(`You live in ${home.username}'s house. Only the owner can invite people. Leave first to host your own.`, 409);
      if (!name) return err('Type a player name.');
      const t = await prisma.user.findUnique({ where: { usernameKey: name.toLowerCase() }, select: { id: true, username: true } });
      if (!t) return err('No such player.', 404);
      if (t.id === u.id) return err("That's you.");
      if (!(await hasPlot(u.id))) return err("You don't have a house on the street yet.", 409);
      const cur = await prisma.houseMate.findUnique({ where: { ownerId_mateId: { ownerId: u.id, mateId: t.id } } });
      if (cur?.status === 'live') return err(`${t.username} already lives with you.`, 409);
      if (cur) return err(`${t.username} already has an invite.`, 409);
      if ((await prisma.houseMate.count({ where: { ownerId: u.id } })) >= MAX_MATES) return err(`Your house holds ${MAX_MATES} housemates (invites count).`, 409);
      await prisma.houseMate.create({ data: { ownerId: u.id, ownerName: u.username, mateId: t.id, mateName: t.username } });
      await note(u.id, u.username, t.username, `🏠 ${u.username} invited you to live in their house. Open Menu → Housemates to accept.`);
      return NextResponse.json({ ok: true, ...(await snapshot(u.id)) });
    }
    if (action === 'accept') {
      const inv = await prisma.houseMate.findFirst({ where: { mateId: u.id, status: 'pending', ownerName: same(name) } });
      if (!inv) return err('That invite is gone.', 404);
      if (await prisma.houseMate.findFirst({ where: { ownerId: u.id, status: 'live' } })) return err('You have housemates of your own. Remove them first.', 409);
      if (await prisma.houseMate.findFirst({ where: { ownerId: inv.mateId, status: 'live' } })) return err('You have housemates of your own. Remove them first.', 409);
      if (await prisma.houseMate.findFirst({ where: { mateId: inv.ownerId, status: 'live' } })) return err(`${inv.ownerName} now lives in someone else's house.`, 409);
      if (!(await hasPlot(inv.ownerId))) return err(`${inv.ownerName} has no house on the street.`, 409);
      await prisma.$transaction([
        prisma.houseMate.deleteMany({ where: { mateId: u.id, status: 'live' } }),   // you can only live in one house
        prisma.houseMate.update({ where: { id: inv.id }, data: { status: 'live' } }),
      ]);
      await note(u.id, u.username, inv.ownerName, `🏠 ${u.username} moved into your house.`);
      return NextResponse.json({ ok: true, ...(await snapshot(u.id)) });
    }
    if (action === 'decline') {
      await prisma.houseMate.deleteMany({ where: { mateId: u.id, status: 'pending', ownerName: same(name) } });
      return NextResponse.json({ ok: true, ...(await snapshot(u.id)) });
    }
    if (action === 'cancel' || action === 'remove') {
      const row = await prisma.houseMate.findFirst({ where: { ownerId: u.id, mateName: same(name) } });
      if (!row) return err('They are not on your list.', 404);
      await prisma.houseMate.delete({ where: { id: row.id } });
      if (row.status === 'live') await note(u.id, u.username, row.mateName, `🏠 ${u.username} asked you to move out of their house.`);
      return NextResponse.json({ ok: true, ...(await snapshot(u.id)) });
    }
    if (action === 'leave') {
      const row = await prisma.houseMate.findFirst({ where: { mateId: u.id, status: 'live' } });
      if (!row) return err("You don't live in someone else's house.", 404);
      await prisma.houseMate.delete({ where: { id: row.id } });
      await note(u.id, u.username, row.ownerName, `🏠 ${u.username} moved out of your house.`);
      return NextResponse.json({ ok: true, ...(await snapshot(u.id)) });
    }
    return err('Unknown action.');
  } catch (e) { return serverError(e); }
}
