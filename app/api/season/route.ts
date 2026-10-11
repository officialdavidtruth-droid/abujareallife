import { NextResponse } from 'next/server';
import { currentUser, err, serverError } from '../../../lib/auth';
import { BOARDS, isBoard, seasonAt } from '../../../lib/season';
import { seasonStandings } from '../../../lib/seasonServer';
export const dynamic = 'force-dynamic';

// GET /api/season?board=fame  → this season's clock, the list of boards, and one board's top 30 with your own rank.
export async function GET(req: Request) {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.', 401);
    const q = new URL(req.url).searchParams.get('board'), board = isBoard(q) ? q : 'fame', s = seasonAt();
    const { top, me } = await seasonStandings(board, s.index, u.id);
    return NextResponse.json({ season: s, boards: Object.values(BOARDS), board, top, me });
  } catch (e) { return serverError(e); }
}
