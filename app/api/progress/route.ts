import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, serverError } from '../../../lib/auth';
import { loadState } from '../../../lib/game';
import { SKILLS, skillLevel } from '../../../lib/profile';
import {
  ACHIEVEMENTS, DAILY_BONUS, KEY_INSIDER, STARTER, STARTER_BONUS, dailiesFor, dayKey, dayStart, keyAch, keyBonus, keyCheckin, keyDaily, keyStarter,
  prevDay, stepProgress, streakReward, STREAK_REWARDS, type Stats,
} from '../../../lib/goals';

/* Goals / daily missions / streak / achievements.
   The browser only displays this. Every number here is derived on the server from the transaction log and the save,
   and a claim is a hidden inventory row (quantity 0, unique per user+key), so it can never pay out twice. */
export const dynamic = 'force-dynamic';
class Stop extends Error {}

type Row = { type: string; amount: number; description: string };
const isEarn = (r: Row) => r.type === 'EARN';
const NOT_INCOME = ['goal:', 'starting', 'paystack', 'received', 'gift', 'helped-by:', 'ride-refund:', 'compensation:'];
const isIncome = (r: Row) => isEarn(r) && !NOT_INCOME.some(p => r.description.startsWith(p));
const isQuest = (r: Row) => isEarn(r) && r.description.startsWith('quest:');
const isShift = (r: Row) => isEarn(r) && (r.description.startsWith('shift:') || ['work', 'hustle', 'bizplan'].includes(r.description));
const isBuy = (r: Row) => r.type === 'SPEND' && /^(store|shop|mall):/.test(r.description);
const isMission = (r: Row) => isEarn(r) && r.description.startsWith('mission:');
const isHelp = (r: Row) => r.description.startsWith('help:');
const isRide = (r: Row) => r.type === 'SPEND' && r.description.endsWith(':city transport');

async function compute(userId: string) {
  const st = await loadState(userId); if (!st) return null;
  const now = Date.now(), day = dayKey(now), since = dayStart(now);
  const [todayRows, quests, shifts, buys, missions, helps, rides, sent, earnedAgg, markers] = await Promise.all([
    prisma.transaction.findMany({ where: { userId, createdAt: { gte: since } }, select: { type: true, amount: true, description: true }, take: 1500 }) as Promise<Row[]>,
    prisma.transaction.count({ where: { userId, type: 'EARN', description: { startsWith: 'quest:' } } }),
    prisma.transaction.count({ where: { userId, type: 'EARN', OR: [{ description: { startsWith: 'shift:' } }, { description: { in: ['work', 'hustle', 'bizplan'] } }] } }),
    prisma.transaction.count({ where: { userId, type: 'SPEND', OR: [{ description: { startsWith: 'store:' } }, { description: { startsWith: 'shop:' } }, { description: { startsWith: 'mall:' } }] } }),
    prisma.transaction.count({ where: { userId, type: 'EARN', description: { startsWith: 'mission:' } } }),
    prisma.transaction.count({ where: { userId, description: { startsWith: 'help:' } } }),
    prisma.transaction.count({ where: { userId, type: 'SPEND', description: { endsWith: ':city transport' } } }),
    prisma.transaction.count({ where: { userId, description: { startsWith: 'sent:' } } }),
    prisma.transaction.aggregate({ where: { userId, type: 'EARN', NOT: NOT_INCOME.map(p => ({ description: { startsWith: p } })) }, _sum: { amount: true } }),
    prisma.inventoryItem.findMany({ where: { userId, itemKey: { startsWith: 'goal_' } }, select: { itemKey: true }, take: 4000 }),
  ]);
  const claimed = new Set<string>(markers.map((m: { itemKey: string }) => m.itemKey));

  // login streak: consecutive game days with a check-in. It only breaks once a whole day is missed.
  const days = new Set<string>(markers.filter((m: { itemKey: string }) => m.itemKey.startsWith('goal_c_')).map((m: { itemKey: string }) => m.itemKey.slice(7)));
  let current = 0, cur = days.has(day) ? day : prevDay(day);
  while (days.has(cur) && current < 4000) { current++; cur = prevDay(cur); }
  let best = 0;
  for (const d of Array.from(days)) { if (days.has(prevDay(d))) continue; let n = 0, c = d; const next = (k: string) => new Date(Date.parse(k + 'T00:00:00Z') + 86_400_000).toISOString().slice(0, 10); while (days.has(c) && n < 4000) { n++; c = next(c); } if (n > best) best = n; }

  const stats: Stats = {
    cash: st.save.cash, fame: st.save.fame, hasCar: st.save.hasCar,
    skillLevel: Math.max(0, ...SKILLS.map(s => skillLevel(st.profile.skills[s.id] || 0))),
    earned: earnedAgg._sum.amount || 0, quests, shifts, buys, missions, helps, rides, sent,
    earnedToday: todayRows.filter(isIncome).reduce((a: number, r: Row) => a + r.amount, 0),
    questsToday: todayRows.filter(isQuest).length, shiftsToday: todayRows.filter(isShift).length, buysToday: todayRows.filter(isBuy).length,
    missionsToday: todayRows.filter(isMission).length, helpsToday: todayRows.filter(isHelp).length, ridesToday: todayRows.filter(isRide).length,
    bestStreak: best,
  };
  return { stats, claimed, day, streak: { current, claimedToday: claimed.has(keyCheckin(day)) } };
}
type Ctx = NonNullable<Awaited<ReturnType<typeof compute>>>;

