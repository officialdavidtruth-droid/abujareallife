# ARL Terrain Fix — Step 2

## Root cause addressed
The countryside terrain chunks overlapped the flat city-floor plane at the same Y coordinate (-0.06). This coplanar overlap can produce z-fighting, dark flickering patches and visible chunk seams where terrain chunks cross the city core.

## Changes
- Terrain triangles whose cell centers lie within the city-floor footprint are omitted; the existing city plane renders that area instead.
- Terrain grid spacing is restored from 4 m to 5 m to reduce geometry cost while stabilizing the fix.
- Terrain height functions, road grading, world coordinates, player coordinates, water and vehicle logic are unchanged.

## Verification
A full Next.js build was not run because dependencies are not installed in this environment. Test in-game around the city edge and all four exits, especially where chunk boundaries cross the city floor. Check for holes at the boundary, terrain pop-in, and mobile frame rate.
