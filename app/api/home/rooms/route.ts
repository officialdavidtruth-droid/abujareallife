import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { currentUser, err, serverError } from '../../../../lib/auth';
import { resolveHome, resolveView } from '../../../../lib/housemates';
import { ROOM_TYPES, checkBuild, checkDemolish, isRoomType, refundFor, roomCost, worldBox, type Room } from '../../../../lib/homeRooms';

export const dynamic = 'force-dynamic';
/* Build mode, step 1 (BUILD-MODE.md): the rooms of a house. GET is open to anyone who may be in the house (owner, housemates, welcomed visitors), so everybody sees the same floor plan.
   Only the owner builds or demolishes. Each change runs under a per-house database lock so two taps at once cannot overlap two rooms or charge twice. */
class Stop extends Error { constructor(public msg: string, public code = 400) { super(msg); } }
type Row = { id: string; type: string; x: number; z: number; w: number; d: number; cost: number };
const toRoom = (r: Row): Room => ({ id: r.id, type: isRoomType(r.type) ? r.type : 'empty', x: r.x, z: r.z, w: r.w, d: r.d, cost: r.cost });
const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const list = async (db: { homeRoom: typeof prisma.homeRoom }, homeId: string) => (await db.homeRoom.findMany({ where: { homeId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })).map(toRoom);

export async function GET(req: Request) {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    const hm = await resolveView(u.id, u.username, new URL(req.url).searchParams.get('visit')); if (!hm) return err('You are not welcome there.', 403);
    return NextResponse.json({ rooms: await list(prisma, hm.id), types: ROOM_TYPES });
  } catch (e) { return serverError(e); }
}

export async function POST(req: Request) {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    const b = await req.json().catch(() => ({})), action = String(b.action || '');
    const hm = await resolveHome(u.id, u.username);
    if (hm.shared) return err(`Only ${hm.username} can change the floor plan of this house.`, 403);
    if (action !== 'build' && action !== 'demolish') return err('Unknown action.');
    try {
      const out = await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'rooms:' + hm.id}))`;   // one change at a time per house
        const rooms = await list(tx, hm.id);
        if (action === 'build') {
          const n = { type: b.type, x: Number(b.x), z: Number(b.z), w: Number(b.w), d: Number(b.d) };
          const why = checkBuild(rooms, n as never); if (why) throw new Stop(why);
          const cost = roomCost(n.type as never, n.w, n.d);
          const paid = await tx.save.updateMany({ where: { userId: u.id, cash: { gte: cost } }, data: { cash: { decrement: cost } } });
          if (!paid.count) throw new Stop("You can't afford that.", 402);
          await tx.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -cost, description: `home:room:${n.type}`.slice(0, 120) } });
          await tx.homeRoom.create({ data: { id: rid(), homeId: hm.id, type: String(n.type), x: n.x, z: n.z, w: n.w, d: n.d, cost } });
          return { rooms: await list(tx, hm.id), charged: cost };
        }
        const id = String(b.id || ''), room = rooms.find(r => r.id === id);
        const why = checkDemolish(rooms, id); if (why) throw new Stop(why, room ? 400 : 404);
        const [x0, x1, z0, z1] = worldBox(room!);
        const inside = await tx.homeFurniture.count({ where: { homeId: hm.id, x: { gte: x0, lt: x1 }, z: { gte: z0, lt: z1 } } });
        if (inside) throw new Stop('Store or sell the furniture in that room first.');
        const gone = await tx.homeRoom.deleteMany({ where: { id, homeId: hm.id } });
        if (!gone.count) throw new Stop('Room not found.', 404);
        const back = refundFor(room!.cost ?? 0);
        if (back > 0) {
          await tx.save.update({ where: { userId: u.id }, data: { cash: { increment: back } } });
          await tx.transaction.create({ data: { userId: u.id, type: 'EARN', amount: back, description: `home:demolish:${room!.type}`.slice(0, 120) } });
        }
        return { rooms: await list(tx, hm.id), refunded: back };
      });
      return NextResponse.json({ ok: true, ...out });
    } catch (e) {
      if (e instanceof Stop) return err(e.msg, e.code);
      throw e;
    }
  } catch (e) { return serverError(e); }
}
