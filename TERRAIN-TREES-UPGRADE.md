# ARL Terrain & Trees Upgrade

This update improves the countryside beyond the flat city core:
- Taller, more defined rolling hills and mountain ridges.
- More terrain detail and rock colouring at high elevations and steep slopes.
- Increased tree density and tree scale outside the city core.
- Rounded, faceted foliage instead of the previous cone-shaped crowns.
- Keeps the flat city core, roads, rivers, lake and player ground-height functions intact.

## Test
Run `npx prisma generate` and `npm run build`, then inspect the countryside at the edge of the city and across the highways. Higher scenery density may affect low-end mobile performance; reduce `scatter(1750, ...)` if needed.
