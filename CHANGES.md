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

## Music + indoor UI pass
- **Music**: real tracks in `public/audio/` now play as the soundtrack (crossfaded, remembers where you were). Streets: `sim-city-groove`, `simbas-groove`. Indoors/home: `virtual-village`, `simbas-virtual-safari`. Edit `PLAYLISTS` in `lib/audio.ts` to reassign. The old generated loop remains as a fallback if files fail to load. Master/Music sliders and mute still control it.
- **Indoors**: joystick moved to the left (chat sits beside it); the "What can I do here?" sheet is now a game-style side panel (so it never covers your character); in-world spot labels are compact icon badges that hide when you stand on them; name plates fade when you walk up to them; all screen UI now layers above 3D labels. Styles live in `INTERIOR_UI_CSS` (`lib/gameLabels.ts`).

## Round 3: family is opt-in, no more overlapping text, sound fixes
- **Family is now the player's choice.** Nobody lives with you by default. Menu (☰) > 💍 Family asks "Start a family?" (Get married & start a family / Not now) and can be ended later. The choice is saved (`state.family`, see `app/api/save/route.ts`); old saves start single. Kid/family-only interactions are hidden until a family exists. Marriage between real players is unchanged (Love tab in the city menu).
- **Home screen:** the top menu always layers above everything; the family panel is a small "Family" button that opens a panel under the top bar (hidden while the menu is open).
- **Inside buildings:** labels only show when you're near them (spot badges within ~7m, name plates 1.9–6.5m), so rooms never turn into a wall of text; the "Till (rob)" style action button moved beside the list instead of under your character; right-hand list is tighter.
- **Sound:** (1) iPhones mute Web Audio when the side silent switch is on: the game now requests a "playback" audio session (`navigator.audioSession`) plus a silent keep-alive element. (2) Resumes after phone calls/app switches. (3) Music and effects are louder and effects are compressed. (4) If the browser is still blocking sound, a "🔊 Tap to turn sound on" button appears at the top.
