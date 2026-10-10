import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, serverError, throttled } from '../../../lib/auth';
import { awardFame, loadState } from '../../../lib/game';
import { CITY } from '../../../lib/cityData';
import { cleanName } from '../../../lib/crews';
import { PASSOUT_DOWN_MS, PASSOUT_LEVEL_AFTER, downState } from '../../../lib/downed';
import { BLACKOUT_AT, BLACKOUT_PENALTY, clamp100 } from '../../../lib/intoxication';
import {
  ASOEBI, GENRES, MENU, OCCASIONS, PARTY, clamp, cleanTitle, danceFx, genreOk, hostFame, kindDef, menuById, menuFx, menuPrice, sprayOk, sprayVibe, titleOk, vibeNow,
} from '../../../lib/parties';
export const dynamic = 'force-dynamic';

/* Parties, hangouts, owambes and club nights hosted by real players (PARTIES.md).
   GET  = everything the Party panel shows (live parties, my party, my friends and where they are).
   POST = one action at a time: host · join · leave · end · spray · order · dance · music · invite · kick.
   Money moves only here, inside transactions with balance guards, and every number comes from lib/parties.ts. */
type Tx = Prisma.TransactionClient;
class Stop extends Error { constructor(public msg: string, public code = 400) { super(msg); } }
const naira = (n: number) => '₦' + Math.round(n).toLocaleString('en-NG');
const find = (name: string) => prisma.user.findUnique({ where: { usernameKey: cleanName(name).toLowerCase() }, select: { id: true, username: true } });
const note = (fromId: string, from: string, to: string, body: string) => prisma.message.create({ data: { fromId, fromName: from, toName: to, kind: 'text', body: body.slice(0, 300) } }).catch(() => null);

/** Every accepted relationship (friends, best friends, family, dating...) counts as "a friend" for friends-only parties. */
async function friendNames(me: string) {
  const rows = await prisma.relationship.findMany({ where: { accepted: true, OR: [{ aName: me }, { bName: me }] }, select: { aName: true, bName: true, status: true } });
  return new Map<string, string>(rows.map(r => [r.aName === me ? r.bName : r.aName, r.status]));
}
/** The district the game last reported for this player, or null if the report is stale. */
async function freshDistrict(userId: string) {
  const p = await prisma.playerPosition.findUnique({ where: { userId }, select: { district: true, updatedAt: true } });
  return p && Date.now() - p.updatedAt.getTime() <= PARTY.joinDistrictFreshMs ? p.district : null;
}
const attendance = (userId: string) => prisma.partyGuest.findFirst({ where: { userId, status: 'IN', party: { status: 'LIVE' } }, include: { party: true } });

