# Update: origins, popularity, calmer HUD

## Run these first
1. Supabase > SQL Editor: run `prisma/setup-database.sql`, then `prisma/fix-database.sql` (safe to re-run).
2. Redeploy (the build runs `prisma generate`).

## What changed
- **Wheel of Luck (sign-up only)**: when you create an account the server spins LAPO (poor, ₦50,000) or NEPO (rich, ₦5,000,000)
  and stores it on the account (`User.origin`). The wheel is shown once, as part of sign-up, before the character creator.
  There is no way to re-spin or change it. 3 in 10 land on NEPO. Tune in `lib/profile.ts`.
- **Men and women now have different bodies** (`lib/humanRig.ts`): men get a broad V-shaped chest, wide shoulders, thicker neck/arms/legs;
  women get narrower shoulders, a small waist, bust, wider rounder hips, slimmer limbs, smaller hands/feet, lashes and a softer jaw.
- **No starting car**: players own a house only. The Car Dealer sells a car for ₦2,500,000 (`CAR_PRICE`).
  CAR/horn buttons and the E key only work once you own one.
- **Popularity (fame)**: bar top-right, tiers Nobody > Local > Known > Influencer > Elite.
  Earn: quests +3, shifts +2, helping a nearby player +4 (costs ₦5,000, goes to them), active play +1 per 10 min. Daily cap 120.
  🏆 Fame panel shows the ranking grouped into Elites / Influencers / Rising.
- **HUD declutter**: one ☰ dock (Map, Jobs, Shops, Quests, Fame, Me, Love, Crime); Enter and Help appear only when relevant.
  Install button is smaller and hides itself after 10 s.
- **Jobs list**: card layout with filter chips (near you / top paid / category) and the real pay per shift.
- Fixed: `City.tsx` never passed the nearby building up, so the 🚪 Enter button could not appear.

## Not done yet
- Timed city "events" that give fame (no event system exists yet).
- Existing players keep their cash but lose the car and start at 0 fame.

## Player-first city update — 2026-10-07
- Removed the in-game NPC marriage/family start option; existing saves are loaded with family disabled.
- Real-player relationships now follow a sequence: dating → engagement → marriage, with acceptance at every stage.
- Building entry now gives immediate Entering feedback and respects business opening hours.
- Businesses display OPEN/CLOSED status and hours in the nearby building card and interior header.
- Building exits now calculate a sidewalk-side exit near the closest road instead of dropping players into the road/building footprint.
- Added taxi stands and bike-hire stands with paid fast travel to Abuja districts.
- Added roadside advertising billboards with a player-facing “YOUR AD HERE” placeholder.
- Added `/api/transport` for server-side transport fares and transaction records.

## Missions, weapons and combat update
- Added a Mission Control panel (M) with four Abuja-themed mission contracts and an active objective tracker.
- Starting a mission sets an in-world navigation waypoint toward its destination; arriving marks that objective complete.
- Added a weapon loadout with a service pistol, compact SMG and carbine rifle, magazines, reserve ammunition, weapon switching (G), reload (R), and firing (V or the on-screen Fire control).
- Weapon shots target the nearest multiplayer player inside the weapon's range and forward aim cone. Shot damage, cooldowns, knockouts, combat animations and the existing assault reporting flow are integrated with the current multiplayer layer.
- Added procedural shooting and reloading body animations; existing movement, vehicles, melee combat and mobile controls remain in place.

## Missions & weapons bug-fix pass
- Missions now pay: new `/api/mission` (start / claim / abandon). Reward, minimum time and heat are decided server-side from `lib/missions.ts`; completed contracts persist (1 h cooldown) and an active one restores its waypoint after reload. No DB migration needed (tracked via Transaction rows).
- On-screen Fire button now goes through the ammo system (was infinite ammo). A bullet is spent only when a shot actually goes out.
- Weapon stats live in one place: `lib/weapons.ts` (used by UI, shooting, damage rules).
- Reload/switch/key handlers use refs: no side effects in state updaters, no listener re-binding, no double notices in Strict Mode.
- Mission auto-abandons if the waypoint is replaced (taxi, map, message). "Last Ride Out" now targets the airport.
- Still open: damage is client-trusted, no line-of-sight check, ammo/weapons not server-owned.

## Mission mechanics update
- Missions are now multi-stage (`lib/missions.ts`): Delivery = pick up at the logistics depot, then deliver to Wuse Market; Recovery = reach Jabi, hold the area for 10 s, return goods to the depot; Chase = police heat applied at start, reach the airport; Escort = meet the VIP at the hotel (hold 5 s), then escort to Maitama.
- Each contract has a deadline (server enforces it on claim, client shows a countdown) and fails on timeout; Escort also fails if you are knocked out.
- Hold objectives need you to stay within 12 m of the spot; leaving resets the timer.
- Waypoints pick the NEAREST matching building to you.
- Known limits: stage progress is not persisted (after a reload an active contract restarts at stage 1 with its original deadline); there is no physical package/VIP/police NPC in the world yet — objectives are location- and time-based.

## Server-side shot validation
- `POST /api/shot`: the server authorizes every shot that should hurt someone. Checks: signed in, not jailed, fire-rate, target online and not jailed, both claimed positions plausible vs last reported position (no teleporting), target in weapon range. Damage comes from the server weapon table.
- On success it returns a signed single-use **hit ticket** (`lib/shotTicket.ts`, 12 s expiry, key derived from AUTH_SECRET). Shooters can no longer forge damage, target or weapon.
- `POST /api/shot/confirm`: only the intended victim can redeem a ticket, once; the victim's client applies the damage the server returns. Realtime `shot` broadcasts WITHOUT a valid ticket only play the animation.
- Assault heat for shooting is now applied by the server to the shooter (first shot per target per 30 s, skipped if the target shot you in the last 20 s). The victim no longer reports shots, so false assault reports are impossible. Knockout reports still go through `/api/fight`.
- No database migration needed.
- Known limits: ammo/weapon ownership is still client-side; no line-of-sight/wall check; positions are client-reported every 5 s (plausibility check allows ~30 m/s + 12 m slack); a modified VICTIM client can still ignore damage (needs server-held HP); in-memory rate/replay maps are per server instance.

## Wallet top-ups (Paystack)
Packages (`lib/wallet.ts`): ₦5,000→80,000 · ₦10,000→170,000 · ₦25,000→400,000 · ₦37,000→585,000 · ₦50,000→1,500,000 · ₦100,000→10,000,000 game money (added to the player's cash).
Setup:
1. Vercel env: `PAYSTACK_SECRET_KEY` (start with `sk_test_...`, switch to `sk_live_...` when ready). Optional `APP_URL` (e.g. https://yourdomain.com).
2. Paystack Dashboard > Settings > API Keys & Webhooks: set the Webhook URL to `https://YOUR-DOMAIN/api/wallet/webhook`.
3. Redeploy. No database migration needed.
How it works: 💰 Wallet in the ☰ dock -> `/api/wallet/checkout` creates a Paystack payment -> player pays on Paystack -> returns to the game (`/?wallet=1`) -> `/api/wallet/verify`; the webhook does the same if the player never returns. Both call one idempotent function (`creditPayment` in `lib/paystack.ts`): it asks Paystack for the truth, checks status/amount/currency, takes the credit amount from OUR table (never from the browser) and uses the payment reference as the Transaction primary key so a payment can only ever credit once.
Not included: refunds/chargebacks (handle manually in Paystack; there is no automatic clawback), receipts page, admin view of payments (use the Paystack dashboard).
