import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';
export async function POST(req: Request) { // invite another player into a building
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({})), to = String(b.to || '').trim().toLowerCase(), building = String(b.building || '').slice(0, 60);
  if (!to || !building || to === u.username.toLowerCase()) return err('Pick another player and a building.');
  if (!(await prisma.user.findUnique({ where: { usernameKey: to } }))) return err('No such player.');
  await prisma.invite.upsert({ where: { toName_building: { toName: to, building } }, create: { fromId: u.id, toName: to, building }, update: {} });
  return NextResponse.json({ ok: true });
}
