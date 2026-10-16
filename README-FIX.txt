ARL Vercel build fix — stray root CityTerrain.tsx

The Vercel error is compiling `./CityTerrain.tsx` at the project root. Its imports (`../lib/terrain`, `./cityShared`, `./CityLook`) are correct only when the component is inside `components/`.

Apply this patch from the repository root:
1. Keep/replace `components/CityTerrain.tsx` with the included file.
2. DELETE the accidental root-level `CityTerrain.tsx` file (the one beside package.json). Do not move the component out of `components/`.
3. Confirm `components/CityTerrain.tsx` imports `../lib/terrain`.
4. Run `npm run build`.
5. Commit and push the deletion plus the correct component file.

No Prisma migration is needed. This patch addresses the path shown in the build log; it has not been tested by Vercel.
