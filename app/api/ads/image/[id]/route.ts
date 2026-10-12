import { prisma } from '../../../../../lib/prisma';
import { currentAdvertiser, isAdAdmin } from '../../../../../lib/adAuth';
export const dynamic = 'force-dynamic';

/* Serves a billboard flyer. Approved ads are public (the 3D city loads them, cached for an hour); a flyer that is still waiting for review
   can only be opened by the advertiser who uploaded it and by admins. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9]{10,40}$/.test(id)) return new Response('Not found', { status: 404 });
  try {
    const b = await prisma.adBooking.findUnique({ where: { id }, select: { status: true, accountId: true, hasImage: true } });
    if (!b || !b.hasImage) return new Response('Not found', { status: 404 });
    let cache = 'public, max-age=3600, s-maxage=3600';
    if (b.status !== 'APPROVED') {
      const me = await currentAdvertiser();
      if (!me || (me.id !== b.accountId && !isAdAdmin(me.email))) return new Response('Not found', { status: 404 });
      cache = 'private, no-store';
    }
    const img = await prisma.adImage.findUnique({ where: { bookingId: id } });
    if (!img) return new Response('Not found', { status: 404 });
    return new Response(new Uint8Array(img.data), { headers: { 'content-type': img.mime, 'cache-control': cache, 'x-content-type-options': 'nosniff' } });
  } catch { return new Response('Server error', { status: 500 }); }
}
