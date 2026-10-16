# ARL Graphics Step 1 — Terrain and Vegetation

## Changes
- Increased the terrain mesh sampling density from 5 m to 4 m per grid cell for smoother hills and ridgelines.
- Added deterministic canopy shape, width, height, and offset variation across the three existing tree kinds.
- Increased canopy geometry detail modestly while keeping instanced meshes to avoid creating one draw call per tree.
- Varied foliage hues and lightness slightly to reduce the repeated single-green look.
- Preserved the city core, terrain height functions, road grading, water levels, and existing tree count.

## Validation
A full production build was not run in this environment because dependencies are not installed. After applying, run:

```bash
npm ci
npm run build
```

Then inspect hill silhouettes, tree distribution, road edges, and mobile frame rate. The 4 m grid increases terrain vertex count by about 56% per chunk versus the previous 5 m grid, so revert `CELL` to 5 if performance drops on lower-end phones.
