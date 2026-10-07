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
let cache: { at: number; ice: Ice[]; provider: string; error: string } | null = null;
const STUN: Ice = { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] };

// Returns the relay servers plus which provider answered, or why none did (so a wrong key is visible instead of silently falling back to STUN only).
async function fetchRelay(): Promise<{ ice: Ice[]; provider: string; error: string }> {
  const { METERED_DOMAIN, METERED_API_KEY, CF_TURN_KEY_ID, CF_TURN_API_TOKEN, TURN_URL, TURN_USERNAME, TURN_CREDENTIAL } = process.env;
  const errs: string[] = [];
  if (METERED_DOMAIN && METERED_API_KEY) {
    try {
      const r = await fetch(`https://${METERED_DOMAIN.replace(/^https?:\/\//, '')}/api/v1/turn/credentials?apiKey=${encodeURIComponent(METERED_API_KEY)}`, { cache: 'no-store' });
      if (r.ok) { const d = await r.json(); if (Array.isArray(d) && d.length) return { ice: d as Ice[], provider: 'metered', error: '' }; errs.push('metered: empty answer'); } else errs.push(`metered: HTTP ${r.status} (check METERED_DOMAIN / METERED_API_KEY)`);
    } catch { errs.push('metered: network error'); }
  }
  if (CF_TURN_KEY_ID && CF_TURN_API_TOKEN) {
    try {
      const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${CF_TURN_KEY_ID}/credentials/generate-ice-servers`, { method: 'POST', headers: { Authorization: `Bearer ${CF_TURN_API_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ ttl: 86400 }), cache: 'no-store' });
      if (r.ok) { const d = await r.json(); const l = d.iceServers; if (Array.isArray(l) && l.length) return { ice: l as Ice[], provider: 'cloudflare', error: '' }; if (l) return { ice: [l as Ice], provider: 'cloudflare', error: '' }; errs.push('cloudflare: empty answer'); } else errs.push(`cloudflare: HTTP ${r.status} (check CF_TURN_KEY_ID / CF_TURN_API_TOKEN)`);
    } catch { errs.push('cloudflare: network error'); }
  }
  if (TURN_URL) return { ice: [{ urls: TURN_URL.split(',').map(x => x.trim()).filter(Boolean), username: TURN_USERNAME, credential: TURN_CREDENTIAL }], provider: 'custom', error: '' };
  return { ice: [], provider: 'none', error: errs.join(' | ') || 'no TURN variables set on the server (METERED_*, CF_TURN_* or TURN_*)' };
}
// Open /api/turn while signed in to check your setup: "relay": true means phone-network calls will work.
export async function GET() {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const ttl = cache && cache.provider !== 'none' ? 10 * 60_000 : 30_000; // a failure is retried after 30 s instead of being remembered for 10 minutes
  if (!cache || Date.now() - cache.at > ttl) { const r = await fetchRelay(); cache = { at: Date.now(), ice: [STUN, ...r.ice], provider: r.provider, error: r.error }; }
  return NextResponse.json({ iceServers: cache.ice, relay: cache.ice.length > 1, provider: cache.provider, ...(cache.error ? { error: cache.error } : {}) });
}
