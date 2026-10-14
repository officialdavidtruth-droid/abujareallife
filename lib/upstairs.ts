/* The upstairs of a two-storey house (the old fixed flat only; houses re-planned in build mode have no upstairs yet).
   A doorway in the flat's north wall opens onto a straight stair that climbs north to an upstairs room. Everything is in flat coordinates (x east, z south, y up).
   The height under your feet depends only on where you stand (yAt), so walking, click-to-walk and the camera need no "which floor" state.
   Pure functions: shared by the 3D drawing (components/Upstairs.tsx), the collision rectangles (lib/collision.ts setExtra) and Sim.tsx. */
export type Rect = { x: number; z: number; w: number; d: number };
export type Box = [number, number, number, number];

export const ST = { ax: 2.1, hw: .6, z0: -4.3, run: 4.4, N: 16, H: 2.8 };    // stair: centre x, half width, bottom z (the flat's north edge), length, steps, height of the upper floor
export const TOP_Z = ST.z0 - ST.run;                                          // where the stair meets the upstairs floor
export const RISE = ST.H / ST.N, TREAD = ST.run / ST.N;
export const ROOM = { x0: ST.ax - 3.5, x1: ST.ax + 3.5, z0: TOP_Z - 5.5, z1: TOP_Z };   // the upstairs room
export const DOOR = { x0: ST.ax - ST.hw - .05, x1: ST.ax + ST.hw + .05, h: 2.1 };        // the gap cut in the flat's north wall

/** Where you may walk beyond the flat: the stair (it reaches .5 m into the flat so the two join) and the upstairs room. */
export const upRects = (): Rect[] => [
  { x: ST.ax - ST.hw, z: TOP_Z, w: ST.hw * 2, d: ST.run + .5 },
  { x: ROOM.x0, z: ROOM.z0, w: ROOM.x1 - ROOM.x0, d: ROOM.z1 - ROOM.z0 },
];
/** Furniture upstairs you can't walk through. */
export const UP_BLOCKS: { id: string; b: Box }[] = [
  { id: 'up.bed', b: [-.1, 1.7, -14.1, -11.65] },
  { id: 'up.wardrobe', b: [4.9, 5.5, -14.1, -12.3] },
  { id: 'up.dresser', b: [-1.3, -.8, -11.8, -10.2] },
];

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** Floor height under (x, z): 0 in the flat, a stepped ramp on the stair, ST.H upstairs. */
export function yAt(x: number, z: number, on = true): number {
  if (!on || z >= ST.z0) return 0;
  if (z <= TOP_Z) return x >= ROOM.x0 && x <= ROOM.x1 && z >= ROOM.z0 ? ST.H : 0;
  if (Math.abs(x - ST.ax) > ST.hw + .05) return 0;
  const u = clamp((ST.z0 - z) / ST.run, 0, 1) * ST.N, k = Math.min(ST.N - 1, Math.floor(u)), s = clamp((u - k - .55) / .35, 0, 1);   // flat on each tread, a quick step up at its edge
  return RISE * (k + s);
}
/** Is (x, z) on the stair or upstairs (so the camera and the walkable area must follow)? */
export const isUp = (x: number, z: number) => z < ST.z0 - .05 && x > ROOM.x0 - 1 && x < ROOM.x1 + 1 && z > ROOM.z0 - 1;
