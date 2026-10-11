import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, serverError } from '../../../lib/auth';
import { loadState } from '../../../lib/game';
import { UPGRADES, homeKey, upgradeById } from '../../../lib/homeUpgrades';
import { resolveHome, resolveView } from '../../../lib/housemates';
import { STARTER_FOR, hitsRoom, starterRooms } from '../../../lib/homeRooms';
// Home upgrades (rooms + luxury items). Permanent, bought once, paid on the server.
export const dynamic = 'force-dynamic';
class Stop extends Error { constructor(public msg: string, public code = 400) { super(msg); } }
async function snapshot(userId: string, homeId = userId) {   // rooms belong to the house (its owner); cash is always yours
  const [rows, save] = await Promise.all([prisma.inventoryItem.findMany({ where: { userId: homeId, itemKey: { startsWith: 'home_' }, quantity: { gt: 0 } }, select: { itemKey: true } }), prisma.save.findUnique({ where: { userId }, select: { cash: true } })]);
  const keys = new Set((rows as { itemKey: string }[]).map(r => r.itemKey));
  return { owned: UPGRADES.filter(u => keys.has(homeKey(u.id))).map(u => u.id), cash: save?.cash ?? 0 };
}
export async function GET(req: Request) {
  try { const u = await currentUser(); if (!u) return err('Not signed in.', 401); const h = await resolveView(u.id, u.username, new URL(req.url).searchParams.get('visit')); if (!h) return err('You are not welcome there.', 403); return NextResponse.json({ catalog: UPGRADES, shared: h.shared, owner: h.username, ...(await snapshot(u.id, h.id)) }); } catch (e) { return serverError(e); }
}
export async function POST(req: Request) {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    const st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
    if (st.jailLeft) return err('You are in jail.', 403);
    const hm = await resolveHome(u.id, u.username); if (hm.shared) return err(`Only ${hm.username} can build rooms in this house.`, 403);
    const b = await req.json().catch(() => ({})), up = upgradeById(String(b.id)); if (!up) return err('Unknown upgrade.', 404);
    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        if (await tx.inventoryItem.findUnique({ where: { userId_itemKey: { userId: u.id, itemKey: homeKey(up.id) } } })) throw new Stop('You already have that.', 409);
        if (up.needs && !(await tx.inventoryItem.findUnique({ where: { userId_itemKey: { userId: u.id, itemKey: homeKey(up.needs) } } }))) throw new Stop(`Build the ${upgradeById(up.needs)?.name || 'required room'} first.`, 409);
        const r = await tx.save.updateMany({ where: { userId: u.id, cash: { gte: up.price } }, data: { cash: { decrement: up.price } } }); if (!r.count) throw new Stop("You can't afford that.", 402);
        await tx.inventoryItem.create({ data: { userId: u.id, itemKey: homeKey(up.id), name: up.name, quantity: 1 } });
        const sid = STARTER_FOR[up.id];   // a house already on the room plan gets the wing as a real room too (lib/homeRooms.ts starterRooms)
        if (sid) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'rooms:' + u.id}))`;
          const rows = await tx.homeRoom.findMany({ where: { homeId: u.id } });
          if (rows.length) {
            const wing = starterRooms(id => id === up.id).find(r => r.id === sid)!;
            if (hitsRoom(rows.map(r => ({ id: r.id, type: 'empty' as const, x: r.x, z: r.z, w: r.w, d: r.d })), wing)) throw new Stop('Something you built is in the way. Demolish it first.', 409);
            await tx.homeRoom.create({ data: { id: u.id + '~' + sid, homeId: u.id, type: wing.type, x: wing.x, z: wing.z, w: wing.w, d: wing.d, cost: 0 } });
          }
        }
        await tx.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -up.price, description: `home:${up.id}` } });
      });
    } catch (e) { if (e instanceof Stop) return err(e.msg, e.code); throw e; }
    return NextResponse.json({ ok: true, bought: up.name, ...(await snapshot(u.id)) });
  } catch (e) { return serverError(e); }
}
