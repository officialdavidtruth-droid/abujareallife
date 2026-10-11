import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { currentUser, err, serverError } from '../../../../lib/auth';
import { defaultHomeLook, packHomeLook, sanitizeHomeLook } from '../../../../lib/homeLook';
import { resolveHome } from '../../../../lib/housemates';

/* The player's home layout (where each piece stands) and home look (wall paint, floor, rug, sofa, bedding, bed frame).
   Stored as the metadata of one hidden inventory row, next to the furniture list kept by /api/home/furniture. */
type T = { x: number; z: number; r: number };
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const valid = (v: unknown): v is T => !!v && typeof v === 'object' && ['x', 'z', 'r'].every(k => num((v as Record<string, unknown>)[k]));
const KEY = 'home_layout';
export const dynamic = 'force-dynamic';
const meta = (m: unknown): Record<string, unknown> => (m && typeof m === 'object' && !Array.isArray(m) ? m as Record<string, unknown> : {});

export async function GET() {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    const h = await resolveHome(u.id, u.username);   // housemates share the owner's layout and look
    const r = await prisma.inventoryItem.findUnique({ where: { userId_itemKey: { userId: h.id, itemKey: KEY } }, select: { metadata: true } });
    const m = meta(r?.metadata), dflt = defaultHomeLook(h.username);
    return NextResponse.json({
      layout: m.layout && typeof m.layout === 'object' ? m.layout : {},
      soldStatic: Array.isArray(m.soldStatic) ? m.soldStatic : [],
      look: packHomeLook(sanitizeHomeLook(m.look, dflt)),
    });
  } catch (e) { return serverError(e); }
}

export async function PUT(req: Request) {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    const b = await req.json().catch(() => ({}));
    if (!b.layout || typeof b.layout !== 'object' || Array.isArray(b.layout)) return err('Invalid home layout.', 400);
    const h = await resolveHome(u.id, u.username);
    const r = await prisma.inventoryItem.findUnique({ where: { userId_itemKey: { userId: h.id, itemKey: KEY } }, select: { metadata: true } });
    const old = meta(r?.metadata), layout: Record<string, T> = {};
    for (const [id, t] of Object.entries(b.layout as Record<string, unknown>)) if (valid(t)) layout[String(id).slice(0, 64)] = { x: t.x, z: t.z, r: t.r };
    const next: Record<string, unknown> = { ...old, layout };
    if (b.look !== undefined) next.look = packHomeLook(sanitizeHomeLook(b.look, defaultHomeLook(h.username)));
    const meta2 = next as never;
    await prisma.inventoryItem.upsert({ where: { userId_itemKey: { userId: h.id, itemKey: KEY } }, update: { metadata: meta2 }, create: { userId: h.id, itemKey: KEY, name: 'Home layout', quantity: 1, metadata: meta2 } });
    return NextResponse.json({ ok: true, layout, look: next.look ?? null });
  } catch (e) { return serverError(e); }
}
