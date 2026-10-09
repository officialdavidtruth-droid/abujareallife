import { NextResponse } from 'next/server';
import { currentUser, publicUser } from '../../../../lib/auth';
export const dynamic = 'force-dynamic';
export async function GET() { try { const u = await currentUser(); return NextResponse.json({ user: u ? publicUser(u) : null }); } catch { return NextResponse.json({ user: null, error: 'db' }, { status: 503 }); } }
