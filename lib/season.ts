// Seasons: fixed-length competitive periods with their own leaderboards. Pure maths, safe on client and server.
// A season is SEASON_DAYS long and starts at Monday 00:00 Nigerian time (WAT, UTC+1), counted from the same anchor week as the world clock.
export const SEASON_DAYS = 28;
const ANCHOR = Date.UTC(2026, 0, 4, 23, 0, 0);   // Mon 5 Jan 2026 00:00 WAT = season 1, day 1
const LEN = SEASON_DAYS * 86_400_000;

export function seasonAt(now: number = Date.now()) {
  const index = Math.floor((now - ANCHOR) / LEN) + 1, startsAt = ANCHOR + (index - 1) * LEN, endsAt = startsAt + LEN;
  return { index, name: `Season ${index}`, startsAt, endsAt, msLeft: Math.max(0, endsAt - now), day: Math.floor((now - startsAt) / 86_400_000) + 1 };
}

export type BoardId = 'fame';   // later steps add 'race' and 'crew'
export const BOARDS: Record<BoardId, { id: BoardId; label: string; icon: string; unit: string; lowerIsBetter: boolean; blurb: string }> = {
  fame: { id: 'fame', label: 'Fame gained', icon: '⭐', unit: 'fame', lowerIsBetter: false, blurb: 'Fame you earn during this season (not your lifetime total).' },
};
export const isBoard = (x: unknown): x is BoardId => typeof x === 'string' && x in BOARDS;
