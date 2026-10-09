import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '../../../../lib/prisma';
import { authConfigured, err, publicUser, serverError, startSession, throttled } from '../../../../lib/auth';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    if (!authConfigured()) return err('Server is missing AUTH_SECRET (32+ characters).', 500);
    const b = await req.json().catch(() => ({}));
    const key = String(b.username || '').trim().toLowerCase(), password = String(b.password || '');
    if (!key || !password) return err('Enter your username and password.');
    if (throttled('login:' + key, 10, 10 * 60_000)) return err('Too many attempts. Try again in a few minutes.', 429);
    const user = await prisma.user.findUnique({ where: { usernameKey: key } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return err('Wrong username or password.', 401);
    await startSession(user.id);
    return NextResponse.json({ ok: true, user: publicUser(user) });
  } catch (e) { return serverError(e); }
}
