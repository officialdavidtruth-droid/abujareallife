import { NextResponse } from 'next/server';
import { currentUser, err } from '../../../lib/auth';
// Hands signed-in players the relay (TURN) credentials for voice calls. On mobile data (MTN / Airtel / Glo) direct
// peer-to-peer usually cannot connect, so without a relay calls get stuck on "Connecting…". Configure ONE of these in Vercel:
//   A) Metered.ca:    METERED_DOMAIN (e.g. yourapp.metered.live) + METERED_API_KEY
//   B) Cloudflare:    CF_TURN_KEY_ID + CF_TURN_API_TOKEN
//   C) Any TURN host: TURN_URL (comma separated) + TURN_USERNAME + TURN_CREDENTIAL
// With none set, calls still try Google STUN (works on most Wi-Fi).
export const dynamic = 'force-dynamic';
type Ice = { urls: string | string[]; username?: string; credential?: string };
let cache: { at: number; ice: Ice[] } | null = null;
const STUN: Ice = { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] };

async function fetchRelay(): Promise<Ice[]> {
  const { METERED_DOMAIN, METERED_API_KEY, CF_TURN_KEY_ID, CF_TURN_API_TOKEN, TURN_URL, TURN_USERNAME, TURN_CREDENTIAL } = process.env;
  try {
    if (METERED_DOMAIN && METERED_API_KEY) {
      const r = await fetch(`https://${METERED_DOMAIN}/api/v1/turn/credentials?apiKey=${encodeURIComponent(METERED_API_KEY)}`, { cache: 'no-store' });
      if (r.ok) { const d = await r.json(); if (Array.isArray(d)) return d as Ice[]; }
    }
    if (CF_TURN_KEY_ID && CF_TURN_API_TOKEN) {
      const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${CF_TURN_KEY_ID}/credentials/generate-ice-servers`, { method: 'POST', headers: { Authorization: `Bearer ${CF_TURN_API_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ ttl: 86400 }), cache: 'no-store' });
      if (r.ok) { const d = await r.json(); const l = d.iceServers; if (Array.isArray(l)) return l as Ice[]; if (l) return [l as Ice]; }
    }
    if (TURN_URL) return [{ urls: TURN_URL.split(',').map(x => x.trim()).filter(Boolean), username: TURN_USERNAME, credential: TURN_CREDENTIAL }];
  } catch { /* fall through to STUN only */ }
  return [];
}
export async function GET() {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  if (!cache || Date.now() - cache.at > 10 * 60_000) { const relay = await fetchRelay(); cache = { at: Date.now(), ice: [STUN, ...relay] }; }
  return NextResponse.json({ iceServers: cache.ice, relay: cache.ice.length > 1 });
}
