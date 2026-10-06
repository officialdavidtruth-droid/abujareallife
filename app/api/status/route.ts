import { NextResponse } from 'next/server';
import { currentUser, err } from '../../../lib/auth';
import { loadState, publicState, tickActivity } from '../../../lib/game';
export const dynamic = 'force-dynamic';
export async function GET() {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
  await tickActivity(u.id, st.save);
  const fresh = await loadState(u.id);
  return NextResponse.json(publicState(fresh || st));
}
