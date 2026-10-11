# Plane — STEP 2: inside + outside camera, toggle

Copy over the project root (same paths). Cumulative with step 1 (CityWorld.tsx contains the step 1 edits too). No packages, no database change.

EDIT: components/cityPlane.tsx, components/CityWorld.tsx

## What's new
- **Outside view** (default when you board): chase camera behind and above the plane, lagging a little in turns.
- **Inside view**: camera sits at the pilot's head in the nose and banks / pitches with the plane, so the horizon tilts. The outer hull is hidden and a simple cockpit (dashboard, screens, yoke, window frame) is shown instead. Wings and engines stay visible.
- **Toggle**: press **V**, or tap the **📷 View** button on a phone (shown while flying). The hint line also says "V view".
- **Phone fix**: a **✈️ Board plane / Exit plane** button now appears when you stand next to the plane or are flying it. Before, only the "Car" button gave an E press, and only to car owners, so touch players could not board.
- The view resets to outside every time you board, get out or crash.

## Not in this step
- Looking around with the mouse / touch inside the cockpit (view is fixed forward).
- STEP 3: other players see the plane, and several players can board the same one.
