import { NextResponse } from 'next/server';
import { currentUser, err } from '../../../../lib/auth';
import { consumeTicket, verifyTicket } from '../../../../lib/shotTicket';
export const dynamic = 'force-dynamic';

/* The VICTIM's client calls this with the ticket it received over realtime. Only the intended target can redeem it,
   only once, and the damage comes from the server-signed ticket, never from the broadcast. */
export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({}));
  const t = typeof b.ticket === 'string' ? await verifyTicket(b.ticket) : null;
  if (!t) return NextResponse.json({ ok: false, reason: 'invalid' });
  if (t.targetId !== u.id) return NextResponse.json({ ok: false, reason: 'not-yours' });
  if (!consumeTicket(t.jti)) return NextResponse.json({ ok: false, reason: 'used' });
  return NextResponse.json({ ok: true, damage: t.damage, shooter: t.shooter, jti: t.jti, weapon: t.weapon });
}
