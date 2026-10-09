# Club underworld (real players only)

Run after pulling: `npm run db:migrate:deploy` (applies 0015_nightlife), then `npm run db:generate`.

## What it is
- Three new professions, picked at sign-up or in ☰ → Character: **Club Escort 💃**, **Drug Dealer 💊**, **Gang Member 🔫**. Real players only; there are no NPC dealers, escorts or gang members.
- Inside the **Nightclub**, the 🪩 *Underworld* button lists the real players in the room (with their role). A seller picks a player, sets a price and sends an offer; the buyer accepts or declines. Offers expire after 2 minutes.
- Server rules (`app/api/deal/route.ts`, tuned in `lib/nightlife.ts`): both players must be inside that club, money moves atomically, price limits per trade, double-accept guarded, 8 offers/min throttle.
- Consequences: sellers gain **heat** per completed deal (dealer +25, gang +15, escort +10), buyers of drugs +8, so real **police players** can arrest them. A police officer who accepts a dealer/escort offer triggers a **sting**: no money or goods change hands and the seller becomes WANTED. Officers cannot pay protection.
- Sellers grow a skill with each deal (charisma / hustling / combat) and have new career ladders.

## Limits (honest)
- Not run in a browser or against a database here (npm registry was blocked, so no typecheck beyond the pure lib files).
- Escorts' service is a purchase that gives the buyer fun/social boosts; nothing explicit is depicted.
- Protection fees have no mechanical shield yet (no territory/fight integration); it is money-for-reputation between players.
- "Who is in the club" comes from the server's inside-building flag (30-minute expiry), not live presence.

## Bribes / police protection money (real officers AND NPC officers)
- 🪩 Underworld → **Pay off the police**: offer ₦5k–₦2M to any officer in the club. Officers listed: two NPC Vice Patrol officers (`NPC_COPS` in `lib/nightlife.ts`) plus every real police player in the club.
- **Real officer:** gets the offer under "Offers for you" and chooses Accept/Decline. Accepting moves the money, cools the payer's heat (₦1,000 per heat point) and gives the officer +10 heat (taking a bribe is a crime).
- **NPC officer:** decides instantly on the server. It takes the bribe only if `amount >= greed × max(20, your heat)` and it passes its honesty roll (Adewale: greed 1,200, honesty 25%; Okonkwo: greed 2,000, honesty 55%). Taking it cools you; refusing keeps your money but adds heat, and if that makes you wanted the NPC arrests you (jail time + 10% fine).
- Officers cannot bribe other officers. Offers expire in 2 minutes and are throttled.
- Not done: NPC police are club-only (a roster in the panel, not walking 3D characters), and NPCs don't patrol the open city.