/** Close a party exactly once (compare-and-set on status), send everybody home and pay the host's fame. */
async function endParty(id: string) {
  const now = new Date();
  const closed = await prisma.party.updateMany({ where: { id, status: 'LIVE' }, data: { status: 'ENDED', endedAt: now } });
  if (!closed.count) return;
  const party = await prisma.party.findUnique({ where: { id }, include: { guests: true } }); if (!party) return;
  await prisma.partyGuest.updateMany({ where: { partyId: id, status: 'IN' }, data: { status: 'LEFT', leftAt: now } });
  const kind = kindDef(party.kind);
  const stayed = party.guests.filter(g => g.userId !== party.hostId && (g.leftAt || now).getTime() - g.joinedAt.getTime() >= PARTY.minStayMs).length;
  if (kind) {
    const fame = hostFame(Math.max(party.peak, vibeNow(party.vibe, party.vibeAt.getTime(), now.getTime())), stayed, kind);
    if (fame > 0) await awardFame(party.hostId, fame).catch(() => 0);
    if (stayed >= 2) await prisma.reputation.upsert({ where: { userId: party.hostId }, update: { social: { increment: Math.min(5, stayed) } }, create: { userId: party.hostId, social: 50 + Math.min(5, stayed) } }).catch(() => null);
  }
}
async function settleExpired() {
  const old = await prisma.party.findMany({ where: { status: 'LIVE', endsAt: { lte: new Date() } }, select: { id: true }, take: 20 });
  for (const p of old) await endParty(p.id);
}
/** Raise or lower the vibe (after fading it to now). Cosmetic and forgiving: a rare lost update only nudges a number. */
async function bump(tx: Tx, partyId: string, delta: number) {
  const p = await tx.party.findUnique({ where: { id: partyId }, select: { vibe: true, vibeAt: true, peak: true } }); if (!p) return 0;
  const now = Date.now(), v = clamp(vibeNow(p.vibe, p.vibeAt.getTime(), now) + delta, 0, 100);
  await tx.party.update({ where: { id: partyId }, data: { vibe: v, vibeAt: new Date(now), peak: Math.max(p.peak, v) } });
  return v;
}
const credit = async (tx: Tx, userId: string, amount: number, why: string) => {
  if (amount <= 0) return;
  await tx.save.update({ where: { userId }, data: { cash: { increment: amount } } });
  await tx.transaction.create({ data: { userId, type: 'EARN', amount, description: why } });
};
const debit = async (tx: Tx, userId: string, amount: number, why: string) => {
  if (amount <= 0) return;
  const r = await tx.save.updateMany({ where: { userId, cash: { gte: amount } }, data: { cash: { decrement: amount } } });
  if (!r.count) throw new Stop("You can't afford that.", 402);
  await tx.transaction.create({ data: { userId, type: 'SPEND', amount: -amount, description: why } });
};

async function snapshot(userId: string, username: string) {
  const now = Date.now();
  const [save, friends, mine, live] = await Promise.all([
    prisma.save.findUnique({ where: { userId }, select: { cash: true } }),
    friendNames(username),
    attendance(userId),
    prisma.party.findMany({ where: { status: 'LIVE' }, orderBy: [{ vibe: 'desc' }, { startsAt: 'desc' }], take: 60, include: { _count: { select: { guests: { where: { status: 'IN' } } } } } }),
  ]);
  const district = await freshDistrict(userId);
  const cards = live.filter(p => !p.friendsOnly || p.hostId === userId || friends.has(p.hostName) || mine?.partyId === p.id).slice(0, PARTY.maxLive).map(p => ({
    id: p.id, kind: p.kind, title: p.title, occasion: p.occasion, genre: p.genre, venueName: p.venueName, district: p.district, hostName: p.hostName, cover: p.cover,
    count: p._count.guests, cap: p.cap, vibe: Math.round(vibeNow(p.vibe, p.vibeAt.getTime(), now)), endsInMs: Math.max(0, p.endsAt.getTime() - now),
    friendsOnly: p.friendsOnly, friend: friends.has(p.hostName), here: district === p.district, joined: mine?.partyId === p.id, hosting: p.hostId === userId,
  }));
  let view = null;
  if (mine) {
    const p = mine.party, kind = kindDef(p.kind)!;
    const guests = await prisma.partyGuest.findMany({ where: { partyId: p.id, status: 'IN' }, orderBy: { joinedAt: 'asc' }, take: 100 });
    view = {
      id: p.id, kind: p.kind, title: p.title, occasion: p.occasion, dress: p.dress, genre: p.genre, venueName: p.venueName, district: p.district, cover: p.cover, markup: p.markup,
      friendsOnly: p.friendsOnly, cap: p.cap, count: guests.length, vibe: Math.round(vibeNow(p.vibe, p.vibeAt.getTime(), now)), peak: Math.round(p.peak), endsInMs: Math.max(0, p.endsAt.getTime() - now),
      hostName: p.hostName, isHost: p.hostId === userId, hostEarned: p.hostEarned, sprayTotal: p.sprayTotal, guestsTotal: p.guestsTotal,
      musicInMs: p.musicAt ? Math.max(0, p.musicAt.getTime() + PARTY.musicCooldownMs - now) : 0,
      guests: guests.map(g => ({ name: g.username, host: g.userId === p.hostId, dances: g.dances, sprayed: g.sprayed, received: g.received, you: g.userId === userId, dancingNow: !!g.lastDanceAt && now - g.lastDanceAt.getTime() < PARTY.danceFloorWindowMs })),
      menu: kind.menu.map(id => ({ id, label: MENU[id].label, e: MENU[id].e, price: menuPrice(id, p.markup), drunk: MENU[id].drunk })),
      me: { spent: mine.spent, sprayed: mine.sprayed, received: mine.received, dances: mine.dances, danceInMs: mine.lastDanceAt ? Math.max(0, mine.lastDanceAt.getTime() + PARTY.danceCooldownMs - now) : 0 },
    };
  }
  // friends and where they are right now
  const names = [...friends.keys()];
  const [pos, at] = names.length ? await Promise.all([
    prisma.playerPosition.findMany({ where: { username: { in: names }, updatedAt: { gt: new Date(now - 60_000) } }, select: { username: true, district: true } }),
    prisma.partyGuest.findMany({ where: { username: { in: names }, status: 'IN', party: { status: 'LIVE' } }, select: { username: true, party: { select: { id: true, title: true, kind: true, friendsOnly: true, hostName: true } } } }),
  ]) : [[], []];
  const friendRows = names.map(n => {
    const pr = pos.find(x => x.username === n), pa = at.find(x => x.username === n)?.party;
    const open = pa && (!pa.friendsOnly || pa.hostName === username || friends.has(pa.hostName));
    return { name: n, bond: friends.get(n)!, online: !!pr, district: pr?.district || null, party: pa && open ? { id: pa.id, title: pa.title, kind: pa.kind } : null };
  }).sort((a, b) => Number(!!b.party) - Number(!!a.party) || Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  return { cash: save?.cash ?? 0, district, live: cards, party: view, friends: friendRows, now };
}

export async function GET() {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    await settleExpired();
    return NextResponse.json({ ok: true, ...(await snapshot(u.id, u.username)) });
  } catch (e) { return serverError(e); }
}

