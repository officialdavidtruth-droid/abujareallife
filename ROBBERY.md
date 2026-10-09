# Street robbery (players + NPCs)

No migration needed. Uses the existing `Crime` and `Message` tables.

## What you can do
- **Rob a player** (walk within 3.5 m): `/api/rob`. Takes 30% of their cash (max ₦150k), +45 heat.
- **Pickpocket a pedestrian** (quiet): ₦8k-40k, +20 heat.
- **Mug a pedestrian** (new, 🔪 Mug): ₦20k-90k, +35 heat, riskier catch chance than pickpocketing.
- Both NPC actions go through `/api/crime`. A pedestrian you hit is hidden from the buttons for 3 minutes (client side).

## Victim notification
When a player is robbed the server saves a `robbed` message to them (inside the same transaction as the cash transfer), so it
pops up through the normal phone ping (sound + vibration) and stays in their Messages. The instant toast over the room channel is kept.

## Cooldowns (all enforced by the server, stored in the database, shown as a ⏳ countdown on the buttons)
Edit in `lib/profile.ts`:
- `ROB_ANY_COOLDOWN_MS` 20 s after ANY robbery attempt (player or NPC), so you cannot hop between kinds.
- `ROB_KIND_COOLDOWN_MS` same kind again: player 30 s, pickpocket 20 s, mug 60 s, NPC carjack 120 s.
- `ROB_VICTIM_SHIELD_MS` a player who was just robbed cannot be robbed again for 120 s.
- Plus a flood guard of 8 robberies per 10 minutes per player (in memory).
Nothing-to-steal attempts also count toward the cooldown.

## Limits
- NPC positions only exist in each player's browser, so the "is a pedestrian really next to you" check for NPC robbery is client-side
  (same as the old pickpocket). The cooldowns and payouts are server-side.
- Not run in a browser or against a database here; only type-checked (Prisma client could not be generated offline).
