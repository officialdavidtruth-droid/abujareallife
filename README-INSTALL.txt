# Abuja Real Life — animation integration files

## Install
1. Extract this ZIP into the repository root, merging folders. It includes the uploaded animation GLBs under `public/models/characters/emotes/`.
2. Apply the patch from the repository root: `git apply lib/mixamoRetarget.patch` (the patch file is included in this ZIP at that path).
3. Run `npm run build`; then test the game and inspect the browser Network tab for failed requests.
4. Commit and push to GitHub so Vercel deploys the change.

The patch targets the current `lib/mixamoRetarget.ts` structure inspected on 2026-10-16. If it does not apply cleanly, do not force it; the project version may have changed.

## Actions
- Idle, walk, run: supplied male neutral clips replace the matching existing clips.
- `anim='dance'`, `wave`, `cheer`, `chat`/`talk`, `think`/`thoughtful`, `clap`, `lookaround` map to supplied clips.
- Female variants load under `ARL_Female...` names and can be selected by passing that exact animation name. Automatic gender-based selection isn't added because the current MixamoDriver doesn't receive gender.

## Compatibility note
These GLBs contain animation tracks but no visible skin mesh. They are played on the hidden skeleton from `public/models/characters/animations.glb`. The loader normalizes Mixamo bone names, but rest-pose differences still need visual testing in-game. Individual file failures are logged and leave existing procedural animation as fallback.
