import { prisma } from '../../../../../lib/prisma';
import { currentAdvertiser, isAdAdmin } from '../../../../../lib/adAuth';
export const dynamic = 'force-dynamic';

/* Serves a billboard flyer. Approved ads are public (the 3D city loads them, cached for an hour); a flyer that is still waiting for review
   can only be opened by the advertiser who uploaded it and by admins. Every failure says why in plain text, so opening the link in a browser tells you what is wrong. */
const text = (msg: string, status: number) => new Response(msg, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9]{10,40}$/.test(id)) return text('Flyer error: bad id.', 404);
  try {
    const b = await prisma.adBooking.findUnique({ where: { id }, select: { status: true, accountId: true, hasImage: true } });
    if (!b) return text('Flyer error: no booking with this id.', 404);
    if (!b.hasImage) return text('Flyer error: this ad has no flyer.', 404);
    let cache = 'public, max-age=3600, s-maxage=3600';
    if (b.status !== 'APPROVED') {
      const me = await currentAdvertiser();
      if (!me || (me.id !== b.accountId && !isAdAdmin(me.email))) return text('Flyer error: not available (log in as the advertiser or an admin).', 404);
      cache = 'private, no-store';
    }
    const img = await prisma.adImage.findUnique({ where: { bookingId: id } });
    if (!img) return text('Flyer error: the booking says it has a flyer but the picture row is missing.', 404);
    const bytes = new Uint8Array(img.data);
    if (bytes.length < 1000) return text('Flyer error: the stored picture is empty (' + bytes.length + ' bytes).', 500);
    return new Response(bytes, { headers: { 'content-type': img.mime || 'image/jpeg', 'content-length': String(bytes.length), 'cache-control': cache, 'x-content-type-options': 'nosniff' } });
  } catch (e) { console.error('[ads/image]', e); return text('Flyer error: server (' + String((e as { code?: string }).code || (e as Error).name || 'unknown') + ').', 500); }
}
