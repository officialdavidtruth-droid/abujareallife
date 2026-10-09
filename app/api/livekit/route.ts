import { NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { currentUser, err, serverError, throttled } from '../../../lib/auth';
import { CITY } from '../../../lib/cityData';
export const dynamic = 'force-dynamic';

// Signs a LiveKit join token for the signed-in player. Env (Vercel): LIVEKIT_URL (wss://<project>.livekit.cloud), LIVEKIT_API_KEY, LIVEKIT_API_SECRET.
// Body { room: 'city' | 'bld:<businessId>' } -> one LiveKit room for the open city and one per building. Identity = username, so nobody can join as someone else.
export async function POST(req: Request) {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    const url = process.env.LIVEKIT_URL, key = process.env.LIVEKIT_API_KEY, secret = process.env.LIVEKIT_API_SECRET;
    if (!url || !key || !secret) return err('Voice server is not configured (set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET).', 503);
    if (throttled('lk:' + u.id, 30, 10 * 60_000)) return err('Slow down.', 429);
    const b = await req.json().catch(() => ({})), want = String(b.room || 'city');
    let room = 'arl-city';
    if (want.startsWith('bld:')) { const id = want.slice(4); if (!CITY.businesses.some(x => x.id === id)) return err('Unknown building.', 400); room = `arl-bld-${id}`; }
    else if (want !== 'city') return err('Unknown voice room.', 400);
    const at = new AccessToken(key, secret, { identity: u.username, name: u.username, ttl: '6h' });
    at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: false });
    return NextResponse.json({ ok: true, url, room, token: await at.toJwt() });
  } catch (e) { return serverError(e); }
}
