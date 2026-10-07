import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';
import { addSkillXp, awardFame, insideBiz, loadState } from '../../../lib/game';
import { FAME_SHIFT } from '../../../lib/profile';
import { SKILL_FOR, shiftPayFor } from '../../../lib/interiors';
import { isSenior, shiftJobs, shiftMins, tasksFor } from '../../../lib/work';

// A shift lasts 8–12 minutes: the server assigns a task when you clock in, and job + task decide the length.
// Stored in save.questId as  shift:<businessId>:<jobIndex>:<taskId>  (the server is the only clock). Leaving the building forfeits it (see /api/exit).
const SHIFT = /^shift:([^:]+):(\d+):([a-z0-9]+)$/;
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({})), st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
  if (st.jailLeft) return err('You are in jail.', 403);
  const biz = insideBiz(st.save); if (!biz) return err('You are not inside a building.', 403);
  const jobs = shiftJobs(biz), currentIdx = Math.floor(Number(b.idx)), currentJob = Number.isFinite(currentIdx) && jobs[currentIdx] ? jobs[currentIdx] : null, tasks = tasksFor(biz.type, currentJob?.title);
  const cur = SHIFT.exec(st.save.questId || ''), mine = cur && cur[1] === biz.id ? { job: jobs[+cur[2]], task: tasks.find(t => t.id === cur[3]), idx: +cur[2] } : null;

  if (b.action === 'status') { // lets the room restore your timer after a refresh
    if (!mine?.job || !mine.task || !st.save.questAt) return NextResponse.json({ ok: true, active: false });
    const secs = shiftMins(mine.job, mine.task) * 60, left = Math.max(0, Math.ceil((st.save.questAt.getTime() + secs * 1000 - Date.now()) / 1000));
    await prisma.save.update({ where: { userId: u.id }, data: { insideAt: new Date() } });
    return NextResponse.json({ ok: true, active: true, idx: mine.idx, label: mine.job.title, task: mine.task.label, secs, left });
  }
  if (b.action === 'start') {
    const idx = Math.floor(Number(b.idx)), job = jobs[idx]; if (!job) return err('No such job.');
    if (isSenior(job) && st.rank < 2) return err('Senior role: needs rank 2.', 403);
    if (st.save.questId && st.save.questAt && !mine) { /* another job type in progress: starting a shift replaces it */ }
    if (mine?.job && mine.task) return err('You are already on a shift. Finish it first.', 409);
    const task = tasks[Math.floor(Math.random() * tasks.length)], secs = shiftMins(job, task) * 60;
    await prisma.save.update({ where: { userId: u.id }, data: { questId: `shift:${biz.id}:${idx}:${task.id}`, questAt: new Date(), insideAt: new Date() } });
    return NextResponse.json({ ok: true, secs, mins: secs / 60, task: task.label, label: job.title });
  }
  // finish
  const s = st.save; if (!mine?.job || !mine.task || !s.questAt) return err('Start a shift first.');
  const mins = shiftMins(mine.job, mine.task), secs = mins * 60;
  if (Date.now() - s.questAt.getTime() < secs * 1000 - 5000) return err('Shift not over yet. No pay.', 429);
  const pay = shiftPayFor(mine.job.pay, mins), skill = SKILL_FOR[biz.type] || 'hustling';
  const r = await prisma.save.updateMany({ where: { userId: u.id, questId: s.questId, questAt: s.questAt }, data: { questId: null, questAt: null, cash: { increment: pay }, profile: addSkillXp(st.profile, skill, 8 + Math.round(mins / 10)) } });
  if (!r.count) return err('Already paid.', 409);
  await prisma.transaction.create({ data: { userId: u.id, type: 'EARN', amount: pay, description: `shift:${biz.name}:${mine.job.title}:${mine.task.id}` } });
  const fame = await awardFame(u.id, FAME_SHIFT);
  const n = await loadState(u.id);
  return NextResponse.json({ ok: true, fame, pay, cash: n!.save.cash, profile: n!.profile });
}
