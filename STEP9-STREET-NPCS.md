# Step 9: street NPCs (dealers and escorts), no database migration
New: `lib/streetNpc.ts`, `app/api/street-npc/route.ts`, `components/StreetNpcs.tsx`. Edited: `CityWorld.tsx` (draws them), `GameLayer.tsx` (Talk button + sheet), `Sim.tsx` (applies need changes).

## Where they stand (on the pavement in front of the building, so go and look for them)
- Tunde 🌿 dealer: Utako Market · Yaro 🌿 dealer: Utako Nightclub
- Chioma 💃 (₦35k): Wuse Nightclub · Zainab 💃 (₦45k): Asokoro Nightclub · Ngozi 💃 (₦80k): Gwarinpa Hotel
Open the map and search those buildings. Walk within 4 m and tap **Talk to <name>**.

## Rules (all decided on the server)
- Dealer: weed at 125% of Mama Put's price, 3 heat per unit, same stack limit. Escort: fixed price, 5 heat, 5 min cooldown per escort. "Take home" is a fade to black with one line of text; it raises fun and social, costs energy. Nothing is shown.
- Officers cannot take part. Jailed or knocked-out players cannot. You must really be next to them (server checks your reported position).
- Mature content gate: the account must have a date of birth of 18+ and the confirmation. New accounts already have it; older accounts get a one-time date-of-birth + checkbox prompt.

## Limits
- The NPCs stand still. "Take home" does not move you to your house or show her there; it is the fade scene and need changes only.
- Not run in a browser or against a database. Prisma types could not be generated here, so `tsc` shows the same `Prisma` import errors as the existing routes; nothing else.
