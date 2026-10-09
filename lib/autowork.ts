import { prisma } from './prisma';
import { CITY } from './cityData';
import { worldMinute } from './worldClock';
import { businessStatus } from './businessHours';
import { addSkillXp, loadState } from './game';
import { SKILL_FOR, shiftPayFor } from './interiors';
import { isSenior, shiftJobs, shiftMins, tasksFor } from './work';

/* Offline work: while the game is closed, a character with free will on keeps doing shifts at their workplace.
 * Settled lazily when the player comes back (the heartbeat gap is the time away), so it needs no cron and cannot be farmed by double-claiming.
 * Tweak the numbers here. */
export const AWAY_AFTER_MS = 3 * 60_000;      // heartbeat gap that counts as "away"
const MAX_AWAY_MS = 8 * 3600_000;             // offline credit is capped at 8 h
const MAX_SHIFTS = 12;                        // ...and 12 shifts per absence
const TRAVEL_MS = 3 * 60_000;                 // walking to work / between shifts
const REST_EVERY = 3, REST_MS = 25 * 60_000;  // after 3 shifts the character goes home to eat / sleep
const OFFLINE_PAY = 0.6;                      // offline shifts pay 60% of a shift you play yourself
const SHIFT_RE = /^shift:([^:]+):(\d+):([a-z0-9]+)$/;
const TITLES = ['Trainee', 'Junior', 'Senior', 'Lead', 'Manager', 'Director', 'Executive'];

export type AwayReport = { shifts: number; earned: number; mins: number; where: string };

export async function settleAway(userId: string): Promise<AwayReport | null> {
  const save = await prisma.save.findUnique({ where: { userId } });
  if (!save) return null;
  const now = Date.now(), seen = save.seenAt;
  // claim this absence atomically: a second tab / request that read the same seenAt gets count 0 and does nothing
  const claim = await prisma.save.updateMany({ where: { userId, seenAt: seen }, data: { seenAt: new Date(now) } });
  if (!claim.count || !seen || now - seen.getTime() < AWAY_AFTER_MS) return null;
  if (!save.freeWill || !save.workBiz || save.workJob == null) return null;
  const st = await loadState(userId); if (!st || st.jailLeft) return null;
  const biz = CITY.businesses.find(b => b.id === save.workBiz); if (!biz) return null;
  const jobs = shiftJobs(biz), job = jobs[save.workJob]; if (!job) return null;
  if (isSenior(job) && st.rank < 2) return null;

  let t = Math.max(seen.getTime(), now - MAX_AWAY_MS), shifts = 0, earned = 0, mins = 0, clearShift = false;
  const tasks = tasksFor(biz.type, job.title);

  // a shift that was running when the browser closed finishes on the server clock, at full pay
  const cur = SHIFT_RE.exec(save.questId || '');
  if (cur && save.questAt) {
    const cb = CITY.businesses.find(b => b.id === cur[1]), cj = cb && shiftJobs(cb)[+cur[2]], ct = cb && cj && tasksFor(cb.type, cj.title).find(x => x.id === cur[3]);
    if (cb && cj && ct) {
      const m = shiftMins(cj, ct), end = save.questAt.getTime() + m * 60_000;
      if (end > now) return null; // still running on the server clock: nothing to add yet
      earned += shiftPayFor(cj.pay, m); mins += m; shifts++; clearShift = true; t = Math.max(t, end);
    } else clearShift = true;
  }

  // then back-to-back shifts for the rest of the time away, only while the building is open
  for (let guard = 0; guard < 400 && shifts < MAX_SHIFTS; guard++) {
    const task = tasks[Math.floor(Math.random() * tasks.length)], m = shiftMins(job, task), dur = m * 60_000, start = t + TRAVEL_MS;
    if (start + dur > now) break;
    if (!businessStatus(biz.type, worldMinute(start)).open || !businessStatus(biz.type, worldMinute(start + dur)).open) { t += 5 * 60_000; continue; }
    earned += Math.round(shiftPayFor(job.pay, m) * OFFLINE_PAY); mins += m; shifts++;
    t = start + dur + (shifts % REST_EVERY === 0 ? REST_MS : 0);
  }
  if (!shifts) { if (clearShift) await prisma.save.update({ where: { userId }, data: { questId: null, questAt: null, inside: null, insideAt: null } }); return null; }

  const skill = SKILL_FOR[biz.type] || 'hustling';
  await prisma.save.update({ where: { userId }, data: { cash: { increment: earned }, questId: null, questAt: null, inside: null, insideAt: null, profile: addSkillXp(st.profile, skill, Math.round(shifts * (8 + mins / shifts / 10))) } });
  await prisma.transaction.create({ data: { userId, type: 'EARN', amount: earned, description: `autowork:${biz.name}:${job.title}:${shifts}` } });
  const prof = st.profile.profession, cp = await prisma.careerProgress.findUnique({ where: { userId_profession: { userId, profession: prof } } });
  const xp = (cp?.xp || 0) + shifts * (8 + Math.round(mins / shifts / 5)), rank = Math.min(7, 1 + Math.floor(xp / 250));
  await prisma.careerProgress.upsert({ where: { userId_profession: { userId, profession: prof } }, update: { xp, rank, title: TITLES[rank - 1], completed: { increment: shifts }, salaryBonus: (rank - 1) * 2500 }, create: { userId, profession: prof, title: TITLES[rank - 1], rank, xp, completed: shifts, salaryBonus: (rank - 1) * 2500 } });
  return { shifts, earned, mins, where: biz.name };
}
