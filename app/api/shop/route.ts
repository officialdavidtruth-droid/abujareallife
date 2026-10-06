import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';
import { addSkillXp, insideBiz, loadState } from '../../../lib/game';
import { SHOP } from '../../../lib/interiors';
// Prices live on the server. You can only buy what the building you are inside sells.
export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
  if (st.jailLeft) return err('You are in jail.', 403);
  const biz = insideBiz(st.save); if (!biz) return err('You are not inside a building.', 403);
  const want = String((await req.json().catch(() => ({}))).item), item = (SHOP[biz.type] || []).find(i => i.id === want); if (!item) return err('Not sold here.');
  const r = await prisma.save.updateMany({ where: { userId: u.id, cash: { gte: item.cost } }, data: { cash: { decrement: item.cost }, ...(item.xp ? { profile: addSkillXp(st.profile, item.xp.skill, item.xp.amt) } : {}) } });
  if (!r.count) return err("You can't afford that.", 402);
  await prisma.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -item.cost, description: `shop:${biz.type}:${item.id}` } });
  const n = await loadState(u.id);
  return NextResponse.json({ ok: true, cash: n!.save.cash, fx: item.fx || {}, profile: n!.profile });
}
