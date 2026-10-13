# Abuja Real Life — Changelog

Merged from the ~59 per-step and patch notes that used to live in the repo root. For how the system fits together and where each rule lives, read `ARCHITECTURE.md`; this file only says **what was added or changed, and what you had to run**.

**About the order.** Only a few of the old notes carried dates. Everything else is ordered by dependency and migration number, newest first, so treat the order inside "Undated" as approximate. Items marked 🛠 need a migration or setup step.

**Two "Step N" series exist in the old notes and overlap**; they are not one sequence:
- *Crime/economy series:* Step 1 intoxication, 2 dealers, 3 robbery cooldowns/shield (numbering inferred: ROBBERY.md itself had no step number), 4 downed state, 5 hold-ups, 6 chop shop, 7 escorts. (The separate "Step 2: crews" belongs to the social series.)
- *World/street series:* Step 5 witnesses, 6 police, 7 street crime, 8 city look, 9 house security, 9 street NPCs. Plus house-door steps 1–3, home-save steps 1–3, club-companion steps 1–3, fashion steps 1–4, plane steps 1–3.

Legend of "how to apply" boilerplate that appeared in nearly every note: *copy files over the same paths (never delete and replace whole folders), `npm run db:generate`, deploy*. It is omitted below except where something extra was required.

---

## Unreleased — billboard flyers, /adminad portal, admin-set prices 🛠
- Advertisers can upload their own landscape flyer; it is cut to the board's shape in the browser (fit or fill) and drawn on the 3D billboard unlit and unstretched. (`app/adbooking/page.tsx`, `app/adbooking/AdBoard.tsx`, `components/CityScenery.tsx`, `app/api/ads/image/[id]/route.ts`)
- New admin portal at `/adminad`: review queue with flyer preview, approve / reject (+refund), take down live ads, and a Prices tab. (`app/adminad/*`)
- Admin sets each billboard's price per day, from 0 (free) upward; free bookings skip Paystack. (`lib/adPrices.ts`, `lib/adSlots.ts`, `app/api/ads/[action]/route.ts`)
- You can tilt the camera up about 17 degrees to read billboards (`LOOK_UP` in `components/CityWorld.tsx`). Billboards with an ad are clickable, and a "View ad" button appears when you walk within 16 m of one; it opens the flyer full size with Call / WhatsApp / website buttons. (`components/CityScenery.tsx`)
- 🛠 Run `prisma/migrations/0031_ad_images_prices/migration.sql` (also appended to `prisma/fix-database.sql`), then `npm run db:generate`. Details in `ADBOOKING.md`.

---

