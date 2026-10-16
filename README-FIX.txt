ABUJA REAL LIFE — REALISM PATCH

Files:
- components/CityScenery.tsx
  Fixes GLB building loading. The old implementation checked each model with a HEAD request
  and filtered by content-type before attempting to load it. Some static hosting/CDN responses
  can fail this check, causing the city to fall back to primitive buildings. The patched loader
  tries loading the actual GLB directly and then falls back to public/models/city/default.glb.
- components/CityTerrain.tsx
  Replaces faceted low-poly tree crowns with smoother foliage geometry.

Install:
1. Back up your project.
2. Extract these files into the project root, preserving the components/ folder.
3. Verify that public/models/city/*.glb files remain in your project.
4. Run npm run build locally before pushing to main.

Note:
This uses the realistic GLB assets already included in your uploaded project. It does not add
new third-party models or textures. The patch has not been tested in a live browser/Vercel
deployment, so verify the resulting scene and build before merging.
