import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, serverError, throttled } from '../../../lib/auth';
import { CAP_DISTRICTS, CREW, CREW_KINDS, canManage, cleanName, kindOf, nameOk, tagOk } from '../../../lib/crews';
import { cupStandings, giveTreasury, membership, payTurf, settleDue, sys, takeCash, takeTreasury, warScores } from '../../../lib/crewServer';
export const dynamic = 'force-dynamic';

/* Crews, gangs and companies. GET = everything the Crew panel shows. POST = one action at a time (create, join, invite, kick, donate, claim, war...). All rules are enforced here. */
const money = (n: number) => '₦' + Math.round(n).toLocaleString();
const isPolice = async (userId: string) => ((await prisma.save.findUnique({ where: { userId }, select: { profile: true } }))?.profile as { profession?: string } | null)?.profession === 'police';
const byName = (name: string) => prisma.user.findUnique({ where: { usernameKey: cleanName(name).toLowerCase() }, select: { id: true, username: true } });
const unique = (e: unknown) => (e as { code?: string })?.code === 'P2002';

export async function GET() {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    await settleDue();
    const m = await membership(u.id);
    if (m) await payTurf(m.crewId);
    const [save, invites, open] = await Promise.all([
      prisma.save.findUnique({ where: { userId: u.id }, select: { cash: true } }),
      prisma.crewInvite.findMany({ where: { toName: u.username }, orderBy: { createdAt: 'desc' }, take: 10, include: { crew: { include: { _count: { select: { members: true } } } } } }),
      m ? [] : prisma.crew.findMany({ where: { open: true }, orderBy: [{ rating: 'desc' }, { createdAt: 'asc' }], take: 15, include: { _count: { select: { members: true } } } }),
    ]);
    const base = {
      cash: save?.cash ?? 0,
      invites: invites.map(i => ({ crewId: i.crewId, name: i.crew.name, tag: i.crew.tag, kind: i.crew.kind, from: i.fromName, members: i.crew._count.members })),
      open: open.map(c => ({ crewId: c.id, name: c.name, tag: c.tag, kind: c.kind, motto: c.motto, members: c._count.members, rating: c.rating })),
    };
    if (!m) return NextResponse.json({ ...base, crew: null });

    const now = new Date();
    const [crew, turfAll, wars, cupEv, recent, unread] = await Promise.all([
      prisma.crew.findUnique({ where: { id: m.crewId }, include: { members: { orderBy: { joinedAt: 'asc' } }, turf: true } }),
      prisma.crewTurf.findMany({ include: { crew: { select: { id: true, name: true, tag: true } } } }),
      prisma.crewEvent.findMany({ where: { kind: 'war', OR: [{ status: 'active' }, { status: 'done', endsAt: { gt: new Date(Date.now() - CREW.warCooldownMs) } }] } }),
      prisma.crewEvent.findFirst({ where: { kind: 'cup', status: 'active' }, orderBy: { startsAt: 'desc' } }),
      prisma.crewEvent.findMany({ where: { kind: 'war', status: 'done', OR: [{ attackerId: m.crewId }, { defenderId: m.crewId }] }, orderBy: { endsAt: 'desc' }, take: 5 }),
      prisma.crewMessage.count({ where: { crewId: m.crewId, createdAt: { gt: m.chatReadAt }, NOT: { fromName: u.username } } }),
    ]);
    if (!crew) return NextResponse.json({ ...base, crew: null });
    const seen = await prisma.save.findMany({ where: { userId: { in: crew.members.map(x => x.userId) }, seenAt: { gt: new Date(Date.now() - CREW.activeMs) } }, select: { userId: true } });
    const seenSet = new Set(seen.map(s => s.userId));
    const names = new Map<string, string>();
    const idsNeeded = new Set<string>(); for (const w of [...wars, ...recent]) { if (w.attackerId) idsNeeded.add(w.attackerId); if (w.defenderId) idsNeeded.add(w.defenderId); }
    (await prisma.crew.findMany({ where: { id: { in: [...idsNeeded] } }, select: { id: true, name: true, tag: true } })).forEach(c => names.set(c.id, `[${c.tag}] ${c.name}`));
    const nm = (id: string | null) => (id && names.get(id)) || 'a former crew';

    const activeWars = await Promise.all(wars.filter(w => w.status === 'active' && (w.attackerId === m.crewId || w.defenderId === m.crewId)).map(async w => {
      const sc = await warScores(w, now);
      return { id: w.id, district: w.district, attacker: nm(w.attackerId), defender: nm(w.defenderId), mine: w.attackerId === m.crewId ? 'attacker' : 'defender', startsIn: Math.max(0, Math.ceil((w.startsAt.getTime() - Date.now()) / 1000)), endsIn: Math.max(0, Math.ceil((w.endsAt.getTime() - Date.now()) / 1000)), attackerScore: sc.a, defenderScore: sc.b, defenderEdge: sc.defended };
    }));
    const cup = cupEv ? await cupStandings(cupEv, now) : [];
    const me = crew.members.find(x => x.userId === u.id)!;
    const eligible = crew.members.length;
    const busy = (id: string) => wars.some(w => w.status === 'active' && (w.attackerId === id || w.defenderId === id));
    const districts = CAP_DISTRICTS.map(d => {
      const t = turfAll.find(x => x.district === d), cool = wars.find(w => w.district === d && (w.status === 'active' || w.endsAt.getTime() > Date.now() - CREW.warCooldownMs));
      return { name: d, holder: t ? { id: t.crew.id, name: t.crew.name, tag: t.crew.tag } : null, mine: t?.crewId === m.crewId, shieldIn: t ? Math.max(0, Math.ceil((t.claimedAt.getTime() + CREW.newTurfShieldMs - Date.now()) / 1000)) : 0, coolIn: cool ? (cool.status === 'active' ? -1 : Math.max(0, Math.ceil((cool.endsAt.getTime() + CREW.warCooldownMs - Date.now()) / 1000))) : 0, holderBusy: t ? busy(t.crewId) : false };
    });
    return NextResponse.json({
      ...base, unread,
      crew: { id: crew.id, name: crew.name, tag: crew.tag, kind: crew.kind, motto: crew.motto, open: crew.open, treasury: crew.treasury, rating: crew.rating, role: me.role, busy: busy(crew.id), turfCount: crew.turf.length,
        members: crew.members.map(x => ({ name: x.username, role: x.role, active: seenSet.has(x.userId), you: x.userId === u.id, joinedAt: x.joinedAt.getTime() })) },
      districts, wars: activeWars, eligible,
      cup: { endsIn: cupEv ? Math.max(0, Math.ceil((cupEv.endsAt.getTime() - Date.now()) / 1000)) : 0, table: cup.slice(0, 10).map((r, i) => ({ rank: i + 1, name: r.name, tag: r.tag, kind: r.kind, score: r.score, mine: r.id === crew.id })), mine: cup.find(r => r.id === crew.id)?.score ?? null, prizes: CREW.cupPrizes },
      history: recent.map(w => { const r = (w.result || {}) as { attackerScore?: number; defenderScore?: number; winner?: string }; return { district: w.district, attacker: nm(w.attackerId), defender: nm(w.defenderId), a: r.attackerScore ?? 0, b: r.defenderScore ?? 0, won: r.winner === m.crewId, at: w.endsAt.getTime() }; }),
    });
  } catch (e) { return serverError(e); }
}

