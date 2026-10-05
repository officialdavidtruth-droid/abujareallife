import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { currentUser, err, publicUser } from '../../../../lib/auth';
import { hashCode } from '../../../../lib/verification';

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return err('Not signed in.', 401);
  const code = String((await req.json().catch(() => ({}))).code || '').trim();
  const rec = await prisma.emailCode.findFirst({ where: { userId: user.id, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
  if (!rec || rec.attempts >= 5) return err('Code expired. Request a new one.', 400);
  if (rec.codeHash !== hashCode(code)) { await prisma.emailCode.update({ where: { id: rec.id }, data: { attempts: { increment: 1 } } }); return err('Wrong code.', 400); }
  const u = await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
  await prisma.emailCode.deleteMany({ where: { userId: user.id } });
  return NextResponse.json({ user: publicUser(u) });
}
