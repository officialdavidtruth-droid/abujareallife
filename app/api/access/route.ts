import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';
import { loadState } from '../../../lib/game';
import { CITY } from '../../../lib/cityData';
import { ACCESS_BY_TYPE, checkAccess } from '../../../lib/profile';
// Can this player enter this building? Rank, invitation and access rules, decided on the server.
export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({})), building = String(b.building || ''), biz = CITY.businesses.find(x => x.id === building);
  if (!biz) return err('No such building.'); const type = biz.type; // never trust the client's type
  const st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
  const invited = !!(await prisma.invite.findUnique({ where: { toName_building: { toName: u.username.toLowerCase(), building } } }));
  const fee = ACCESS_BY_TYPE[type]?.minCash || 0, res = checkAccess(type, { rank: st.rank, profession: st.profile.profession, cash: st.save.cash, invited, jailed: !!st.jailLeft });
  if (res.ok && fee && !invited) await prisma.save.updateMany({ where: { userId: u.id, cash: { gte: fee } }, data: { cash: { decrement: fee } } });
  if (res.ok) await prisma.save.update({ where: { userId: u.id }, data: { inside: building, insideAt: new Date() } });
  return NextResponse.json(res);
}
