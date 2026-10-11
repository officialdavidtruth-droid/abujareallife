import { NextResponse } from 'next/server';
import { currentUser, endSession, revokeAllSessions, serverError } from '../../../../lib/auth';
export const dynamic = 'force-dynamic';
// POST {} signs out this device. POST { all: true } signs the account out of every device (every existing session token stops working).
export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({}));
    if (b?.all) { const u = await currentUser(); if (u) await revokeAllSessions(u.id); }
    await endSession();
    return NextResponse.json({ ok: true });
  } catch (e) { return serverError(e); }
}
