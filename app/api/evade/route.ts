import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, throttled } from '../../../lib/auth';
import { loadState } from '../../../lib/game';
import { EVADE_HEAT, EVADE_MIN_MS } from '../../../lib/profile';
export const dynamic = 'force-dynamic';

/* Step 6: you broke line of sight and the NPC police lost you. The client owns positions and reports it; the server only
   allows a small, rate-limited cool-down (EVADE_HEAT per EVADE_MIN_MS, on top of the normal 3 heat per minute), so a lying
   client can shave heat no faster than a player who really is hiding. heatAt is left alone so the normal decay clock keeps running. */
export async function POST() {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
  if (st.jailLeft || st.save.heat <= 0) return NextResponse.json({ ok: false, heat: st.save.heat });
  if (throttled('evade:' + u.id, 1, EVADE_MIN_MS)) return NextResponse.json({ ok: false, heat: st.save.heat, reason: 'too-soon' });
  const heat = Math.max(0, st.save.heat - EVADE_HEAT);
  await prisma.save.update({ where: { userId: u.id }, data: { heat } });
  return NextResponse.json({ ok: true, heat });
}
