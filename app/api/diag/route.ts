import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser } from '../../../lib/auth';
export const dynamic = 'force-dynamic';

// Setup check: open /api/diag while signed in. Shows only yes/no values, never secrets.
export async function GET() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: 'Sign in to the game first, then open this page again.' }, { status: 401 });
  const has = (k: string) => !!(process.env[k] && process.env[k]!.trim());
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  let messageTable = 'ok';
  try { await prisma.message.count(); } catch (e) { messageTable = 'FAILED: ' + ((e as { code?: string }).code || (e as Error).message || 'unknown').toString().slice(0, 120); }
  return NextResponse.json({
    signedInAs: u.username,
    supabaseUrlSet: has('NEXT_PUBLIC_SUPABASE_URL'),
    supabaseUrlLooksRight: /^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url.trim()),
    supabaseAnonKeySet: has('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    voiceMode: process.env.NEXT_PUBLIC_VOICE || '(livekit)',
    livekitUrlSet: has('LIVEKIT_URL'),
    livekitUrlStartsWithWss: (process.env.LIVEKIT_URL || '').trim().startsWith('wss://'),
    livekitKeySet: has('LIVEKIT_API_KEY'),
    livekitSecretSet: has('LIVEKIT_API_SECRET'),
    messageTable,
  }, { headers: { 'cache-control': 'no-store' } });
}
