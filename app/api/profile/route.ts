import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';
import { loadState, publicState } from '../../../lib/game';
import { START_CASH, sanitizeProfile } from '../../../lib/profile';
export const dynamic = 'force-dynamic';
export async function GET() {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
  return NextResponse.json(publicState(st));
}
// Onboarding creates the save (₦1,000,000, all skills 0). Later edits change profession/focus/style/outfit/bio only.
export async function PUT(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({}));
  const st = await loadState(u.id);
  if (!st) {
    const profile = sanitizeProfile(b.profile, null);
    await prisma.save.create({ data: { userId: u.id, look: b.look || {}, state: { needs: {}, min: 480 }, profile, cash: START_CASH } });
    await prisma.transaction.create({ data: { userId: u.id, type: 'EARN', amount: START_CASH, description: 'starting money' } });
    return NextResponse.json({ ok: true, profile, cash: START_CASH });
  }
  if (st.jailLeft) return err('You cannot change your profile in jail.', 403);
  const want = sanitizeProfile(b.profile, st.profile);
  if (want.profession === 'police' && st.profile.profession !== 'police') want.profession = st.profile.profession; // police is chosen at sign-up only
  await prisma.save.update({ where: { userId: u.id }, data: { profile: want } });
  return NextResponse.json({ ok: true, profile: want });
}
