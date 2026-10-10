import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, serverError } from '../../../lib/auth';
import { insideBiz, loadState } from '../../../lib/game';
import { CITY } from '../../../lib/cityData';
import { MAX_SHIFT_MS, MAX_WAGE, MIN_WAGE, ROLES, maxStaff, onShiftNow, shiftPay } from '../../../lib/bizEconomy';

/* Players employ players (BIZJOBS.md).
   Owner:    offer (username + role + hourly wage) · setwage · fire
   Employee: respond (accept / decline) · clockin (must be inside the building) · clockout · quit · claim (wages the business could not pay yet)
   Wages come out of the business balance, never out of thin air: if the till is short, the rest is kept as "owed" and can be claimed later. */
export const dynamic = 'force-dynamic';
type Tx = Prisma.TransactionClient;
const bizName = (id: string) => CITY.businesses.find(b => b.id === id)?.name || 'a business';
const wageOk = (n: unknown) => { const w = Math.round(Number(n)); return Number.isFinite(w) && w >= MIN_WAGE && w <= MAX_WAGE ? w : 0; };

/** Pay `due` naira of wages from the business till to the worker. Returns what was really paid (never more than the till holds). */
async function payOut(tx: Tx, biz: { id: string; balance: number; name: string }, workerId: string, due: number) {
  let paid = Math.min(Math.max(0, due), Math.max(0, biz.balance));
  if (paid > 0) {
    const r = await tx.playerBusiness.updateMany({ where: { id: biz.id, balance: { gte: paid } }, data: { balance: { decrement: paid }, expenses: { increment: paid } } });
    if (!r.count) paid = 0; // the owner collected in the meantime
  }
  if (paid > 0) {
    await tx.save.update({ where: { userId: workerId }, data: { cash: { increment: paid } } });
    await tx.transaction.create({ data: { userId: workerId, type: 'EARN', amount: paid, description: `wage:${biz.name}` } });
  }
  return paid;
}
/** Close the current shift (if any), pay what is due plus anything owed, and either keep the row (ACTIVE / FORMER with debt) or delete it.
    The row is locked first with a compare-and-set, so two clicks at once can never pay the same shift or debt twice. */
async function settle(tx: Tx, empId: string, opts: { end?: boolean } = {}) {
  const emp = await tx.businessEmployee.findUnique({ where: { id: empId } }); if (!emp) return null;
  const lock = await tx.businessEmployee.updateMany({ where: { id: emp.id, owed: emp.owed, clockedInAt: emp.clockedInAt }, data: { owed: 0, clockedInAt: null, clockWage: 0 } });
  if (!lock.count) return { paid: 0, owed: emp.owed, shift: 0 };
  const biz = await tx.playerBusiness.findUnique({ where: { businessId: emp.businessId } });
  const shift = emp.clockedInAt && emp.status === 'ACTIVE' ? shiftPay(emp.clockedInAt, emp.clockWage) : 0;
  const total = emp.owed + shift, paid = biz ? await payOut(tx, biz, emp.userId, total) : 0, owed = total - paid;
  if (opts.end && owed <= 0) await tx.businessEmployee.delete({ where: { id: emp.id } });
  else await tx.businessEmployee.update({ where: { id: emp.id }, data: { owed, earned: { increment: paid }, ...(opts.end ? { status: 'FORMER' } : {}) } });
  return { paid, owed, shift };
}
const ownBiz = async (userId: string, businessId: unknown) => prisma.playerBusiness.findFirst({ where: { userId, businessId: String(businessId) } });
const note = (fromId: string, from: string, to: string, body: string) => prisma.message.create({ data: { fromId, fromName: from, toName: to, kind: 'text', body: body.slice(0, 300) } }).catch(() => null);

export async function GET() {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    const [mine, jobs] = await Promise.all([
      prisma.playerBusiness.findMany({ where: { userId: u.id }, select: { businessId: true, name: true, level: true, balance: true } }),
      prisma.businessEmployee.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' } }),
    ]);
    const staff = mine.length ? await prisma.businessEmployee.findMany({ where: { businessId: { in: mine.map(m => m.businessId) } }, orderBy: { createdAt: 'asc' } }) : [];
    const now = Date.now();
    return NextResponse.json({
      owner: mine.map(m => ({ businessId: m.businessId, name: m.name, balance: m.balance, capacity: maxStaff(m.level), staff: staff.filter(s => s.businessId === m.businessId).map(s => ({ id: s.id, username: s.username, role: s.role, wage: s.wage, status: s.status, onShift: onShiftNow(s.clockedInAt, now), owed: s.owed, earned: s.earned })) })),
      jobs: jobs.map(j => ({ id: j.id, businessId: j.businessId, business: bizName(j.businessId), role: j.role, wage: j.wage, status: j.status, onShift: onShiftNow(j.clockedInAt, now), shiftStart: j.clockedInAt?.getTime() || 0, due: j.clockedInAt && j.status === 'ACTIVE' ? shiftPay(j.clockedInAt, j.clockWage, now) : 0, owed: j.owed, earned: j.earned })),
    });
  } catch (e) { return serverError(e); }
}

