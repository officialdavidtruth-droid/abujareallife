# Home save races, step 1: safe writes on the server

Problem: furniture, layout, look and sold fixtures live in one JSON blob per house (hidden inventory row `home_layout`). Every save read it, changed it and wrote it back, so two saves at the same moment (owner + housemates, or two quick clicks) overwrote each other. It also allowed double refunds: two Store clicks gave the piece back twice, two Sell clicks paid twice.

Fix (no migration): `lib/homeStore.ts`
- The row's `quantity` is now a version counter (old rows start at 1). `editHome()` reads the house, changes a copy, and writes it with one atomic `UPDATE ... WHERE quantity = <version read>`. If someone else saved first it re-reads and re-applies, with a short random wait, up to 8 times, then answers "The house is busy, try again" (503).
- `app/api/home/furniture`: place, store and sell all use it. Money and inventory only move after the house change committed. A piece already stored or sold by someone else is "not found", so no double payout or duplicate. If a place fails, the item is given back.
- `app/api/home/layout` (PUT) merges instead of overwriting when the client sends `base` (the layout and look it loaded): only pieces this client really moved, and only look fields it really changed, are applied on top of the house's current data. A fixture sold meanwhile stays gone; a piece stored meanwhile does not come back. Without `base` (the current game client) it replaces the layout as before, but atomically.
- Tested with an in-memory fake database: 20 simultaneous placements all kept; 10 simultaneous sells of one piece, exactly one succeeded.

Next steps: (2) the game client sends `base` on save and shows the merged result, (3) optionally move placed furniture into its own table.

# Step 2: the game sends what it loaded and shows the merge

- `components/Sim.tsx` remembers the layout and look it loaded (`HOME_BASE`, set at the end of `reloadHome` and after every save) and sends it as `base` with the **Save** in Home design.
- The server (step 1) then applies only the pieces you actually moved and the look fields you actually changed on top of the house's current data.
- The reply is the merged result: the game applies it, so you immediately see a housemate's moves that were saved meanwhile. The toast says "A housemate changed things too: now merged." when that happened.
- Save errors now show the server's reason (for example "The house is busy right now. Try again.") instead of a generic message, and a lost connection is reported as not saved.

Known limit: edits are merged when someone presses Save, so you only see a housemate's moves after your own save or after reloading the house. Live updating while both are decorating is not built.

Files (step 2): EDITED `components/Sim.tsx`
Step 3 (optional): move placed furniture into its own table.

# Step 3: placed furniture in its own table

Each placed piece is now one row in `HomeFurniture` (migration `0026_home_furniture`) instead of an entry in the house blob.

- **Place** = one INSERT. **Store / sell** = one DELETE that only one request can win; the refund or the payout happens only for the winner. Housemates working on different pieces can no longer touch each other at all.
- **Existing houses migrate by themselves:** the first time anybody opens or edits a house's furniture (or saves its layout), the pieces are copied into the table and removed from the blob. It is safe if several requests do it at once, and if an older server adds a piece in the middle, the next request picks it up. Nothing to backfill by hand.
- Stays in the blob (still protected by the versioned writes of step 1): layout positions, house look, sold fixtures.
- The game client is unchanged: the API returns the same list as before.
- Tested with a fake database: 8 simultaneous migrations of a 30-piece house (plus one late piece) gave exactly 31 rows with no duplicates; 10 simultaneous deletes of one piece had exactly one winner.

## Setup
Run `prisma/migrations/0026_home_furniture/migration.sql` (also appended to `prisma/fix-database.sql` and `prisma/setup-database.sql`) in the Supabase SQL editor **before** deploying, then `npm run db:generate`.

## Files (step 3)
NEW `lib/homeFurniture.ts`, `prisma/migrations/0026_home_furniture/migration.sql`
EDITED `prisma/schema.prisma`, `prisma/fix-database.sql`, `prisma/setup-database.sql`, `app/api/home/furniture/route.ts`, `app/api/home/layout/route.ts`

## Known limits
- No foreign key to User, like HouseMate and HomeVisit: furniture rows of a deleted account stay behind (harmless, can be cleaned with `DELETE FROM "HomeFurniture" WHERE "homeId" NOT IN (SELECT id FROM "User")`).
- Opening a visited house can trigger its one-time copy; it is idempotent.
