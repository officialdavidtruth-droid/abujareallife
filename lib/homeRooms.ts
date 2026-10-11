/* Build mode, step 1: the floor plan as data. Pure functions (no React / three / database), shared by the server (app/api/home/rooms) and later by the 3D house.
   The house sits on a grid of 1 m tiles. A room is a rectangle of whole tiles; world metres = tile numbers (a room at x 2, w 3 covers world x 2 to 5).
   Houses with no saved rooms keep the old fixed floor plan until a later step converts them. */
export const GRID = { x0: -20, x1: 20, z0: -20, z1: 20 };   // tiles allowed: x0 <= x < x1, z0 <= z < z1
export const MIN_SIDE = 2, MAX_SIDE = 8, MAX_ROOMS = 24, MAX_TILES = 400;
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

const overlap = (a: NewRoom, b: NewRoom) => a.x < b.x + b.w && a.x + a.w > b.x && a.z < b.z + b.d && a.z + a.d > b.z;
/** Do the two rectangles share a stretch of wall at least one tile long (touching, not overlapping)? */
export function sharesWall(a: NewRoom, b: NewRoom): boolean {
  const zov = Math.min(a.z + a.d, b.z + b.d) - Math.max(a.z, b.z), xov = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  return ((a.x + a.w === b.x || b.x + b.w === a.x) && zov >= 1) || ((a.z + a.d === b.z || b.z + b.d === a.z) && xov >= 1);
}

/** Why this room cannot be built here, or null when it can. */
export function checkBuild(rooms: Room[], n: NewRoom): string | null {
  if (!isRoomType(n.type)) return 'Pick a room type.';
  if (![n.x, n.z, n.w, n.d].every(Number.isInteger)) return 'Rooms are made of whole tiles.';
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
export function checkDemolish(rooms: Room[], id: string): string | null {
  if (!rooms.some(r => r.id === id)) return 'Room not found.';
  if (!connected(rooms.filter(r => r.id !== id))) return 'Demolishing that would cut your house in two. Remove the rooms beyond it first.';
  return null;
}

/** The room standing on this world point, if any. */
export const roomAt = (rooms: Room[], x: number, z: number): Room | null => rooms.find(r => x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.d) ?? null;

/* ───── step 2: what the 3D house draws ───── */
export type WallSeg = { x: number; z: number; len: number; axis: 'x' | 'z' };   // (x, z) = start of the wall; it runs `len` metres along `axis`
/** Outside walls: every tile edge with a room on one side and nothing on the other, merged into straight runs. (Walls between two rooms come with doors in step 5; until then rooms are open plan.) */
export function exteriorWalls(rooms: Room[]): WallSeg[] {
  const has = (x: number, z: number) => rooms.some(r => x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.d);
  const horiz = new Map<number, number[]>(), vert = new Map<number, number[]>();   // z -> xs of tiles with an edge on that line, x -> zs
  const add = (m: Map<number, number[]>, k: number, v: number) => { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); };
  for (const r of rooms) {
    for (let x = r.x; x < r.x + r.w; x++) { if (!has(x, r.z - 1)) add(horiz, r.z, x); if (!has(x, r.z + r.d)) add(horiz, r.z + r.d, x); }
    for (let z = r.z; z < r.z + r.d; z++) { if (!has(r.x - 1, z)) add(vert, r.x, z); if (!has(r.x + r.w, z)) add(vert, r.x + r.w, z); }
  }
  const out: WallSeg[] = [];
  const merge = (m: Map<number, number[]>, axis: 'x' | 'z') => {
    for (const [line, vs] of m) {
      vs.sort((a, b) => a - b);
      let s = vs[0], p = vs[0];
      for (let i = 1; i <= vs.length; i++) {
        if (i < vs.length && vs[i] === p + 1) { p = vs[i]; continue; }
        out.push(axis === 'x' ? { x: s, z: line, len: p + 1 - s, axis } : { x: line, z: s, len: p + 1 - s, axis });
        if (i < vs.length) { s = vs[i]; p = vs[i]; }
      }
    }
  };
  merge(horiz, 'x'); merge(vert, 'z');
  return out;
}
/** Where to centre the camera and put the lights: the middle of the whole plan, and its size. */
export function planBounds(rooms: Room[]) {
  const x0 = Math.min(...rooms.map(r => r.x)), x1 = Math.max(...rooms.map(r => r.x + r.w)), z0 = Math.min(...rooms.map(r => r.z)), z1 = Math.max(...rooms.map(r => r.z + r.d));
  return { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
}
