/* Step 6: real police response. Pure helpers (no React, no three) so they can be tested headlessly.
   CityWorld.tsx (PolicePatrol) owns the cars and officers; this file only holds the numbers and the line-of-sight test. */

export type Rect = { x0: number; x1: number; z0: number; z1: number };

export const PATROL = {
  maxCars: 5,            // patrol cars alive at once (including roadblock cars)
  maxCops: 4,            // officers on foot at once
  seeRange: 48,          // an officer sees you inside this range if no building is in the way
  searchMs: 22_000,      // after losing you, officers search around your last known spot this long, then go back to their car
  evadeAfterMs: 8_000,   // nobody has seen you this long -> the server cools your heat a little
  evadeEveryMs: 12_000,
  roadblockHeat: 110,    // roadblocks only at this heat or more, and only while you drive
  roadblockEveryMs: 45_000,
  roadblockLifeMs: 35_000,
  parkMs: 70_000,        // how long a car with nobody to pick up stays parked before it drives off
};

/** how many patrol cars / officers the current heat calls for */
export const carsFor = (heat: number) => (heat >= 110 ? 3 : heat >= 70 ? 2 : 1);
export const copsFor = (heat: number) => (heat >= 110 ? 4 : heat >= 70 ? 3 : heat >= 40 ? 2 : 1);

/** Is the straight line a->b cut by any rectangle? (slab test; used for "can this officer see you?") */
export function lineBlocked(rects: Rect[], ax: number, az: number, bx: number, bz: number): boolean {
  const dx = bx - ax, dz = bz - az;
  for (const r of rects) {
    let t0 = 0, t1 = 1;
    if (Math.abs(dx) < 1e-9) { if (ax < r.x0 || ax > r.x1) continue; }
    else { let a = (r.x0 - ax) / dx, b = (r.x1 - ax) / dx; if (a > b) { const t = a; a = b; b = t; } t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) continue; }
    if (Math.abs(dz) < 1e-9) { if (az < r.z0 || az > r.z1) continue; }
    else { let a = (r.z0 - az) / dz, b = (r.z1 - az) / dz; if (a > b) { const t = a; a = b; b = t; } t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) continue; }
    return true;
  }
  return false;
}
