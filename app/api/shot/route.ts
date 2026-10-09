import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';
import { WEAPON_RULES } from '../../../lib/weapons';
import { signTicket } from '../../../lib/shotTicket';
import { ASSAULT_HEAT, OFFICER_HEAT } from '../../../lib/profile';
import { downState } from '../../../lib/downed';
import { recordShot } from '../../../lib/combatLog';
export const dynamic = 'force-dynamic';

/* The server decides whether a shot may hurt someone. Checks:
   - the shooter is signed in, not jailed, and fires no faster than the weapon's fire rate
   - the target is a real, online, un-jailed player (not yourself)
   - both claimed positions are plausible compared with the last position each player reported (no teleporting)
   - the target is inside the weapon's range
   On success it returns a signed single-use ticket (damage comes from the server's weapon table) and, for the first shot at a
   person in a while, puts assault heat on the SHOOTER. The victim no longer reports shots, so false reports are impossible. */
const MAX_SPEED = 30;          // m/s a player can plausibly cover (cars included)
const POS_SLACK = 12;          // metres of tolerance on top of that
const POS_MAX_AGE = 30_000;    // a player whose last position is older than this is offline
const RETALIATE_MS = 20_000;   // shooting someone who just shot you is a fight, not an assault
const lastShot = new Map<string, number>();           // shooter -> time of last accepted shot
const lastAimed = new Map<string, number>();          // `${shooter}>${target}` -> time of last accepted shot
const lastHeat = new Map<string, number>();           // `${shooter}>${target}` -> last time heat was applied

const plausible = (claimed: { x: number; z: number }, row: { x: number; z: number; updatedAt: Date }, now: number) =>
  Math.hypot(claimed.x - row.x, claimed.z - row.z) <= MAX_SPEED * ((now - row.updatedAt.getTime()) / 1000) + POS_SLACK;

export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({}));
  const rules = WEAPON_RULES[String(b.weapon)]; if (!rules) return err('Unknown weapon.');
  const target = String(b.target || '').trim(); if (!target) return err('No target.');
  const s = { x: Number(b.sx), z: Number(b.sz) }, t = { x: Number(b.tx), z: Number(b.tz) };
  if (![s.x, s.z, t.x, t.z].every(Number.isFinite)) return err('Bad positions.');
  const now = Date.now();

  if (now - (lastShot.get(u.id) || 0) < rules.cooldown * 0.8) return NextResponse.json({ ok: false, reason: 'cooldown' });
  const rows = await prisma.playerPosition.findMany({ where: { OR: [{ userId: u.id }, { username: { equals: target, mode: 'insensitive' } }] } });
  const me = rows.find(r => r.userId === u.id), him = rows.find(r => r.userId !== u.id);
  if (!me || !him) return NextResponse.json({ ok: false, reason: 'offline' });
  if (him.userId === u.id) return err('You cannot shoot yourself.');
  if (now - him.updatedAt.getTime() > POS_MAX_AGE || now - me.updatedAt.getTime() > POS_MAX_AGE) return NextResponse.json({ ok: false, reason: 'offline' });
  if (!plausible(s, me, now) || !plausible(t, him, now)) return NextResponse.json({ ok: false, reason: 'position' });
  if (Math.hypot(s.x - t.x, s.z - t.z) > rules.range + 1.5) return NextResponse.json({ ok: false, reason: 'range' });

  const saves = await prisma.save.findMany({ where: { userId: { in: [u.id, him.userId] } }, select: { userId: true, jailUntil: true, profile: true, heat: true, downUntil: true } });
  const mine = saves.find(x => x.userId === u.id), theirs = saves.find(x => x.userId === him.userId);
  if (!mine || !theirs) return NextResponse.json({ ok: false, reason: 'offline' });
  if (mine.jailUntil && mine.jailUntil.getTime() > now) return err('You are in jail.', 403);
  if (theirs.jailUntil && theirs.jailUntil.getTime() > now) return NextResponse.json({ ok: false, reason: 'jailed' });

  if (downState(mine.downUntil, now).down) return err('You are out cold.', 403);
  if (downState(theirs.downUntil, now).safe) return NextResponse.json({ ok: false, reason: 'safe' });   // just woke up: protected for a few seconds
  lastShot.set(u.id, now);
  recordShot(u.id, him.userId);
  const pair = `${u.id}>${him.userId}`, back = `${him.userId}>${u.id}`;
  const retaliating = now - (lastAimed.get(back) || 0) < RETALIATE_MS;
  lastAimed.set(pair, now);

  // keep the stored position fresh so follow-up shots validate against where the shooter really is
  await prisma.playerPosition.update({ where: { userId: u.id }, data: { x: s.x, z: s.z } }).catch(() => {});

  let wanted = false;
  if (!retaliating && now - (lastHeat.get(pair) || 0) > 30_000) {
    lastHeat.set(pair, now);
    const officer = (theirs.profile as { profession?: string } | null)?.profession === 'police';
    const heat = Math.min(200, mine.heat + ASSAULT_HEAT + (officer ? OFFICER_HEAT : 0));
    await prisma.save.update({ where: { userId: u.id }, data: { heat, heatAt: new Date() } });
    await prisma.crime.create({ data: { userId: u.id, kind: 'assault', caught: false, loot: 0 } });
    wanted = true;
  }
  const { token } = await signTicket({ shooterId: u.id, shooter: u.username, targetId: him.userId, weapon: String(b.weapon), damage: rules.damage });
  return NextResponse.json({ ok: true, ticket: token, damage: rules.damage, reported: wanted });
}
