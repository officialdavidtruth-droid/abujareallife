ARL GLB AIRCRAFT / CAR DOORS PATCH

Files to replace:
- components/cityPlane.tsx
- components/CityCars.tsx

What this patch does:
- Loads crj900.glb into the existing flyable Plane component. Existing boarding, flight controls, physics, camera, and airport runway logic are retained.
- Uses the original procedural plane as a fallback until the GLB loads.
- Removes the fake floating GLB-car door panel. Existing car interaction refs remain valid.

IMPORTANT MODEL LIMITATION:
Inspection of all car GLBs in this archive found NO nodes named door. Their doors are part of combined meshes. It is impossible to swing the actual original door independently without editing/re-exporting the GLB mesh with a separate door object and hinge. This patch does NOT claim real GLB doors open. To make real doors work, separate door geometry in Blender and name door_front_left / door_front_right, with hinge origins.

Airport parked aircraft in AirportExtras are decorative, not independently pilotable. The existing Plane entity is pilotable and now shows the CRJ900 GLB. No airline terminal/ticketing system is added.

IMPORTANT: Remove any incorrect root-level CityTerrain.tsx in GitHub if it still exists; that is a separate TypeScript build blocker.

Not validated with a complete npm/Vercel build. Test in a staging deployment first.
