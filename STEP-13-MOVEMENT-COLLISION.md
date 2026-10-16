# ARL Step 13 — Movement and collision audit

## Change in this patch

`components/CityWorld.tsx` now resolves on-foot movement along the X and Z axes separately, running the existing `pushOut` solid collision resolver after each axis. This is intended to reduce diagonal corner snagging and improve sliding along building walls while preserving the existing solid map, traffic, pedestrian, transport stand, parked-car, water, and terrain checks.

## Apply

1. Back up the current project.
2. Replace `components/CityWorld.tsx` with this file.
3. Run `npm ci` and `npm run build`.
4. Test walking diagonally into building corners, along walls, past parked cars, beside traffic, entering/exiting houses, and near water edges.

## Known limits

This is a targeted movement-resolution improvement, not a complete physics rewrite. Vehicle movement still resolves collision after its frame movement, so high-speed tunnelling may remain. Remote-player positions are not authoritative physics. Verify the change in the current project before deployment.