export async function POST(req: Request) {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    const b = await req.json().catch(() => ({})), act = String(b.action || '');
    await settleDue();
    const m = await membership(u.id);
    const need = () => { if (!m) throw new Error('NOCREW'); return m; };
    const mgr = () => { const x = need(); if (!canManage(x.role)) throw new Error('NOPERM'); return x; };
    const boss = () => { const x = need(); if (x.role !== 'leader') throw new Error('NOBOSS'); return x; };
    try {
      switch (act) {
        case 'create': {
          if (m) return err('Leave your current crew first.');
          if (throttled('crew:create:' + u.id, 3)) return err('Too many tries. Wait a few minutes.', 429);
          const name = cleanName(b.name), tag = cleanName(b.tag).toUpperCase(), kind = CREW_KINDS.find(k => k.id === b.kind)?.id;
          if (!nameOk(name)) return err(`Name must be ${CREW.nameMin}-${CREW.nameMax} letters, numbers or spaces.`);
          if (!tagOk(tag)) return err(`Tag must be ${CREW.tagMin}-${CREW.tagMax} letters or numbers.`);
          if (!kind) return err('Pick crew, gang or company.');
          if (kind === 'gang' && await isPolice(u.id)) return err('Officers cannot start a gang.', 403);
          const crew = await prisma.$transaction(async tx => {
            await takeCash(tx, u.id, CREW.createCost, 'crew:create');
            const c = await tx.crew.create({ data: { name, nameKey: name.toLowerCase(), tag, tagKey: tag.toLowerCase(), kind, motto: cleanName(b.motto).slice(0, CREW.mottoMax), open: !!b.open } });
            await tx.crewMember.create({ data: { crewId: c.id, userId: u.id, username: u.username, role: 'leader' } });
            await sys(tx, c.id, `${kindOf(kind).e} ${name} was founded by ${u.username}.`);
            return c;
          });
          return NextResponse.json({ ok: true, crewId: crew.id });
        }
        case 'join': {
          if (m) return err('Leave your current crew first.');
          const crew = await prisma.crew.findUnique({ where: { id: String(b.crewId || '') }, include: { _count: { select: { members: true } } } }); if (!crew) return err('That crew no longer exists.', 404);
          const inv = await prisma.crewInvite.findUnique({ where: { crewId_toName: { crewId: crew.id, toName: u.username } } });
          if (!crew.open && !inv) return err('That crew is invite-only.', 403);
          if (crew._count.members >= CREW.maxMembers) return err('That crew is full.', 409);
          if (crew.kind === 'gang' && await isPolice(u.id)) return err('Officers cannot join a gang.', 403);
          await prisma.$transaction(async tx => {
            await tx.crewMember.create({ data: { crewId: crew.id, userId: u.id, username: u.username } });
            await tx.crewInvite.deleteMany({ where: { toName: u.username } });
            await sys(tx, crew.id, `👋 ${u.username} joined.`);
          });
          return NextResponse.json({ ok: true });
        }
        case 'decline': { await prisma.crewInvite.deleteMany({ where: { crewId: String(b.crewId || ''), toName: u.username } }); return NextResponse.json({ ok: true }); }
        case 'invite': {
          const me = mgr(), t = await byName(b.name); if (!t || t.id === u.id) return err('No such player.', 404);
          if (await prisma.crewMember.findUnique({ where: { userId: t.id } })) return err(`${t.username} is already in a crew.`, 409);
          if ((await prisma.crewMember.count({ where: { crewId: me.crewId } })) >= CREW.maxMembers) return err('Your crew is full.', 409);
          if (m!.crew.kind === 'gang' && await isPolice(t.id)) return err('Officers cannot join a gang.', 403);
          await prisma.crewInvite.upsert({ where: { crewId_toName: { crewId: me.crewId, toName: t.username } }, create: { crewId: me.crewId, toName: t.username, fromName: u.username }, update: { fromName: u.username, createdAt: new Date() } });
          await prisma.message.create({ data: { fromId: u.id, fromName: u.username, toName: t.username, kind: 'text', body: `${kindOf(m!.crew.kind).e} I invited you to ${m!.crew.name} [${m!.crew.tag}]. Open Crew in the menu to join.` } }).catch(() => {});
          return NextResponse.json({ ok: true, to: t.username });
        }
        case 'leave': {
          const me = need(), rest = await prisma.crewMember.findMany({ where: { crewId: me.crewId, NOT: { userId: u.id } }, orderBy: { joinedAt: 'asc' } });
          await prisma.$transaction(async tx => {
            if (me.role === 'leader' && rest.length) { const next = rest.find(r => r.role === 'officer') || rest[0]; await tx.crewMember.update({ where: { id: next.id }, data: { role: 'leader' } }); await sys(tx, me.crewId, `👑 ${next.username} is the new leader.`); }
            await tx.crewMember.delete({ where: { id: me.id } });
            if (!rest.length) { await tx.crewEvent.updateMany({ where: { status: 'active', kind: 'war', OR: [{ attackerId: me.crewId }, { defenderId: me.crewId }] }, data: { status: 'done', result: { cancelled: true } } }); await tx.crew.delete({ where: { id: me.crewId } }); } // last one out closes the crew; turf and chat go with it
            else await sys(tx, me.crewId, `🚪 ${u.username} left.`);
          });
          return NextResponse.json({ ok: true });
        }
        case 'kick': {
          const me = mgr(), t = await prisma.crewMember.findFirst({ where: { crewId: me.crewId, username: cleanName(b.name) } }); if (!t || t.userId === u.id) return err('No such member.', 404);
          if (t.role === 'leader' || (t.role === 'officer' && me.role !== 'leader')) return err('You cannot remove them.', 403);
          await prisma.$transaction(async tx => { await tx.crewMember.delete({ where: { id: t.id } }); await sys(tx, me.crewId, `🥾 ${t.username} was removed by ${u.username}.`); });
          return NextResponse.json({ ok: true });
        }
        case 'promote': case 'demote': case 'transfer': {
          const me = boss(), t = await prisma.crewMember.findFirst({ where: { crewId: me.crewId, username: cleanName(b.name) } }); if (!t || t.userId === u.id) return err('No such member.', 404);
          await prisma.$transaction(async tx => {
            if (act === 'transfer') { await tx.crewMember.update({ where: { id: t.id }, data: { role: 'leader' } }); await tx.crewMember.update({ where: { id: me.id }, data: { role: 'officer' } }); await sys(tx, me.crewId, `👑 ${t.username} is the new leader.`); }
            else { await tx.crewMember.update({ where: { id: t.id }, data: { role: act === 'promote' ? 'officer' : 'member' } }); await sys(tx, me.crewId, act === 'promote' ? `⭐ ${t.username} is now an officer.` : `${t.username} is a regular member again.`); }
          });
          return NextResponse.json({ ok: true });
        }
        case 'settings': {
          const me = mgr(), data: { motto?: string; open?: boolean } = {};
          if (typeof b.motto === 'string') data.motto = cleanName(b.motto).slice(0, CREW.mottoMax);
          if (typeof b.open === 'boolean') data.open = b.open;
          await prisma.crew.update({ where: { id: me.crewId }, data }); return NextResponse.json({ ok: true });
        }
        case 'donate': {
          const me = need(), amt = Math.floor(Number(b.amount)); if (!(amt >= 1)) return err('Enter an amount of ₦1 or more.');
          await prisma.$transaction(async tx => {
            await takeCash(tx, u.id, amt, 'crew:donate');
            const r = await giveTreasury(tx, me.crewId, amt); if (!r.count) throw new Error('FULL');
            await sys(tx, me.crewId, `💰 ${u.username} put ${money(amt)} in the treasury.`);
          });
          const s = await prisma.save.findUnique({ where: { userId: u.id }, select: { cash: true } });
          return NextResponse.json({ ok: true, cash: s?.cash ?? 0 });
        }
        case 'claim': {
          const me = mgr(), d = CAP_DISTRICTS.find(x => x === b.district); if (!d) return err('Unknown district.');
          if (await prisma.crewMember.count({ where: { crewId: me.crewId } }) < CREW.minToClaim) return err(`You need ${CREW.minToClaim} members to claim turf.`);
          if (await prisma.crewTurf.count({ where: { crewId: me.crewId } }) >= CREW.maxTurf) return err(`A crew can hold ${CREW.maxTurf} districts at most.`);
          await prisma.$transaction(async tx => {
            await takeTreasury(tx, me.crewId, CREW.claimCost);
            await tx.crewTurf.create({ data: { district: d, crewId: me.crewId } });
            await sys(tx, me.crewId, `🏴 ${u.username} claimed ${d} for ${money(CREW.claimCost)}. Rivals cannot attack it for ${CREW.newTurfShieldMs / 3600_000} h.`);
          });
          return NextResponse.json({ ok: true });
        }
        case 'abandon': {
          const me = boss(), r = await prisma.crewTurf.deleteMany({ where: { crewId: me.crewId, district: String(b.district || '') } }); if (!r.count) return err('You do not hold that district.');
          await sys(prisma, me.crewId, `🏳️ ${u.username} gave up ${b.district}.`); return NextResponse.json({ ok: true });
        }
        case 'war': {
          const me = mgr(), d = CAP_DISTRICTS.find(x => x === b.district); if (!d) return err('Unknown district.');
          const turf = await prisma.crewTurf.findUnique({ where: { district: d } }); if (!turf) return err('Nobody holds that district. Claim it instead.');
          if (turf.crewId === me.crewId) return err('That is already your turf.');
          if (turf.claimedAt.getTime() + CREW.newTurfShieldMs > Date.now()) return err('That turf was claimed a moment ago and is still shielded.', 409);
          const [mine, theirs, recent, def, atk] = await Promise.all([
            prisma.crewEvent.findFirst({ where: { kind: 'war', status: 'active', OR: [{ attackerId: me.crewId }, { defenderId: me.crewId }] } }),
            prisma.crewEvent.findFirst({ where: { kind: 'war', status: 'active', OR: [{ attackerId: turf.crewId }, { defenderId: turf.crewId }] } }),
            prisma.crewEvent.findFirst({ where: { kind: 'war', district: d, endsAt: { gt: new Date(Date.now() - CREW.warCooldownMs) } } }),
            prisma.crewMember.findMany({ where: { crewId: turf.crewId }, select: { userId: true } }),
            prisma.crewMember.findMany({ where: { crewId: me.crewId }, select: { userId: true } }),
          ]);
          if (mine) return err('Your crew is already in a war.', 409);
          if (theirs) return err('That crew is already in a war.', 409);
          if (recent) return err('That district was fought over recently. Try again later.', 409);
          if (atk.length < CREW.minToClaim) return err(`You need ${CREW.minToClaim} members to start a war.`);
          const start = new Date(Date.now() + CREW.warPrepMs), end = new Date(start.getTime() + CREW.warMs);
          const defCrew = await prisma.crew.findUnique({ where: { id: turf.crewId }, select: { name: true, tag: true } });
          await prisma.$transaction(async tx => {
            await takeTreasury(tx, me.crewId, CREW.warFee);
            await tx.crewEvent.create({ data: { key: `war:${d}:${Date.now()}`, kind: 'war', startsAt: start, endsAt: end, attackerId: me.crewId, defenderId: turf.crewId, district: d, data: { a: atk.map(x => x.userId), b: def.map(x => x.userId) } } });
            await sys(tx, me.crewId, `⚔️ ${u.username} declared war on [${defCrew?.tag}] for ${d}. It starts in ${CREW.warPrepMs / 60_000} min and lasts ${CREW.warMs / 60_000} min. Earn money to score!`);
            await sys(tx, turf.crewId, `🚨 [${m!.crew.tag}] ${m!.crew.name} declared war for ${d}! It starts in ${CREW.warPrepMs / 60_000} min. Earn money to defend it!`);
          });
          return NextResponse.json({ ok: true });
        }
        default: return err('Unknown action.');
      }
    } catch (e) {
      const t = (e as Error).message;
      if (t === 'FUNDS') return err("You don't have enough cash.", 402);
      if (t === 'TREASURY') return err('The crew treasury does not have enough money.', 402);
      if (t === 'FULL') return err('The treasury is full.', 409);
      if (t === 'NOCREW') return err('You are not in a crew.', 403);
      if (t === 'NOPERM') return err('Only the leader or officers can do that.', 403);
      if (t === 'NOBOSS') return err('Only the leader can do that.', 403);
      if (unique(e)) return err(act === 'claim' ? 'Someone just claimed that district.' : act === 'join' ? 'You are already in a crew.' : 'That name or tag is taken.', 409);
      throw e;
    }
  } catch (e) { return serverError(e); }
}
