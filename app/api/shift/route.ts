import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';
import { addSkillXp, awardFame, insideBiz, loadState } from '../../../lib/game';
import { FAME_SHIFT } from '../../../lib/profile';
import { SKILL_FOR, shiftPayFor } from '../../../lib/interiors';
import { isSenior, shiftJobs, shiftMins, tasksFor } from '../../../lib/work';
import { MAX_ROUNDS, MIN_ROUND_SECS, SCORE_KEY, bonusPct, gameFor } from '../../../lib/jobGames';

type Score = { at: number; pts: number; rounds: number; last: number };
// the mini-game score of the CURRENT shift (a row left over from an older shift has a different "at" and counts as nothing)
const readScore = async (userId: string, at: Date | null): Promise<Score> => {
  const row = await prisma.inventoryItem.findUnique({ where: { userId_itemKey: { userId, itemKey: SCORE_KEY } }, select: { metadata: true } });
  const m = (row?.metadata || {}) as Partial<Score>;
  return at && m.at === at.getTime() ? { at: m.at, pts: Number(m.pts) || 0, rounds: Number(m.rounds) || 0, last: Number(m.last) || at.getTime() } : { at: at ? at.getTime() : 0, pts: 0, rounds: 0, last: at ? at.getTime() : 0 };
};

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
  const cur = SHIFT.exec(st.save.questId || ''), mine = cur && cur[1] === biz.id ? { job: jobs[+cur[2]], task: tasksFor(biz.type, jobs[+cur[2]]?.title).find(t => t.id === cur[3]), idx: +cur[2] } : null; // the task list follows the job you are ON, not the one the client names

  if (b.action === 'status') { // lets the room restore your timer after a refresh
    if (!mine?.job || !mine.task || !st.save.questAt) return NextResponse.json({ ok: true, active: false });
    const secs = shiftMins(mine.job, mine.task) * 60, left = Math.max(0, Math.ceil((st.save.questAt.getTime() + secs * 1000 - Date.now()) / 1000));
    await prisma.save.update({ where: { userId: u.id }, data: { insideAt: new Date() } });
    const sc = await readScore(u.id, st.save.questAt);
    return NextResponse.json({ ok: true, active: true, idx: mine.idx, label: mine.job.title, task: mine.task.label, secs, left, game: gameFor(biz.type, mine.job.title), pts: sc.pts, rounds: sc.rounds, bonus: bonusPct(sc.pts) });
  }
  if (b.action === 'play') { // one finished mini-game round: 0-3 stars. Capped, rate-limited, and only counted while the shift is running.
    if (!mine?.job || !mine.task || !st.save.questAt) return err('Start a shift first.');
    if (!gameFor(biz.type, mine.job.title)) return err('This job has no mini-game.');
    const secs = shiftMins(mine.job, mine.task) * 60;
    if (Date.now() > st.save.questAt.getTime() + secs * 1000) return err('The shift is over.', 409);
    const stars = Math.max(0, Math.min(3, Math.floor(Number(b.stars) || 0))), sc = await readScore(u.id, st.save.questAt), now = Date.now();
    if (sc.rounds >= MAX_ROUNDS) return NextResponse.json({ ok: true, capped: true, pts: sc.pts, rounds: sc.rounds, bonus: bonusPct(sc.pts) });
    if (now - sc.last < MIN_ROUND_SECS * 1000) return err('Too fast. Take your time.', 429);
    const next: Score = { at: st.save.questAt.getTime(), pts: sc.pts + stars, rounds: sc.rounds + 1, last: now };
    await prisma.inventoryItem.upsert({ where: { userId_itemKey: { userId: u.id, itemKey: SCORE_KEY } }, update: { metadata: next, quantity: 0 }, create: { userId: u.id, itemKey: SCORE_KEY, name: 'Shift score', quantity: 0, metadata: next } });
    return NextResponse.json({ ok: true, pts: next.pts, rounds: next.rounds, bonus: bonusPct(next.pts), capped: next.rounds >= MAX_ROUNDS });
  }
  if (b.action === 'start') {
    const idx = Math.floor(Number(b.idx)), job = jobs[idx]; if (!job) return err('No such job.');
    if (isSenior(job) && st.rank < 2) return err('Senior role: needs rank 2.', 403);
    if (st.save.questId && st.save.questAt && !mine) { /* another job type in progress: starting a shift replaces it */ }
    if (mine?.job && mine.task) return err('You are already on a shift. Finish it first.', 409);
    const task = tasks[Math.floor(Math.random() * tasks.length)], secs = shiftMins(job, task) * 60;
    await prisma.save.update({ where: { userId: u.id }, data: { questId: `shift:${biz.id}:${idx}:${task.id}`, questAt: new Date(), insideAt: new Date(), workBiz: biz.id, workJob: idx } });
    return NextResponse.json({ ok: true, secs, mins: secs / 60, task: task.label, label: job.title });
  }
  // finish
  const s = st.save; if (!mine?.job || !mine.task || !s.questAt) return err('Start a shift first.');
  const mins = shiftMins(mine.job, mine.task), secs = mins * 60;
  if (Date.now() - s.questAt.getTime() < secs * 1000 - 5000) return err('Shift not over yet. No pay.', 429);
  const sc = gameFor(biz.type, mine.job.title) ? await readScore(u.id, s.questAt) : { pts: 0 }, bonus = bonusPct(sc.pts);
  const base = shiftPayFor(mine.job.pay, mins), pay = base + Math.round(base * bonus / 100), skill = SKILL_FOR[biz.type] || 'hustling';
  const r = await prisma.save.updateMany({ where: { userId: u.id, questId: s.questId, questAt: s.questAt }, data: { questId: null, questAt: null, cash: { increment: pay }, profile: addSkillXp(st.profile, skill, 8 + Math.round(mins / 10) + Math.min(24, sc.pts)) } });
  if (!r.count) return err('Already paid.', 409);
  await prisma.transaction.create({ data: { userId: u.id, type: 'EARN', amount: pay, description: `shift:${biz.name}:${mine.job.title}:${mine.task.id}` } });
  const cp = await prisma.careerProgress.findUnique({ where: { userId_profession: { userId: u.id, profession: st.profile.profession } } });
  const careerXp = 8 + Math.round(mins / 5), nextXp = (cp?.xp || 0) + careerXp, careerRank = Math.min(7, 1 + Math.floor(nextXp / 250));
  const careerTitles = ['Trainee','Junior','Senior','Lead','Manager','Director','Executive'];
  await prisma.careerProgress.upsert({ where: { userId_profession: { userId: u.id, profession: st.profile.profession } }, update: { xp: nextXp, rank: careerRank, title: careerTitles[careerRank-1], completed: { increment: 1 }, salaryBonus: (careerRank-1)*2500 }, create: { userId: u.id, profession: st.profile.profession, title: careerTitles[careerRank-1], rank: careerRank, xp: careerXp, completed: 1, salaryBonus: (careerRank-1)*2500 } });
  await prisma.reputation.upsert({ where: { userId: u.id }, update: { score: { increment: 1 }, trust: { increment: 1 }, social: { increment: 1 } }, create: { userId: u.id, score: 51, trust: 51, social: 51 } });
  const fame = await awardFame(u.id, FAME_SHIFT);
  const n = await loadState(u.id);
  return NextResponse.json({ ok: true, fame, pay, base, bonus, cash: n!.save.cash, profile: n!.profile });
}
