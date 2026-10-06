import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';
import { addSkillXp, insideBiz, loadState } from '../../../lib/game';
import { CITY } from '../../../lib/cityData';
import { sanitizeLook } from '../../../lib/characterModels';
import { MGR_TASKS, MGR_TASKS_NEEDED, MGR_TASK_PAY, MGR_TERM_MS, hasSeat, managerDaily, seatTitle } from '../../../lib/work';

/* Manager seats. One per business. Nobody holds one at the start: the first player to apply gets it.
   A term lasts 7 days; after that the seat is open to everyone again. Every appointment costs MGR_TASKS_NEEDED completed management tasks,
   and tasks done while you hold a seat do not count, so whoever steps down has to earn it all again.
   Tasks live in save.questId as  mtask:<businessId>:<taskId>. */
export const dynamic = 'force-dynamic';
const DAY = 24 * 3600_000, MTASK = /^mtask:([^:]+):([a-z0-9]+)$/;
class Reject extends Error { code: number; constructor(m: string, code = 403) { super(m); this.code = code; } }

async function info(userId: string, bizId: string) {
  const biz = CITY.businesses.find(x => x.id === bizId); if (!biz || !hasSeat(biz)) return null;
  const now = new Date(), [row, mine, st] = await Promise.all([
    prisma.management.findUnique({ where: { businessId: biz.id }, include: { user: { select: { username: true, save: { select: { look: true } } } } } }),
    prisma.management.findUnique({ where: { userId } }), loadState(userId)]);
  const live = row && row.expiresAt > now ? row : null, holdsSeat = !!mine && mine.expiresAt > now, isHolder = !!live && live.userId === userId;
  const holderName = live ? String((live.user.save?.look as { name?: string } | null)?.name || live.user.username).slice(0, 24) : '';
  const m = MTASK.exec(st?.save.questId || ''), act = m && m[1] === biz.id ? MGR_TASKS.find(t => t.id === m[2]) : undefined;
  return {
    seat: true, title: seatTitle(biz), needed: MGR_TASKS_NEEDED, tasks: MGR_TASKS.map(t => ({ id: t.id, label: t.label, mins: t.mins })), daily: managerDaily(biz),
    holder: live ? { name: holderName, look: sanitizeLook((live.user.save?.look as object) || {}, holderName), until: live.expiresAt.getTime() } : null,
    me: { isHolder, holdsSeat, progress: st?.save.mgrTasks ?? 0, salaryInMs: isHolder && live!.lastPaidAt ? Math.max(0, live!.lastPaidAt.getTime() + DAY - now.getTime()) : 0, otherSeat: holdsSeat && !isHolder },
    active: act && st?.save.questAt ? { label: act.label, secs: act.mins * 60, left: Math.max(0, Math.ceil((st.save.questAt.getTime() + act.mins * 60_000 - now.getTime()) / 1000)) } : null,
  };
}

export async function GET(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const i = await info(u.id, new URL(req.url).searchParams.get('biz') || ''); if (!i) return NextResponse.json({ seat: false });
  return NextResponse.json(i);
}

export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({})), st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
  if (st.jailLeft) return err('You are in jail.', 403);
  const biz = insideBiz(st.save); if (!biz || !hasSeat(biz)) return err('You must be inside a business with a manager seat.', 403);
  const now = new Date(), mine = await prisma.management.findUnique({ where: { userId: u.id } }), holding = !!mine && mine.expiresAt > now;

  if (b.action === 'apply') {
    if (st.save.mgrTasks < MGR_TASKS_NEEDED) return err(`Complete ${MGR_TASKS_NEEDED - st.save.mgrTasks} more management task(s) before you can apply.`, 403);
    if (holding) return err('You already hold a manager seat. Wait for your term to end.', 409);
    try {
      await prisma.management.deleteMany({ where: { OR: [{ businessId: biz.id }, { userId: u.id }], expiresAt: { lte: now } } }); // clear expired terms
      await prisma.management.create({ data: { businessId: biz.id, userId: u.id, expiresAt: new Date(now.getTime() + MGR_TERM_MS) } }); // unique(businessId): first applicant wins
    } catch (e) { if ((e as { code?: string }).code === 'P2002') return err('Someone else just took this seat.', 409); throw e; }
    await prisma.save.update({ where: { userId: u.id }, data: { mgrTasks: 0 } });
    return NextResponse.json({ ok: true, info: await info(u.id, biz.id) });
  }
  if (b.action === 'salary') {
    if (!mine || !holding || mine.businessId !== biz.id) return err('You are not the manager here.', 403);
    const pay = managerDaily(biz), r = await prisma.management.updateMany({ where: { id: mine.id, OR: [{ lastPaidAt: null }, { lastPaidAt: { lt: new Date(now.getTime() - DAY) } }] }, data: { lastPaidAt: now } });
    if (!r.count) return err('You already collected your salary today.', 429);
    await prisma.save.update({ where: { userId: u.id }, data: { cash: { increment: pay } } });
    await prisma.transaction.create({ data: { userId: u.id, type: 'EARN', amount: pay, description: `manager:${biz.name}` } });
    const n = await loadState(u.id); return NextResponse.json({ ok: true, pay, cash: n!.save.cash, info: await info(u.id, biz.id) });
  }
  if (b.action === 'task_start') {
    const t = MGR_TASKS.find(x => x.id === b.task); if (!t) return err('Unknown task.');
    if (holding) return err('Managers cannot earn promotion tasks while in office.', 403);
    if (MTASK.test(st.save.questId || '') || /^shift:/.test(st.save.questId || '')) { const cur = st.save.questAt && st.save.questId; if (cur) return err('Finish what you are doing first.', 409); }
    await prisma.save.update({ where: { userId: u.id }, data: { questId: `mtask:${biz.id}:${t.id}`, questAt: now, insideAt: now } });
    return NextResponse.json({ ok: true, secs: t.mins * 60, label: t.label });
  }
  if (b.action === 'task_finish') {
    const m = MTASK.exec(st.save.questId || ''), t = m && m[1] === biz.id ? MGR_TASKS.find(x => x.id === m[2]) : undefined, s = st.save;
    if (!t || !s.questAt) return err('Start a management task first.');
    if (Date.now() - s.questAt.getTime() < t.mins * 60_000 - 5000) return err('Task not finished yet.', 429);
    const r = await prisma.save.updateMany({ where: { userId: u.id, questId: s.questId, questAt: s.questAt }, data: { questId: null, questAt: null, cash: { increment: MGR_TASK_PAY }, mgrTasks: Math.min(MGR_TASKS_NEEDED, s.mgrTasks + 1), profile: addSkillXp(st.profile, 'business', 10) } });
    if (!r.count) return err('Already claimed.', 409);
    await prisma.transaction.create({ data: { userId: u.id, type: 'EARN', amount: MGR_TASK_PAY, description: `mgrtask:${biz.name}:${t.id}` } });
    const n = await loadState(u.id); return NextResponse.json({ ok: true, reward: MGR_TASK_PAY, cash: n!.save.cash, profile: n!.profile, info: await info(u.id, biz.id) });
  }
  return err('Unknown action.');
}
