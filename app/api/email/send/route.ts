import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { currentUser, err, publicUser } from '../../../../lib/auth';
import { issueCode } from '../../../../lib/verification';

// Body {email?}: sets/changes the email (resets verification), then sends a code.
export async function POST(req: Request) {
  let user = await currentUser();
  if (!user) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({}));
  const email = String(b.email || '').trim().toLowerCase();
  if (email && email !== user.email) {
    if (!/^\S+@\S+\.\S+$/.test(email)) return err('That email looks invalid.');
    try { user = await prisma.user.update({ where: { id: user.id }, data: { email, emailVerifiedAt: null } }); }
    catch { return err('That email is already in use.', 409); }
  }
  const problem = await issueCode(user);
  return problem ? err(problem, 429) : NextResponse.json({ ok: true, user: publicUser(user) });
}
