import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '../../../../lib/prisma';
import { err, serverError, throttledShared } from '../../../../lib/auth';
import { currentAdvertiser, endAdSession, isAdAdmin, publicAccount, startAdSession } from '../../../../lib/adAuth';
import { paystackConfigured } from '../../../../lib/paystack';
import { AD_COLORS, AD_IMG_MAX_BYTES, DURATIONS, HOLD_MINUTES, MAX_ADVANCE_DAYS, MIN_PAID_PER_DAY, addDays, checkAdText, isYmd, lagosToday, priceFor, slotOf, toDateOnly, ymdOf } from '../../../../lib/adSlots';
import { getSlots } from '../../../../lib/adPrices';
import { refundPayment, settleAdPayment, slotConflict, startPayment } from '../../../../lib/adPay';
export const dynamic = 'force-dynamic';

/* One route for the whole /adbooking dashboard:  GET slots | live | me | admin   ·   POST signup | login | logout | book | pay | verify | cancel | review | setprice */
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const ip = (req: Request) => (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
const origin = (req: Request) => { const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '', proto = req.headers.get('x-forwarded-proto') || 'https'; return (process.env.APP_URL || (host ? `${proto}://${host}` : '')).replace(/\/$/, ''); };
const view = (b: { id: string; slot: number; startDate: Date; days: number; title: string; sub: string; contact: string; website: string; color: string; priceNaira: number; status: string; paidAt: Date | null; refund: string; note: string; hasImage: boolean; createdAt: Date }) => ({
  id: b.id, slot: b.slot, slotName: slotOf(b.slot)?.name || 'Billboard', start: ymdOf(b.startDate), end: addDays(ymdOf(b.startDate), b.days - 1), days: b.days, title: b.title, sub: b.sub, contact: b.contact, website: b.website, color: b.color,
  price: b.priceNaira, img: b.hasImage ? '/api/ads/image/' + b.id : '', status: b.status, paidAt: b.paidAt, refund: b.refund, note: b.note, createdAt: b.createdAt,
  holdUntil: b.status === 'PENDING_PAYMENT' ? new Date(b.createdAt.getTime() + HOLD_MINUTES * 60_000) : null,
});

export async function GET(req: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  try {
    if (action === 'slots') {
      const today = lagosToday();
      const since = new Date(Date.now() - HOLD_MINUTES * 60_000);
      const rows = await prisma.adBooking.findMany({ where: { startDate: { gte: toDateOnly(addDays(today, -31)) }, OR: [{ status: { in: ['IN_REVIEW', 'APPROVED'] } }, { status: 'PENDING_PAYMENT', createdAt: { gt: since } }] }, select: { slot: true, startDate: true, days: true } });
      return NextResponse.json({ slots: await getSlots(), durations: DURATIONS, colors: AD_COLORS, today, maxAdvance: MAX_ADVANCE_DAYS, payments: paystackConfigured(), booked: rows.map(r => ({ slot: r.slot, start: ymdOf(r.startDate), end: addDays(ymdOf(r.startDate), r.days) })) });
    }
    if (action === 'live') { // read by the 3D city: only approved ads whose dates include today
      const today = lagosToday();
      const rows = await prisma.adBooking.findMany({ where: { status: 'APPROVED', startDate: { lte: toDateOnly(today), gte: toDateOnly(addDays(today, -31)) } }, orderBy: { startDate: 'desc' } });
      const seen = new Set<number>(), ads = [];
      for (const r of rows) { if (addDays(ymdOf(r.startDate), r.days) <= today || seen.has(r.slot)) continue; seen.add(r.slot); ads.push({ slot: r.slot, title: r.title, sub: r.sub, contact: r.contact, color: r.color, img: r.hasImage ? '/api/ads/image/' + r.id : '' }); }
      return NextResponse.json({ ads }, { headers: { 'cache-control': 'public, max-age=0, s-maxage=5' } });
    }
    const me = await currentAdvertiser();
    if (action === 'me') {
      if (!me) return NextResponse.json({ account: null });
      const rows = await prisma.adBooking.findMany({ where: { accountId: me.id }, orderBy: { createdAt: 'desc' }, take: 100 });
      return NextResponse.json({ account: publicAccount(me), bookings: rows.map(view) });
    }
    if (action === 'admin') {
      if (!me || !isAdAdmin(me.email)) return err('Not allowed.', 403);
      const rows = await prisma.adBooking.findMany({ where: { status: { not: 'PENDING_PAYMENT' } }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 200, include: { account: { select: { name: true, business: true, email: true, phone: true } } } });
      const sum = await prisma.adBooking.aggregate({ where: { status: { in: ['IN_REVIEW', 'APPROVED'] } }, _sum: { priceNaira: true } });
      return NextResponse.json({ bookings: rows.map(r => ({ ...view(r), account: r.account })), revenue: sum._sum.priceNaira || 0 });
    }
    return err('Not found.', 404);
  } catch (e) { return serverError(e); }
}

export async function POST(req: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  try {
    const b = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (action === 'signup') {
      if (await throttledShared('adsignup:' + ip(req), 6, 60 * 60_000)) return err('Too many attempts. Try again later.', 429);
      const email = String(b.email || '').trim().toLowerCase(), password = String(b.password || ''), name = String(b.name || '').trim().slice(0, 60), business = String(b.business || '').trim().slice(0, 80), phone = String(b.phone || '').trim().slice(0, 25);
      if (!EMAIL.test(email)) return err('Enter a valid email address.');
      if (password.length < 8 || password.length > 100) return err('Choose a password of at least 8 characters.');
      if (name.length < 2) return err('Enter your name.'); if (business.length < 2) return err('Enter your business name.');
      if (phone.replace(/\D/g, '').length < 7) return err('Enter a phone number we can reach you on.');
      if (await prisma.adAccount.findUnique({ where: { email } })) return err('That email already has an account. Log in instead.', 409);
      const a = await prisma.adAccount.create({ data: { email, name, business, phone, passwordHash: await bcrypt.hash(password, 12) } });
      await startAdSession(a.id, a.sessionVersion);
      return NextResponse.json({ ok: true, account: publicAccount(a) });
    }
    if (action === 'login') {
      const email = String(b.email || '').trim().toLowerCase();
      if (await throttledShared('adlogin:' + ip(req) + ':' + email, 8, 10 * 60_000)) return err('Too many attempts. Wait a few minutes.', 429);
      const a = await prisma.adAccount.findUnique({ where: { email } });
      if (!a || !(await bcrypt.compare(String(b.password || ''), a.passwordHash))) return err('Wrong email or password.', 401);
      await startAdSession(a.id, a.sessionVersion);
      return NextResponse.json({ ok: true, account: publicAccount(a) });
    }
    if (action === 'logout') { await endAdSession(); return NextResponse.json({ ok: true }); }

    const me = await currentAdvertiser(); if (!me) return err('Please log in first.', 401);

    if (action === 'book') {
      if (await throttledShared('adbook:' + me.id, 12, 60 * 60_000)) return err('Too many bookings. Try again later.', 429);
      const slots = await getSlots();
      const slot = slots.find(x => x.index === Number(b.slot)); if (!slot) return err('Choose a billboard.');
      const days = Number(b.days); if (!(DURATIONS as readonly number[]).includes(days)) return err('Choose how many days.');
      const start = b.startDate; if (!isYmd(start)) return err('Choose a start date.');
      const today = lagosToday(); if (start < today) return err('The start date cannot be in the past.'); if (start > addDays(today, MAX_ADVANCE_DAYS)) return err(`You can book up to ${MAX_ADVANCE_DAYS} days ahead.`);
      if (b.terms !== true) return err('Please accept the advertising rules.');
      const price = priceFor(slot, days), free = price <= 0;
      if (!free && !paystackConfigured()) return err('Payments are not switched on yet. Please try again soon.', 503);
      // flyer: the browser sends a JPEG already cut to the board's shape; we only check that it really is a JPEG and not huge
      let flyer: Buffer | null = null;
      if (typeof b.image === 'string' && b.image) {
        const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(b.image); if (!m) return err('The flyer must be a JPG, PNG or WebP picture.');
        flyer = Buffer.from(m[1], 'base64');
        if (flyer.length < 1000 || flyer[0] !== 0xff || flyer[1] !== 0xd8 || flyer[2] !== 0xff) return err('That flyer file looks damaged. Try another picture.');
        if (flyer.length > AD_IMG_MAX_BYTES) return err('The flyer is too big. Use a smaller picture.');
      }
      const t = checkAdText(b, !!flyer); if (!t.ok) return err(t.message);
      // the unpaid pile-up guard: at most 3 unpaid bookings per advertiser
      const open = await prisma.adBooking.count({ where: { accountId: me.id, status: 'PENDING_PAYMENT', createdAt: { gt: new Date(Date.now() - HOLD_MINUTES * 60_000) } } });
      if (open >= 3) return err('You have 3 unpaid bookings. Pay for them or cancel one first.');
      // free ads skip Paystack, so keep one account from flooding the review queue
      if (free && (await prisma.adBooking.count({ where: { accountId: me.id, status: 'IN_REVIEW', priceNaira: 0 } })) >= 3) return err('You already have 3 free ads waiting for review. Wait for a decision first.');
      if (await slotConflict(slot.index, start, days)) return err('Some of those dates are already booked on this billboard. Pick other dates or another billboard.', 409);
      const row = await prisma.adBooking.create({ data: {
        accountId: me.id, slot: slot.index, startDate: toDateOnly(start), days, ...t.v, priceNaira: price, hasImage: !!flyer,
        ...(free ? { status: 'IN_REVIEW', paidAt: new Date() } : {}),
        ...(flyer ? { image: { create: { mime: 'image/jpeg', data: new Uint8Array(flyer) } } } : {}),
      } });
      if (free) return NextResponse.json({ ok: true, free: true, id: row.id });
      const o = origin(req); if (!o) return err('Server cannot work out its own address. Set APP_URL.', 500);
      const r = await startPayment(row, me.email, o);
      if (!r.ok) { await prisma.adBooking.update({ where: { id: row.id }, data: { status: 'CANCELLED' } }); return err(r.message || 'Could not start the payment.', 502); }
      return NextResponse.json({ ok: true, url: r.url, id: row.id });
    }

    if (action === 'pay' || action === 'verify' || action === 'cancel') {
      const row = await prisma.adBooking.findUnique({ where: { id: String(b.id || '') } });
      if (!row || row.accountId !== me.id) return err('Booking not found.', 404);
      if (action === 'cancel') {
        const r = await prisma.adBooking.updateMany({ where: { id: row.id, status: 'PENDING_PAYMENT' }, data: { status: 'CANCELLED' } });
        return r.count ? NextResponse.json({ ok: true }) : err('Only unpaid bookings can be cancelled. Paid ads are reviewed; contact us for changes.');
      }
      if (action === 'verify') { // the page Paystack sends the advertiser back to
        if (!row.reference) return err('No payment was started for this booking.');
        const r = await settleAdPayment(row.reference); return NextResponse.json({ ok: r.state === 'paid' || r.state === 'already', ...r });
      }
      if (await throttledShared('adpay:' + me.id, 10, 60 * 60_000)) return err('Too many attempts. Try again later.', 429);
      if (row.status !== 'PENDING_PAYMENT') return err('This booking is not waiting for payment.');
      const fresh = new Date(row.createdAt.getTime() + HOLD_MINUTES * 60_000) > new Date();
      if (await slotConflict(row.slot, ymdOf(row.startDate), row.days, row.id)) return err('These dates were taken by someone else. Please make a new booking.', 409);
      if (!fresh) await prisma.adBooking.update({ where: { id: row.id }, data: { createdAt: new Date() } });   // restart the hold
      const r = await startPayment(row, me.email, origin(req));
      return r.ok ? NextResponse.json({ ok: true, url: r.url }) : err(r.message || 'Could not start the payment.', 502);
    }

    if (action === 'review') {
      if (!isAdAdmin(me.email)) return err('Not allowed.', 403);
      const row = await prisma.adBooking.findUnique({ where: { id: String(b.id || '') } }); if (!row) return err('Booking not found.', 404);
      const note = String(b.note || '').trim().slice(0, 300);
      if (b.decision === 'approve') {
        const r = await prisma.adBooking.updateMany({ where: { id: row.id, status: 'IN_REVIEW' }, data: { status: 'APPROVED', note: '' } });
        return r.count ? NextResponse.json({ ok: true }) : err('This booking is not waiting for review.');
      }
      if (b.decision === 'reject') {
        if (note.length < 3) return err('Write a short reason; the advertiser will see it.');
        const r = await prisma.adBooking.updateMany({ where: { id: row.id, status: { in: ['IN_REVIEW', 'APPROVED'] } }, data: { status: 'REJECTED', note } });
        if (!r.count) return err('This booking cannot be rejected.');
        if (row.priceNaira <= 0) return NextResponse.json({ ok: true, refund: 'NONE' });   // a free ad: nothing was paid
        const refund = row.reference ? await refundPayment(row.reference) : 'FAILED: no payment reference';
        await prisma.adBooking.update({ where: { id: row.id }, data: { refund: refund || 'REQUESTED' } });
        return NextResponse.json({ ok: true, refund: refund || 'REQUESTED' });
      }
      return err('Unknown decision.');
    }

    if (action === 'setprice') {   // admin: price per day of one billboard. 0 = free.
      if (!isAdAdmin(me.email)) return err('Not allowed.', 403);
      const slot = slotOf(b.slot); if (!slot) return err('Unknown billboard.');
      const perDay = Math.round(Number(b.perDay));
      if (!Number.isFinite(perDay) || perDay < 0 || perDay > 10_000_000) return err('Enter an amount from 0 (free) up to 10,000,000.');
      if (perDay > 0 && perDay < MIN_PAID_PER_DAY) return err(`A paid price must be at least ₦${MIN_PAID_PER_DAY} per day (or 0 for free), because Paystack will not take very small payments.`);
      await prisma.adSlotPrice.upsert({ where: { slot: slot.index }, create: { slot: slot.index, perDay }, update: { perDay } });
      return NextResponse.json({ ok: true, slot: slot.index, perDay });
    }
    return err('Not found.', 404);
  } catch (e) { return serverError(e); }
}
