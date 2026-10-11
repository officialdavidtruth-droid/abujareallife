/* Build mode: the floor plan as data. (Positions may be tenths of a metre so new rooms can sit flush against the original flat, whose walls are not on whole metres; the size of a NEW room is always whole tiles.)
   Step 1 notes: Pure functions (no React / three / database), shared by the server (app/api/home/rooms) and later by the 3D house.
   The house sits on a grid of 1 m tiles. A room is a rectangle of whole tiles; world metres = tile numbers (a room at x 2, w 3 covers world x 2 to 5).
   Houses with no saved rooms keep the old fixed floor plan until a later step converts them. */
export const GRID = { x0: -30, x1: 30, z0: -30, z1: 30 };   // metres allowed: x0 <= x < x1, z0 <= z < z1
export const MIN_SIDE = 2, MAX_SIDE = 8, MAX_ROOMS = 24, MAX_TILES = 600;
export const PER_TILE = 120_000, REFUND = 0.6;   // naira per tile; demolishing returns 60% of what that room cost

export type RoomType = 'bedroom' | 'kitchen' | 'bathroom' | 'living' | 'gym' | 'cinema' | 'office' | 'empty';
export const ROOM_TYPES: Record<RoomType, { name: string; e: string; fee: number; min: [number, number] }> = {
  living:   { name: 'Living room', e: '🛋️', fee: 500_000,   min: [3, 3] },
  bedroom:  { name: 'Bedroom',     e: '🛏️', fee: 600_000,   min: [3, 3] },
  kitchen:  { name: 'Kitchen',     e: '🍳', fee: 1_500_000, min: [2, 3] },
  bathroom: { name: 'Bathroom',    e: '🚿', fee: 1_200_000, min: [2, 2] },
  gym:      { name: 'Gym',         e: '🏋️', fee: 2_000_000, min: [3, 4] },
  cinema:   { name: 'Cinema',      e: '🎬', fee: 3_500_000, min: [4, 4] },
  office:   { name: 'Office',      e: '📚', fee: 2_500_000, min: [3, 3] },
  empty:    { name: 'Empty room',  e: '⬜', fee: 0,         min: [2, 2] },
};
export const isRoomType = (t: unknown): t is RoomType => typeof t === 'string' && Object.prototype.hasOwnProperty.call(ROOM_TYPES, t);

export type Room = { id: string; type: RoomType; x: number; z: number; w: number; d: number; cost?: number };
export type NewRoom = Pick<Room, 'type' | 'x' | 'z' | 'w' | 'd'>;

export const area = (r: Pick<Room, 'w' | 'd'>) => r.w * r.d;
export const roomCost = (type: RoomType, w: number, d: number) => w * d * PER_TILE + ROOM_TYPES[type].fee;
export const refundFor = (cost: number) => Math.round(cost * REFUND);
/** World-metre footprint [x0, x1, z0, z1] (the same Box shape lib/collision.ts uses). */
export const worldBox = (r: Pick<Room, 'x' | 'z' | 'w' | 'd'>): [number, number, number, number] => [r.x, r.x + r.w, r.z, r.z + r.d];

const q = (v: number) => Math.round(v * 10);   // everything is compared in tenths of a metre, so 6.2 + 5.2 never disagrees with 11.4 by rounding
const isTenth = (v: number) => Number.isFinite(v) && Math.abs(v * 10 - Math.round(v * 10)) < 1e-6;
const overlap = (a: NewRoom, b: NewRoom) => q(a.x) < q(b.x + b.w) && q(a.x + a.w) > q(b.x) && q(a.z) < q(b.z + b.d) && q(a.z + a.d) > q(b.z);
export const hitsRoom = (rooms: Room[], n: NewRoom) => rooms.some(r => overlap(r, n));
/** Do the two rectangles share a stretch of wall at least one metre long (touching, not overlapping)? */
export function sharesWall(a: NewRoom, b: NewRoom): boolean {
  const zov = Math.min(q(a.z + a.d), q(b.z + b.d)) - Math.max(q(a.z), q(b.z)), xov = Math.min(q(a.x + a.w), q(b.x + b.w)) - Math.max(q(a.x), q(b.x));
  return ((q(a.x + a.w) === q(b.x) || q(b.x + b.w) === q(a.x)) && zov >= 10) || ((q(a.z + a.d) === q(b.z) || q(b.z + b.d) === q(a.z)) && xov >= 10);
}

