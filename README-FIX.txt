Abuja Real Life — Terrain rendering fix

Copy components/CityTerrain.tsx into the same path in your project, replacing the existing file.

This is a targeted terrain rendering adjustment only. Keep the rest of your project unchanged. Then run npm run build locally and deploy the resulting commit.

Note: this patch does not remove the separate root-level CityTerrain.tsx build-error file. If that file still exists, remove it from Git; keep components/CityTerrain.tsx.
