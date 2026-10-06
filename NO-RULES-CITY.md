# No-Rules City update

Run after pulling: `npm run db:migrate:deploy` (applies 0004_no_rules_city), then `npm run db:generate`.

## Done
- Sign-up/onboarding AND ☰ → Character (same editor): profession, focus skill, style, outfit model, look.
- All skills start at 0 (server-owned, grow through quests/crime). New players get ₦1,000,000.
- Quests (/api/quest), crime (/api/crime), heat/WANTED, bail, jail (/api/jail).
- Police are real players (choose "Police Officer" at sign-up): see wanted players (/api/wanted), arrest within 6 m (/api/arrest). Station and jail buildings in the city; a fenced JAIL CELL locks arrested players in; release at the station.
- Building access by rank / invitation / profession / entry fee (/api/access, /api/invite); 🚪 Enter button near any building.
- Relationships: propose / accept / end (/api/relationship), shown on both profiles.

## Not done yet (honest)
- Walkable building interiors: Enter currently checks access and opens a result card. Real interiors need modelled rooms + a scene switch.
- Distinct 3D garments (agbada, hoodie): outfit models currently set colours + are synced to other players; geometry changes need humanRig work.
- Police chase is player-vs-player over the existing realtime layer; no siren/handcuff animation or server-validated distance (distance is client-trusted).
- Crime "caught" roll uses client-reported nearby officers (clamped 0-3). Move to server-tracked positions before public launch.
- Not run in a browser or against a database here (Prisma engines download was blocked); typechecks except Prisma client typing.

## Interiors + shared rooms (update 2)
Run `npm run db:migrate:deploy` (adds 0005_interiors) and `npm run db:generate`.
- Every building type has a room (hall, dining, club, store, service, station, terminal archetypes) built in `lib/interiors.ts`.
- Press 🚪 Enter near a building: the server checks access, marks you "inside", and you walk the room (WASD / joystick). Walk out the door to leave.
- Inside spots: 💼 work a shift (any of that business's jobs), 🛒 buy (needs/skill courses), 📜 location quests, 🕶️ tills & the bank vault (crime now only works inside the right building, enforced by the server).
- Shared rooms: one Supabase channel per building (`room:<id>`), up to 30 shown. You see other players, chat bubbles, and police (uniform) inside; an officer can arrest a wanted player in the room within 6 m.
- Being arrested while inside sends you to the jail cell (the room polls your status every 4 s).
- Police are recognised by the uniform outfit (`outfitModel === 'uniform'`, police-only server-side) for the "officers nearby" crime risk.

Limits: player positions in rooms are client-trusted (same as the city). The "inside" flag lasts 30 minutes. Rooms are built from simple boxes (no textures/props). Not run in a browser here.
