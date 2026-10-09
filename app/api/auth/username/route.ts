import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { err, serverError, throttled } from '../../../../lib/auth';
export const dynamic = 'force-dynamic';

// Sign-up screen: "is this name free?" Names are unique regardless of upper / lower case ("Ada" and "ada" are the same name).
export async function GET(req: Request) {
  try {
    if (throttled('uname:' + (req.headers.get('x-forwarded-for') || 'ip'), 60, 60_000)) return err('Too many checks. Slow down.', 429);
    const name = String(new URL(req.url).searchParams.get('name') || '').trim();
    if (!/^[A-Za-z0-9_]{3,18}$/.test(name)) return NextResponse.json({ valid: false, available: false });
    const hit = await prisma.user.findUnique({ where: { usernameKey: name.toLowerCase() }, select: { id: true } });
    return NextResponse.json({ valid: true, available: !hit });
  } catch (e) { return serverError(e); }
}
