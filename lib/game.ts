import { downState } from './downed';
import { prisma } from './prisma';
import { CITY } from './cityData';
import { decayIntox } from './intoxication';
import { DEFAULT_PROFILE, FAME_ACTIVE_SECS, FAME_DAILY_CAP, HEAT_DECAY_PER_MIN, fameTier, rankFor, sanitizeProfile, skillLevel, type Profile, type SkillId } from './profile';

// Loads the save, cools heat over time, frees the player when jail time is up. Server is the only writer of money/heat/jail/skills.
export async function loadState(userId: string) {
  let s = await prisma.save.findUnique({ where: { userId } });
  if (!s) return null;
  const now = Date.now(), data: Record<string, unknown> = {};
  if (s.heat > 0 && s.heatAt) {
    const cooled = Math.max(0, s.heat - Math.floor((now - s.heatAt.getTime()) / 60_000) * HEAT_DECAY_PER_MIN);
    if (cooled !== s.heat) { data.heat = cooled; data.heatAt = new Date(now); }
  }
  if ((s.drunk > 0 || s.high > 0) && s.intoxAt) {
    const d = decayIntox(s.drunk, s.high, now - s.intoxAt.getTime());
    if (d.drunk !== s.drunk || d.high !== s.high) { data.drunk = d.drunk; data.high = d.high; data.intoxAt = new Date(now); }
  }
  if (s.jailUntil && s.jailUntil.getTime() <= now) { data.jailUntil = null; data.heat = 0; }
  if (Object.keys(data).length) s = await prisma.save.update({ where: { userId }, data });
  const profile = sanitizeProfile((s.profile as Partial<Profile>) || DEFAULT_PROFILE, (s.profile as Profile) || DEFAULT_PROFILE);
  const totalXp = Object.values(profile.skills).reduce((a, b) => a + b, 0);
  const jailLeft = s.jailUntil ? Math.max(0, Math.ceil((s.jailUntil.getTime() - now) / 1000)) : 0;
  return { save: s, profile, rank: rankFor(profile.profession, totalXp), jailLeft };
}
const downPublic = (until: Date | null, kind: string | null) => { const d = downState(until); return { downLeft: Math.ceil(d.downLeft / 1000), safeLeft: Math.ceil(d.safeLeft / 1000), downKind: d.down ? (kind || 'ko') : '' }; };
export const addSkillXp = (p: Profile, skill: SkillId, xp: number): Profile => ({ ...p, skills: { ...p.skills, [skill]: (p.skills[skill] || 0) + xp } });
export const lvl = (p: Profile, s: SkillId) => skillLevel(p.skills[s] || 0);
export const publicState = (st: NonNullable<Awaited<ReturnType<typeof loadState>>>) => ({
  cash: st.save.cash, heat: st.save.heat, wanted: st.save.heat >= 40, jailLeft: st.jailLeft, profile: st.profile, rank: st.rank,
  drunk: st.save.drunk, high: st.save.high,
  ...downPublic(st.save.downUntil, st.save.downKind),
  origin: st.save.origin, hasCar: st.save.hasCar, fame: st.save.fame, tier: fameTier(st.save.fame),
});

const today = () => new Date().toISOString().slice(0, 10);
// Fame is server-owned. A daily cap stops farming. Returns how much fame was actually granted.
export async function awardFame(userId: string, amount: number) {
  const s = await prisma.save.findUnique({ where: { userId }, select: { fameDay: true, fameToday: true } });
  if (!s || amount <= 0) return 0;
  const day = today(), used = s.fameDay === day ? s.fameToday : 0;
  const give = Math.max(0, Math.min(amount, FAME_DAILY_CAP - used));
  if (!give) return 0;
  await prisma.save.update({ where: { userId }, data: { fame: { increment: give }, fameDay: day, fameToday: used + give } });
  return give;
}
// Called by the status poll (every ~5 s while the game is open): every 10 active minutes = +1 fame.
export async function tickActivity(userId: string, save: { fameAt: Date | null; fameCarry: number }) {
  const now = Date.now(), dt = save.fameAt ? now - save.fameAt.getTime() : Infinity;
  let carry = save.fameCarry + (dt <= 30_000 ? Math.round(dt / 1000) : 0); // gaps over 30 s (tab closed) do not count
  const pts = Math.floor(carry / FAME_ACTIVE_SECS); carry -= pts * FAME_ACTIVE_SECS;
  await prisma.save.update({ where: { userId }, data: { fameAt: new Date(now), fameCarry: carry } });
  if (pts > 0) await awardFame(userId, pts);
}

// Which building the player is currently inside (server-tracked; expires after 30 min so a stale flag cannot be farmed from outside).
export function insideBiz(save: { inside: string | null; insideAt: Date | null }) {
  if (!save.inside || !save.insideAt || Date.now() - save.insideAt.getTime() > 30 * 60_000) return null;
  return CITY.businesses.find(b => b.id === save.inside) || null;
}
