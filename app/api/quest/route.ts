import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';
import { addSkillXp, insideBiz, loadState, lvl } from '../../../lib/game';
import { QUESTS } from '../../../lib/profile';
export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({})), st = await loadState(u.id);
  if (!st) return err('Create your character first.', 409);
  if (st.jailLeft) return err('You are in jail.', 403);
  const q = QUESTS.find(x => x.id === b.id); if (!q) return err('Unknown quest.');
  if (q.profession && !q.profession.includes(st.profile.profession)) return err('Not available for your profession.', 403);
  if (q.at && !q.at.includes(insideBiz(st.save)?.type || '')) return err(`You must be inside: ${q.at.join(' / ')}.`, 403);
  if (b.action === 'start') {
    if (q.minSkill && lvl(st.profile, q.skill) < q.minSkill) return err(`Needs ${q.skill} level ${q.minSkill}.`, 403);
    await prisma.save.update({ where: { userId: u.id }, data: { questId: q.id, questAt: new Date() } });
    return NextResponse.json({ ok: true, secs: q.secs });
  }
  const s = st.save;
  if (s.questId !== q.id || !s.questAt) return err('Start the quest first.');
  if (Date.now() - s.questAt.getTime() < q.secs * 900) return err('Too fast. No pay.', 429);
  const r = await prisma.save.updateMany({ where: { userId: u.id, questId: q.id, questAt: s.questAt }, data: { questId: null, questAt: null, cash: { increment: q.reward }, profile: addSkillXp(st.profile, q.skill, q.xp) } });
  if (!r.count) return err('Already claimed.', 409);
  let heat = 0;
  if (!q.legal) { heat = 25; await prisma.save.update({ where: { userId: u.id }, data: { heat: { increment: heat }, heatAt: new Date() } }); }
  await prisma.transaction.create({ data: { userId: u.id, type: 'EARN', amount: q.reward, description: 'quest:' + q.id } });
  const n = await loadState(u.id);
  return NextResponse.json({ ok: true, reward: q.reward, heatAdded: heat, cash: n!.save.cash, profile: n!.profile });
}
