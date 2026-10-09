import { NextResponse } from 'next/server';
import { creditPayment, paystackConfigured, validSignature } from '../../../../lib/paystack';
export const dynamic = 'force-dynamic';
/* Paystack -> us. Set this URL in Paystack Dashboard > Settings > API Keys & Webhooks:  https://YOUR-DOMAIN/api/wallet/webhook
   It credits the wallet even if the player closes the browser before returning to the game. */
export async function POST(req: Request) {
  if (!paystackConfigured()) return NextResponse.json({ ok: false }, { status: 503 });
  const raw = await req.text();                                   // the signature is over the exact raw bytes
  if (!validSignature(raw, req.headers.get('x-paystack-signature'))) return NextResponse.json({ ok: false }, { status: 401 });
  let ev: { event?: string; data?: { reference?: string } } = {};
  try { ev = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); }
  if (ev.event === 'charge.success' && ev.data?.reference) {
    const r = await creditPayment(String(ev.data.reference));
    if (r.state === 'error') return NextResponse.json({ ok: false }, { status: 500 });  // let Paystack retry
  }
  return NextResponse.json({ ok: true });
}
