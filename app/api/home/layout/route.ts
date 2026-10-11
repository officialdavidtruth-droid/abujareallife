import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { currentUser, err, serverError } from '../../../../lib/auth';
import { defaultHomeLook, packHomeLook, sanitizeHomeLook } from '../../../../lib/homeLook';
import { resolveHome, resolveView } from '../../../../lib/housemates';
import { HOME_KEY, HomeBusy, editHome } from '../../../../lib/homeStore';
import { ensureFurniture } from '../../../../lib/homeFurniture';

/* The player's home layout (where each piece stands) and home look (wall paint, floor, rug, sofa, bedding, bed frame).
   Stored as the metadata of one hidden inventory row, next to the furniture list kept by /api/home/furniture. */
type T = { x: number; z: number; r: number };
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const valid = (v: unknown): v is T => !!v && typeof v === 'object' && ['x', 'z', 'r'].every(k => num((v as Record<string, unknown>)[k]));
const KEY = HOME_KEY;
export const dynamic = 'force-dynamic';
const meta = (m: unknown): Record<string, unknown> => (m && typeof m === 'object' && !Array.isArray(m) ? m as Record<string, unknown> : {});

export async function GET(req: Request) {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    const h = await resolveView(u.id, u.username, new URL(req.url).searchParams.get('visit')); if (!h) return err('You are not welcome there.', 403);   // housemates share the owner's layout and look
    const r = await prisma.inventoryItem.findUnique({ where: { userId_itemKey: { userId: h.id, itemKey: KEY } }, select: { metadata: true } });
    const m = meta(r?.metadata), dflt = defaultHomeLook(h.username);
    return NextResponse.json({
      layout: m.layout && typeof m.layout === 'object' ? m.layout : {},
      soldStatic: Array.isArray(m.soldStatic) ? m.soldStatic : [],
      look: packHomeLook(sanitizeHomeLook(m.look, dflt)),
    });
  } catch (e) { return serverError(e); }
}

const same = (a: T | undefined, b: T | undefined) => (!a && !b) || (!!a && !!b && a.x === b.x && a.z === b.z && a.r === b.r);
const cleanLayout = (raw: unknown): Record<string, T> => { const out: Record<string, T> = {}; if (raw && typeof raw === 'object' && !Array.isArray(raw)) for (const [id, t] of Object.entries(raw as Record<string, unknown>)) if (valid(t)) out[String(id).slice(0, 64)] = { x: t.x, z: t.z, r: t.r }; return out; };

/* Saving the layout (HOME-SAVE.md). The client sends what it wants (`layout`, `look`) plus, when it can, `base`: the layout and look it LOADED.
   With a base the server merges instead of overwriting: only the pieces this client actually moved (layout[id] differs from base[id]) and only the look
   fields it actually changed are applied on top of the house's CURRENT data, so a housemate's moves saved a moment earlier survive. Without a base (old
   clients) it replaces the layout as before. Either way the write is atomic (lib/homeStore.ts) and retried if someone else saved in between. */
export async function PUT(req: Request) {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    const b = await req.json().catch(() => ({}));
    if (!b.layout || typeof b.layout !== 'object' || Array.isArray(b.layout)) return err('Invalid home layout.', 400);
    const h = await resolveHome(u.id, u.username), dflt = defaultHomeLook(h.username);
    const mine = cleanLayout(b.layout), hasBase = !!b.base && typeof b.base === 'object' && !!b.base.layout && typeof b.base.layout === 'object';
    const base = hasBase ? cleanLayout(b.base.layout) : null;
    const myLook = b.look !== undefined ? sanitizeHomeLook(b.look, dflt) : null, baseLook = hasBase && b.base.look !== undefined ? sanitizeHomeLook(b.base.look, dflt) : null;
    await ensureFurniture(h.id);
    const placed = new Set<string>((await prisma.homeFurniture.findMany({ where: { homeId: h.id }, select: { id: true } })).map((r: { id: string }) => r.id));   // ids of placed pieces right now
    let outLayout: Record<string, T> = {}, outLook: unknown = null;
    try {
      await editHome(h.id, m => {
        const cur = cleanLayout(m.layout), owned = placed, sold = new Set(Array.isArray(m.soldStatic) ? m.soldStatic.map(String) : []);
        let layout: Record<string, T>;
        if (!base) layout = mine;
        else {
          layout = { ...cur };
          for (const id of new Set([...Object.keys(mine), ...Object.keys(base)])) {
            if (same(mine[id], base[id])) continue;                 // this client did not touch it: keep what the house has now
            if (sold.has(id)) continue;                              // a fixture sold meanwhile stays gone
            if (/^[a-z0-9]{14,}$/.test(id) && !owned.has(id)) continue;   // a placed piece that was stored or sold meanwhile does not come back
            if (mine[id]) layout[id] = mine[id]; else delete layout[id];
          }
        }
        const next: Record<string, unknown> = { ...m, layout };
        if (myLook) {
          const curLook = sanitizeHomeLook(m.look, dflt);
          const merged = baseLook ? (Object.fromEntries((Object.keys(curLook) as (keyof typeof curLook)[]).map(k => [k, myLook[k] !== baseLook[k] ? myLook[k] : curLook[k]])) as typeof curLook) : myLook;
          next.look = packHomeLook(merged);
        }
        outLayout = layout; outLook = next.look ?? m.look ?? null;
        return next;
      });
    } catch (e) { if (e instanceof HomeBusy) return err(e.message, 503); throw e; }
    return NextResponse.json({ ok: true, layout: outLayout, look: outLook });
  } catch (e) { return serverError(e); }
}
