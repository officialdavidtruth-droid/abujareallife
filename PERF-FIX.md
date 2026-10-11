# Performance fix: city was very slow after step 8 (city look)

Cause: every building drew ~25 separate small meshes (door, glass, awning, roof kit from step 8, signs, AC units), each with its OWN new material and geometry. Roughly 110 buildings, so 2,000+ draw calls and ~1,500 materials per frame, plus 45 graffiti meshes. Frustum culling only hides what is behind you.

Fix (applies to every building type, no layout or look change up close):
- `components/cityShared.ts`: `registerDetail` / `updateDetails`. Small detail groups are only drawn within 85 m of the player (fog starts at 90 m, so the change is hidden). Runs 4x a second.
- `components/CityScenery.tsx` `Building`: body, plinth, cornice and name board are always drawn; everything small goes in a detail group. All meshes now use one shared geometry and a handful of shared materials (was one new material + geometry per mesh). Cornices no longer cast shadows.
- `components/CityLook.tsx`: graffiti uses the same near-only rule. `BuildingDress` is inside the building detail group.
- `components/CityWorld.tsx`: on touch devices the shadow map is 1024 (was 2048) and pixel ratio max 1.25 (was 1.5); high-performance GPU hint. Detail range updates also during taxi rides.

Tuning: `DETAIL_R` in cityShared.ts (85). Lower = faster, raise if you see pop-in.
Not measured in a browser here (no GPU). tsc is clean for the touched files; please run `npm run build` once.
