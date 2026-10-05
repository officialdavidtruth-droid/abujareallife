import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';

export const dynamic = 'force-dynamic';
export async function GET() {
  const u = await currentUser();
  if (!u) return err('Not signed in.', 401);
  const s = await prisma.save.findUnique({ where: { userId: u.id } });
  return NextResponse.json({ save: s ? { look: s.look, state: s.state, cash: s.cash } : null });
}
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
export async function PUT(req: Request) {
  const u = await currentUser();
  if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({}));
  const l = b.look || {}, st = b.state || {}, n = st.needs || {};
  const look = { name: u.username, model: String(l.model || 'xbot').slice(0, 30), skin: /^#[0-9a-f]{6}$/i.test(l.skin) ? l.skin : '#8b552f', outfit: /^#[0-9a-f]{6}$/i.test(l.outfit) ? l.outfit : '#126c4b', height: num(l.height, .9, 1.1, 1) };
  const state = { needs: Object.fromEntries(['hunger', 'energy', 'hygiene', 'bladder', 'fun', 'social'].map(k => [k, num(n[k], 0, 100, 60)])), min: num(st.min, 0, 1e7, 480) }; // cash is server-owned: see /api/economy
  await prisma.save.upsert({ where: { userId: u.id }, create: { userId: u.id, look, state }, update: { look, state } });
  return NextResponse.json({ ok: true });
}
