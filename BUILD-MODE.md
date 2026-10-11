# Build mode (free-form floor plan), the Virtual Family 2 style

Done one step at a time. Each step leaves the game working; houses without saved rooms keep the old fixed flat until step 4.

1. **Rooms as data (this step).** `HomeRoom` table, `lib/homeRooms.ts` (grid, room types, prices, placement/demolish rules), `/api/home/rooms` (GET for anyone allowed in the house, POST build/demolish for the owner). No visible change yet.
2. **Render + walk the plan (done).** `components/HomePlan.tsx` draws floors and outside walls from rooms; `lib/collision.ts` `setPlan()` makes "inside any room" the walkable area and resizes the path grid; `Sim.tsx` loads rooms in `reloadHome` (visitors and housemates get the same plan). A house with saved rooms hides the old flat's fixtures except the front door, which moves to the plan's west wall. Rooms are open plan until step 5. Houses with no rooms are untouched.
3. **Build UI.** "Build" button, room-type picker, drag a rectangle, green/red ghost, price shown, tap a room to demolish.
4. **Convert the old flat.** Existing houses become real rooms (main flat, kids' wing, south wing with gym/cinema/office), furniture keeps its place; retire the hard-coded wings.
5. **Doors and windows.** Tap a wall to add; walking and path-finding pass only through doors.
6. **Housemates and visitors.** Everyone loads the same rooms; live refresh when the owner builds.
7. **Polish.** Room-type starter furniture, per-room floor style, undo, tile-size tweaks.

Rules in step 1: tiles are 1 m; rooms 2-8 tiles a side; plot -20..20; max 24 rooms / 400 tiles; each new room must share a wall with an existing one; demolish refunds 60% and may not split the house or leave furniture inside.
