import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, serverError } from '../../../lib/auth';
import { sanitizeLook } from '../../../lib/characterModels';
import { itemById } from '../../../lib/catalog';
import { accOf } from '../../../lib/fashionWear';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const u = await currentUser();
    if (!u) return err('Not signed in.', 401);
    const s = await prisma.save.findUnique({ where: { userId: u.id } });
    return NextResponse.json({ save: s ? { look: s.look, state: s.state, cash: s.cash, profile: s.profile, heat: s.heat } : null });
  } catch (e) { return serverError(e); }
}
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
export async function PUT(req: Request) {
  const u = await currentUser();
  if (!u) return err('Not signed in.', 401);
  const b = await req.json().catch(() => ({}));
  const l = b.look || {}, st = b.state || {}, n = st.needs || {};
  const look = sanitizeLook(l, u.username);
  if (look.worn?.length || look.shoeStyle || look.acc?.length) { // bought shoes / clothes can only be worn if they are in your bag
    const have = new Set(((await prisma.inventoryItem.findMany({ where: { userId: u.id, itemKey: { in: look.worn || [] }, quantity: { gt: 0 } }, select: { itemKey: true } })) as { itemKey: string }[]).map(r => r.itemKey));
    look.worn = (look.worn || []).filter(id => have.has(id));
    const shoeOwned = look.worn.some(id => { const it = itemById(id); return it?.cat === 'fashion' && it.sub?.startsWith('Shoes') && it.col === look.shoeColor; });
    if (!shoeOwned) { delete look.shoeColor; delete look.shoeStyle; }
    const okAcc = new Set(look.worn.map(id => { const it = itemById(id); return it ? accOf(it) : null; }).filter(Boolean) as string[]);
    look.acc = (look.acc || []).filter(a => okAcc.has(a));
  }
  const state = { needs: Object.fromEntries(['hunger', 'energy', 'hygiene', 'bladder', 'fun', 'social'].map(k => [k, num(n[k], 0, 100, 60)])), min: num(st.min, 0, 1e7, 480), bonds: Object.fromEntries(['spouse', 'chidi', 'amara'].map(k => [k, num((st.bonds || {})[k], 0, 100, 30)])), family: false }; // cash is server-owned: see /api/economy
  if (!(await prisma.save.findUnique({ where: { userId: u.id } }))) return err('Create your character through /api/profile first.', 409);
  await prisma.save.update({ where: { userId: u.id }, data: { look, state } });
  return NextResponse.json({ ok: true });
}
