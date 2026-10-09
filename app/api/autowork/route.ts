import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';
import { CITY } from '../../../lib/cityData';
import { settleAway } from '../../../lib/autowork';
import { shiftJobs } from '../../../lib/work';
export const dynamic = 'force-dynamic';

// Heartbeat from the open game (every ~30 s). The first beat after an absence pays out the shifts the character worked while you were away.
export async function GET(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  // A hidden tab (switched away, minimised, phone locked) counts as away: do not refresh seenAt, so the time keeps adding up
  // and the first beat after the player looks at the game again pays the shifts the character worked in the meantime.
  if (new URL(req.url).searchParams.get('hidden') === '1') return NextResponse.json({ ok: true, hidden: true });
  const away = await settleAway(u.id).catch(() => null);
  await prisma.save.updateMany({ where: { userId: u.id }, data: { seenAt: new Date() } });
  const s = await prisma.save.findUnique({ where: { userId: u.id }, select: { freeWill: true, workBiz: true, workJob: true, cash: true } });
  if (!s) return err('Create your character first.', 409);
  const biz = s.workBiz ? CITY.businesses.find(b => b.id === s.workBiz) : null, job = biz && s.workJob != null ? shiftJobs(biz)[s.workJob] : null;
  return NextResponse.json({ ok: true, freeWill: s.freeWill, cash: s.cash, away, work: biz && job ? { bizId: biz.id, idx: s.workJob, name: biz.name, job: job.title, x: biz.x, z: biz.z } : null });
}

export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({}));
  if (typeof b.freeWill === 'boolean') await prisma.save.updateMany({ where: { userId: u.id }, data: { freeWill: b.freeWill, seenAt: new Date() } });
  return NextResponse.json({ ok: true });
}