import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';
import { addSkillXp, lvl, loadState } from '../../../lib/game';
import { dayKey } from '../../../lib/goals';
import { vehicleByName, VEHICLE_CATALOG } from '../../../lib/vehicles';
import {
  DAILY_NET_CAP, DRIVING_XP, MAX_RACES_PER_DAY, MIN_CONDITION, MIN_FUEL, MIN_RACE_SECS, RACERS, RACE_COOLDOWN_SECS, TICKET_MAX_SECS, TIERS, TUNES, WEAR,
  carPerf, cleanInputs, cleanTune, raceTime, tierById, tuneKey, type Tune,
} from '../../../lib/racing';

/* Street racing. The server owns the money, the opponents, the result and the wear:
   start  = charge the entry fee, roll hidden opponent times, save a ticket (hidden inventory row "race_ticket")
   finish = the browser reports what you DID (reaction + 3 gear changes); the server turns that into your time, ranks you and pays
   tune   = buy a performance part (stored in a hidden inventory row "tune_<vehicleId>", no migration needed)
   Per-day count and net profit live in a hidden row "race_day". */
export const dynamic = 'force-dynamic';
const TICKET = 'race_ticket', DAYROW = 'race_day';
type Ticket = { vid: string; tier: string; at: number; ai: { name: string; car: string; time: number }[] };
type Day = { day: string; n: number; net: number; last: number };

const readRow = async <T,>(userId: string, itemKey: string): Promise<Partial<T>> => {
  const r = await prisma.inventoryItem.findUnique({ where: { userId_itemKey: { userId, itemKey } }, select: { metadata: true } });
  return ((r?.metadata as Partial<T>) || {});
};
const writeRow = (userId: string, itemKey: string, name: string, metadata: object) =>
  prisma.inventoryItem.upsert({ where: { userId_itemKey: { userId, itemKey } }, update: { metadata, quantity: 0 }, create: { userId, itemKey, name, quantity: 0, metadata } });
const readDay = async (userId: string): Promise<Day> => { const d = await readRow<Day>(userId, DAYROW), today = dayKey(); return d.day === today ? { day: today, n: Number(d.n) || 0, net: Number(d.net) || 0, last: Number(d.last) || 0 } : { day: today, n: 0, net: 0, last: Number(d.last) || 0 }; };
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / .75; // roughly -1..1, bell-shaped

async function garage(userId: string, profile: Parameters<typeof lvl>[0]) {
  const rows = await prisma.vehicle.findMany({ where: { userId }, orderBy: { purchasedAt: 'desc' } });
  const tunes = await prisma.inventoryItem.findMany({ where: { userId, itemKey: { startsWith: 'tune_' } }, select: { itemKey: true, metadata: true } });
  const byId = new Map<string, Tune>(tunes.map((t: { itemKey: string; metadata: unknown }): [string, Tune] => [t.itemKey.slice(5), cleanTune(t.metadata)]));
  const dl = lvl(profile, 'driving');
  return rows.map((v: (typeof rows)[number]) => { const tune = byId.get(v.id) || cleanTune(null), p = carPerf(v.name, tune); return { ...v, tune, perf: p, spec: vehicleByName(v.name), drivingLevel: dl }; });
}

export async function GET() {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
  const day = await readDay(u.id);
  return NextResponse.json({ ok: true, cash: st.save.cash, heat: st.save.heat, vehicles: await garage(u.id, st.profile), day: { n: day.n, max: MAX_RACES_PER_DAY, net: day.net, cap: DAILY_NET_CAP, cooldown: Math.max(0, Math.ceil((day.last + RACE_COOLDOWN_SECS * 1000 - Date.now()) / 1000)) }, tiers: TIERS, tunes: TUNES, catalog: VEHICLE_CATALOG.length });
}

