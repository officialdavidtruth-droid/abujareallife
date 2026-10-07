import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';
import { fameTier, rankFor, sanitizeProfile, skillLevel, SKILLS, PROFESSIONS, type Profile } from '../../../lib/profile';
export const dynamic = 'force-dynamic';
// Public profile card: what other players may see about someone. No cash, no email, no inventory.
export async function GET(req: Request) {
  const me = await currentUser(); if (!me) return err('Not signed in.', 401);
  const name = (new URL(req.url).searchParams.get('name') || '').trim(); if (!name) return err('Name required.');
  const u = await prisma.user.findUnique({ where: { usernameKey: name.toLowerCase() } }); if (!u) return err('No such player.', 404);
  const s = await prisma.save.findUnique({ where: { userId: u.id } }); if (!s) return err('No such player.', 404);
  const profile: Profile = sanitizeProfile((s.profile as Partial<Profile>) || null, (s.profile as Profile) || null);
  const totalXp = Object.values(profile.skills).reduce((a, b) => a + b, 0);
  const [ahead, stalls, sales] = await Promise.all([
    prisma.save.count({ where: { fame: { gt: s.fame } } }),
    prisma.listing.count({ where: { sellerId: u.id, status: 'ACTIVE' } }),
    prisma.listing.aggregate({ where: { sellerId: u.id, soldQty: { gt: 0 } }, _sum: { soldQty: true } }),
  ]);
  const top = SKILLS.map(k => ({ id: k.id, label: k.label, e: k.e, lv: skillLevel(profile.skills[k.id]) })).sort((a, b) => b.lv - a.lv).slice(0, 3).filter(x => x.lv > 0);
  const prof = PROFESSIONS.find(p => p.id === profile.profession);
  return NextResponse.json({
    name: u.username, you: u.id === me.id, since: u.createdAt.getTime(), origin: s.origin, fame: s.fame, fameRank: ahead + 1, tier: fameTier(s.fame),
    rank: rankFor(profile.profession, totalXp), profession: prof ? { e: prof.e, label: prof.label } : null, style: profile.style, bio: profile.bio,
    relationship: profile.relationship, partner: profile.partner, top, stalls, itemsSold: sales._sum.soldQty || 0,
  });
}
