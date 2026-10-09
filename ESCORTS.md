# Step 7: escort service (street + club), with heat

**No database migration** (uses the existing `Deal` table; street offers have `building = 'street'`). Copy files over; deploy.
Includes the updated `components/GameLayer.tsx` (also changed in step 6, so use this copy).

## How it plays
- **Street:** a Club Escort (☰ → Character) standing within 6 m of a real player on foot sees **💃 Offer company to <name>**, names a price (₦15k–₦250k). The other player gets an Accept/Decline card for 2 minutes.
- **Club:** unchanged booth deals in the Nightclub Underworld panel.
- **Scene:** fade to black with one line of text (🌙 The night goes on…), for both players. Nothing is shown.
- **Heat:** escort +20 on the street (+10 in the club), buyer +5 on the street. **Sting:** a police officer who accepts pays nothing and the escort gets +45 heat (WANTED).
- Server checks: both players really next to each other (server-held positions), on foot, not jailed/out cold, buyer can afford it, offers expire, one open offer per pair, money moves in one transaction, escort gains charisma XP.

## Limits
- Street deals give money, heat and XP only; the club's need-bar effects (fun/social) apply in the club only.
- Players only: no NPC clients. Not run in a browser or against a database; `tsc --noEmit` is clean.
