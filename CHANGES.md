# What changed (this build)

1. Run `prisma/migrations/0007_management/migration.sql` in Supabase (same SQL is appended to `prisma/fix-database.sql`). Adds the `Management` table and `Save.mgrTasks`.
2. Redeploy (the build already runs `prisma generate`).

## New files
- lib/work.ts (shift tasks 45-60 min, manager rules and numbers to tweak)
- lib/nav.ts (tap-to-walk path finding inside buildings)
- app/api/manager/route.ts (manager seats, management tasks, daily salary)
- prisma/migrations/0007_management/migration.sql

## Changed files
- components/Interior.tsx (joystick fix, props, staff, tap-to-interact, dock, camera orbit, manager desk, long shifts)
- components/City.tsx, components/GameLayer.tsx, app/hud.css (Enter & apply buttons)
- lib/interiors.ts, lib/roomNet.ts
- app/api/shift/route.ts, app/api/status/route.ts, app/api/exit/route.ts
- prisma/schema.prisma, prisma/fix-database.sql

## HUD cleanup (latest)
- app/mobile.css: the tidy phone HUD (clock, cash and menu on top; everything else inside the menu; needs as a small icon strip; round icon buttons) now applies on every screen size
- app/clean.css (new, imported last in app/layout.tsx): controls cheat-sheet fades after 9 s, touch buttons hidden on desktop, small install button in the corner, compact near-building card
- components/CityWorld.tsx: removed the floating building-name tag (the sign and the card already show it) and your own name tag
- components/City.tsx: removed the "ABUJA REAL LIFE / 100 buildings" bar
