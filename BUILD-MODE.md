# Build mode (free-form floor plan), the Virtual Family 2 style

Done one step at a time. Each step leaves the game working; houses without saved rooms keep the old fixed flat until step 4.

1. **Rooms as data (this step).** `HomeRoom` table, `lib/homeRooms.ts` (grid, room types, prices, placement/demolish rules), `/api/home/rooms` (GET for anyone allowed in the house, POST build/demolish for the owner). No visible change yet.
2. **Render + walk the plan (done).** `components/HomePlan.tsx` draws floors and outside walls from rooms; `lib/collision.ts` `setPlan()` makes "inside any room" the walkable area and resizes the path grid; `Sim.tsx` loads rooms in `reloadHome` (visitors and housemates get the same plan). A house with saved rooms hides the old flat's fixtures except the front door, which moves to the plan's west wall. Rooms are open plan until step 5. Houses with no rooms are untouched.
3. **Build UI.** "Build" button, room-type picker, drag a rectangle, green/red ghost, price shown, tap a room to demolish.
4. **Convert the old flat (done, before step 3).** First `build` or `convert` call on a house turns the original flat into rooms `legacy-main`, `legacy-wing` (if owned), `legacy-south` (if owned) at their exact old coordinates, so every fixture, rug and window stays where it is and the old look is kept. They can't be demolished. Buying the kids' or south wing later adds that room for houses already converted (`/api/home`). New rooms may sit flush against the flat (positions are tenths of a metre; migration 0028). Houses nobody has built in stay on the old code path. The old shell visuals (walls, windows) are retired in step 5 when walls and doors become data.
5. **Doors and windows.** Tap a wall to add; walking and path-finding pass only through doors.
6. **Housemates and visitors.** Everyone loads the same rooms; live refresh when the owner builds.
7. **Polish.** Room-type starter furniture, per-room floor style, undo, tile-size tweaks.

Rules (step 1, as extended in step 4): tiles are 1 m; new rooms 2-8 tiles a side (whole tiles), placed on tenths of a metre; plot -30..30 m; max 24 rooms / 600 m²; each new room must share a wall with an existing one; demolish refunds 60% and may not split the house or leave furniture inside.
