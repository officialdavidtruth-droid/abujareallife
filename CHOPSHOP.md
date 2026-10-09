# Step 6: the chop shop (steal → hidden yard → cash or parts)

**No database migration.** Copy the files over your project (same paths). Nothing to run except a normal deploy.
State lives in the existing `Vehicle` table (`stolen: true` rows) and `Crime` rows (`chop:<id>` start / cooldown, `chopwin:<id>`, `chopcaught:<id>`).

## How it plays
1. **Steal.** Walk up to an AI car on the street. Next to the old *Carjack the driver* button there is now **🔧 Steal it for the chop shop**.
   - The server rolls whether the owner/patrol stops you on the spot (35% base, −4% per stealth level, +12% per officer standing near you).
     Stopped = +30 heat; if an officer is right there you also go to jail.
   - Otherwise you get a **real stolen car in your garage** (the server picks the model: cheap family cars common, LX rare; condition 55–94%).
     **+60 heat** at once, so you are WANTED. Press **E** next to yourself to get in, as with any car.
2. **A fixer tells you where.** One of four yards is picked by the server: Lugbe back lot, Kubwa scrapyard, Asokoro lock-up, Gwarinpa breaker's yard.
   They are **not on the map or in any list**; the waypoint (🔧) and an amber light beam appear only for the yard you were sent to. You have **4 min**.
3. **Checkpoints on the way.** The server has up to 3 secret police checkpoints (manned 6–11 s, 13–21 s and 24–36 s after the theft).
   Each one you are still on the road for is a roll. Pass chance = 65% + 5% per stealth level + faster-car bonus − 8% per police *player* online (25–92%).
   **Fail one and it ends right there**: car impounded, jail time from your heat, 10% cash fine. Driving fast means fewer checkpoints (about 74% survive a 10 s dash, 30% a 40 s crawl at stealth 0).
   You see "🚧 slipped through" as each one passes. Real police players can still arrest you as normal.
4. **At the gate** (drive the stolen car inside the yard) pick:
   - **💵 Cash**: 0.6% of the car's price scaled by its condition, ₦80k–₦400k (average ≈ ₦155k).
   - **🔩 Parts**: 2–4 pieces (by car price): Engine block, Body panels, Wheel set, ECU module. Normal inventory items: sell back (½ shelf), list on the **Market** for other players, or…
5. **Fit parts.** Stand at any yard on foot with parts in your bag: **Fit** one to your own (non-stolen) newest car for +10 / +8 / +6 / +4 condition.
6. You are **still WANTED** after delivery. XP: +8 stealth, +8 driving.

## Rules that changed elsewhere
- **Hot cars cannot be sold** through 🎒 Inventory (was possible for player-carjacked cars too: 60% of the price, which would have made stolen cars a money printer). Only a chop yard takes them.
- Car parts are a new inventory category (🔩 Car Parts). They are in no shop and the Online Mall refuses them.

## Where to tune (all in `lib/chopData.ts`)
`CHOP` (heat, deadline, cooldown, checkpoint windows, pass odds, payout rate and clamps), `PARTS` (shelf price, condition gained), `YARDS` (coordinates).

## Why it is hard to cheat
- The ticket is signed. The **checkpoint times, who passes them, which car and which parts** come from the ticket id with a server-only key; the browser never sees them.
- Delivery needs the server's own position record to be inside the yard, **driving**, with a fresh report (the client sends one right before asking).
- A job pays once (the stolen `Vehicle` row is deleted in the same transaction), cooldown 4 min per player, throttled.

## Honest limits
- The server cannot see AI cars, so *"I am next to a car"* is trusted from the browser (same as the existing NPC carjack). The 4 min cooldown, heat and the need to physically deliver cap what a modified client can do.
- Yard positions are in the client code (they draw the scenery), so a determined player can find them by exploring; they are only *unmarked*, not secret.
- The AI car you "steal" stays on the road (no despawn); the yard fence is scenery only (no collision).
- Not run in a browser or against a database here: type-checked clean (`tsc --noEmit`), and the ticket/odds/payout maths were simulated (4,000 jobs). Please try one job on your side before shipping.