/** Why this room cannot be built here, or null when it can. */
export function checkBuild(rooms: Room[], n: NewRoom): string | null {
  if (!isRoomType(n.type)) return 'Pick a room type.';
  if (!isTenth(n.x) || !isTenth(n.z) || !Number.isInteger(n.w) || !Number.isInteger(n.d)) return 'Rooms are made of whole tiles.';
  if (n.w < MIN_SIDE || n.d < MIN_SIDE) return `A room must be at least ${MIN_SIDE} x ${MIN_SIDE} tiles.`;
  if (n.w > MAX_SIDE || n.d > MAX_SIDE) return `A room can be at most ${MAX_SIDE} x ${MAX_SIDE} tiles.`;
  const [mw, md] = ROOM_TYPES[n.type].min;
  if (!((n.w >= mw && n.d >= md) || (n.w >= md && n.d >= mw))) return `A ${ROOM_TYPES[n.type].name.toLowerCase()} needs at least ${mw} x ${md} tiles.`;
  if (n.x < GRID.x0 || n.z < GRID.z0 || n.x + n.w > GRID.x1 || n.z + n.d > GRID.z1) return 'That is off the edge of your plot.';
  if (rooms.length >= MAX_ROOMS) return `A house can have at most ${MAX_ROOMS} rooms.`;
  if (rooms.reduce((s, r) => s + area(r), 0) + area(n) > MAX_TILES) return 'Your plot is full.';
  if (rooms.some(r => overlap(r, n))) return 'That overlaps another room.';
  if (rooms.length && !rooms.some(r => sharesWall(r, n))) return 'Place it right next to an existing room (they must share a wall).';
  return null;
}

/** Every room reachable from the first one through shared walls? (A demolition must not cut the house in two.) */
export function connected(rooms: Room[]): boolean {
  if (rooms.length < 2) return true;
  const seen = new Set([rooms[0].id]), todo = [rooms[0]];
  while (todo.length) { const c = todo.pop()!; for (const r of rooms) if (!seen.has(r.id) && sharesWall(c, r)) { seen.add(r.id); todo.push(r); } }
  return seen.size === rooms.length;
}
export const isStarter = (r: Pick<Room, 'id'>) => r.id.startsWith('legacy-');   // the three parts of the original flat
/** How a house is drawn: 'none' = no saved rooms (old fixed flat), 'starter' = the original flat as rooms (old look and fixtures), possibly with new rooms around it, 'free' = only rooms the player built. */
export const planMode = (rooms: Room[]): 'none' | 'starter' | 'free' => (!rooms.length ? 'none' : rooms.some(r => r.id === 'legacy-main') ? 'starter' : 'free');
/** The original flat as rooms, exactly where its walls always were (so every fixture stays where it is). Wings exist only if the player owns them. */
export function starterRooms(owns: (upgrade: string) => boolean): Room[] {
  const out: Room[] = [{ id: 'legacy-main', type: 'living', x: -6.2, z: -4.6, w: 12.4, d: 9.2 }];
  if (owns('kids_room')) out.push({ id: 'legacy-wing', type: 'bedroom', x: 6.2, z: -4.6, w: 5.2, d: 9.2 });
  if (owns('south_wing')) out.push({ id: 'legacy-south', type: 'empty', x: -6.2, z: 4.6, w: 12.4, d: 4.7 });
  return out;
}
export const STARTER_FOR: Record<string, string> = { kids_room: 'legacy-wing', south_wing: 'legacy-south' };
export function checkDemolish(rooms: Room[], id: string): string | null {
  if (!rooms.some(r => r.id === id)) return 'Room not found.';
  if (id.startsWith('legacy-')) return 'That is part of your original home and cannot be demolished.';
  if (!connected(rooms.filter(r => r.id !== id))) return 'Demolishing that would cut your house in two. Remove the rooms beyond it first.';
  return null;
}

/** The room standing on this world point, if any. */
export const roomAt = (rooms: Room[], x: number, z: number): Room | null => rooms.find(r => x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.d) ?? null;

/* ───── step 2: what the 3D house draws ───── */
export type WallSeg = { x: number; z: number; len: number; axis: 'x' | 'z' };   // (x, z) = start of the wall; it runs `len` metres along `axis`
/** Outside walls: every stretch of a room's edge with no room on the other side, merged into straight runs. `skip` leaves out edges of some rooms (the starter flat draws its own walls).
    (Walls between two rooms come with doors in step 5; until then rooms are open plan.) */
