ABUJA REAL LIFE — ALL BUILDING INTERIORS LAYOUT PATCH

File to replace:
- lib/interiors.ts

This patch updates the shared buildInterior() floor-plan generator, so the layout changes apply to all business/building types that use it. Retail interiors now use separated shelf runs, more deliberate aisle spacing and a checkout moved toward the front-right wall. The existing dining, service, club, station, office and hall layouts are retained with their existing interactions/spot definitions.

Install:
1. Back up your project.
2. Replace lib/interiors.ts with this file.
3. Run npm run build and inspect multiple building types in-game before pushing.
4. If your current branch contains newer changes to lib/interiors.ts, merge the change instead of overwriting newer work.

Limitations:
This is a layout patch, not a photorealistic asset replacement. The project currently represents many interior items procedurally; realistic GLB props and textures are a separate next step.
