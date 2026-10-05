import { createHash, randomInt } from 'crypto';
import { prisma } from './prisma';

export const hashCode = (c: string) => createHash('sha256').update(c + (process.env.AUTH_SECRET || '')).digest('hex');

async function sendMail(to: string, code: string) {
  const key = process.env.RESEND_API_KEY, from = process.env.MAIL_FROM;
  if (!key || !from) { console.log(`[DEV – no email provider configured] code for ${to}: ${code}`); return true; }
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject: 'Your Abuja Real Life code', text: `Your verification code is ${code}. It expires in 10 minutes.` }) });
  return r.ok;
}

export async function issueCode(user: { id: string; email: string | null }): Promise<string | null> {
  if (!user.email) return 'Add an email first.';
  const last = await prisma.emailCode.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
  if (last && Date.now() - last.createdAt.getTime() < 60_000) return 'Please wait a minute before requesting another code.';
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await prisma.emailCode.deleteMany({ where: { userId: user.id } });
  await prisma.emailCode.create({ data: { userId: user.id, codeHash: hashCode(code), expiresAt: new Date(Date.now() + 10 * 60_000) } });
  return (await sendMail(user.email, code)) ? null : 'Could not send the email. Try again later.';
}
