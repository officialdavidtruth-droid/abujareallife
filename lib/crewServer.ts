import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { CREW, LEGIT_PREFIXES, dayKey, dayStart, kindOf } from './crews';

/* Server-side crew logic shared by the /api/crew routes. Nothing here is callable from the browser directly. */
type Tx = Prisma.TransactionClient;
export const sys = (db: Tx | typeof prisma, crewId: string, body: string) => db.crewMessage.create({ data: { crewId, fromName: 'system', kind: 'sys', body: body.slice(0, CREW.chatMax) } });

export async function membership(userId: string) {
  const m = await prisma.crewMember.findUnique({ where: { userId }, include: { crew: true } });
  return m;
}

/* Points each user earned in [from, to): street money (uncaught crime loot) and honest work (shifts, quests, missions, races). Capped per member. */
export async function rawEarnings(userIds: string[], from: Date, to: Date) {
  const out = new Map<string, { crime: number; legit: number }>();
  if (!userIds.length) return out;
  const [crime, legit] = await Promise.all([
    prisma.crime.groupBy({ by: ['userId'], where: { userId: { in: userIds }, caught: false, loot: { gt: 0 }, createdAt: { gte: from, lt: to } }, _sum: { loot: true } }),
    prisma.transaction.groupBy({ by: ['userId'], where: { userId: { in: userIds }, type: 'EARN', amount: { gt: 0 }, createdAt: { gte: from, lt: to }, OR: LEGIT_PREFIXES.map(p => ({ description: { startsWith: p } })) }, _sum: { amount: true } }),
  ]);
  for (const r of crime) out.set(r.userId, { crime: r._sum.loot || 0, legit: 0 });
  for (const r of legit) { const c = out.get(r.userId) || { crime: 0, legit: 0 }; c.legit = r._sum.amount || 0; out.set(r.userId, c); }
  return out;
}
export function crewScore(kind: string, userIds: string[], raw: Map<string, { crime: number; legit: number }>) {
  const k = kindOf(kind); let total = 0; const by: Record<string, number> = {};
  for (const id of userIds) {
    const e = raw.get(id); if (!e) continue;
    const pts = Math.min(CREW.memberCap, Math.floor((e.crime * k.crime + e.legit * k.legit) / CREW.pointNaira));
    if (pts > 0) { by[id] = pts; total += pts; }
  }
  return { total, by };
}

/* Money moves. Each guards against overdraft and 32-bit overflow, and is meant to run inside a transaction. */
export async function takeCash(tx: Tx, userId: string, amt: number, why: string) {
  const r = await tx.save.updateMany({ where: { userId, cash: { gte: amt } }, data: { cash: { decrement: amt } } });
  if (!r.count) throw new Error('FUNDS');
  await tx.transaction.create({ data: { userId, type: 'SPEND', amount: -amt, description: why } });
}
export async function giveCash(tx: Tx, userId: string, amt: number, why: string) {
  if (amt <= 0) return;
  const r = await tx.save.updateMany({ where: { userId, cash: { lte: CREW.maxCash - amt } }, data: { cash: { increment: amt } } });
  if (r.count) await tx.transaction.create({ data: { userId, type: 'EARN', amount: amt, description: why } });
}
export async function takeTreasury(tx: Tx, crewId: string, amt: number) {
  const r = await tx.crew.updateMany({ where: { id: crewId, treasury: { gte: amt } }, data: { treasury: { decrement: amt } } });
  if (!r.count) throw new Error('TREASURY');
}
export const giveTreasury = (tx: Tx, crewId: string, amt: number) => tx.crew.updateMany({ where: { id: crewId, treasury: { lte: CREW.maxCash - amt } }, data: { treasury: { increment: amt } } });

/* Turf income: paid lazily whenever someone from the crew opens the panel. Half to the treasury, half split between members seen in the last 24 h. */
export async function payTurf(crewId: string) {
  const now = Date.now(), crew = await prisma.crew.findUnique({ where: { id: crewId }, include: { turf: true, members: true } }); if (!crew) return;
  const mult = crew.kind === 'company' ? 1.25 : 1;
  for (const t of crew.turf) {
    const el = now - t.lastPaidAt.getTime(); if (el < CREW.turfPayMinMs) continue;
    const income = Math.floor(Math.min(el, CREW.turfPayCapMs) / 3600_000 * CREW.turfHourly * mult);
    await prisma.$transaction(async tx => {
      const cas = await tx.crewTurf.updateMany({ where: { id: t.id, lastPaidAt: t.lastPaidAt }, data: { lastPaidAt: new Date(now) } }); if (!cas.count) return; // someone else already paid this out
      const seen = await tx.save.findMany({ where: { userId: { in: crew.members.map(m => m.userId) }, seenAt: { gt: new Date(now - CREW.activeMs) } }, select: { userId: true } });
      const half = Math.floor(income / 2), each = seen.length ? Math.floor(half / seen.length) : 0;
      await giveTreasury(tx, crewId, income - each * seen.length);
      for (const s of seen) await giveCash(tx, s.userId, each, `crew:turf:${t.district}`);
    }).catch(e => console.error('[crew] turf pay failed', e));
  }
}

