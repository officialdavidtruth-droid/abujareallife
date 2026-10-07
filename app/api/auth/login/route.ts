import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '../../../../lib/prisma';
import { authConfigured, err, publicUser, serverError, startSession, throttled } from '../../../../lib/auth';

const DUMMY = '$2b$11$CwTycUXWue0Thq9StjUM0uJ8.s1x1H1p1xXkq3sQY6xk1u5pYV3bK';
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const username = String(b.username || '').trim().toLowerCase(), password = String(b.password || '');
  if (throttled(`login:${req.headers.get('x-forwarded-for') || 'ip'}:${username}`)) return err('Too many attempts. Try again in a few minutes.', 429);
  if (!authConfigured()) return err('Server is missing AUTH_SECRET (32+ characters). Add it in Vercel / .env.local.', 500);
  try {
    const user = await prisma.user.findUnique({ where: { usernameKey: username } });
    const ok = await bcrypt.compare(password, user?.passwordHash || DUMMY);
    if (!user || !ok) return err('Wrong username or password.', 401);
    await startSession(user.id);
    return NextResponse.json({ user: publicUser(user) });
  } catch (e) { return serverError(e); }
}
