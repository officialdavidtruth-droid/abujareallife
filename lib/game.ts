import { prisma } from './prisma';
import { CITY } from './cityData';
import { DEFAULT_PROFILE, HEAT_DECAY_PER_MIN, rankFor, sanitizeProfile, skillLevel, type Profile, type SkillId } from './profile';

// Loads the save, cools heat over time, frees the player when jail time is up. Server is the only writer of money/heat/jail/skills.
export async function loadState(userId: string) {
  let s = await prisma.save.findUnique({ where: { userId } });
  if (!s) return null;
  const now = Date.now(), data: Record<string, unknown> = {};
  if (s.heat > 0 && s.heatAt) {
    const cooled = Math.max(0, s.heat - Math.floor((now - s.heatAt.getTime()) / 60_000) * HEAT_DECAY_PER_MIN);
    if (cooled !== s.heat) { data.heat = cooled; data.heatAt = new Date(now); }
  }
  if (s.jailUntil && s.jailUntil.getTime() <= now) { data.jailUntil = null; data.heat = 0; }
  if (Object.keys(data).length) s = await prisma.save.update({ where: { userId }, data });
  const profile = sanitizeProfile((s.profile as Partial<Profile>) || DEFAULT_PROFILE, (s.profile as Profile) || DEFAULT_PROFILE);
  const totalXp = Object.values(profile.skills).reduce((a, b) => a + b, 0);
  const jailLeft = s.jailUntil ? Math.max(0, Math.ceil((s.jailUntil.getTime() - now) / 1000)) : 0;
  return { save: s, profile, rank: rankFor(profile.profession, totalXp), jailLeft };
}
export const addSkillXp = (p: Profile, skill: SkillId, xp: number): Profile => ({ ...p, skills: { ...p.skills, [skill]: (p.skills[skill] || 0) + xp } });
export const lvl = (p: Profile, s: SkillId) => skillLevel(p.skills[s] || 0);
export const publicState = (st: NonNullable<Awaited<ReturnType<typeof loadState>>>) => ({
  cash: st.save.cash, heat: st.save.heat, wanted: st.save.heat >= 40, jailLeft: st.jailLeft, profile: st.profile, rank: st.rank,
});

// Which building the player is currently inside (server-tracked; expires after 30 min so a stale flag cannot be farmed from outside).
export function insideBiz(save: { inside: string | null; insideAt: Date | null }) {
  if (!save.inside || !save.insideAt || Date.now() - save.insideAt.getTime() > 30 * 60_000) return null;
  return CITY.businesses.find(b => b.id === save.inside) || null;
}