export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({})), st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
  if (st.jailLeft) return err('You are in jail.', 403);
  const action = String(b.action || '');
  const veh = await prisma.vehicle.findFirst({ where: { userId: u.id, id: String(b.vehicleId || '') } });

  /* ───── buy a performance part ───── */
  if (action === 'tune') {
    if (!veh) return err('Vehicle not found.', 404);
    const part = TUNES.find(t => t.id === b.part); if (!part) return err('Unknown part.');
    const tune: Tune = cleanTune(await readRow(u.id, tuneKey(veh.id))), level = tune[part.id];
    if (level >= 3) return err('That part is already maxed out.', 409);
    const cost = part.costs[level];
    const next: Tune = { ...tune, [part.id]: level + 1 };
    const ok = await prisma.$transaction(async tx => {
      const r = await tx.save.updateMany({ where: { userId: u.id, cash: { gte: cost } }, data: { cash: { decrement: cost } } }); if (!r.count) return false;
      await tx.inventoryItem.upsert({ where: { userId_itemKey: { userId: u.id, itemKey: tuneKey(veh.id) } }, update: { metadata: next, quantity: 0 }, create: { userId: u.id, itemKey: tuneKey(veh.id), name: 'Car tuning', quantity: 0, metadata: next } });
      await tx.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -cost, description: `tune:${veh.name}:${part.id}:${level + 1}` } });
      return true;
    });
    if (!ok) return err(`You need ₦${cost.toLocaleString()}.`, 402);
    const n = await loadState(u.id);
    return NextResponse.json({ ok: true, cash: n!.save.cash, tune: next });
  }

  /* ───── enter a race ───── */
  if (action === 'start') {
    if (!veh) return err('Pick a car first.', 404);
    const tier = tierById(String(b.tier)); if (!tier) return err('Unknown race.');
    if (veh.stolen) return err('Nobody races a stolen car.', 403);
    if (veh.fuel < MIN_FUEL) return err(`Not enough fuel (need ${MIN_FUEL}%).`, 409);
    if (veh.condition < MIN_CONDITION) return err(`Car is too beaten up (need ${MIN_CONDITION}% condition). Repair it first.`, 409);
    const day = await readDay(u.id), now = Date.now();
    if (day.n >= MAX_RACES_PER_DAY) return err('The crews are done for tonight. Come back tomorrow.', 429);
    if (now - day.last < RACE_COOLDOWN_SECS * 1000) return err(`Cool down: ${Math.ceil((day.last + RACE_COOLDOWN_SECS * 1000 - now) / 1000)}s until the next race.`, 429);
    const old = await readRow<Ticket>(u.id, TICKET);
    if (old.at && now - old.at < TICKET_MAX_SECS * 1000) return err('You already have a race in progress.', 409);
    const paid = await prisma.$transaction(async tx => {
      const r = await tx.save.updateMany({ where: { userId: u.id, cash: { gte: tier.fee } }, data: { cash: { decrement: tier.fee } } }); if (!r.count) return false;
      await tx.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -tier.fee, description: `race-entry:${tier.id}` } });
      return true;
    });
    if (!paid) return err(`Entry fee is ₦${tier.fee.toLocaleString()}.`, 402);
    const names = [...RACERS].sort(() => Math.random() - .5).slice(0, 3);
    const ai = names.map(name => ({ name, car: `${VEHICLE_CATALOG[Math.floor(Math.random() * VEHICLE_CATALOG.length)].brand}`, time: Math.max(9.8, tier.ai + gauss() * tier.spread) }));
    const ticket: Ticket = { vid: veh.id, tier: tier.id, at: now, ai };
    await writeRow(u.id, TICKET, 'Race ticket', ticket);
    await writeRow(u.id, DAYROW, 'Race log', { ...day, last: now });
    const tune = cleanTune(await readRow(u.id, tuneKey(veh.id)));
    const n = await loadState(u.id);
    return NextResponse.json({ ok: true, cash: n!.save.cash, fee: tier.fee, rivals: ai.map(a => ({ name: a.name, car: a.car })), perf: carPerf(veh.name, tune) });
  }

  /* ───── cross the line ───── */
  if (action === 'finish') {
    const t = await readRow<Ticket>(u.id, TICKET);
    if (!t.at || !t.ai || !t.vid || !t.tier) return err('No race in progress.', 409);
    const tier = tierById(t.tier), car = await prisma.vehicle.findFirst({ where: { userId: u.id, id: t.vid } });
    await prisma.inventoryItem.deleteMany({ where: { userId: u.id, itemKey: TICKET } }); // a ticket pays at most once
    if (!tier || !car) return err('That race is gone.', 409);
    const el = (Date.now() - t.at) / 1000;
    if (el < MIN_RACE_SECS) return err('That was too fast to be a real race. Entry lost.', 429);
    const tune = cleanTune(await readRow(u.id, tuneKey(car.id))), inputs = cleanInputs(b);
    const mine = raceTime(carPerf(car.name, tune), lvl(st.profile, 'driving'), inputs);
    const place = 1 + t.ai.filter(a => a.time < mine).length, mult = tier.prize[place - 1] || 0;
    const day = await readDay(u.id);
    let prize = Math.round(tier.fee * mult), capped = false;
    const profit = prize - tier.fee;
    if (profit > 0) { const room = Math.max(0, DAILY_NET_CAP - day.net); if (profit > room) { prize = tier.fee + room; capped = true; } }
    const net = prize - tier.fee, won = place === 1;
    const fuel = Math.max(0, car.fuel - WEAR.fuel), condition = Math.max(0, car.condition - (place === 4 ? WEAR.lastPlaceCondition : WEAR.condition));
    const heat = Math.min(200, st.save.heat + tier.heat);
    await prisma.$transaction(async tx => {
      await tx.save.update({ where: { userId: u.id }, data: { ...(prize > 0 ? { cash: { increment: prize } } : {}), heat, heatAt: new Date(), profile: addSkillXp(st.profile, 'driving', DRIVING_XP.run + (won ? DRIVING_XP.win : 0)) } });
      if (prize > 0) await tx.transaction.create({ data: { userId: u.id, type: 'EARN', amount: prize, description: `race:${tier.id}:${place}` } });
      await tx.vehicle.update({ where: { id: car.id }, data: { fuel, condition, mileage: { increment: 1 } } });
    });
    await writeRow(u.id, DAYROW, 'Race log', { day: day.day, n: day.n + 1, net: day.net + net, last: Date.now() });
    const n = await loadState(u.id);
    const field = [{ name: 'You', time: mine, you: true }, ...t.ai.map(a => ({ name: a.name, time: a.time, you: false }))].sort((x, y) => x.time - y.time);
    return NextResponse.json({ ok: true, place, time: mine, field, prize, net, capped, heat: n!.save.heat, wanted: n!.save.heat >= 40, cash: n!.save.cash, car: { fuel, condition } });
  }
  return err('Unknown action.');
}
