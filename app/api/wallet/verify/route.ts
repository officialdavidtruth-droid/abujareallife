import { NextResponse } from 'next/server';
import { currentUser, err } from '../../../../lib/auth';
import { creditPayment } from '../../../../lib/paystack';
export const dynamic = 'force-dynamic';
/* Called when the player comes back from Paystack. It never trusts the browser: it asks Paystack, and crediting is idempotent. */
export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({})), ref = String(b.reference || '').trim();
  const r = await creditPayment(ref);
  if ('userId' in r && r.userId !== u.id) return err('That payment belongs to another account.', 403);
  if (r.state === 'credited' || r.state === 'already') return NextResponse.json({ ok: true, state: r.state, coins: r.coins, naira: r.naira, cash: r.cash });
  return NextResponse.json({ ok: false, state: r.state, error: r.message }, { status: r.state === 'error' ? 502 : 200 });
}
