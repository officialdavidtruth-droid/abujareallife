import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, serverError } from '../../../lib/auth';

export const dynamic = 'force-dynamic';
/* The in-game tutorial shows once per account. The flag lives in Save.state.tut (no migration needed; /api/save keeps it). */
const flag = (s: unknown) => ((s || {}) as { tut?: boolean }).tut === true;
export async function GET() {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    const s = await prisma.save.findUnique({ where: { userId: u.id } });
    return NextResponse.json({ done: s ? flag(s.state) : false });
  } catch (e) { return serverError(e); }
}
export async function POST() {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    const s = await prisma.save.findUnique({ where: { userId: u.id } }); if (!s) return err('Create your character first.', 409);
    if (!flag(s.state)) await prisma.save.update({ where: { userId: u.id }, data: { state: { ...((s.state || {}) as object), tut: true } } });
    return NextResponse.json({ done: true });
  } catch (e) { return serverError(e); }
}