export async function POST(req: Request) {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    if (throttled('party:' + u.id, PARTY.actionsPerMin, 60_000)) return err('Slow down a little.', 429);
    const st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
    if (st.jailLeft) return err('You are in jail.', 403);
    const b = await req.json().catch(() => ({})), action = String(b.action || '');
    await settleExpired();
    const out: Record<string, unknown> = {};

    try {
      if (action === 'host') {
        if (downState(st.save.downUntil).down) return err('You are out cold.', 403);
        const kind = kindDef(String(b.kind)); if (!kind) return err('Pick a kind of party.');
        const title = cleanTitle(b.title); if (!titleOk(title)) return err(`Give it a name (${PARTY.titleMin}-${PARTY.titleMax} letters or numbers).`);
        const genre = genreOk(String(b.genre)) ? String(b.genre) : 'afrobeats';
        const cover = Math.round(clamp(Number(b.cover) || 0, 0, kind.coverMax));
        const markup = Math.round(clamp(Number(b.markup) || 1, PARTY.markupMin, PARTY.markupMax) * 100) / 100;
        let occasion: string | null = null, dress: string | null = null;
        if (kind.needsOccasion) {
          occasion = (OCCASIONS as readonly string[]).includes(String(b.occasion)) ? String(b.occasion) : null; if (!occasion) return err('Say what you are celebrating.');
          dress = (ASOEBI as readonly string[]).includes(String(b.dress)) ? String(b.dress) : 'No dress code';
        }
        if (await prisma.party.findFirst({ where: { hostId: u.id, status: 'LIVE' }, select: { id: true } })) return err('You are already hosting. End that one first.', 409);
        if (await attendance(u.id)) return err('Leave the party you are at before hosting your own.', 409);
        const district = await freshDistrict(u.id); if (!district) return err('Open the city map so the game knows where you are, then try again.', 409);
        let venueId: string | null = null, venueName = '', where = district;
        if (kind.needsClub) {
          const club = CITY.businesses.find(x => x.id === String(b.venueId) && x.type === 'Nightclub'); if (!club) return err('Pick a nightclub to book.');
          if (club.district !== district) return err(`${club.name} is in ${club.district}. Go there to book it.`, 409);
          if (await prisma.party.findFirst({ where: { venueId: club.id, status: 'LIVE' }, select: { id: true } })) return err(`${club.name} is already booked tonight.`, 409);
          venueId = club.id; venueName = club.name; where = club.district;
        } else venueName = kind.id === 'owambe' ? `${district} event hall` : kind.id === 'house' ? `${u.username}'s place` : `${u.username}'s spot`;
        const id = await prisma.$transaction(async tx => {
          await debit(tx, u.id, kind.setup, `party-setup:${kind.id}`);
          const p = await tx.party.create({ data: {
            hostId: u.id, hostName: u.username, kind: kind.id, title, occasion, dress, genre, venueId, venueName, district: where, cover, markup, friendsOnly: kind.friendsOnly || !!b.friendsOnly,
            cap: kind.cap, vibe: 10, peak: 10, endsAt: new Date(Date.now() + kind.durationMs),
          } });
          await tx.partyGuest.create({ data: { partyId: p.id, userId: u.id, username: u.username } });
          return p.id;
        });
        out.partyId = id; out.msg = `${kind.e} ${title} is live! Invite your people.`;

      } else if (action === 'join') {
        if (downState(st.save.downUntil).down) return err('You are out cold.', 403);
        const p = await prisma.party.findFirst({ where: { id: String(b.id), status: 'LIVE' } }); if (!p) return err('That party is over.', 404);
        const cur = await attendance(u.id);
        if (cur) return err(cur.partyId === p.id ? 'You are already inside.' : 'Leave the party you are at first.', 409);
        const prior = await prisma.partyGuest.findUnique({ where: { partyId_userId: { partyId: p.id, userId: u.id } } });
        if (prior?.status === 'KICKED') return err('The host has asked you to stay out.', 403);
        if (p.friendsOnly && p.hostId !== u.id && !(await friendNames(u.username)).has(p.hostName)) return err('This one is for the host’s friends only.', 403);
        const district = await freshDistrict(u.id);
        if (!district) return err('Open the city map so the game knows where you are, then try again.', 409);
        if (district !== p.district) return err(`The party is in ${p.district}. You are in ${district}: go there first.`, 409);
        await prisma.$transaction(async tx => {
          const inside = await tx.partyGuest.count({ where: { partyId: p.id, status: 'IN' } });
          if (inside >= p.cap) throw new Stop('The place is packed. Try again in a bit.', 409);
          const fresh = await tx.party.findFirst({ where: { id: p.id, status: 'LIVE' }, select: { id: true } }); if (!fresh) throw new Stop('That party just ended.', 404);
          const stamped = !!prior; // someone who already paid and stepped out is let back in free
          if (!stamped && p.cover > 0) { await debit(tx, u.id, p.cover, `party-cover:${p.title.slice(0, 30)}`); await credit(tx, p.hostId, p.cover, `party-door:${u.username}`); await tx.party.update({ where: { id: p.id }, data: { hostEarned: { increment: p.cover } } }); }
          if (prior) await tx.partyGuest.update({ where: { id: prior.id }, data: { status: 'IN', leftAt: null } });
          else { await tx.partyGuest.create({ data: { partyId: p.id, userId: u.id, username: u.username, spent: p.cover } }); await tx.party.update({ where: { id: p.id }, data: { guestsTotal: { increment: 1 } } }); }
          await bump(tx, p.id, PARTY.joinVibe);
        });
        out.msg = `🎉 Welcome to ${p.title}!`;

      } else if (action === 'leave') {
        const g = await attendance(u.id); if (!g) return err('You are not at a party.', 409);
        if (g.party.hostId === u.id) return err('It is your party: end it instead.', 409);
        await prisma.partyGuest.update({ where: { id: g.id }, data: { status: 'LEFT', leftAt: new Date() } });
        out.msg = 'You left the party.';

      } else if (action === 'end') {
        const p = await prisma.party.findFirst({ where: { hostId: u.id, status: 'LIVE' } }); if (!p) return err('You are not hosting.', 409);
        await endParty(p.id); out.msg = `Party over. You took ${naira(p.hostEarned)} tonight.`;

      } else {
        const g = await attendance(u.id); if (!g) return err('Join a party first.', 409);
        const p = g.party, kind = kindDef(p.kind)!;

        if (action === 'spray') {
          const amount = Math.round(Number(b.amount)); if (!sprayOk(amount)) return err('Pick one of the spray amounts.');
          if (throttled('spray:' + u.id, 20, 60_000)) return err('Easy! Let the notes land.', 429);
          const to = await find(String(b.to)); if (!to || to.id === u.id) return err('Spray someone else.');
          const rg = await prisma.partyGuest.findFirst({ where: { partyId: p.id, userId: to.id, status: 'IN' } }); if (!rg) return err(`${to.username} is not at this party.`, 404);
          const got = Math.floor(amount * (1 - PARTY.sprayFee));
          await prisma.$transaction(async tx => {
            if (!(await tx.party.findFirst({ where: { id: p.id, status: 'LIVE' }, select: { id: true } }))) throw new Stop('That party just ended.', 404);
            await debit(tx, u.id, amount, `spray:${to.username}`);
            await credit(tx, to.id, got, `spray-from:${u.username}`);
            await tx.partyGuest.update({ where: { id: g.id }, data: { sprayed: { increment: amount }, spent: { increment: amount } } });
            await tx.partyGuest.update({ where: { id: rg.id }, data: { received: { increment: got } } });
            await tx.party.update({ where: { id: p.id }, data: { sprayTotal: { increment: amount }, ...(to.id === p.hostId ? { hostEarned: { increment: got } } : {}) } });
            await bump(tx, p.id, sprayVibe(amount, kind));
          });
          out.msg = `💸 You sprayed ${to.username} ${naira(amount)}!`;
          out.fx = { fun: Math.round(3 + Math.log10(amount / 1000) * 2), social: 3 };

        } else if (action === 'order') {
          const item = menuById(String(b.item)); if (!item || !kind.menu.includes(item.id)) return err('Not on the menu.');
          const dn = downState(st.save.downUntil); if (dn.down) return err('You are out cold.', 403);
          const price = menuPrice(item.id, p.markup), cost = Math.round(item.base * PARTY.cogsRate), margin = Math.max(0, price - cost);
          let drunk = st.save.drunk;
          const v = await prisma.$transaction(async tx => {
            if (!(await tx.party.findFirst({ where: { id: p.id, status: 'LIVE' }, select: { id: true } }))) throw new Stop('That party just ended.', 404);
            await debit(tx, u.id, price, `party-order:${item.id}`);
            await credit(tx, p.hostId, margin, `party-margin:${u.username}`);
            await tx.partyGuest.update({ where: { id: g.id }, data: { spent: { increment: price } } });
            if (margin > 0) await tx.party.update({ where: { id: p.id }, data: { hostEarned: { increment: margin } } });
            return bump(tx, p.id, PARTY.orderVibe);
          });
          let blackout = false;
          if (item.drunk > 0) {
            drunk = clamp100(drunk + item.drunk); blackout = drunk >= BLACKOUT_AT;
            if (blackout) drunk = Math.min(drunk, PASSOUT_LEVEL_AFTER);
            await prisma.save.update({ where: { userId: u.id }, data: { drunk, intoxAt: new Date(), ...(blackout ? { downUntil: new Date(Date.now() + PASSOUT_DOWN_MS), downKind: 'passout' } : {}) } });
          }
          out.msg = `${item.e} ${item.label}: ${naira(price)}`; out.fx = menuFx(item, v); out.drunk = drunk;
          if (blackout) { out.blackout = true; out.downMs = PASSOUT_DOWN_MS; out.penalty = BLACKOUT_PENALTY; out.msg = `${item.e} You passed out at the party!`; }

        } else if (action === 'dance') {
          if (downState(st.save.downUntil).down) return err('You are out cold.', 403);
          const now = Date.now();
          const claimed = await prisma.partyGuest.updateMany({ where: { id: g.id, OR: [{ lastDanceAt: null }, { lastDanceAt: { lt: new Date(now - PARTY.danceCooldownMs) } }] }, data: { lastDanceAt: new Date(now), dances: { increment: 1 } } });
          if (!claimed.count) return err('Catch your breath first.', 429);
          const dancers = await prisma.partyGuest.count({ where: { partyId: p.id, status: 'IN', lastDanceAt: { gt: new Date(now - PARTY.danceFloorWindowMs) } } });
          const full = dancers >= PARTY.danceFloorMin;
          const v = await prisma.$transaction(tx => bump(tx, p.id, PARTY.danceVibe * kind.danceMult * (full ? PARTY.danceFloorBonus : 1)));
          out.fx = danceFx(v, kind, full); out.floorFull = full; out.dancers = dancers;
          out.msg = full ? '🔥 The dance floor is on fire!' : '💃 You hit the dance floor.';

        } else if (action === 'music') {
          if (p.hostId !== u.id) return err('Only the host picks the music.', 403);
          if (!genreOk(String(b.genre))) return err('Unknown genre.');
          const now = Date.now(), boost = !p.musicAt || now - p.musicAt.getTime() >= PARTY.musicCooldownMs;
          await prisma.$transaction(async tx => { await tx.party.update({ where: { id: p.id }, data: { genre: String(b.genre), ...(boost ? { musicAt: new Date(now) } : {}) } }); if (boost) await bump(tx, p.id, PARTY.musicVibe); });
          out.msg = `🎧 Now playing: ${GENRES.find(x => x.id === b.genre)?.label}${boost ? ' · the crowd cheers!' : ''}`;

        } else if (action === 'invite') {
          if (throttled('pinv:' + u.id, PARTY.invitesPerMin, 60_000)) return err('Too many invites. Wait a minute.', 429);
          const to = await find(String(b.to)); if (!to || to.id === u.id) return err('No such player.');
          if (p.friendsOnly && !(await friendNames(p.hostName)).has(to.username) && to.username !== p.hostName) return err('This party is friends-only: ask the host.', 403);
          await note(u.id, u.username, to.username, `🎉 ${u.username} invited you to “${p.title}” (${kind.label}${p.cover ? ' · door ' + naira(p.cover) : ' · free'}) in ${p.district}. Go there, open the Party app and tap Join.`);
          out.msg = `📨 Invite sent to ${to.username}.`; out.pingTo = to.username;

        } else if (action === 'kick') {
          if (p.hostId !== u.id) return err('Only the host can do that.', 403);
          const t = await find(String(b.name)); if (!t || t.id === u.id) return err('No such guest.');
          const r = await prisma.partyGuest.updateMany({ where: { partyId: p.id, userId: t.id, status: 'IN' }, data: { status: 'KICKED', leftAt: new Date() } });
          if (!r.count) return err('They are not here.', 404);
          out.msg = `${t.username} was shown the door.`;

        } else return err('Unknown action.');
      }
    } catch (e) { if (e instanceof Stop) return err(e.msg, e.code); throw e; }

    return NextResponse.json({ ok: true, ...out, ...(await snapshot(u.id, u.username)) });
  } catch (e) { return serverError(e); }
}
