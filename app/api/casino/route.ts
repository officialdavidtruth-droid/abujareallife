import { NextResponse } from 'next/server';
import { randomInt } from 'node:crypto';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';
import { loadState } from '../../../lib/game';
import { dayKey } from '../../../lib/goals';
import {
  BET_CHIPS, BLOCK_IF_TOPPED_UP, BREAK_MS, DICE_MAX, DICE_MIN, LIMIT_DEFAULT, LIMIT_MAX, LIMIT_MIN, MAX_BET, MAX_WIN, MIN_BET, RAISE_DELAY_MS, SYMBOLS,
  colorOf, diceChance, diceMult, rouletteMult, slotMult, type RoulettePick,
} from '../../../lib/casino';

/* Casino. In-game cash only. The server does the RNG, the money and every limit.
   State lives in one hidden inventory row "casino" (quantity 0): { day, net, wagered, rounds, limit, pend, breakUntil }.
   net/wagered/rounds are for the current game day; limit, pend and breakUntil persist. No migration needed. */
export const dynamic = 'force-dynamic';
const KEY = 'casino';
type Row = { day: string; net: number; wagered: number; rounds: number; limit: number; pend: { v: number; at: number } | null; breakUntil: number };

async function readRow(userId: string): Promise<Row> {
  const r = await prisma.inventoryItem.findUnique({ where: { userId_itemKey: { userId, itemKey: KEY } }, select: { metadata: true } });
  const m = ((r?.metadata as Partial<Row>) || {}), today = dayKey(), now = Date.now();
  let limit = Math.min(LIMIT_MAX, Math.max(LIMIT_MIN, Number(m.limit) || LIMIT_DEFAULT)), pend = m.pend && Number(m.pend.v) ? { v: Number(m.pend.v), at: Number(m.pend.at) || 0 } : null;
  if (pend && now >= pend.at) { limit = Math.min(LIMIT_MAX, Math.max(LIMIT_MIN, pend.v)); pend = null; } // a raise only counts after its delay
  const same = m.day === today;
  return { day: today, net: same ? Number(m.net) || 0 : 0, wagered: same ? Number(m.wagered) || 0 : 0, rounds: same ? Number(m.rounds) || 0 : 0, limit, pend, breakUntil: Number(m.breakUntil) || 0 };
}
const save = (userId: string, row: Row) => prisma.inventoryItem.upsert({ where: { userId_itemKey: { userId, itemKey: KEY } }, update: { metadata: row, quantity: 0 }, create: { userId, itemKey: KEY, name: 'Casino log', quantity: 0, metadata: row } });
const toppedUp = async (userId: string) => BLOCK_IF_TOPPED_UP && !!(await prisma.transaction.findFirst({ where: { userId, type: 'TOPUP', description: { startsWith: 'paystack:' } }, select: { id: true } }));
const view = (row: Row, cash: number) => {
  const now = Date.now(), left = Math.max(0, row.limit + row.net);
  return { cash, limit: row.limit, pendingLimit: row.pend ? { value: row.pend.v, inMs: Math.max(0, row.pend.at - now) } : null, net: row.net, wagered: row.wagered, rounds: row.rounds, room: left, breakLeftMs: Math.max(0, row.breakUntil - now), minBet: MIN_BET, maxBet: MAX_BET, chips: BET_CHIPS };
};
const closed = (row: Row) => row.breakUntil > Date.now() ? `You are on a break for another ${Math.ceil((row.breakUntil - Date.now()) / 3600_000)}h.` : row.limit + row.net <= 0 ? 'You hit your daily loss limit. The casino reopens for you tomorrow.' : null;

export async function GET() {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
  if (await toppedUp(u.id)) return NextResponse.json({ ok: true, blocked: 'The casino is closed to accounts that have bought game money with real money.' });
  const row = await readRow(u.id);
  return NextResponse.json({ ok: true, ...view(row, st.save.cash), closed: closed(row) });
}

export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({})), st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
  if (st.jailLeft) return err('You are in jail.', 403);
  if (await toppedUp(u.id)) return err('The casino is closed to accounts that have bought game money with real money.', 403);
  const row = await readRow(u.id), action = String(b.action || ''), now = Date.now();

  if (action === 'limit') { // lowering is instant, raising waits 24h
    const v = Math.round(Number(b.value)); if (!Number.isFinite(v) || v < LIMIT_MIN || v > LIMIT_MAX) return err('Pick a limit between the allowed minimum and maximum.');
    if (v < row.limit) { row.limit = v; row.pend = null; } else if (v > row.limit) row.pend = { v, at: now + RAISE_DELAY_MS }; else row.pend = null;
    await save(u.id, row); return NextResponse.json({ ok: true, ...view(row, st.save.cash), closed: closed(row) });
  }
  if (action === 'break') { row.breakUntil = Math.max(row.breakUntil, now + BREAK_MS); await save(u.id, row); return NextResponse.json({ ok: true, ...view(row, st.save.cash), closed: closed(row) }); }
  if (action !== 'play') return err('Unknown action.');

  const bet = Math.floor(Number(b.bet)), shut = closed(row); if (shut) return err(shut, 403);
  if (!Number.isFinite(bet) || bet < MIN_BET || bet > MAX_BET) return err('That bet is outside the table limits.');
  const room = row.limit + row.net; if (bet > room) return err(`Your daily loss limit only leaves room for a bet of up to ₦${Math.max(0, room).toLocaleString()}.`, 403);
  if (st.save.cash < bet) return err("You don't have enough cash for that bet.", 402);

  let mult = 0, outcome: Record<string, unknown> = {};
  const game = String(b.game || '');
  if (game === 'slots') {
    const bag = SYMBOLS.flatMap(x => Array(x.w).fill(x.s)), reels = [0, 1, 2].map(() => bag[randomInt(bag.length)] as string);
    mult = slotMult(reels); outcome = { reels };
  } else if (game === 'roulette') {
    const p = (b.pick || {}) as RoulettePick; if (!['red', 'black', 'even', 'odd', 'low', 'high', 'number'].includes(p.type)) return err('Pick a bet.');
    if (p.type === 'number' && !(Number.isInteger(p.n) && p.n! >= 0 && p.n! <= 36)) return err('Pick a number from 0 to 36.');
    const n = randomInt(37); mult = rouletteMult(p, n); outcome = { n, color: colorOf(n) };
  } else if (game === 'dice') {
    const t = Math.floor(Number(b.target)); if (!(t >= DICE_MIN && t <= DICE_MAX)) return err('Pick a target between the allowed limits.');
    const roll = randomInt(1, 101); mult = roll < t ? diceMult(t) : 0; outcome = { roll, target: t, chance: diceChance(t), mult: diceMult(t) };
  } else return err('Unknown game.');

  const payout = Math.min(MAX_WIN, Math.round(bet * mult)), delta = payout - bet;
  const ok = await prisma.$transaction(async tx => {
    const r = await tx.save.updateMany({ where: { userId: u.id, cash: { gte: bet } }, data: { cash: { increment: delta } } }); if (!r.count) return false;
    await tx.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -bet, description: `casino-bet:${game}` } });
    if (payout > 0) await tx.transaction.create({ data: { userId: u.id, type: 'EARN', amount: payout, description: `casino:${game}` } });
    return true;
  });
  if (!ok) return err("You don't have enough cash for that bet.", 402);
  row.net += delta; row.wagered += bet; row.rounds += 1; await save(u.id, row);
  const n = await loadState(u.id);
  return NextResponse.json({ ok: true, game, outcome, bet, payout, win: payout > 0, delta, ...view(row, n!.save.cash), closed: closed(row) });
}
