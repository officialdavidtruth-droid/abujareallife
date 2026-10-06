import { NextResponse } from 'next/server';
import { currentUser, err } from '../../../lib/auth';
import { loadState, publicState } from '../../../lib/game';
export const dynamic = 'force-dynamic';
export async function GET() {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const st = await loadState(u.id); if (!st) return err('Create your character first.', 409);
  return NextResponse.json(publicState(st));
}
