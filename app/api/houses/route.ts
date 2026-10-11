import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err, serverError } from '../../../lib/auth';
import { PLOT_COUNT } from '../../../lib/houses';
// Player houses on the street. Plots are handed out in sign-up order (the first PLOT_COUNT accounts get one), so nobody has to be stored or migrated:
// the same account always gets the same plot as long as the accounts before it still exist. The 3D geometry lives in lib/houses.ts.
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    const rows: { id: string; username: string; origin: string | null }[] = await prisma.user.findMany({ select: { id: true, username: true, origin: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: PLOT_COUNT });
    // how each house looks (lib/houseStyle.ts): one hidden inventory row per account that customised its house; everybody else shows the default for their origin
    const styled: { userId: string; metadata: unknown }[] = await prisma.inventoryItem.findMany({ where: { itemKey: 'home_style', userId: { in: rows.map(r => r.id) } }, select: { userId: true, metadata: true } });
    const code = new Map(styled.map(x => [x.userId, (x.metadata as { s?: unknown } | null)?.s]));
    return NextResponse.json({ houses: rows.map((r, slot) => ({ slot, u: r.username, o: r.origin === 'NEPO' ? 'NEPO' : 'LAPO', s: typeof code.get(r.id) === 'string' ? code.get(r.id) : undefined })), mine: rows.findIndex(r => r.id === u.id), capacity: PLOT_COUNT });
  } catch (e) { return serverError(e); }
}
