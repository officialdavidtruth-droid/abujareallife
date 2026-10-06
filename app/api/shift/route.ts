import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';
import { addSkillXp, insideBiz, loadState } from '../../../lib/game';
import { SKILL_FOR, shiftPay } from '../../../lib/interiors';
const SECS = 25;
// Work a shift for the building you are inside. Pay = a tenth of that job's monthly salary. Senior roles need rank 2.
export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({})), st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
  if (st.jailLeft) return err('You are in jail.', 403);
  const biz = insideBiz(st.save); if (!biz) return err('You are not inside a building.', 403);
  if (b.action === 'start') {
    const idx = Math.floor(Number(b.idx)), job = biz.jobs[idx]; if (!job) return err('No such job.');
    if (idx >= 2 && st.rank < 2) return err('Senior role: needs rank 2.', 403);
    await prisma.save.update({ where: { userId: u.id }, data: { questId: `shift:${idx}`, questAt: new Date() } });
    return NextResponse.json({ ok: true, secs: SECS });
  }
  const s = st.save, m = /^shift:(\d+)$/.exec(s.questId || ''); if (!m || !s.questAt) return err('Start a shift first.');
  const job = biz.jobs[+m[1]]; if (!job) return err('No such job.');
  if (Date.now() - s.questAt.getTime() < SECS * 900) return err('Too fast. No pay.', 429);
  const pay = shiftPay(job.pay), skill = SKILL_FOR[biz.type] || 'hustling';
  const r = await prisma.save.updateMany({ where: { userId: u.id, questId: s.questId, questAt: s.questAt }, data: { questId: null, questAt: null, cash: { increment: pay }, profile: addSkillXp(st.profile, skill, 8) } });
  if (!r.count) return err('Already paid.', 409);
  await prisma.transaction.create({ data: { userId: u.id, type: 'EARN', amount: pay, description: `shift:${biz.name}:${job.title}` } });
  const n = await loadState(u.id);
  return NextResponse.json({ ok: true, pay, cash: n!.save.cash, profile: n!.profile });
}
