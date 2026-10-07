import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';
import { loadState } from '../../../lib/game';
import { CITY } from '../../../lib/cityData';
import { ACCESS_BY_TYPE, checkAccess } from '../../../lib/profile';
import { businessStatus } from '../../../lib/businessHours';
import { worldMinute } from '../../../lib/worldClock';
// Can this player enter this building? Rank, invitation and access rules, decided on the server.
export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({})), building = String(b.building || ''), biz = CITY.businesses.find(x => x.id === building);
  if (!biz) return err('No such building.'); const type = biz.type; // never trust the client's type
  const status = businessStatus(type, worldMinute()) /* the server's shared world clock — never the client's */;
  if (!status.open) return NextResponse.json({ ok: false, reason: `Closed now · Hours ${status.hours}` });
  const [st, inv] = await Promise.all([loadState(u.id), prisma.invite.findUnique({ where: { toName_building: { toName: u.username.toLowerCase(), building } } })]); // run both lookups at once
  if (!st) return err('Create your character first.', 409);
  const invited = !!inv;
  const fee = ACCESS_BY_TYPE[type]?.minCash || 0, res = checkAccess(type, { rank: st.rank, profession: st.profile.profession, cash: st.save.cash, invited, jailed: !!st.jailLeft });
  if (!res.ok) return NextResponse.json(res);
  const charge = !!fee && !invited; // fee + 'you are inside' in ONE database write instead of two
  const w = await prisma.save.updateMany({ where: { userId: u.id, ...(charge ? { cash: { gte: fee } } : {}) }, data: { ...(charge ? { cash: { decrement: fee } } : {}), inside: building, insideAt: new Date() } });
  if (!w.count) return NextResponse.json({ ok: false, reason: `Entry costs ₦${fee.toLocaleString()}.` });
  return NextResponse.json(res);
}