/* Settles every event whose time is up (idempotent: the status flip and the payouts share one transaction), and makes sure today's cup exists. */
export async function settleDue() {
  const now = new Date();
  const due = await prisma.crewEvent.findMany({ where: { status: 'active', endsAt: { lte: now } }, take: 20 });
  for (const ev of due) { try { await (ev.kind === 'cup' ? settleCup(ev) : settleWar(ev)); } catch (e) { console.error('[crew] settle failed', ev.key, e); } }
  const key = 'cup:' + dayKey(), s = dayStart();
  if (!(await prisma.crewEvent.findUnique({ where: { key }, select: { id: true } }))) await prisma.crewEvent.create({ data: { key, kind: 'cup', startsAt: new Date(s), endsAt: new Date(s + 86400_000) } }).catch(() => {}); // a parallel request may win the race: fine
}

type Ev = Awaited<ReturnType<typeof prisma.crewEvent.findMany>>[number];
export async function cupStandings(ev: { startsAt: Date; endsAt: Date }, to: Date) {
  const crews = await prisma.crew.findMany({ include: { members: { where: { joinedAt: { lt: ev.startsAt } }, select: { userId: true } } } });
  const eligible = crews.filter(c => c.members.length >= 2); // a crew needs two members who were in it before the day began
  const raw = await rawEarnings(eligible.flatMap(c => c.members.map(m => m.userId)), ev.startsAt, to < ev.endsAt ? to : ev.endsAt);
  return eligible.map(c => ({ id: c.id, name: c.name, tag: c.tag, kind: c.kind, score: crewScore(c.kind, c.members.map(m => m.userId), raw).total })).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
async function settleCup(ev: Ev) {
  const table = await cupStandings(ev, ev.endsAt), placed = table.filter(r => r.score > 0).slice(0, 3);
  const live = new Set((await prisma.crew.findMany({ where: { id: { in: placed.map(p => p.id) } }, select: { id: true } })).map(c => c.id));
  await prisma.$transaction(async tx => {
    const flip = await tx.crewEvent.updateMany({ where: { id: ev.id, status: 'active' }, data: { status: 'done', result: { table: table.slice(0, 10), winners: placed.map(p => p.id) } } }); if (!flip.count) return;
    for (let i = 0; i < placed.length; i++) {
      await giveTreasury(tx, placed[i].id, CREW.cupPrizes[i]);
      await tx.crew.updateMany({ where: { id: placed[i].id }, data: { rating: { increment: CREW.cupRating[i] } } });
      if (live.has(placed[i].id)) await sys(tx, placed[i].id, `🏆 Crew Cup ${ev.key.slice(4)}: you finished #${i + 1} with ${placed[i].score} pts. ₦${CREW.cupPrizes[i].toLocaleString()} added to the treasury.`);
    }
  });
}
export async function warScores(ev: Ev, to: Date) {
  const d = (ev.data || {}) as { a?: string[]; b?: string[] };
  const [A, B] = await Promise.all([ev.attackerId ? prisma.crew.findUnique({ where: { id: ev.attackerId } }) : null, ev.defenderId ? prisma.crew.findUnique({ where: { id: ev.defenderId } }) : null]);
  const raw = await rawEarnings([...(d.a || []), ...(d.b || [])], ev.startsAt, to < ev.endsAt ? to : ev.endsAt);
  const a = crewScore(A?.kind || 'crew', d.a || [], raw).total, b = crewScore(B?.kind || 'crew', d.b || [], raw).total;
  return { a, b, defended: Math.floor(b * CREW.warDefenderBonus) };
}
async function settleWar(ev: Ev) {
  const live = new Set((await prisma.crew.findMany({ where: { id: { in: [ev.attackerId!, ev.defenderId!] } }, select: { id: true } })).map(c => c.id));
  const sc = await warScores(ev, ev.endsAt), won = sc.a >= CREW.warMinScore && sc.a > sc.defended, atk = ev.attackerId!, def = ev.defenderId!, dist = ev.district || '';
  await prisma.$transaction(async tx => {
    const flip = await tx.crewEvent.updateMany({ where: { id: ev.id, status: 'active' }, data: { status: 'done', result: { attackerScore: sc.a, defenderScore: sc.b, winner: won ? atk : def } } }); if (!flip.count) return;
    if (won && live.has(atk)) {
      const mv = await tx.crewTurf.updateMany({ where: { district: dist, crewId: def }, data: { crewId: atk, claimedAt: new Date(), lastPaidAt: new Date() } });
      if (!mv.count) return; // the defender no longer held it (disbanded): nothing to take
      await tx.crew.updateMany({ where: { id: atk }, data: { rating: { increment: CREW.warWinRating } } });
      const l = await tx.crew.findUnique({ where: { id: def }, select: { rating: true } });
      if (l) await tx.crew.updateMany({ where: { id: def }, data: { rating: Math.max(0, l.rating - CREW.warLoseRating) } });
    }
    if (live.has(atk)) await sys(tx, atk, won ? `⚔️ War for ${dist} WON ${sc.a} to ${sc.b}. The district is yours.` : `⚔️ War for ${dist} lost: ${sc.a} to ${sc.b} (home crew gets a ${Math.round((CREW.warDefenderBonus - 1) * 100)}% edge, and you need ${CREW.warMinScore}+ pts).`);
    if (live.has(def)) await sys(tx, def, won ? `⚔️ ${dist} was taken from you, ${sc.a} to ${sc.b}.` : `🛡️ You held ${dist}: ${sc.b} to ${sc.a}.`);
  });
}
