import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';
import { loadState, publicState } from '../../../lib/game';
import { randomInt } from 'crypto';
import { NEPO_CHANCE, sanitizeProfile, startCash, type Origin } from '../../../lib/profile';
export const dynamic = 'force-dynamic';
export async function GET() {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
  return NextResponse.json(publicState(st));
}
// Onboarding creates the save: starting money comes from the origin spun at sign-up (LAPO or NEPO); no car; all skills 0. Later edits change profession/focus/style/outfit/bio only.
export async function PUT(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({}));
  const st = await loadState(u.id);
  if (!st) {
    const profile = sanitizeProfile(b.profile, null);
    // The origin was spun at sign-up and lives on the account. Only accounts that pre-date the wheel get one assigned here, once.
    let origin: Origin = u.origin === 'NEPO' || u.origin === 'LAPO' ? u.origin : (randomInt(0, 1000) < NEPO_CHANCE * 1000 ? 'NEPO' : 'LAPO');
    if (u.origin !== origin) await prisma.user.update({ where: { id: u.id }, data: { origin } });
    const cash = startCash(origin);
    await prisma.save.create({ data: { userId: u.id, look: b.look || {}, state: { needs: {}, min: 480 }, profile, cash, origin, hasCar: false } });
    await prisma.transaction.create({ data: { userId: u.id, type: 'EARN', amount: cash, description: `starting money (${origin})` } });
    return NextResponse.json({ ok: true, profile, cash, origin });
  }
  if (st.jailLeft) return err('You cannot change your profile in jail.', 403);
  const want = sanitizeProfile(b.profile, st.profile);
  if (want.profession === 'police' && st.profile.profession !== 'police') want.profession = st.profile.profession; // police is chosen at sign-up only
  await prisma.save.update({ where: { userId: u.id }, data: { profile: want } });
  return NextResponse.json({ ok: true, profile: want });
}
