import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from './prisma';
import { toKobo, topUpById } from './wallet';

const BASE = 'https://api.paystack.co';
export const paystackConfigured = () => !!process.env.PAYSTACK_SECRET_KEY;
const secret = () => { const s = process.env.PAYSTACK_SECRET_KEY; if (!s) throw new Error('PAYSTACK_SECRET_KEY is not set.'); return s; };

async function call(path: string, init?: RequestInit) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 15_000);
  try {
    const r = await fetch(BASE + path, { ...init, signal: ac.signal, headers: { authorization: `Bearer ${secret()}`, 'content-type': 'application/json', ...(init?.headers || {}) }, cache: 'no-store' });
    const j = await r.json().catch(() => null) as { status?: boolean; message?: string; data?: any } | null; // eslint-disable-line @typescript-eslint/no-explicit-any
    return { ok: r.ok && !!j?.status, message: j?.message || `Paystack error (${r.status})`, data: j?.data };
  } finally { clearTimeout(t); }
}

export async function initializeCharge(p: { email: string; naira: number; reference: string; callbackUrl: string; metadata: Record<string, unknown> }) {
  const r = await call('/transaction/initialize', { method: 'POST', body: JSON.stringify({ email: p.email, amount: toKobo(p.naira), currency: 'NGN', reference: p.reference, callback_url: p.callbackUrl, metadata: p.metadata, channels: ['card', 'bank', 'ussd', 'bank_transfer', 'mobile_money', 'qr'] }) });
  return r.ok && r.data?.authorization_url ? { ok: true as const, url: String(r.data.authorization_url) } : { ok: false as const, message: r.message };
}

/** Webhook authenticity: HMAC-SHA512 of the RAW body with your secret key, compared in constant time. */
export function validSignature(raw: string, header: string | null) {
  if (!header) return false;
  const mac = createHmac('sha512', secret()).update(raw).digest('hex');
  const a = Buffer.from(mac), b = Buffer.from(header.trim().toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

export type CreditResult =
  | { state: 'credited'; userId: string; coins: number; naira: number; cash: number }
  | { state: 'already'; userId: string; coins: number; naira: number; cash: number }
  | { state: 'pending' | 'failed' | 'invalid' | 'error'; message: string };

/** The ONE place money is credited. Both the browser return page and the webhook call it, so it must be idempotent:
    Paystack itself is asked for the truth (status, amount, currency, metadata); the credit amount comes from OUR package table;
    and the Transaction row's primary key is derived from the payment reference, so a second attempt hits a unique violation and credits nothing. */
export async function creditPayment(reference: string): Promise<CreditResult> {
  if (!/^[A-Za-z0-9.=-]{6,100}$/.test(reference)) return { state: 'invalid', message: 'Bad payment reference.' };
  let v;
  try { v = await call('/transaction/verify/' + encodeURIComponent(reference)); } catch { return { state: 'error', message: 'Could not reach Paystack. Try again in a moment.' }; }
  if (!v.ok || !v.data) return { state: 'error', message: v.message };
  const d = v.data, status = String(d.status);
  if (status === 'failed' || status === 'abandoned' || status === 'reversed') return { state: 'failed', message: 'The payment was not completed.' };
  if (status !== 'success') return { state: 'pending', message: 'Payment is still processing.' };
  const meta = (d.metadata && typeof d.metadata === 'object') ? d.metadata as Record<string, unknown> : {};
  const pkg = topUpById(meta.packageId), userId = typeof meta.userId === 'string' ? meta.userId : '';
  if (!pkg || !userId) { console.error('[wallet] paid reference without usable metadata', reference); return { state: 'invalid', message: 'Payment received but it could not be matched to a package. Contact support with reference ' + reference + '.' }; }
  if (d.currency !== 'NGN' || Number(d.amount) !== toKobo(pkg.naira)) { console.error('[wallet] amount mismatch', reference, d.amount, d.currency, pkg.id); return { state: 'invalid', message: 'The amount paid does not match the package. Contact support with reference ' + reference + '.' }; }
  try {
    await prisma.$transaction([
      prisma.transaction.create({ data: { id: 'paystack-' + reference, userId, type: 'TOPUP', amount: pkg.coins, description: `paystack:${pkg.id}:${reference}`, balanceType: 'CASH' } }),
      prisma.save.update({ where: { userId }, data: { cash: { increment: pkg.coins } } }),
    ]);
  } catch (e) {
    if ((e as { code?: string })?.code === 'P2002') {
      const s = await prisma.save.findUnique({ where: { userId }, select: { cash: true } });
      return { state: 'already', userId, coins: pkg.coins, naira: pkg.naira, cash: s?.cash ?? 0 };
    }
    console.error('[wallet] credit failed', reference, e); return { state: 'error', message: 'Payment received but crediting failed. It will be retried automatically; contact support if your balance does not update.' };
  }
  const s = await prisma.save.findUnique({ where: { userId }, select: { cash: true } });
  return { state: 'credited', userId, coins: pkg.coins, naira: pkg.naira, cash: s?.cash ?? 0 };
}
