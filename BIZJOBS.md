# Player-run businesses with staff

Players hire each other, set wages, and compete on prices.

## Setup (once)
1. Run `prisma/migrations/0020_bizjobs/migration.sql` in the Supabase SQL editor (safe to re-run; `fix-database.sql` has the same statements appended).
2. `npm run db:generate`, then redeploy. No new environment variables.

## How it works

**Hiring** (Living Abuja → Businesses → *Staff & prices*)
- The owner sends an offer to a username with a role and an hourly wage (₦2,000 to ₦200,000). The player also gets a phone message.
- The player opens Living Abuja → *My jobs* and accepts or declines. One job per player. A business holds `3 + 2 × level` people (max 15), so upgrading makes room.
- The owner can change a wage (applies from the next shift) or fire someone.

**Shifts and pay**
- The employee must be *inside* the building to clock in, then clocks out to be paid: `hours × wage`, at most 8 hours per shift. The wage is locked in when the shift starts.
- Wages come out of the business's profit balance (the till). If it can't cover the bill, the rest is kept as **owed** and the employee can *Claim owed* later. Firing or quitting never erases owed wages.
- Settlement is compare-and-set on the employee row, so double clicks or two tabs can't pay a shift twice.

**Prices and competition**
- Each owner sets a *price level* (50% to 300% of list) and can set individual service prices (meals, haircuts, room, and so on) within the same band. Catalog goods follow the price level.
- Customers inside a player-run building pay the owner's prices (the server charges them; the client only displays them). The owner keeps the sale minus the supplier cost, which is 50% of list price (`COGS_RATE`).
- Players can press **🔎 Compare** on any store item to see which player-run shops sell it and for how much (`GET /api/shop?compare=ID`).
- Idle sales while the owner is away are settled when the owner opens the panel (up to 2 hours at a time). The crowd size depends on:
  - price vs. the other player-run shops of the same type in the same district (plus a "city average" at list price, so a lone shop can't gouge). Elasticity is 1.8, so profit peaks around 1.2× list and drops on both sides;
  - staff clocked in right now (+12% each, up to 6);
  - reputation.
  Net profit (sales − supplier cost − overhead) lands in the till.

## Files
- `lib/bizEconomy.ts`: all constants and pure formulas (tune the economy here).
- `app/api/bizjobs/route.ts`: offer / respond / setwage / fire / clockin / clockout / quit / claim.
- `app/api/businesses/route.ts`: idle settlement now credits the till (before, `balance` never grew), plus a `setprices` action.
- `app/api/shop/route.ts`: owner prices and crediting the owner; `GET` for prices and compare.
- `components/BizManage.tsx`, `CityLifePanel.tsx`, `StoreModal.tsx`, `Interior.tsx`: UI.
- Schema: `PlayerBusiness.markup/prices/settledAt` and the new `BusinessEmployee` table.

## Known limits
- Not run against a live database or in a browser here (Prisma's engine couldn't be downloaded in my sandbox). Please try it with two accounts before shipping.
- The old anonymous "Hire" button is removed from the UI (the API action still exists).
- Job offers are direct (by username). There is no public job board yet.
- Clock-in checks that you are inside the building; staying there afterwards isn't enforced.
- Idle sales are only settled while the owner opens the panel, as before.
- Per-item prices for catalog goods are API-only (`setprices` with a `prices` map); the UI exposes the price level and services.
