import { NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../../../../lib/prisma';
import { authConfigured, err, publicUser, serverError, startSession, throttled } from '../../../../lib/auth';
import { issueCode } from '../../../../lib/verification';
import { NEPO_CHANCE, type Origin } from '../../../../lib/profile';
export const dynamic = 'force-dynamic';

// Creates the account, spins the origin wheel once (LAPO / NEPO, stored on the account) and signs the player in.
export async function POST(req: Request) {
  try {
    if (!authConfigured()) return err('Server is missing AUTH_SECRET (32+ characters).', 500);
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
    if (throttled('signup:' + ip, 10, 10 * 60_000)) return err('Too many attempts. Try again later.', 429);
    const b = await req.json().catch(() => ({}));
    const username = String(b.username || '').trim(), password = String(b.password || ''), email = String(b.email || '').trim().toLowerCase();
    const dobText = String(b.dateOfBirth || ''), acceptedAdultContent = b.acceptAdultContent === true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dobText)) return err('Enter your date of birth to confirm you are 18 or older.');
    const dob = new Date(`${dobText}T00:00:00.000Z`), now = new Date();
    if (Number.isNaN(dob.getTime()) || dob.toISOString().slice(0, 10) !== dobText || dob > now) return err('Enter a valid date of birth.');
    const adultCutoff = new Date(Date.UTC(now.getUTCFullYear() - 18, now.getUTCMonth(), now.getUTCDate()));
    if (dob > adultCutoff) return err('Abuja Real Life includes mature themes and is restricted to players aged 18 and older.');
    if (!acceptedAdultContent) return err('Please confirm that you understand this game contains mature fictional themes.');
    if (!/^[A-Za-z0-9_]{3,18}$/.test(username)) return err('Username must be 3–18 letters, numbers or underscores.');
    if (password.length < 6 || password.length > 100) return err('Password must be at least 6 characters.');
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return err('That email looks invalid.');
    const usernameKey = username.toLowerCase();
    if (await prisma.user.findUnique({ where: { usernameKey } })) return err('That username is already taken. Please choose another name.', 409);
    if (email && await prisma.user.findUnique({ where: { email } })) return err('That email is already registered.', 409);
    const origin: Origin = randomInt(0, 1000) < NEPO_CHANCE * 1000 ? 'NEPO' : 'LAPO';
    let user;
    try { user = await prisma.user.create({ data: { username, usernameKey, passwordHash: await bcrypt.hash(password, 10), email: email || null, origin, dateOfBirth: dob, adultContentAcceptedAt: new Date() } }); }
    catch (e) { // two people signing up with the same name at the same moment: the database's unique key decides, the loser gets a friendly message
      if ((e as { code?: string })?.code === 'P2002') { const t = String((e as { meta?: { target?: unknown } })?.meta?.target || ''); return err(/email/i.test(t) ? 'That email is already registered.' : 'That username is already taken. Please choose another name.', 409); }
      throw e;
    }
    await startSession(user.id);
    let verifyEmail = false;
    if (email) { verifyEmail = true; await issueCode(user).catch(() => null); }
    return NextResponse.json({ ok: true, user: publicUser(user), origin, verifyEmail });
  } catch (e) { return serverError(e); }
}
