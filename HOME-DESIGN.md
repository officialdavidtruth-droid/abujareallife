# Home design update

- Every account now gets its own home look by default (walls, floor, rugs, sofa, bedding, bed frame), so homes no longer look the same. Players change it under Home design > Style and tap Save. (lib/homeLook.ts, app/api/home/layout/route.ts, components/Sim.tsx)
- Home design editor: Arrange / Add items / Style tabs. Move by Fine/Normal/Far, turn by 15/45/90 degrees, Snap to wall, Put away (back to inventory, no sale), Original spot. New pieces appear next to you and are selected so you can place them straight away.
- New 3D items in the Online Mall: standing fans (7 designs), ceiling fans (7), air conditioners (10, wall / ceiling / window / portable / tower), wall-mounted, frame-art and retro TVs, canopy / bunk / daybed beds, camelback / Lawson / futon sofas. Ceiling and wall units never block walking. (lib/catalog.ts, components/FurnitureModels.tsx)
