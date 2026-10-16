import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

const MAX_ABS_COORD = 100_000;
const MAX_ROTATION = Math.PI * 2;
const VALID_DISTRICTS = new Set(['Wuse', 'Garki', 'Maitama', 'Jabi', 'Gwarinpa', 'Asokoro']);

function finiteNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== 'object') return err('Invalid position payload.', 400);

  const x = finiteNumber(b.x);
  const z = finiteNumber(b.z);
  const rawR = finiteNumber(b.r);
  if (x === null || z === null || Math.abs(x) > MAX_ABS_COORD || Math.abs(z) > MAX_ABS_COORD) {
    return err('Invalid position coordinates.', 400);
  }
  const r = rawR === null ? 0 : ((rawR % MAX_ROTATION) + MAX_ROTATION) % MAX_ROTATION;
  const districtInput = typeof b.district === 'string' ? b.district.slice(0, 40) : 'Wuse';
  const district = VALID_DISTRICTS.has(districtInput) ? districtInput : 'Wuse';
  const prev = await prisma.playerPosition.findUnique({ where: { userId: u.id } });

  if (prev) {
    const dt = Math.max(0, (Date.now() - prev.updatedAt.getTime()) / 1000);
    // Allow normal movement plus a generous correction margin; reject implausible teleports.
    if (dt < 60 && Math.hypot(x - prev.x, z - prev.z) > dt * 60 + 40) {
      return NextResponse.json({ ok: true, position: prev, corrected: true });
    }
  }

  const row = await prisma.playerPosition.upsert({
    where: { userId: u.id },
    create: { id: u.id, userId: u.id, username: u.username, x, z, r, district, driving: b.driving === true },
    update: { username: u.username, x, z, r, district, driving: b.driving === true },
  });
  return NextResponse.json({ ok: true, position: row });
}

export async function GET() {
  const u = await currentUser();
  if (!u) return err('Not signed in.', 401);
  const now = Date.now();
  const [me, players] = await Promise.all([
    prisma.playerPosition.findUnique({ where: { userId: u.id } }),
    prisma.playerPosition.findMany({
      where: { updatedAt: { gt: new Date(now - 30_000) }, NOT: { userId: u.id } },
      select: { username: true, x: true, z: true, r: true, district: true, driving: true, updatedAt: true },
      take: 100,
      orderBy: { updatedAt: 'desc' },
    }),
  ]);
  return NextResponse.json({ me, players });
}
