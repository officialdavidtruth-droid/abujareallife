import { NextResponse, type NextRequest } from 'next/server';

/* Per-IP rate limit for the whole API, stricter for money / crime routes. Needs Upstash Redis (UPSTASH_REDIS_REST_URL and
   UPSTASH_REDIS_REST_TOKEN). If they are not set this does nothing, so the game keeps working. */
const SENSITIVE = /^\/api\/(casino|market|crime|carjack|rob|holdup|deal|dealer|chop|shop|wallet\/checkout|escort|race)(\/|$)/;
const SKIP = /^\/api\/(wallet\/webhook|livekit|turn)(\/|$)/;

export async function middleware(req: NextRequest) {
  const url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const path = req.nextUrl.pathname;
  if (!url || !token || SKIP.test(path) || req.method === 'OPTIONS') return NextResponse.next();
  const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  const sensitive = SENSITIVE.test(path), max = sensitive ? 60 : 900, bucket = sensitive ? 's' : 'g';
  const k = `rl:api:${bucket}:${ip}:${Math.floor(Date.now() / 60000)}`;
  try {
    const r = await fetch(url.replace(/\/$/, '') + '/pipeline', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify([['INCR', k], ['EXPIRE', k, 70, 'NX']]), cache: 'no-store',
    });
    const n = Number((await r.json())?.[0]?.result);
    if (n > max) return NextResponse.json({ error: 'Too many requests. Slow down.' }, { status: 429, headers: { 'Retry-After': '30' } });
  } catch { /* limiter unavailable: let the request through */ }
  return NextResponse.next();
}
export const config = { matcher: '/api/:path*' };
