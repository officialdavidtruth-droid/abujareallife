import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '../../../../lib/prisma';
import { authConfigured, err, publicUser, serverError, startSession, throttled } from '../../../../lib/auth';
import { issueCode } from '../../../../lib/verification';

export async function POST(req: Request) {
  if (throttled('signup:' + (req.headers.get('x-forwarded-for') || 'ip'), 10, 60 * 60_000)) return err('Too many sign-ups. Try again later.', 429);
  // Check config BEFORE creating the user so a missing secret never leaves an orphan account behind.
  if (!authConfigured()) return err('Server is missing AUTH_SECRET (32+ characters). Add it in Vercel / .env.local.', 500);
  const b = await req.json().catch(() => ({}));
  const username = String(b.username || '').trim(), password = String(b.password || ''), email = String(b.email || '').trim().toLowerCase();
  if (!/^[A-Za-z0-9_]{3,18}$/.test(username)) return err('Username must be 3–18 letters, numbers or underscores.');
  if (password.length < 8 || password.length > 72) return err('Password must be 8–72 characters.');
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return err('That email looks invalid.');
  try {
    const user = await prisma.user.create({ data: { username, usernameKey: username.toLowerCase(), passwordHash: await bcrypt.hash(password, 11), email: email || null } });
    await startSession(user.id);
    let mailError: string | null = null;
    if (email) { try { mailError = await issueCode(user); } catch (e) { console.error('[signup] email code failed:', e); mailError = 'Could not send the email. Try again later.'; } }
    return NextResponse.json({ user: publicUser(user), verifyEmail: !!email, mailError });
  } catch (e) {
    const x = e as { code?: string; meta?: { target?: string[] | string } };
    if (x.code === 'P2002') return err(String(x.meta?.target).includes('email') ? 'That email is already in use.' : 'That username is already taken.', 409);
    return serverError(e);
  }
}
