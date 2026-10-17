ABUJA REAL LIFE - ANIMATION + ROOFTOP FIX

Why the animations were not working:
The existing Mixamo skeleton uses node names like "mixamorig:Hips" but the animation driver searches for "mixamorigHips". The driver now normalizes the loaded skeleton names. The supplied emote GLBs are also now loaded, their Bip01 body tracks are mapped to the Mixamo skeleton names, and the clips are registered as Wave, Dance, Cheer, Clap, Talk, Thoughtful, LookAround, EmoteIdle, EmoteWalk, and EmoteRun.

Rooftop fix:
The building renderer returned early for imported city GLBs, skipping the rooftop details used by procedural buildings. Imported models now receive a roof cap, water tank, AC unit, and a rooftop beacon on taller buildings.

INSTALL:
1. Back up your current project.
2. Copy the included components/CityScenery.tsx and lib/mixamoRetarget.ts over the matching files in the project.
3. Copy/merge public/models/characters/emotes/ into your existing public/models/characters/emotes/ directory. Do not delete animations.glb, kara.glb, man.glb, or walking.fbx.
4. Run npm run build.
5. If the build succeeds, test in a browser and push the changes to GitHub/Vercel.

NOTE:
The animation clips are mapped to common body bones; facial/extra bones are intentionally skipped. The supplied emote models are male-named sources, so the same body animation clips are available to both player genders via the shared procedural rig. Visual validation in the running game is still required.