export async function POST(req: Request) {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    const b = await req.json().catch(() => ({})), action = String(b.action || '');
    const st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
    if (st.jailLeft) return err('You are in jail.', 403);

    if (action === 'offer') {
      const biz = await ownBiz(u.id, b.businessId); if (!biz) return err('You do not own this business.', 403);
      const role = ROLES.includes(String(b.role) as (typeof ROLES)[number]) ? String(b.role) : 'cashier', wage = wageOk(b.wage);
      if (!wage) return err(`Wage must be between ₦${MIN_WAGE.toLocaleString()} and ₦${MAX_WAGE.toLocaleString()} per hour.`);
      const target = await prisma.user.findUnique({ where: { usernameKey: String(b.username || '').trim().toLowerCase() } });
      if (!target) return err('No player with that username.', 404);
      if (target.id === u.id) return err('You already run this business.');
      const [has, active] = await Promise.all([prisma.businessEmployee.findMany({ where: { businessId: biz.businessId, status: { in: ['OFFERED', 'ACTIVE'] } } }), prisma.businessEmployee.findFirst({ where: { userId: target.id, status: 'ACTIVE' } })]);
      const prev = has.find(h => h.userId === target.id);
      if (prev?.status === 'ACTIVE') return err(`${target.username} already works here.`, 409);
      if (active) return err(`${target.username} already has a job.`, 409);
      if (!prev && has.length >= maxStaff(biz.level)) return err(`This business can employ ${maxStaff(biz.level)} people at its level. Upgrade it for more room.`, 409);
      const row = await prisma.businessEmployee.upsert({ where: { businessId_userId: { businessId: biz.businessId, userId: target.id } }, create: { businessId: biz.businessId, userId: target.id, username: target.username, role, wage }, update: { role, wage, status: 'OFFERED', clockedInAt: null, clockWage: 0 } });
      await note(u.id, u.username, target.username, `💼 Job offer from ${biz.name}: ${role}, ₦${wage.toLocaleString()}/hour. Open Living Abuja → My jobs to accept.`);
      return NextResponse.json({ ok: true, employee: row.id });
    }

    if (action === 'respond') {
      const emp = await prisma.businessEmployee.findFirst({ where: { id: String(b.offerId), userId: u.id, status: 'OFFERED' } }); if (!emp) return err('That offer is gone.', 404);
      if (!b.accept) { await prisma.businessEmployee.delete({ where: { id: emp.id } }); return NextResponse.json({ ok: true }); }
      const biz = await prisma.playerBusiness.findUnique({ where: { businessId: emp.businessId } }); if (!biz) { await prisma.businessEmployee.delete({ where: { id: emp.id } }); return err('That business is no longer open.', 404); }
      if (await prisma.businessEmployee.findFirst({ where: { userId: u.id, status: 'ACTIVE' } })) return err('You already have a job. Quit it first.', 409);
      const r = await prisma.businessEmployee.updateMany({ where: { id: emp.id, status: 'OFFERED' }, data: { status: 'ACTIVE', hiredAt: new Date() } }); if (!r.count) return err('That offer is gone.', 404);
      const owner = await prisma.user.findUnique({ where: { id: biz.userId }, select: { username: true } });
      if (owner) await note(u.id, u.username, owner.username, `✅ ${u.username} accepted your offer at ${biz.name}.`);
      return NextResponse.json({ ok: true });
    }

    if (action === 'setwage' || action === 'fire') {
      const emp = await prisma.businessEmployee.findUnique({ where: { id: String(b.employeeId) } }); if (!emp) return err('Not found.', 404);
      const biz = await ownBiz(u.id, emp.businessId); if (!biz) return err('You do not own this business.', 403);
      if (action === 'setwage') {
        const wage = wageOk(b.wage); if (!wage) return err(`Wage must be between ₦${MIN_WAGE.toLocaleString()} and ₦${MAX_WAGE.toLocaleString()} per hour.`);
        await prisma.businessEmployee.update({ where: { id: emp.id }, data: { wage } }); // a shift already running keeps the wage it started with
        return NextResponse.json({ ok: true });
      }
      if (emp.status === 'OFFERED') { await prisma.businessEmployee.delete({ where: { id: emp.id } }); return NextResponse.json({ ok: true }); }
      const res = await prisma.$transaction(tx => settle(tx, emp.id, { end: true }));
      await note(u.id, u.username, emp.username, `You were let go from ${biz.name}.${res && res.owed > 0 ? ` The business still owes you ₦${res.owed.toLocaleString()} — claim it under My jobs.` : ''}`);
      return NextResponse.json({ ok: true, ...res });
    }

    if (action === 'quit' || action === 'clockout' || action === 'claim') {
      const emp = await prisma.businessEmployee.findFirst({ where: { id: String(b.employeeId), userId: u.id, status: action === 'claim' ? { in: ['ACTIVE', 'FORMER'] } : 'ACTIVE' } }); if (!emp) return err('Not found.', 404);
      if (action === 'clockout' && (emp.status !== 'ACTIVE' || !emp.clockedInAt)) return err('You are not on shift.', 409);
      if (action === 'claim' && emp.owed <= 0) return err('Nothing is owed to you.', 409);
      const res = await prisma.$transaction(tx => settle(tx, emp.id, action === 'quit' ? { end: true } : {}));
      return NextResponse.json({ ok: true, ...res });
    }

    if (action === 'clockin') {
      const emp = await prisma.businessEmployee.findFirst({ where: { userId: u.id, status: 'ACTIVE', ...(b.employeeId ? { id: String(b.employeeId) } : {}) } }); if (!emp) return err('You have no job to clock in to.', 404);
      const here = insideBiz(st.save); if (!here || here.id !== emp.businessId) return err(`Go inside ${bizName(emp.businessId)} to clock in.`, 403);
      if (onShiftNow(emp.clockedInAt)) return err('You are already on shift.', 409);
      if (emp.clockedInAt) await prisma.$transaction(tx => settle(tx, emp.id)); // an 8-hour-old forgotten shift is paid out first
      await prisma.businessEmployee.update({ where: { id: emp.id }, data: { clockedInAt: new Date(), clockWage: emp.wage } });
      return NextResponse.json({ ok: true, maxHours: MAX_SHIFT_MS / 3600_000 });
    }
    return err('Unknown action.');
  } catch (e) {
    return serverError(e);
  }
}
