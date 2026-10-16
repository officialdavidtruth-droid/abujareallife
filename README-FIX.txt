ABUJA REAL LIFE — INTERIOR DETAIL PATCH

This patch is a first step toward GTA-style interiors, focused on supermarkets:
- Adds detailed product props (bottles with necks/caps/labels, metal cans, cartons, produce)
- Adds metal shelving and produce bins
- Removes the old generic colored-box stock generation for Supermarket only
- Leaves shop purchase/interaction logic unchanged

Files to copy into project:
components/SupermarketProps.tsx (new)
components/Interior.tsx (updated)
lib/interiors.ts (updated)

Important:
These props are procedural 3D meshes, not scanned/photogrammetry assets or licensed branded products.
For full GTA-level realism across every interior, the next step is a reusable GLB asset library
for supermarket products, shelves, checkout lanes, fridges, shopping carts, and branded signage.
Back up first and run `npm run build` before pushing. This patch has not been tested with Vercel.
