import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { currentUser, err, throttled } from '../../../../lib/auth';
import { initializeCharge, paystackConfigured } from '../../../../lib/paystack';
import { topUpById } from '../../../../lib/wallet';
export const dynamic = 'force-dynamic';
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  if (!paystackConfigured()) return err('Payments are not set up yet.', 503);
  if (throttled('wallet:' + u.id, 8, 10 * 60_000)) return err('Too many attempts. Wait a few minutes.', 429);
  const b = await req.json().catch(() => ({}));
  const pkg = topUpById(b.package); if (!pkg) return err('Unknown package.');
  const email = (u.email || String(b.email || '')).trim().toLowerCase();
  if (!EMAIL.test(email)) return err('Enter a valid email address for your payment receipt.');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '', proto = req.headers.get('x-forwarded-proto') || 'https';
  const origin = (process.env.APP_URL || (host ? `${proto}://${host}` : '')).replace(/\/$/, '');
  if (!origin) return err('Server cannot work out its own address. Set APP_URL.', 500);
  const reference = `arl-${Date.now().toString(36)}-${randomBytes(8).toString('hex')}`;   // Paystack only allows letters, digits, - . =
  const r = await initializeCharge({ email, naira: pkg.naira, reference, callbackUrl: `${origin}/?wallet=1`, metadata: { userId: u.id, username: u.username, packageId: pkg.id } });
  if (!r.ok) return err(r.message || 'Could not start the payment.', 502);
  return NextResponse.json({ ok: true, url: r.url, reference });
}
