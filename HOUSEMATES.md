# Housemates — invite players to live in your house

Menu → 🏠 Housemates.

- Owner invites a player by name (max 4 incl. pending). The invitee gets a phone message, opens Menu → Housemates and taps **Move in**.
- A housemate's "home" becomes the owner's house: E at that front door enters it, 📍 Route home / exiting / the beacon / car delivery all point to it. Sign reads "<owner>'s house · YOUR HOME".
- Shared: rooms (home upgrades), furniture, layout, wall/floor look. Housemates can rearrange and place their own furniture.
- Owner only: build rooms, sell fixtures, house look, guards. Each person can store/sell only the furniture they placed (stored pieces go back to whoever bought them). Furniture placed before this update counts as the owner's.
- Nobody can burgle the house they live in. A burglary takes cash from the owner only.
- Move out: housemate taps **Move out**, or the owner removes them. Accepting an invite moves you out of any previous house. You cannot move in while you have housemates of your own.
- A housemate's own house stays on the street, empty.

## Setup
Run `prisma/migrations/0023_housemates/migration.sql` (also appended to `prisma/fix-database.sql` and `prisma/setup-database.sql`) in the Supabase SQL editor, then `npm run db:generate`.

## Files
NEW `lib/housemates.ts`, `app/api/housemates/route.ts`, `components/Housemates.tsx`, `prisma/migrations/0023_housemates/migration.sql`, `HOUSEMATES.md`
EDITED `prisma/schema.prisma`, `prisma/fix-database.sql`, `prisma/setup-database.sql`, `app/api/houses/route.ts`, `app/api/home/route.ts`, `app/api/home/layout/route.ts`, `app/api/home/furniture/route.ts`, `app/api/burgle/route.ts`, `lib/houses.ts`, `components/PlayerHouses.tsx`, `components/Sim.tsx`

## Known limits
- Housemates don't see each other walking inside the house (interiors are still single-player scenes); they share the space, not the live view.
- Two housemates editing the layout at the same moment: last save wins.