export function exteriorWalls(rooms: Room[], skip?: (r: Room) => boolean): WallSeg[] {
  type Iv = [number, number];
  const raw: { axis: 'x' | 'z'; line: number; a: number; b: number }[] = [];
  const cut = (iv: Iv, others: Iv[]): Iv[] => { let parts: Iv[] = [iv]; for (const [c0, c1] of others) parts = parts.flatMap(([p0, p1]): Iv[] => (c1 <= p0 || c0 >= p1 ? [[p0, p1]] : [[p0, Math.min(p1, c0)], [Math.max(p0, c1), p1]].filter(([u, v]) => v > u) as Iv[])); return parts; };
  for (const r of rooms) {
    if (skip?.(r)) continue;
    const x0 = q(r.x), x1 = q(r.x + r.w), z0 = q(r.z), z1 = q(r.z + r.d);
    const sides: { axis: 'x' | 'z'; line: number; iv: Iv; nb: (o: Room) => boolean; span: (o: Room) => Iv }[] = [
      { axis: 'x', line: z0, iv: [x0, x1], nb: o => q(o.z + o.d) === z0, span: o => [q(o.x), q(o.x + o.w)] },
      { axis: 'x', line: z1, iv: [x0, x1], nb: o => q(o.z) === z1, span: o => [q(o.x), q(o.x + o.w)] },
      { axis: 'z', line: x0, iv: [z0, z1], nb: o => q(o.x + o.w) === x0, span: o => [q(o.z), q(o.z + o.d)] },
      { axis: 'z', line: x1, iv: [z0, z1], nb: o => q(o.x) === x1, span: o => [q(o.z), q(o.z + o.d)] },
    ];
    for (const sd of sides) for (const [a, b] of cut(sd.iv, rooms.filter(o => o !== r && sd.nb(o)).map(sd.span))) raw.push({ axis: sd.axis, line: sd.line, a, b });
  }
  raw.sort((u, v) => (u.axis < v.axis ? -1 : u.axis > v.axis ? 1 : u.line - v.line || u.a - v.a));
  const merged: typeof raw = [];
  for (const e of raw) { const l = merged[merged.length - 1]; if (l && l.axis === e.axis && l.line === e.line && l.b === e.a) l.b = e.b; else merged.push({ ...e }); }
  return merged.map(e => e.axis === 'x' ? { axis: 'x' as const, x: e.a / 10, z: e.line / 10, len: (e.b - e.a) / 10 } : { axis: 'z' as const, x: e.line / 10, z: e.a / 10, len: (e.b - e.a) / 10 });
}
/** Where to centre the camera and put the lights: the middle of the whole plan, and its size. */
export function planBounds(rooms: Room[]) {
  const x0 = Math.min(...rooms.map(r => r.x)), x1 = Math.max(...rooms.map(r => r.x + r.w)), z0 = Math.min(...rooms.map(r => r.z)), z1 = Math.max(...rooms.map(r => r.z + r.d));
  return { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
}

/* ───── step 3: where a new room goes when you tap the ground ───── */
export type Placement = { x: number; z: number; why: string | null };
/** The spot for a w x d room that sits flush against an existing room and is closest to the tapped point (px, pz). Prefers a spot that is allowed; otherwise returns the nearest one with the reason it is not. */
export function suggestPlacement(rooms: Room[], type: RoomType, w: number, d: number, px: number, pz: number): Placement | null {
  if (!rooms.length) return null;
  const t1 = (v: number) => Math.round(v * 10) / 10, cl = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
  const cands: NewRoom[] = [];
  for (const r of rooms) {
    const z = t1(cl(r.z + Math.round(pz - d / 2 - r.z), r.z - d + 1, r.z + r.d - 1)), x = t1(cl(r.x + Math.round(px - w / 2 - r.x), r.x - w + 1, r.x + r.w - 1));   // slide along the wall in whole metres from the room's own corner
    cands.push({ type, x: t1(r.x + r.w), z, w, d }, { type, x: t1(r.x - w), z, w, d }, { type, x, z: t1(r.z + r.d), w, d }, { type, x, z: t1(r.z - d), w, d });
  }
  const near = (c: NewRoom) => Math.hypot(c.x + c.w / 2 - px, c.z + c.d / 2 - pz);
  cands.sort((a, b) => near(a) - near(b));
  const ok = cands.find(c => checkBuild(rooms, c) === null);
  const pick = ok ?? cands[0];
  return { x: pick.x, z: pick.z, why: ok ? null : checkBuild(rooms, pick) };
}
