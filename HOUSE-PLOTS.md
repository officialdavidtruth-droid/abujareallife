# House plots: every player gets a house

- Each account now stores its plot: `User.houseSlot` (unique). A new account gets the lowest free plot and keeps it. Deleting an account frees its plot for a later player and moves nobody.
- Capacity went from 105 to **660 plots** (`lib/houses.ts`: `ROWS = 6`). Row 0 is the old ring-road row, built exactly as before, so existing houses stay where they are. Rows 1-5 stand behind it, facing the same way; each row's front yard is a lane behind the row before, reached along the cross-road stubs. Rows behind skip the railway, chop yards and airport. The gate wall is drawn on row 0 only.
- `/api/houses` assigns a plot to every account that has none (oldest first), so houses appear even for players who are offline.
- To add more plots later raise `ROWS` (new plots are appended after the old ones). Keep `LIM` in `lib/cityNet.ts` above the outermost row (about 250 m now, set to 300).

## Setup (once)
Run `prisma/migrations/0024_house_slot/migration.sql` (also appended to `prisma/fix-database.sql` and `setup-database.sql`) in the Supabase SQL editor, then `npm run db:generate`. It adds the column and gives the first 105 accounts the plots they have today.
Run it before deploying this build.

## Files
NEW `lib/housePlots.ts`, `prisma/migrations/0024_house_slot/migration.sql`, `HOUSE-PLOTS.md`
EDITED `lib/houses.ts`, `lib/cityNet.ts`, `components/PlayerHouses.tsx`, `app/api/houses/route.ts`, `app/api/burgle/route.ts`, `app/api/housemates/route.ts`, `prisma/schema.prisma`, `prisma/fix-database.sql`, `prisma/setup-database.sql`

## Known limits
- When all 660 plots are taken the next account has no house (it keeps the 🏠 Go home button). Raise `ROWS`.
- Rows behind the ring are not on the route planner's road graph; walking and driving there is open ground.
- Not checked in-game: scenery I did not read (trees, props) beyond the ring could overlap rows 1-5.
