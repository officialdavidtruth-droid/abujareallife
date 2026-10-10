# Step 5: witnesses and NPC reactions (GTA feel)

## What changed
- **`lib/witness.ts` (new)**: pure logic for who sees/hears a crime and how they react.
  Personalities per pedestrian (fixed by index, ~40% coward / 35% bystander / 25% brave).
  Sight and hearing radii per crime kind, facing check, reaction priority, shout lines (Abuja pidgin mix).
- **`components/CityWorld.tsx` (Pedestrians)**: each ped now has a reaction state:
  `freeze` (look at it), `handsup` (hands up, trembling), `cower` (crouch, arms over head),
  `flee` (sprint along the pavement away from it, ignores red lights), `film` (phone out, calls police after 2.5-4.5 s),
  `confront` (squares up and gestures). Witnesses turn to face the crime. Poses are smoothed.
- **Crime triggers**: gunshots (everyone nearby hears, many see), a gun out (seen for 6 s after you fire/reload;
  point it at someone within 12 m and they put their hands up and keep them up while you aim), punches next to a pedestrian,
  mugging, pickpocketing (quiet: only peds looking straight at it), NPC carjacking, running a pedestrian over.
- **Speech bubbles** above peds ("Oga, abeg, don't shoot!", "Thief! Thief!", "I dey call police!"), max 4 at once.
- **Real consequences**: `CrimeActions` sends how many NPCs *saw* the crime; `/api/crime` adds `WITNESS_HEAT` (6) per witness,
  capped at `WITNESS_MAX` (3), for street crimes only. The response includes `witnesses`.
- **Hook for step 6**: when a filming witness "calls the police" the game fires `window` event `arl-witness-report`
  with `{ x, z }` (and shows a notice at most once per 15 s). Nothing consumes it yet; police dispatch is step 6.

## Tuning
All in `lib/witness.ts` (RANGE, decide, duration, LINES, personaOf) and `lib/profile.ts` (WITNESS_HEAT, WITNESS_MAX).

## Known limits
- Buildings do not block sight yet (a ped behind a wall can still "see" you).
- Witness count and shots are client-reported, like `policeNearby` already is. The server caps the effect (max +18 heat).
- Pedestrians are still on pavement lines, so fleeing means sprinting along the pavement, not through the city.
- Confronting peds only shout and gesture; they do not damage the player.
- Only the 32 ambient pedestrians react. Real players and AI drivers are unchanged.
- I could not run `next build` here (no dependencies / network). `witness.ts` is strict-typechecked and unit-tested;
  the TSX edits were syntax-checked. Run `npm run build` once and send me any errors.