## Unreleased — bigger parking, pedestrians stay out of walls
- Player houses: front yard deepened from 6.2 m to 9.5 m (the deepest that keeps every plot, and so every player's slot, exactly where it was). Most houses (607 of 660) now get a paved two-bay parking pad 6.8 m wide with painted bay lines and a path from the porch; the rest keep a single, wider (3.8 m) driveway because a lamp or pole stands in the way. Your car parks in the left bay, the right bay stays free. Gate opening, gate posts and palms follow the pad width. (`lib/houses.ts`, `components/PlayerHouses.tsx`)
- Pedestrians walked fixed pavement lines that ran straight through the player-house strip: 120 of 132 lines crossed a house. They now stay inside the outer ring road (and use only its city-side pavement), look ahead and turn round instead of walking into a wall, fence, building, parked car or house, and are pushed out of any solid they still overlap. Fast grid lookup, so many pedestrians stay cheap. (`components/CityPeds.tsx`, `components/CityCollision.ts`)

---

## Unreleased — reference-style HUD
- New `components/HudCard.tsx`: profile card (avatar, name with fame badge, level + XP bar) with labelled Health, Energy, Hunger and Mood bars; the other four needs are a thin row of small bars under it. Level = total skill XP (1 + floor(sqrt(xp/25))). Health is live.
- Minimap has an N marker that rides the rim and always points north (`CityUi.tsx`).
- Top-right: time with weather and location, cash, menu, and a labelled shortcut row (Home, Map, Phone, Jobs, Inventory, Settings). Home is in `Sim.tsx`, the rest in `GameLayer.tsx`. 🌍 players and 🕺 emotes are small buttons under it. The separate ⚙️ and 🔊 buttons are gone (Settings is in the row, mute is inside Settings).
- Action pad on a 3-column grid: Interact, Phone, Jump, Car, Fight, Crouch, Sprint. Taxi, Camera, Horn / plane view and Fire are small extras beside it. A Phone button sits next to the joystick.
- New: Crouch (slower, lower camera, smaller model; sprinting cancels it) and Interact (enters the building you stand next to, else enter/exit vehicle).
- Contextual pills (Carjack, Chop shop, Break in, Help) stack above the building card.
- Everything scales with screen height. `app/gtahud.css` rewritten, `app/gtamenus.css` hides the new HUD parts while a menu is open.

---

## Unreleased — better lighting and sky
- New `components/CityAtmosphere.tsx`: gradient sky dome with drifting clouds and a sun glow (follows time of day and weather), a generated sky reflection map so car paint, glass and metal reflect the sky, and Neutral tone mapping for richer colours.
- `CityWorld.tsx`: wired in the atmosphere, longer/softer depth haze (fog 70 to 290), warmer hemisphere light, cleaner shadows (normalBias).
- `CityCars.tsx`: clear-coat paint on non-touch devices (phones keep standard paint, which still reflects the sky), glossier glass.
- `cityShared.ts`: warmer sun and sunset colours.
- `app/gtahud.css`: soft screen-edge vignette.
- Not included: real depth-of-field blur (needs the postprocessing package).

---

## Unreleased — GTA pause-menu skin
- New `app/gtamenus.css` (imported last in `app/layout.tsx`): every panel (missions, phone, market, inventory, home, store, wallet, side panels, sheets) gets one flat GTA pause-menu look: black panel with gold top rule, gold eyebrow and white uppercase title, flat tabs with a solid gold selected tab, list rows with a left edge bar, square gold action buttons. Visual only.
- The HUD (needs, minimap, buttons, cash) now hides while a menu is open, which fixes the needs bars showing on top of the Missions panel.

---

## Unreleased — GTA-style outdoor HUD
- Re-arranged the phone HUD so each corner has one job: radar + needs bars top-left, clock/cash as plain text with the menu and one row of small round buttons top-right, toasts and the nearby-building card top-centre, joystick bottom-left, and the action buttons in an arc around the right thumb (Fight/Fire big in the corner, Jump above, Sprint beside, Car/Camera/Taxi/Horn further out).
- Contextual buttons (Carjack, Chop shop, Break in, Help) are now one stack of pills to the left of the arc instead of round buttons on top of Jump. New wrapper `.ctxStack` in `components/GameLayer.tsx`.
- The separate 🔊 button is hidden on the outdoor HUD ("Mute everything" is in ⚙️ Settings).
- All of it is one new stylesheet, `app/gtahud.css`, imported last in `app/layout.tsx`. Outdoor, touch screens only; interiors and desktop are unchanged. To go back to the old layout, remove that import.

---

## Unreleased — shared world (this session)

Goal: every player sees the same AI cars and NPCs at the same positions, seeded from the shared clock in `lib/worldClock.ts`. Done step by step.

- **Step 1 — shared traffic lights.** Traffic-light phase used each phone's local scene clock (starts at 0 on load), so lights disagreed between players. Added `simSeconds()` (seconds since the shared epoch) to `lib/worldClock.ts`; `CityTraffic.tsx` (lamps, cars, rides), `CityPeds.tsx` and `TailTarget.tsx` now use it.
- **Step 2 — seeded ambient randomness.** Added `simRand(id, n)` (deterministic per-entity draws). Pedestrian wander targets and rest times use it with a per-ped counter (`Ped.rc`). Crime-reaction and local-player-dependent randomness intentionally stays `Math.random`.
- **Step 3 — shared traffic core.** New `lib/trafficCore.ts`: pure fixed-tick (0.5 s) simulation of every AI car from the seeded layout, restarting every 2 h and fast-forwarding on join (~35 ms). `CityTraffic.tsx` keeps its per-frame logic as a local layer that follows the core, lags when stopping for you/crimes/hails, and catches up. `lightState` moved into `worldClock.ts` (still re-exported by `cityShared.ts`). Verified in a script (two instances joining at different times agree to 0 m); not tested on devices.
- **Retention, step 1 — seasons + fame board (migration `0027_season_scores`) 🛠.** 28-day seasons (Monday 00:00 WAT; Season 1 began 5 Jan 2026), `SeasonScore` table, `GET /api/season?board=`, new 🏅 Seasons panel in the ☰ dock (clock, board chips, top 30, your rank). Season fame is added wherever fame is earned (`awardFame`, driver fares, city events). New: `lib/season.ts`, `lib/seasonServer.ts`, `app/api/season/route.ts`, `components/Seasons.tsx`. Edited: `lib/game.ts`, `app/api/transport/route.ts`, `app/api/city-events/route.ts`, `components/GameLayer.tsx`, `prisma/schema.prisma`, `prisma/fix-database.sql`, `prisma/setup-database.sql`. Run the migration before deploying. Weekly goals already existed (Week tab); they were not rebuilt.
- **Docs.** The old per-step notes were merged into this file and `ARCHITECTURE.md`.
- **Next (retention):** step 2 best race times per tier, step 3 richest crew, step 4 end-of-season rewards, step 5 push notifications (Web Push for the PWA, native push for Capacitor).
- **Next (shared world):** 3b pedestrians on the same core pattern; then a general local-layer-over-core rule for hails and crime effects.

---

## 2026-10-10 — Mature-content age gate and club nightlife 🛠
- New sign-ups must enter a valid date of birth proving 18+ and acknowledge the mature-content notice; the server validates both independently. Stored on `User` (migration `0022_adult_access`, also in `setup-database.sql` / `fix-database.sql`).
- Nightclub lounge panel with five fictional hostess NPC profiles and fictional in-game contraband rumours (narrative only, no sexual content depicted). The weed trade remains the only implemented drug mechanic.

## 2026-10-07 — Player-first city update
- Removed the NPC marriage/family start option; saves load with family disabled. Real-player relationships go dating → engagement → marriage with acceptance at each stage.
- Building entry gives immediate "Entering" feedback and respects opening hours; buildings show OPEN/CLOSED and hours in the nearby card and interior header; exits drop you on a sidewalk near the closest road.
- Taxi stands and bike-hire stands with paid fast travel; roadside billboards with a "YOUR AD HERE" placeholder; `/api/transport` for fares and transaction records.

---

## Undated, newest first (approximate)

### Home, houses and housemates

- **Home-save races, steps 1–3 (migration `0026_home_furniture`) 🛠.** Layout/look/sold fixtures are one JSON row with a version counter and atomic versioned writes (`lib/homeStore.ts`, `editHome()` retries 8×); furniture place/store/sell no longer double-pay. Step 2: the client sends `base` on Save and shows the merged result ("A housemate changed things too: now merged"), and shows real server errors. Step 3: each placed piece is a `HomeFurniture` row (`lib/homeFurniture.ts`); existing houses migrate automatically on first access. Run the migration **before** deploying.
- **Home door, steps 1–3 (migration `0025_home_visits`, step 3 none) 🛠.** Step 1: everyone inside a house sees each other (`HomePresence.tsx`, room `room:home-<slot>`, new `p` pose field in `lib/roomNet.ts`). Step 2: knock, invite by name, ask to leave, guest read-only view, welcome lasts 90 min, knock waits 60 s (`/api/visit`, `HomeDoor.tsx`). Step 3: owner lock/unlock (`home_open` hidden row); unlocked doors show "· 🔓 open" and let anyone in; a kicked player cannot re-enter for 10 min; the server only sends layout/furniture to allowed visitors.
- **House plots (migration `0024_house_slot`) 🛠.** `User.houseSlot` unique; capacity 105 → 660 plots (`ROWS = 6`); `/api/houses` assigns missing plots oldest-first. Position clamp raised (`LIM` 300). Run the migration before deploying.
- **Housemates (migration `0023_housemates`) 🛠.** Invite up to 4 players to live in your house (Menu → Housemates). Their "home" becomes your house; shared rooms/furniture/layout/look; owner-only build/sell/look/guards; no burgling the house you live in.
- **Glamorous houses + "🎨 House look".** Designs Classic (free) / Modern ₦2.5M / Villa ₦5M / Mansion ₦15M; extras (gate & wall ₦1.5M, columns ₦1.2M, balcony ₦2M, palms ₦0.9M, garden ₦0.8M, night glow ₦1.8M); colour pickers free. NEPO babies get the Mansion with all extras free. Stored in hidden row `home_style`.
- **Home design update.** Per-account default home look; editor tabs Arrange / Add items / Style with fine/normal/far move, 15/45/90° turn, snap to wall, put away; new 3D fans, ceiling fans, air conditioners, TVs, beds, sofas.
- **Player houses on the street.** Every account has a named house on the outer ring road with a driveway; E at the door enters; gold beacon; "📍 Route home"; houses are solid for walking, cars and the planner. Slots by sign-up order at first (`lib/houses.ts`, `/api/houses`, `PlayerHouses.tsx`).
- **Home upgrades fixes.** Full catalog (south wing, gym, cinema, office, solar, AC, water heater, smart home, surround sound, chef's kitchen, orthopedic mattress, inverter, borehole, fridge freezer, gaming rig, fibre internet); `mallPrice` added to `lib/sell.ts`; `setSouthLimit` added to `lib/collision.ts`; sleep 240 → 120 min (orthopedic mattress 75), movie night 110 → 55, big-screen gaming 80 → 45; `buildingExitPoint` exported.

### Crime, police and security

- **Step 9 — house break-ins and security (no migration).** 🔓 Break in at any non-owned house (8 s lock bar), guard dog ₦1.5M / guard ₦4M / armed guard ₦9M, odds 80% → 6%, 20% of owner cash (cap ₦400k), +30 heat, 15 min per-house shield, owner alerts, visible patrolling guards on the 8 nearest guarded houses. `lib/security.ts`, `lib/burgle.ts`, `/api/security`, `/api/burgle`, `BreakIn.tsx`, `HomeSecurity.tsx`. `burgle` joined the shared cooldown table (120 s).
- **Step 9 — street NPCs (no migration).** Dealers Tunde (Utako Market) and Yaro (Utako Nightclub) sell weed at 125% of Mama Put's price (+3 heat/unit); escorts Chioma ₦35k, Zainab ₦45k, Ngozi ₦80k (+5 heat, 5 min cooldown). 18+ gate; scenes are fade-to-black. `lib/streetNpc.ts`, `/api/street-npc`, `StreetNpcs.tsx`.
- **Step 8 — city look (visual only).** ±1 storey variety, five rooftop looks, real business names on signs, blade signs and striped awnings, night light pools, instanced street clutter, graffiti, utility poles and wires, wet roads/puddles. Layouts "lot" (fenced forecourt, parked cars, gate) ~37 buildings and "alley" ~29 buildings (`lib/destinations.ts`); fences, parked cars, alley walls are solid (`LOOK_SOLIDS`). Doors need you within 2.6 m, so lot buildings are entered through the gate. New `components/CityLook.tsx`.
- **Step 7 — street crime.** Drawn gun makes peds react; aim until hands go up, then 🔫 Demand cash (₦60–180k, +50 heat, 75 s cooldown, needs a gun in inventory); outcomes robbed / brave confronts / bolts. Carjacked owner chases you 7 s, then phones the police (patrol dispatched); chop-shop theft also triggers the call after ~10 s. Hold-up clerks put hands up, 25% armed (8% min with stealth), 2.5 s warning, resolved on the server (haul gone, KO 15 s, 5% hospital bill, +10 heat). New poses `handsup`, `reach`.
- **Step 6 — real police response.** `PolicePatrol` replaces `NpcPolice`: witness call or WANTED sends cars that drive the road grid; officers chase with path-finding and line of sight, search 22 s, arrest after ~1.2 s contact; heat 40/70/110 → 1/2/3 cars and 2/3/4 officers; roadblocks at heat ≥ 110 while driving fast; `POST /api/evade` cools heat (−4 per call every 12 s when hidden); siren volume by distance. New `lib/police.ts`, `/api/evade`.
- **Step 5 — witnesses and NPC reactions.** `lib/witness.ts`: per-pedestrian personas (~40% coward / 35% bystander / 25% brave), sight/hearing radii, reactions freeze/handsup/cower/flee/film/confront, Abuja-pidgin speech bubbles (max 4), `WITNESS_HEAT` 6 per witness capped at 3. AI drivers witness too (stop / film / honk / flee, behind glass: sight ×0.8, hearing ×0.6). Window event `arl-witness-report`.
- **Step 7 (crime series) — escort service.** Club Escorts can offer company to real players on foot within 6 m (₦15k–250k, 2 min offer); heat escort +20 (club +10), buyer +5; officer accepting = sting (+45 heat for the escort). Uses `Deal` with `building = 'street'`.
- **Step 6 (crime series) — chop shop (no migration).** Steal an AI car → hidden yard (Lugbe, Kubwa, Asokoro, Gwarinpa) within 4 min, up to 3 secret checkpoints, deliver for cash (₦80k–400k) or 2–4 car parts; fit parts for +10/+8/+6/+4 condition; hot cars cannot be sold via Inventory; car parts are a new category. `lib/chopData.ts`, `/api/chop`, `ChopShop.tsx`, `ChopYards.tsx`.
- **Step 5 (crime series) — shop hold-ups (migration `0018_holdup`, index only) 🛠.** 🔫 Hold up the clerk on 10 shop types; +45 heat at start; 20 s bag with partial pay after 5 s; hidden police arrival 14–38 s; ₦40–160k haul; 5 min/10 min cooldowns. Old instant `rob_shop` disabled.
- **Step 4 — downed state (migration `0017_down_state`) 🛠.** `Save.downUntil/downKind`; KO 15 s, pass-out 45 s (wake groggy, drunk/high capped 60), 8 s safe window; robbing someone out cold takes 50% (max ₦300k); passing out in a venue drags you to the street; `DOWN_REPEAT_MS` 60 s.
- **Step 3 — street robbery.** `/api/rob` 30% (max ₦150k, +45 heat), pickpocket ₦8–40k, new 🔪 Mug ₦20–90k; victims get a `robbed` phone message; cooldown stack (any 20 s, per-kind, victim shield 120 s, 8 per 10 min).
- **Step 2 — weed trade (no migration).** Mama Put (Market, ₦5–7k) supplies, Slim (Nightclub, ₦9–13k) buys; prices drift every 15 min; Slim −4% per unit sold, floor 55%; heat +2 per unit bought / +5 sold; bust chance 6% + 0.2%/heat + 1%/unit (max 60%) seizes the weed and adds 30 heat.
- **Step 1 — intoxication (migration `0016_intoxication`) 🛠.** `Save.drunk/high`; bar menu (palm wine, lager, whisky, champagne) in Nightclub/Restaurant/Hotel; smoke uses `drug_weed`; screen effects; blackout at 100.
- **Club underworld (migration `0015_nightlife`) 🛠.** Professions Club Escort / Drug Dealer / Gang Member; 🪩 Underworld panel in the Nightclub (player-to-player offers, 2 min expiry, heat per deal, sting if an officer accepts); bribes to police (real officers and two NPC Vice officers, `NPC_COPS`).
- **Bug-fix pass (patch notes).** `clampHeat`, `lockedSkillXp`; many routes (deal, escort, dealer, casino, holdup, rob, transport, economy/start, race, mission, crew, businesses, arrest) got row locks, atomic heat, single-use tickets and compare-and-set; signup throttle uses real client IP; arrest has a server proximity check and a 30 min no-repeat reward window. "Sting" status added to `Underworld.tsx`.
- **Server-side shot validation.** `POST /api/shot` issues a signed single-use hit ticket (`lib/shotTicket.ts`, 12 s); `POST /api/shot/confirm` redeemed by the victim only; server applies assault heat to the shooter.
- **v5 NPC police, physical crime, death.** Heat ≥ 40 spawns patrols (1/2/3 officers at 40/70/110), arrest on 1.2 s contact, rob/carjack/pickpocket buttons (`CrimeActions.tsx`, `/api/rob`, `/api/carjack`, `/api/crime`), death takes all cash (`/api/death`) and respawns you in your house with 8 s protection.
- **No-Rules City (migration `0004_no_rules_city`) 🛠.** Profession/focus/style/outfit editor; skills start at 0; quests, crime, heat/WANTED, bail, jail; real police players (`/api/wanted`, `/api/arrest`); station and jail buildings; building access by rank/invite/profession/fee; relationships.
- **Interiors + shared rooms (migration `0005_interiors`) 🛠.** Walkable rooms for every building type (`lib/interiors.ts`), 💼 shifts, 🛒 buy, 📜 quests, 🕶️ tills/vault (crime enforced inside the right building), Supabase channel `room:<id>` per building.

### Economy, business and progression

- **Goals loop.** Starter chain now 12 steps (+ "Join a crew", "Go to a party"); weekly tab (Spotlight Party/Race/Hustle/Neighbour Week pays ₦200k, 3 missions, ₦250k bonus for any 2, crew chest ₦150k each at ≥ 3 jobs); next-goal chip points at weekly items. No DB change.
- **Goals.** Guided starter chain, 7-day check-in streak, 3 daily missions + all-3 bonus, 14 badges; progress derived from `Transaction`; claims are hidden rows.
- **Daily income caps.** `lib/earnCap.ts` tiers (1–6 full, 7–12 50%, 13–18 25%, then 10%; ₦120k/day) for home jobs and driver fares; `/api/economy/start` returns 429 when exhausted; casino winnings no longer count as "earned".
- **Wallet top-ups (Paystack).** Packages ₦5k→80k … ₦100k→10M; checkout/verify/webhook with idempotent `creditPayment`. Set `PAYSTACK_SECRET_KEY` and the webhook URL.
- **Casino.** Slots (~92%), roulette (~97%), dice (97%); bets ₦10k–500k; daily loss limit ₦2M, 24 h break, reality check every 10 rounds, max payout ₦20M; blocked for accounts that ever topped up (`BLOCK_IF_TOPPED_UP`).
- **Street racing + tuning + paint.** Tiers ₦500k / ₦2M / ₦5M, reaction + 3 shifts, tuning levels, paint/rims/tint; 12 races/day, 45 s cooldown, ₦8M daily net cap.
- **Job mini-games.** Kitchen Rush, Delivery Run, Garage Fix; +2% per star, cap +50%, max 24 rounds/shift, 10 s apart.
- **Player-run businesses with staff (migration `0020_bizjobs`) 🛠.** Hire by username, wages ₦2k–200k/h, price level 50–300%, supplier cost 50%, compare prices, idle sales settled when the owner opens the panel, owed wages.
- **Parties (migration `0021_parties`) 🛠.** Hangout / house party / owambe / club night, vibe, dance, spray (8% sink), food and drinks, emotes, dance circle, Friends tab; phone polish (44 px targets, haptics, two-tap confirm, battery-friendly polling).
- **Crews, gangs and companies (migration `0019_crews`) 🛠.** ₦250k to found, kinds with different scoring, treasury, turf (₦3M, ₦120k/h/district), turf wars, daily Crew Cup, chat, leaderboard.
- **Messages.** Free chat, read receipts, share location, send money ≤ ₦500k; optimistic sending; migration `0009_messages` 🛠.
- **Rides.** Ride requests between players (migration `0014_ride_requests`) 🛠, all buildings as destinations, bus with shared stops.
- **Passengers + "meet them" fix.** Waypoints on players follow them; taxi menus list nearby players; your position is broadcast while riding; up to 3 friends in your car, one in a shared taxi (`cityPax.ts`, `PaxUi.tsx`).
- **Management/shifts (migration `0007_management`) 🛠.** `Management` table, `Save.mgrTasks`, shift tasks 45–60 min, manager seats and daily salary (`lib/work.ts`, `/api/manager`).
- **Origins, popularity, calmer HUD (migration `0006_origin_fame`).** Wheel of Luck (LAPO ₦50k / NEPO ₦5M, once at sign-up), male/female body differences, no starting car (Car Dealer ₦2.5M), fame tiers and daily cap 120, ☰ dock.
- **Server-owned money (migration `0003_economy`) and accounts (`0002_accounts`).** Auth with bcryptjs + jose, email verification, economy routes, `AUTH_SECRET` required.

### Missions, weapons and transport

- **Wuse Market Tail.** Stealth mission following a dealer's black SUV (alertness, lose conditions, ₦48k reward); `lib/tailRoute.ts`, `TailTarget.tsx`, `TailHud.tsx`.
- **Missions & weapons.** Mission Control (M) with four contracts, waypoints, multi-stage objectives and deadlines, `/api/mission` pays; weapon loadout (pistol, SMG, carbine; G/R/V), procedural shoot/reload animations; weapon stats in `lib/weapons.ts`.
- **Round 4: taxis, bikes, billboards.** Rides follow roads (`lib/roadRoute.ts`: right-hand lane, turn radius, red lights, kerb drop-off); stands moved onto the pavement with `curbSpot()`; billboards moved onto sidewalks. Fixed wrong heading formula and corner cutting (tested: 1,848 rides, none entered a building).
- **Plane, steps 1–3.** 1: single-pilot flight at the airport (E to board, Shift/Space throttle, W/S pitch, A/D bank; runway 180 m; crash tows the plane back). 2: chase and cockpit cameras (V / 📷 View), phone ✈️ Board button. 3: others see the flight (pose on the 5/s broadcast), one pilot at a time, up to 3 passengers via `cityPax.ts` when parked, label with pilot/passengers (`planeNet.tsx`).

### Fashion, characters and companions

- **Club companions, steps 1–3.** Talk → pay (`/api/club-company`, 5 min cooldown, +5 heat) → she follows you out and home → stays in your house until "Send her home" (`ClubTalk.tsx`, `ClubCompanion.tsx`, `lib/clubNpc.ts`). The planned bedroom scene (step 4) was not built.
- **Fashion, steps 1–4.** 1: Fashion Boutiques (5, 09:00–20:00, ownable) and 1,200 clothing items. 2: 672 shoes. 3: jewellery, watches, bags, headwear, eyewear, belts, ties. 4 part 1: wear clothes and shoes (wardrobe mirror "My bought clothes", server drops shoes not in the bag). Part 2: draw accessories on the 3D character (one per slot) and fix the women's 'f'/'w' gender bug. Wallets and suspenders (32 items) not wearable yet.
- **Wardrobe update.** Men's/women's outfit sets, 18 hair styles, mirror panel with live preview; police keep their uniform.
- **Human character.** Procedural human replaces the Xbot model (`lib/humanRig.ts`); emotes; walking around furniture; new objects and actions.

### Platform, UI and misc

- **Perf fix after Step 8.** Detail only within 85 m (`DETAIL_R`), shared geometry/materials, touch devices 1024 shadows and pixel ratio ≤ 1.25.
- **Mobile.** PWA (manifest, service worker, rotate-to-landscape, install buttons), Capacitor wrapper, safe-area CSS.
- **Multiplayer.** Supabase Realtime city (`lib/cityNet.ts`), instances of 40, chat bubbles, wave/high-five/dance with Social gain, cleaner phone HUD.
- **Groceries, online mall, phone, home upgrades.** Pantry system (`/api/pantry`), catalog 577 items, Online Mall (+8% delivery), real-smartphone Phone UI, 6 home rooms and 7 comfort upgrades, **voice chat removed** (code remnants remain, see `ARCHITECTURE.md` §15).
- **Round 3.** Family is opt-in (Menu → 💍 Family); labels only near you; iPhone silent-switch audio fix; "Tap to turn sound on" button.
- **Music + indoor UI pass.** Real tracks in `public/audio/` (`PLAYLISTS` in `lib/audio.ts`), side-panel interior UI.
- **HUD cleanup.** Tidy phone HUD on every screen size, `app/clean.css` imported last, removed floating name tags and the "ABUJA REAL LIFE" bar.
- **Tutorial / Guide.** In-game tutorial shown once per account (`Save.state.tut`); `Guide.tsx` is now unused and can be deleted.
- **Chat setup.** `fix-database.sql` creates the `Message` table; in-world chat needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Audio / settings.** `lib/audio.ts`, `lib/settings.ts`, `lib/catalog.ts`, `components/AudioRoot.tsx`, `components/StoreModal.tsx`, `/api/inventory`, `lib/gameLabels.ts` (original "update 2" drop).
- **Migrations with no surviving notes:** `0005_session_version`, `0008_marketplace`, `0010_living_city`, `0011_city_completion`, `0012_home_layout`, `0013_auto_work`.
