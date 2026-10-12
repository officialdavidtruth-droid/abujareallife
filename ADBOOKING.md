# Billboard advertising: abujareallife.online/adbooking

Real businesses sign up, pick one of the city billboards and dates, write an ad, pay with Paystack, and a reviewer approves it. Approved ads are drawn on the 3D billboards from their start date.

## One-time setup
1. **Database.** Run `prisma/migrations/0030_adbooking/migration.sql` in the Supabase SQL Editor (safe to re-run; it is also appended to `prisma/fix-database.sql`). Then `npx prisma generate` (the build does this).
2. **Environment variables** (Vercel > Settings > Environment Variables):
   - `ADMIN_EMAILS`: comma separated emails of the people who may review ads, e.g. `you@gmail.com`. Create an advertiser account with that email at /adbooking; a **Review queue** tab appears.
   - Already needed and already used by the wallet: `PAYSTACK_SECRET_KEY`, `AUTH_SECRET`, `DATABASE_URL`. `APP_URL=https://abujareallife.online` is recommended.
3. **Paystack webhook.** Nothing new: billboard payments use the same URL as the wallet (`https://abujareallife.online/api/wallet/webhook`). Billboard references start with `adb-`, wallet ones with `arl-`.
4. **Prices and boards.** Edit `lib/adSlots.ts` (`AD_SLOTS`, per-day price, names, discounts). The slot number is the position in `BILLBOARDS` in `components/CityScenery.tsx`; keep them in the same order. Add a board there and a matching entry in `AD_SLOTS` to sell more.

## How it works
- Advertiser accounts are separate from game accounts (`AdAccount`, cookie `arl_ad`).
- Booking creates an `AdBooking` (PENDING_PAYMENT) that holds the dates for 1 hour, then sends the advertiser to Paystack.
- Payment is accepted in ONE place, `settleAdPayment` in `lib/adPay.ts`, called by both the return page and the webhook. The price is read from the booking, never from the browser, and Paystack is asked for the real amount. If two people paid for the same dates, the later one is refunded automatically.
- After payment the booking is IN_REVIEW. The reviewer approves (goes live on the start date) or rejects with a reason (refunded through the Paystack refund API; if that fails the page tells you to refund it in the Paystack dashboard).
- The game reads `GET /api/ads/live` (cached 60 s) every 5 minutes.

## Flyers, admin portal and prices (migration 0031)
- **Flyer upload.** On /adbooking step 3 the advertiser can upload a JPG / PNG / WebP flyer. The browser cuts it to the board's exact shape (1600 x 708, the same ratio as the 3D board face) with two choices: *Show all of it* (whole picture, board colour fills the gaps) or *Fill the board* (crops the edges). Only that finished JPEG is sent, so the game can never stretch it; it is also fitted by its real width and height when drawn. With a flyer, the headline is just a name for your review team and the tagline is optional. Flyers are stored in the database (table `AdImage`, under 900 KB each) and served by `GET /api/ads/image/<bookingId>`: public once approved, otherwise only the advertiser and admins can open it.
- **Admin portal: abujareallife.online/adminad.** Log in with an advertiser account whose email is in `ADMIN_EMAILS` (create the account at /adbooking first, then log in at /adminad). Tabs: *To review* (big flyer preview, open full size, Approve / Reject with reason), *All ads* (filter, and *Take down* for a live ad), *Prices*.
- **Prices set by you.** *Prices* tab: type a per-day price for each board and Save, or press *Make free*. 0 means free. A paid price must be at least 100 a day (Paystack will not take tiny payments). A free booking skips Paystack and goes straight to your review queue (limit: 3 free ads waiting per advertiser). Rejecting a free ad needs no refund. The defaults in `lib/adSlots.ts` apply only to a board you have not priced. Bookings already made keep the price they were made at.
- The old *Review queue* tab on /adbooking was replaced by an *Admin portal* link for admins.
- **To apply:** run `prisma/migrations/0031_ad_images_prices/migration.sql` in the Supabase SQL Editor (safe to re-run), copy the files over, `npx prisma generate`, deploy.

## Not included yet
Logo upload separate from the flyer, emails (receipt and approval notices), password reset, and a view counter. Ask for any of these next.

## Board names
Boards are named after the real in-game building each one stands next to (found with the nearest business building in `BUILDS_WORLD`): Central Area Market, Central Area Logistics, National Civic Centre, Central Area School, Jabi Market, Garki Gun Shop. If you move a billboard in `components/CityScenery.tsx`, update its name in `lib/adSlots.ts`.
