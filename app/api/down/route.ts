import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';
import { loadState } from '../../../lib/game';
import { DOWN_REPEAT_MS, KO_DOWN_MS, downState } from '../../../lib/downed';
export const dynamic = 'force-dynamic';

/* The player's own client reports "I was just knocked out" (fights are still client-side). The server then owns the timer:
   for KO_DOWN_MS you count as out cold (robbable for more), then you get the safe window. To stop anyone from calling this
   on purpose to earn the safe window, a new report is ignored until DOWN_REPEAT_MS after the previous KO ended. */
export async function POST() {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
  if (st.jailLeft) return NextResponse.json({ ok: true, ignored: true });
  const now = Date.now(), until = st.save.downUntil ? st.save.downUntil.getTime() : 0;
  if (now < until + DOWN_REPEAT_MS) return NextResponse.json({ ok: true, ignored: true, ...(downState(st.save.downUntil, now)) });
  const downUntil = new Date(now + KO_DOWN_MS);
  await prisma.save.update({ where: { userId: u.id }, data: { downUntil, downKind: 'ko' } });
  return NextResponse.json({ ok: true, downMs: KO_DOWN_MS });
}