function snapshot(c: Ctx) {
  const { stats, claimed, day } = c;
  const starter = STARTER.map(s => { const p = stepProgress(s, stats); return { id: s.id, e: s.e, title: s.title, how: s.how, reward: s.reward, have: p.have, need: p.need, done: p.done, claimed: claimed.has(keyStarter(s.id)) }; });
  const starterAll = starter.every(s => s.claimed);
  const dailies = dailiesFor(day).map(d => ({ id: d.id, e: d.e, title: d.title, reward: d.reward, have: Math.min(d.target, Number(stats[d.stat]) || 0), need: d.target, claimed: claimed.has(keyDaily(day, d.id)) }));
  const dailiesAll = dailies.every(d => d.claimed);
  const nextStreak = c.streak.claimedToday ? c.streak.current + 1 : (c.streak.current || 0) + 1;
  const achievements = ACHIEVEMENTS.map(a => { const have = Math.min(a.target, Number(stats[a.stat]) || 0); return { id: a.id, e: a.e, title: a.title, how: a.how, reward: a.reward, have, need: a.target, done: have >= a.target, claimed: claimed.has(keyAch(a.id)) }; });
  // what the guide chip should point at right now
  const ready = starter.find(s => s.done && !s.claimed);
  const open = starter.find(s => !s.done);
  const dReady = dailies.find(d => d.have >= d.need && !d.claimed);
  const next = ready ? { kind: 'starter', id: ready.id, e: ready.e, title: ready.title, ready: true }
    : !c.streak.claimedToday ? { kind: 'checkin', id: 'checkin', e: '🎁', title: 'Daily check-in reward', ready: true }
    : dReady ? { kind: 'daily', id: dReady.id, e: dReady.e, title: dReady.title, ready: true }
    : open ? { kind: 'starter', id: open.id, e: open.e, title: open.title, how: open.how, ready: false }
    : null;
  return {
    day, cash: stats.cash, next,
    starter, starterBonus: { ...STARTER_BONUS, ready: starter.every(s => s.claimed) && !claimed.has(KEY_INSIDER), claimed: claimed.has(KEY_INSIDER), locked: !starterAll },
    dailies, dailyBonus: { reward: DAILY_BONUS, claimed: claimed.has(keyBonus(day)), ready: dailiesAll && !claimed.has(keyBonus(day)) },
    streak: { current: c.streak.current, best: stats.bestStreak, claimedToday: c.streak.claimedToday, reward: streakReward(nextStreak), cycle: STREAK_REWARDS, day: ((nextStreak - 1) % STREAK_REWARDS.length) + 1 },
    achievements,
  };
}

export async function GET() {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    const c = await compute(u.id); if (!c) return err('Create your character first.', 409);
    return NextResponse.json(snapshot(c));
  } catch (e) { return serverError(e); }
}

export async function POST(req: Request) {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    const b = await req.json().catch(() => ({})), kind = String(b.kind || ''), id = String(b.id || '');
    const c = await compute(u.id); if (!c) return err('Create your character first.', 409);
    const { stats, claimed, day } = c;
    let key = '', reward = 0, label = '';
    if (kind === 'starter' && id === STARTER_BONUS.id) {
      if (!STARTER.every(s => claimed.has(keyStarter(s.id)))) return err('Finish every starter goal first.', 403);
      key = KEY_INSIDER; reward = STARTER_BONUS.reward; label = STARTER_BONUS.title;
    } else if (kind === 'starter') {
      const s = STARTER.find(x => x.id === id); if (!s) return err('Unknown goal.');
      if (!stepProgress(s, stats).done) return err('Not finished yet.', 403);
      key = keyStarter(s.id); reward = s.reward; label = s.title;
    } else if (kind === 'daily') {
      const d = dailiesFor(day).find(x => x.id === id); if (!d) return err('That mission is not active today.');
      if ((Number(stats[d.stat]) || 0) < d.target) return err('Not finished yet.', 403);
      key = keyDaily(day, d.id); reward = d.reward; label = d.title;
    } else if (kind === 'bonus') {
      if (!dailiesFor(day).every(d => claimed.has(keyDaily(day, d.id)))) return err('Claim all three daily missions first.', 403);
      key = keyBonus(day); reward = DAILY_BONUS; label = 'Daily bonus';
    } else if (kind === 'checkin') {
      const n = c.streak.current + 1; // today counts, so claiming makes the streak one longer
      key = keyCheckin(day); reward = streakReward(n); label = `Day ${n} streak`;
    } else if (kind === 'ach') {
      const a = ACHIEVEMENTS.find(x => x.id === id); if (!a) return err('Unknown achievement.');
      if ((Number(stats[a.stat]) || 0) < a.target) return err('Not reached yet.', 403);
      key = keyAch(a.id); reward = a.reward; label = a.title;
    } else return err('Unknown claim.');
    if (claimed.has(key)) return err('Already claimed.', 409);

    try {
      await prisma.$transaction(async tx => {
        try { await tx.inventoryItem.create({ data: { userId: u.id, itemKey: key, name: 'Goal claim', quantity: 0 } }); }
        catch (e) { if ((e as { code?: string })?.code === 'P2002') throw new Stop('Already claimed.'); throw e; }
        await tx.save.update({ where: { userId: u.id }, data: { cash: { increment: reward } } });
        await tx.transaction.create({ data: { userId: u.id, type: 'EARN', amount: reward, description: `goal:${kind}:${id || 'x'}` } });
      });
    } catch (e) { if (e instanceof Stop) return err(e.message, 409); throw e; }

    const n = await compute(u.id);
    return NextResponse.json({ ok: true, reward, label, cash: n ? n.stats.cash : undefined, ...(n ? { progress: snapshot(n) } : {}) });
  } catch (e) { return serverError(e); }
}
