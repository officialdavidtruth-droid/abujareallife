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

## Not included yet
Image / logo upload (needs file storage), emails (receipt and approval notices), password reset, and a view counter. Ask for any of these next.
