import { randomBytes } from 'crypto';
import { prisma } from './prisma';
import { initializeCharge, paystackCall } from './paystack';
import { toKobo } from './wallet';
import { HOLD_MINUTES, addDays, toDateOnly, ymdOf } from './adSlots';

export const AD_REF_PREFIX = 'adb-';   // wallet payments use 'arl-', so the webhook can tell them apart

type B = { id: string; slot: number; startDate: Date; days: number };
const endOf = (b: { startDate: Date; days: number }) => addDays(ymdOf(b.startDate), b.days);   // exclusive end day

/** Is any of these days already taken on this billboard? Paid / approved bookings block it, and so does an unpaid booking made in the last hour. */
export async function slotConflict(slot: number, startYmd: string, days: number, excludeId?: string) {
  const end = addDays(startYmd, days), since = new Date(Date.now() - HOLD_MINUTES * 60_000);
  const rows = await prisma.adBooking.findMany({
    where: { slot, id: excludeId ? { not: excludeId } : undefined, startDate: { lt: toDateOnly(end), gte: toDateOnly(addDays(startYmd, -60)) }, OR: [{ status: { in: ['IN_REVIEW', 'APPROVED'] } }, { status: 'PENDING_PAYMENT', createdAt: { gt: since } }] },
    select: { startDate: true, days: true },
  });
  return rows.some(r => ymdOf(r.startDate) < end && endOf(r) > startYmd);
}

export async function startPayment(b: { id: string; priceNaira: number }, email: string, origin: string) {
  const reference = `${AD_REF_PREFIX}${Date.now().toString(36)}-${randomBytes(8).toString('hex')}`;
  const r = await initializeCharge({ email, naira: b.priceNaira, reference, callbackUrl: `${origin}/adbooking?paid=${b.id}`, metadata: { kind: 'ad', bookingId: b.id } });
  if (!r.ok) return r;
  await prisma.adBooking.update({ where: { id: b.id }, data: { reference } });
  return { ok: true as const, url: r.url };
}

export async function refundPayment(reference: string) {
  try { const r = await paystackCall('/refund', { method: 'POST', body: JSON.stringify({ transaction: reference }) }); return r.ok ? '' : 'FAILED: ' + r.message; } catch { return 'FAILED: could not reach Paystack'; }
}

export type SettleResult = { state: 'paid' | 'already' | 'pending' | 'failed' | 'refunded' | 'invalid' | 'error'; message: string; bookingId?: string };

/** The ONE place a billboard payment is accepted. Called by the browser return page AND the Paystack webhook, so it is idempotent:
    Paystack is asked for the truth (status, amount, currency), the price comes from OUR booking row, and the status change is a single guarded update. */
export async function settleAdPayment(reference: string): Promise<SettleResult> {
  if (!/^[A-Za-z0-9.=-]{6,100}$/.test(reference)) return { state: 'invalid', message: 'Bad payment reference.' };
  const b = await prisma.adBooking.findUnique({ where: { reference } });
  if (!b) return { state: 'invalid', message: 'No booking matches this payment.' };
  if (b.status === 'IN_REVIEW' || b.status === 'APPROVED') return { state: 'already', message: 'Payment already received.', bookingId: b.id };
  if (b.status === 'REJECTED' && b.paidAt) return { state: 'refunded', message: b.note || 'This booking was not accepted and the payment is being refunded.', bookingId: b.id };
  let v; try { v = await paystackCall('/transaction/verify/' + encodeURIComponent(reference)); } catch { return { state: 'error', message: 'Could not reach Paystack. Try again in a moment.' }; }
  if (!v.ok || !v.data) return { state: 'error', message: v.message };
  const status = String(v.data.status);
  if (status === 'failed' || status === 'abandoned' || status === 'reversed') return { state: 'failed', message: 'The payment was not completed.', bookingId: b.id };
  if (status !== 'success') return { state: 'pending', message: 'Payment is still processing.', bookingId: b.id };
  if (v.data.currency !== 'NGN' || Number(v.data.amount) !== toKobo(b.priceNaira)) { console.error('[ads] amount mismatch', reference, v.data.amount); return { state: 'invalid', message: 'The amount paid does not match this booking. Contact support with reference ' + reference + '.', bookingId: b.id }; }
  // someone else may have taken these dates while this booking sat unpaid: then refund instead of double-selling the board
  if (await slotConflict(b.slot, ymdOf(b.startDate), b.days, b.id)) {
    const claimed = await prisma.adBooking.updateMany({ where: { id: b.id, status: { in: ['PENDING_PAYMENT', 'CANCELLED'] } }, data: { status: 'REJECTED', paidAt: new Date(), note: 'Sorry, these dates were taken by another advertiser while your payment was processing. Your money is being refunded.' } });
    if (claimed.count) { const refund = await refundPayment(reference); await prisma.adBooking.update({ where: { id: b.id }, data: { refund: refund || 'REQUESTED' } }); }
    return { state: 'refunded', message: 'These dates were taken by another advertiser. Your payment is being refunded.', bookingId: b.id };
  }
  const r = await prisma.adBooking.updateMany({ where: { id: b.id, status: { in: ['PENDING_PAYMENT', 'CANCELLED'] }, reference }, data: { status: 'IN_REVIEW', paidAt: new Date() } });
  return { state: r.count ? 'paid' : 'already', message: 'Payment received. Your ad is now waiting for review.', bookingId: b.id };
}
export type { B as AdBookingLite };
