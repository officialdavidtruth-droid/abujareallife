# Abuja Real Life — Architecture

How the game is put together, where each rule lives, and what to be careful about. This replaces the ~59 per-step and patch notes that used to sit in the repo root. For *what was added when*, see `CHANGELOG.md`.

> **Status of this document.** Written from the old notes plus a check of the code tree (file lists, Prisma models, API routes, migrations, `package.json`). It has **not** been verified by running the game: the notes repeatedly say "not run in a browser or against a database", and that is still true. Where the notes and the code disagree this document says so (see [Known discrepancies](#15-known-discrepancies-and-cleanup-candidates)).

---

## 1. What this is

A phone-first, open-city multiplayer life sim set in Abuja, Nigeria. Players create a character, get a house, work, trade, commit crimes, race, party, join crews and run businesses. Currency is naira (₦). Players pick an origin at sign-up: **LAPO** (poor, ₦50,000) or **NEPO** (rich, ₦5,000,000; 3 in 10 spin NEPO).

Two scenes share one codebase:

- **Home / flat scene** (`components/Sim.tsx`): the player's own house, needs (energy, hygiene, fun, social, …), furniture, upgrades.
- **Open city** (`components/CityWorld.tsx` and the `City*.tsx` files): one shared 3D city with other real players, AI traffic, pedestrians, police, shops with walkable interiors.

Guiding rule of the project: **the server owns money, rewards, heat, cooldowns and outcomes; the browser only displays and reports.** Where that is not true it is listed in [Trust model](#9-trust-model-and-anti-cheat).

## 2. Stack

| Layer | Choice |
|---|---|
| App | Next.js 15 (App Router), React 19, TypeScript |
| 3D | three 0.180, `@react-three/fiber` 9, `@react-three/drei` 10 (all characters, rooms and cars are procedural; the only binary model, `public/models/Xbot.glb`, is no longer referenced by any code) |
| Database | PostgreSQL (Supabase) via Prisma 6 (`DATABASE_URL`) |
| Auth | `bcryptjs` password hashes + `jose` signed session cookie (`lib/auth.ts`, `AUTH_SECRET`); email verification via Resend (`RESEND_API_KEY`, `MAIL_FROM`) |
| Realtime | Supabase Realtime (presence + broadcast only, no tables) via `lib/supabaseClient.ts` |
| Payments | Paystack (`PAYSTACK_SECRET_KEY`, optional `APP_URL`) |
| Rate limiting | `middleware.ts` per-IP limiter on `/api/*` using Upstash Redis REST (`UPSTASH_REDIS_REST_URL/_TOKEN`); does nothing if unset |
| Hosting | Vercel, region `dub1` (`vercel.json`) |
| Mobile | PWA (manifest + `public/sw.js`) and Capacitor wrapper (`capacitor.config.ts`, `GAME_URL`) |

Scripts: `npm run build` runs `prisma generate && next build`. DB: `db:migrate:deploy`, `db:generate`, `db:studio`, `db:seed`.

## 3. Repository layout

```
app/
  page.tsx, layout.tsx          entry; layout imports css in order (clean.css last)
  api/<route>/route.ts          ~75 server routes (see §6)
  *.css                         globals, game, hud, hudfix, mobile, phone, clean
components/                     React + three UI. Big ones:
  Sim.tsx (~1.3k lines)           home scene + menu + most modals
  CityWorld.tsx                   the city scene root, player, camera, remote players
  CityScenery.tsx / CityLook.tsx  buildings / street dressing, signage, graffiti, fences
  CityTraffic.tsx                 AI cars, taxis/bikes/buses, rides, carjack scene
  CityPeds.tsx                    pedestrians + witness reactions
  CityPolice.tsx                  NPC patrols
  CityRemote.tsx / CityPeople.tsx other players, emotes
  Interior.tsx                    walkable building interiors
  GameLayer.tsx                   HUD dock, panels mounted over the city
  cityShared.ts                   shared mutable game state (GAME, VEH, OBS, TPOS, PEDPOS, INTER…) + helpers
lib/                            pure rules, tables, tuning numbers (importable by client AND server)
prisma/                         schema.prisma, migrations/00NN_*, setup-database.sql, fix-database.sql
public/                         audio/, icons/, models/, manifest.webmanifest, sw.js
middleware.ts                   API rate limit
```

Convention: **rules and numbers live in `lib/*.ts`; routes in `app/api` enforce them; components only render and call routes.** When tuning, edit the `lib` file named in §7.

## 4. Data model (Prisma)

Models: `User Character Job Property Vehicle InventoryItem Mission PlayerMission Transaction EmailCode Save Invite Relationship Crime Management Listing Message PlayerBusiness BusinessEmployee CareerProgress Reputation CityEvent CityBusinessMetric PlayerPosition DriverProfile RideRequest Deal Crew CrewMember CrewInvite CrewMessage CrewTurf CrewEvent Party PartyGuest HouseMate HomeVisit HomeFurniture SeasonScore`.

Core ideas:

- **`Save`** is the per-player game state: cash, needs, skills (all start at 0, server-owned), fame, heat, `drunk`/`high`, `downUntil`/`downKind`, `mgrTasks`, and a JSON `state` (tutorial done flag `state.tut`, `state.family`, …).
- **`Transaction`** is the money log. Many systems *derive* their state from it instead of adding columns: daily income caps, goals/missions progress, crew event scoring, mission start/claim rows. A payment reference is used as the primary key where idempotency matters (Paystack).
- **`Crime`** rows double as cooldown markers and event records (`holdup:<shopId>`, `chop:<id>`, `chopwin:`, `chopcaught:`, burglary markers).
- **`User`** also holds `origin`, date of birth + mature-content acknowledgement (migration 0022) and `houseSlot` (unique, 0024).
- **`HomeFurniture`** (0026): one row per placed piece. `HouseMate`, `HomeVisit`, `HomeFurniture` deliberately have **no foreign key to `User`**; rows of deleted accounts stay behind (harmless; cleanup SQL is in the changelog).

### The "hidden inventory row" pattern

To avoid migrations, lots of per-player state is stored as `InventoryItem` rows with a reserved key and (often) `quantity 0` or a version number. These never show in the bag UI:

| Key | Holds |
|---|---|
| `home_<upgrade>`, `home_style`, `home_open` | home upgrades, house look, door unlocked flag |
| `home_layout` | house layout/look/sold fixtures JSON; its `quantity` is the **version counter** used by `lib/homeStore.ts` |
| `sec_dog`, `sec_guard`, `sec_armed` | guards (quantity = how many) |
| `pantry_meals`, `pantry_supplies` | groceries / toiletries |
| `tune_<vehicleId>` | car tuning levels |
| `race_ticket`, `race_day` | race ticket and daily race log |
| `casino` | casino limits and session state |
| `shiftscore` | job mini-game score for the running shift |
| goal / badge claim rows | unique per user+key so a reward can be claimed once |
| `drug_weed`, car parts (`Engine block`, …) | real inventory items |

If you add per-player state that is small and not queried across players, this is the established pattern. If you need cross-player queries or concurrency (furniture did), use a real table.

### Migrations

`prisma/migrations/0002_accounts … 0027_season_scores` (note two `0005_*`: `interiors` and `session_version`). `setup-database.sql` is the one-shot for an empty database; `fix-database.sql` is the cumulative, re-runnable patch to paste into the Supabase SQL editor. **Every new migration must also be appended to both files.** Many later features needed no migration because they use hidden rows or `Crime`/`Transaction` rows.

## 5. Server patterns (use these when adding a route)

1. **Auth first**: read the session cookie (`lib/auth.ts`); reject jailed/down players where relevant (`lib/downed.ts`).
2. **Rate limits**: `middleware.ts` (global, stricter on `SENSITIVE` routes: casino, market, crime, carjack, rob, holdup, deal, dealer, chop, shop, wallet checkout, escort, race) plus in-route `throttled()` flood guards. The in-route ones are **in-memory per server instance**, i.e. best-effort on serverless.
3. **One transaction, row lock**: money, heat, XP and cooldowns change inside a single Prisma transaction. Re-check cooldowns and ownership *under the lock*. Helpers in `lib/game.ts`: `clampHeat` (0..200) and `lockedSkillXp` (locks the Save row, re-reads, adds XP).
4. **Compare-and-set** for anything a double click could pay twice (business till collect, employee shift settle, house layout writes, furniture delete-to-win).
5. **Signed tickets for two-step actions** (start → wait → finish): hold-ups, break-ins, chop-shop jobs, races, shots. The ticket carries who/where/when; **outcome values (police arrival time, loot, who passes a checkpoint, which car) are derived on the server from the ticket id with a key the client never sees.** Tickets are single-use and expire (shots 12 s via `lib/shotTicket.ts`, hold-up 90 s, break-in 2 min).
6. **Server-held position**: `PlayerPosition` / `/api/position`. Proximity checks (rob, arrest, escort, party district, club, break-in door) use the server's last reported position, which must be fresh (parties: < 2 min).
7. **Daily rollovers** use midnight WAT (Nigerian time); weekly resets Monday 00:00 WAT; crew cup is UTC.

## 6. API surface (by area)

| Area | Routes |
|---|---|
| Account | `auth/{signup,login,logout,me,username}`, `email/{send,verify}`, `profile`, `save`, `status`, `tutorial`, `inventory`, `phone`, `messages`, `player`, `leaderboard`, `diag` |
| Economy | `economy/{start,finish}`, `shift`, `shop`, `market`, `pantry`, `sell` (lib), `wallet{,/checkout,/verify,/webhook}`, `businesses`, `bizjobs`, `manager`, `career`, `reputation`, `autowork` |
| City & movement | `position`, `transport`, `rides`, `driver`, `vehicles`, `access`, `exit`, `invite`, `city-life`, `city-events` |
| Crime & police | `crime`, `rob`, `carjack`, `holdup`, `burgle`, `chop`, `death`, `down`, `fight`, `help`, `shot`, `shot/confirm`, `arrest`, `jail`, `wanted`, `evade`, `npc-police`, `security` |
| Nightlife & vice | `intox`, `dealer`, `deal`, `escort`, `street-npc`, `club-company` |
| Social | `season`, `relationship`, `crew{,/chat,/board}`, `party`, `housemates`, `visit`, `quest`, `mission`, `race`, `casino` |
| Home | `home`, `home/layout`, `home/furniture`, `houses`, `housestyle` |
| Legacy | `livekit`, `turn` (voice was removed from the game, see §15) |

## 7. Where the numbers live (tuning map)

| Area | File | Notable knobs |
|---|---|---|
| Economy / prices / pay | `lib/economy.ts`, `lib/cityEconomy.ts`, `lib/work.ts` | shift tasks 45–60 min, manager rules |
| Player profile & crime numbers | `lib/profile.ts` | origin odds (`NEPO` 3/10), `CRIMES`, `ROB_ANY_COOLDOWN_MS` 20 s, `ROB_KIND_COOLDOWN_MS`, `ROB_VICTIM_SHIELD_MS` 120 s, `WITNESS_HEAT` 6 / `WITNESS_MAX` 3, `HOLDUP`, `DEMAND_RANGE`, `OWNER_CHASE_SECS`, `EVADE_HEAT`, `CAR_PRICE` ₦2.5M |
| Daily income caps | `lib/earnCap.ts` | `HOME_JOBS`, `DRIVER_FARES`: tiers 1–6 / 7–12 / 13–18 and 10% after; ₦120k/day ceiling |
| Wallet packages | `lib/wallet.ts` | ₦5k→80k … ₦100k→10M game money |
| Intoxication | `lib/intoxication.ts` | drunk −3/min, high −4/min, blackout at 100 |
| Knocked out / safe window | `lib/downed.ts` | KO 15 s, pass-out 45 s, safe 8 s, `DOWN_REPEAT_MS` 60 s |
| Weed dealers | `lib/dealers.ts`, `lib/streetNpc.ts` | prices drift every 15 min; Slim −4% per unit sold, floor 55% |
| Club underworld | `lib/nightlife.ts` | deal limits, `NPC_COPS` greed/honesty |
| Witnesses | `lib/witness.ts` | `RANGE`, `decide`, `duration`, `LINES`, `personaOf` (~40% coward / 35% bystander / 25% brave) |
| Police | `lib/police.ts` | `PATROL`, `carsFor` (heat 40/70/110 → 1/2/3 cars), `copsFor`, `lineBlocked` |
| Hold-ups | `lib/holdup.ts` | `holdupPlan`, clerk gun odds |
| Chop shop | `lib/chopData.ts` | `CHOP`, `PARTS`, `YARDS` |
| Break-ins / guards | `lib/security.ts` | `GUARDS`, `BREAKIN` |
| Racing | `lib/racing.ts` | tiers, caps (12/day, 45 s cooldown, ₦8M net/day) |
| Casino | `lib/casino.ts` | limits, `BLOCK_IF_TOPPED_UP = true` |
| Crews | `lib/crews.ts` (+ `lib/crewServer.ts` for scoring/settlement) | all costs, kinds, turf, cup |
| Parties | `lib/parties.ts` | kinds, caps, spray cut 8% |
| Business economy | `lib/bizEconomy.ts` | `COGS_RATE` 0.5, elasticity 1.8 |
| Seasons | `lib/season.ts` | `SEASON_DAYS` 28, `BOARDS` (board list) |
| Goals | `lib/goals.ts` | `SPOTLIGHTS`, `W_A/W_B`, `WEEKLY_BONUS`, `CREW_WEEK` |
| Missions / tail | `lib/missions.ts`, `lib/tailRoute.ts` | `TAIL_RULES` |
| Weapons | `lib/weapons.ts` | single source for stats |
| Houses / plots | `lib/houses.ts`, `lib/housePlots.ts`, `lib/houseStyle.ts`, `lib/homeUpgrades.ts` | `PLOT_COUNT`/`ROWS = 6` (660 plots), design/extra prices |
| World clock & weather | `lib/worldClock.ts` | `GAME_MIN_PER_SEC` (1 real s = 1 game minute), `DAYS_PER_MONTH` 3 |
| Shared traffic | `lib/trafficCore.ts` | `TICK` 0.5 s, `ERA_S` 2 h |
| Render budget | `components/cityShared.ts` | `DETAIL_R` 85 m |

## 8. Client architecture

### Shared mutable state
`components/cityShared.ts` exports module-level singletons read every frame by many components (no React state, to keep 60 fps): `GAME` (player pose, notices, nav, ride, drunk/high…), `VEH` (your car), `OBS` (obstacles), `TPOS` (traffic car positions), `PEDPOS`, `INTER` (junctions), plus helpers `hs()` (string→[0,1) hash), `pick`, `smooth`, `lightState` (re-exported from `lib/worldClock.ts`). Per-frame code in `useFrame` reads/writes these; React state is used only for UI that must re-render.

### City layout
`lib/roadRoute.ts`: a 11×11 road grid (`GRID = 22·WS`), major/minor road half-widths (`halfW`), signalised junctions on even/even indices, `planRide`/`stepRide` (road-following vehicle path + stepper used by taxis, buses, police and the tail target), curb spots. `lib/destinations.ts` (`BUILDS_WORLD`) is the single source for building geometry used by rendering, collision, map and ride destinations; it picks lot/alley/plain layouts per building by hash.

### Interiors
Every building type maps to a room archetype in `lib/interiors.ts`; `components/Interior.tsx` renders it (joystick/tap-to-walk via `lib/nav.ts`). Server tracks an "inside" flag (30-min expiry). Shared rooms: one Supabase channel `room:<id>` per building (shows ≤ 30 people), `lib/roomNet.ts`. Houses use `room:home-<plot slot>`.

### Characters
`lib/humanRig.ts` (procedural male/female bodies, hair, outfits, poses incl. handsup/reach/sit/sleep, accessories), `lib/characterModels.ts` (ids and look sanitising), `lib/fashionWear.ts` (maps bought clothes/shoes/accessories onto the look). Looks live in `Character.look` JSON; other players receive them through presence.

### HUD and CSS
`GameLayer.tsx` hosts the ☰ dock and mounts panels (Goals, Crew, Party, Racing, Casino, BreakIn, mission HUD…). Styles load in order `globals → hud → mobile → phone → clean`; `clean.css` is last and wins. Interior/label styles live in `INTERIOR_UI_CSS` (`lib/gameLabels.ts`). Audio: `lib/audio.ts` (playlists in `PLAYLISTS`, iOS playback session workaround), `lib/cityAudio.ts` (effects, sirens), `components/AudioRoot.tsx`.

### Performance rules
- Small building detail is only drawn within `DETAIL_R` (85 m) via `registerDetail/updateDetails` (4 Hz); buildings share one geometry and a few materials. Do not give each mesh its own material.
- Touch devices: 1024 shadow map, max pixel ratio 1.25.
- Street clutter and player houses are instanced (~10 draw calls for all houses).
- Only the 8 nearest guarded houses get guard actors.

## 9. Trust model and anti-cheat

**Server-owned:** cash, needs growth rules, skills, heat, fame, rewards, loot, outcomes, cooldowns, ticket secrets, shot authorisation and damage values, jail/arrest consequences, purchases, wallet credits, house ownership/visibility, daily caps.

**Client-reported (known gaps):**
- Player positions (broadcast ~5/s; server position check allows ~30 m/s + 12 m slack).
- "Is an NPC/AI car next to me" for pickpocket, mug, NPC carjack, chop-shop steal (the server cannot see AI). Bounded by cooldowns, heat and having to physically deliver.
- Witness counts and which NPCs saw a crime (server caps effect: max +18 heat).
- Punch knockouts (decided in the victim's browser, then `/api/down`, throttled by `DOWN_REPEAT_MS`).
- Shot **damage application**: server issues a signed single-use hit ticket, but the victim's browser applies HP; a modified victim client can ignore damage. HP is not server-held.
- Ammo/weapon ownership.
- Death and arrest reports.
- Job mini-game results (bounded: 10 s spacing, 24 rounds/shift, +50% cap).
- Realtime chat/movement (spoofable names in chat; mute is the only moderation tool).
- `room:home-<slot>` channels are not server-gated (a modified client could join an empty house room, but never loads layout/furniture).

**Gambling/payments policy:** game money can be bought. `lib/casino.ts` has `BLOCK_IF_TOPPED_UP = true`, which keeps any account that ever topped up out of the casino (app-store and Nigerian rules on simulated gambling). Check the rules that apply before changing it.

**Age gate:** sign-ups require a valid date of birth proving 18+ and a mature-content acknowledgement (validated server-side). Older accounts are prompted once on first use of mature features (street NPCs); other paths may not check them. Mature scenes are always a fade-to-black with one line of text; nothing is depicted.

## 10. Gameplay systems (reference)

### Accounts, creator, tutorial
Sign-up spins the Wheel of Luck once (origin), then the character creator (profession, focus skill, style, look). Tutorial (`Tutorial.tsx`, `/api/tutorial`) shows once per account (`Save.state.tut`). `Guide.tsx` is unused.

### Needs, home and upgrades
Home scene needs, furniture editor (Arrange / Add items / Style), 6 home rooms and comfort upgrades (`lib/homeUpgrades.ts`), groceries/toiletries consumed by cooking/showers (`lib/pantry.ts`). Catalog is `lib/catalog.ts` (577 items plus 1,200 clothes, 672 shoes and accessories), sold in person; the **Online Mall** (Phone > Market, +8% delivery) excludes groceries, toiletries, clothes/shoes/accessories and car parts.

### Houses
- Every account has a plot (`User.houseSlot`; 660 plots in 6 rows; row 0 is the original ring-road row; `/api/houses` assigns missing slots oldest-first). House look (Classic/Modern/Villa/Mansion + extras, `lib/houseStyle.ts`; NEPO get Mansion free).
- **Housemates** (max 4 incl. pending): a housemate's "home" becomes the owner's house. Owner-only: build, sell fixtures, look, guards. Burglary only affects the owner's cash.
- **Visits**: knock / invite / ask to leave (`HomeVisit`), door lock state via `home_open`; server withholds layout/furniture unless allowed. Guests see the host's rooms read-only. Polling cadence 4 s.
- **Presence**: everyone inside a house sees each other (`HomePresence.tsx`, pose `p` 0/1/2 in `roomNet`).
- **Concurrency**: layout/look in one JSON row with versioned writes (`editHome()` retries up to 8×, then 503); layout PUT merges when the client sends `base`; furniture is per-row (place = INSERT, store/sell = a DELETE only one request can win; first access migrates old blob furniture automatically).
- **Security & break-ins** (`lib/security.ts`, `lib/burgle.ts`): guard dog ₦1.5M (max 2), guard ₦4M (max 2), armed guard ₦9M (max 1); break-in is an 8 s lock bar; win chance from 80% (no guards) down to 6% floor; 20% of owner cash, cap ₦400k, 15 min shield per house.

### Crime & policing
- **Heat** 0–200, WANTED at ≥ 40, cools 3/min plus `/api/evade` (−4 per call when hidden, client calls every 12 s once lost).
- **Robbery** (`/api/rob`, `/api/crime`, `/api/carjack`): player rob 30% (max ₦150k; out cold 50%, max ₦300k); pickpocket ₦8–40k; mug ₦20–90k; NPC carjack; point-and-demand ₦60–180k. Cooldown stack in `lib/profile.ts` (any 20 s, per-kind, victim shield 120 s, flood guard 8 per 10 min). `burgle` shares the same cooldown table.
- **Hold-ups** (`lib/holdup.ts`): 20 s bag fill, partial share when you run after 5 s, hidden police arrival 14–38 s (stealth +1.5 s/level, −25% per police player online, max −50%), 25% of clerks armed; 5-min per-player and 10-min per-shop cooldown. The old instant `rob_shop` is disabled.
- **Chop shop** (`lib/chopData.ts`): steal AI car → server picks one of four unmarked yards, 4-min deadline, up to 3 secret checkpoints (65% + 5%/stealth pass), deliver for cash (₦80k–400k) or 2–4 parts; hot cars cannot be sold through Inventory.
- **Witnesses** (`lib/witness.ts`): pure rules. Peds and AI drivers have personas and react (freeze, handsup, cower, flee, film, confront; drivers stop/film/honk/flee). Filming witnesses fire the window event `arl-witness-report {x,z}` which dispatches a patrol.
- **Police** (`CityPolice.tsx`, `lib/police.ts`): patrol cars drive the real road grid (ignore red lights), officers chase with line-of-sight (`lineBlocked`), search 22 s, arrest after ~1.2 s contact, roadblocks at heat ≥ 110 while driving. Real police players (chosen at sign-up, uniform outfit) still work via `/api/wanted` + `/api/arrest`; jail cell and `/api/jail`.
- **Downed state**: down (KO 15 s / pass-out 45 s), then 8 s safe window; HUD countdown from `/api/status`.
- **Street escorts / dealers / club companions**: players-only underworld (`/api/deal`, `/api/escort`), NPC street dealers and escorts (`/api/street-npc`, 18+ gate), club companions (`clubNpc.ts` → pay → follow you out → home), all with fade-to-black scenes.
- **Intoxication**: drinks in Nightclub/Restaurant/Hotel, weed from Mama Put (Market, ₦5–7k) and Slim buys (Nightclub, ₦9–13k); bust chance 6% + 0.2%/heat + 1%/unit (max 60%). Walking sway/speed from `effects()` is not hooked into movement yet.
- **Missions & weapons**: `lib/missions.ts` multi-stage contracts with deadlines and hold objectives; `/api/mission` pays; `lib/weapons.ts` (service pistol, SMG, carbine; G switch, R reload, V fire); Wuse Market Tail stealth mission (`lib/tailRoute.ts`, `TailTarget.tsx`, `TailHud.tsx`).

### Economy, work and business
- Shifts (45–60 min tasks), managers (`/api/manager`, daily salary), tap-to-walk interiors, optional job mini-games (`lib/jobGames.ts`: +2% per star, cap +50%).
- Quests ₦25–150k, daily income caps, wallet top-ups with idempotent credit (`creditPayment` in `lib/paystack.ts`: asks Paystack, checks status/amount/currency, takes the credit from OUR table, payment reference = Transaction PK).
- **Player businesses** (`lib/bizEconomy.ts`): price level 50–300%, supplier cost 50% of list, idle sales settled when the owner opens the panel (≤ 2 h), staff offers/wages/shifts (8 h max, owed wages kept).
- **Marketplace**, phone (free messaging, location share, send money ≤ ₦500k), listings.
- **Goals loop**: starter chain (12 steps), daily check-in streak, 3 daily missions, 14 badges, weekly Spotlight + missions + crew chest. Progress is *derived* from `Transaction` + `Save`; claims are unique hidden rows.
- **Crews** (`lib/crews.ts`, `lib/crewServer.ts`): Crew/Gang/Company kinds, treasury, turf (11 districts, ₦120k/h, half to treasury), turf wars (₦500k, 60 min), daily Crew Cup, chat (polling 2.5 s). Scoring is read from `Transaction`/`Crime` rows (≤ 600 points per member per event). Events settle lazily on the next crew endpoint hit.
- **Parties** (`lib/parties.ts`, `/api/party`): hangout / house party / owambe / club night, vibe 0–100, spray 92% to recipient (8% sink), host fame at end. Virtual venue (no 3D party room).
- **Seasons** (`lib/season.ts`, `lib/seasonServer.ts`, `/api/season`, `components/Seasons.tsx`, table `SeasonScore`): 28-day seasons starting Monday 00:00 WAT from the anchor week 5 Jan 2026 (Season 1). One row per player per season per board (`score` Int; `lowerIsBetter` per board in `BOARDS`). `addSeasonScore()` is called wherever fame is earned (`awardFame`, driver fares, city events) and never throws, so a missing table cannot break the action. The API returns the board list, so adding a board server-side shows it in the panel automatically. **Live boards: fame gained.** Planned: best race time per tier, richest crew, end-of-season rewards, push notifications.
- **Racing**, **casino**, **fashion** (boutiques, wardrobe mirror, wearable items checked on `/api/save`), **transport** (taxi/bike/bus, ride requests between players, passengers in cars/taxis/plane).
- **Plane** (`cityPlane.tsx`, `planeNet.tsx`): single pilot at a time, cockpit/chase camera (V), up to 3 passengers via the `cityPax.ts` handshake, pose rides on the normal 5/s position broadcast. Runway at the airport; `FLY_LIM` 850 m.

## 11. Multiplayer

- `lib/cityNet.ts`: joins `city:abuja-N` (40 players per instance), tracks look in presence, sends position ~5/s only when someone else is in the instance, chat 120 chars with rate limits, inbound values clamped (`LIM` position clamp is 300, must exceed the outermost house row).
- Remote players: `CityRemote.tsx` (interpolated). They are solid: pedestrians sidestep them (`peersOnFoot`), AI traffic stops for them on foot or in a car, and `remoteCars()` pushes cars apart. Social need rises within ~7 m. (The original multiplayer note said they were not solid; the code has since changed.)
- `LIM` (position clamp) is 300 m; planes use `FLIM` 900 m.
- Quota: Supabase free plan is ~100 realtime msgs/s and ~200 connections, so roughly 15–20 simultaneous movers. Beyond a few hundred daily players move to a game server (Colyseus / PartyKit / Nakama).
- Voice was removed (see §15).

## 12. The shared world (what everyone sees identically)

**Principle:** anything that must look the same on every phone is a pure function of the real clock, so nothing needs syncing. Implemented in `lib/worldClock.ts` (client and server safe).

| Thing | Status |
|---|---|
| Time of day, calendar, seasons, weather, lightning | Shared (pure functions of `Date.now()`; 1 real s = 1 game min; 3-day months; harmattan / hot / rainy) |
| Traffic-light phase | **Shared** — `simSeconds()` / `lightState(t, axis)` (32 s cycle). All lights, cars, pedestrians, ride steppers and the tail target use it. (Previously each phone used its own R3F `clock.elapsedTime`.) |
| AI car positions | **Shared core** — `lib/trafficCore.ts` |
| Pedestrian wander choices | **Seeded** — `simRand(id, n)` per-ped draw counter (movement itself still local) |
| Pedestrian positions | **Not shared yet** |
| Taxi/bus/bike while hailed, carjack scenes, crime reactions, NPC police, remote-player-driven obstacles | Local (by design) |

### Traffic core (`lib/trafficCore.ts`)
A pure fixed-step simulation of every AI car on its lane: speed = lane speed × role multiplier × weather/rush factor, a 7 m safe gap to the car ahead, and red-light stop lines (same formulas as the original per-frame code). It has no player/network input and no `Math.random`.
- Ticks of `TICK` = 0.5 s counted from the shared epoch. The core restarts from the seeded layout every `ERA_S` = 2 h and fast-forwards to "now" on join (≈ 35 ms measured for 64 cars; there is one small visual reset per era).
- `sync(t)` per frame; `pos(i)` is interpolated between ticks (display is one tick behind real time, the same on every phone).
- `CityTraffic.tsx` keeps its original per-frame logic as a **local layer**: a free-driving car (no hail, hold, reaction or speed override) aims at the core position; if it had to stop for you or a crime it lags and catches up at up to 1.6× speed; if it is > 60 m behind and neither it nor the target is within 60 m of the player it snaps to the core position. Hailed/ridden/carjacked cars leave the core path and rejoin afterwards.
- Verified in isolation: two instances that joined at different frame times agree to 0 m. **Not yet verified on real devices.**
- Caveats: depends on each phone's own clock (a skewed phone sees lights/cars shifted; a server time offset is a possible later step); lane-change swerves are local and cosmetic; `lightState` now lives in `worldClock.ts` and is re-exported from `cityShared.ts`.

### Remaining plan
3b. Same core treatment for pedestrians (`CityPeds.tsx`: modes by time of day, targets, pavement walking, kerb waits) with a local overlay for dodging/reactions. 4. Generalise "local layer follows shared core" for hails/crime effects. Dead code: `lib/citySim.ts` `tickTraffic` is unused (and uses `Math.random`).

## 13. Operations

**Environment variables:** `DATABASE_URL`, `AUTH_SECRET` (32+ random chars), `RESEND_API_KEY`, `MAIL_FROM`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `PAYSTACK_SECRET_KEY`, `APP_URL` (optional), `UPSTASH_REDIS_REST_URL`/`_TOKEN` (optional), `GAME_URL` (Capacitor). Obsolete and removable: `LIVEKIT_*`, `METERED_*`, `CF_TURN_*`, `TURN_*`, `NEXT_PUBLIC_VOICE`.

**Deploy checklist for a feature that adds a migration:** run the migration SQL in Supabase (it is also in `fix-database.sql`/`setup-database.sql`) **before** deploying, then `npm run db:generate`, then deploy (build runs `prisma generate`).

**Supabase:** Realtime settings must allow public access to channels; chat for the phone needs the `Message` table (`fix-database.sql`).

**Paystack:** set the webhook to `https://<domain>/api/wallet/webhook`. No refund/chargeback automation, no receipts page, no admin payments view (use the Paystack dashboard).

**Mobile:** PWA works as is (Android Install button, iOS Add to Home Screen). Native: `npm i`, `GAME_URL=… npx cap add android|ios`, `cap sync`, lock landscape in the Android manifest / Xcode. Replace `public/icons/*`. If old phones lag, lower `dpr` in `Sim.tsx` to `[1,1.25]`.

**Copying patches:** merge files over the same paths; never delete and replace whole `app/` (the root layout goes missing).

## 14. Testing status (be honest about it)

No automated test suite is in the repo. Over the project's history, pure `lib` logic was unit-checked in throw-away scripts (witness, police `lineBlocked`/`carsFor`/`copsFor`, route planning over 1,848 rides and 194 dispatches, tail rules, chop odds over 4,000 jobs, hold-up clerk roll, break-in odds, home-store concurrency with a fake DB, now the traffic core). The 3D scenes, realtime, API routes and SQL migrations have **never been run end to end** by the assistant that wrote them (sandbox had no browser/DB/network). Every feature should be treated as "type-checked, not playtested" until a human has run it. Priorities for a first QA pass: two-device multiplayer (positions, lights, cars), sign-up → tutorial, a hold-up, a chop job, a house visit, a Paystack test payment, a party.

## 15. Known discrepancies and cleanup candidates

- **Voice is half-removed.** The old notes say it was removed completely, but `package.json` still has `livekit-client`/`livekit-server-sdk`, `app/api/livekit/route.ts` and `lib/cityVoice.ts` exist (`cityVoiceMesh.ts` too), and `middleware.ts` still skips `livekit`/`turn`. Decide: delete them, or restore voice.
- `components/Guide.tsx` is unused (nothing imports it) — safe to delete.
- Two `0005_*` migrations (`interiors`, `session_version`); apply both. No notes exist for migrations 0008, 0010, 0011, 0012, 0013 beyond their names (marketplace, living_city, city_completion, home_layout, auto_work).
- `lib/citySim.ts` `tickTraffic` is dead code.
- Wuse Delivery mission targets a building named "Wuse Market" that does not exist (use `Wuse Supermarket`).
- `public/models/Xbot.glb` is unused (character is procedural).
- Age gate only applies to sign-ups and to street-NPC mature features; accounts older than migration 0022 are not otherwise checked.
- Existing players who predate the origin/popularity update kept cash but lost the starting car and started at 0 fame.

## 16. Open work and known limits (consolidated)

- **Server-held HP / ammo / weapons**, server-side death and arrest, server validation of KO punches; line-of-sight checks for shots.
- **Redis for throttles**: `throttled()`, shot cooldowns, shot tickets and "recent shot" memory are per instance.
- Walking sway/slow movement under intoxication; drunk driving; being easy to rob while passed out inside buildings (interiors are solo for rob purposes).
- Dealers/escorts/NPC cops in clubs are menu characters; street NPCs stand still. NPC cops do not enter buildings and cannot be shot; officers may catch on corners when the path-finder has no route.
- Mission stage progress is not persisted across reload; no physical package/VIP NPCs.
- Crew turf is a ledger only (not drawn on the map; no perks, no friendly-fire rule, no crew tags above heads); crew chat polls; events settle lazily.
- Parties are virtual (no 3D room, staying inside is not enforced); housemates edit with last-save-wins unless `base` merge is used; other players see new guards/houses up to 90 s late.
- Rows 1–5 of house plots are off the route-planner graph; unchecked overlap with scenery beyond the ring; when 660 plots are full the next account has no house (raise `ROWS`).
- Home chat bubbles missing; knocks refresh every 4 s (polling).
- Alleys/fences/parked cars are not known to `findPath`; ambient NPCs can clip dumpsters; wet roads have no reflections.
- Buildings do not block witnesses' sight (police do use `lineBlocked`).
- Plane: passengers not drawn inside; no engine sound; no server validation of flight speed; plane left parked away from the runway shows at the runway to late joiners.
- Chat moderation/profanity filter for a public launch.
- Hot cars/chop: the "stolen" AI car stays on the road; yard fence is scenery only.
- Wallet: no refunds/chargebacks, receipts or admin view.
