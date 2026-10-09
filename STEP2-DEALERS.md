# Step 2: the weed trade (two NPC dealers)

No new migration. Weed is stored as the inventory item `drug_weed` (the same item Step 1's smoke button uses).

## The loop
- **Mama Put, the supplier (Market):** walk into a Market, tap 🌿 The Plug, buy 1-10 units at ₦5,000-7,000 each.
- **Slim, the buyer (Nightclub):** walk into a Nightclub, tap 🕶️ Buyer, sell 1-10 units at ₦9,000-13,000 each.
- Prices drift every 15 minutes (`lib/dealers.ts`). Slim's price drops 4% per unit you sold in the last 10 minutes (floor 55%), so flooding him can lose money.
- Heat: +2 per unit bought, +5 per unit sold. Each sale has a bust chance of 6% + 0.2% per heat point + 1% per unit (max 60%). A bust seizes the weed, pays nothing and adds 30 heat.
- Officers cannot deal. Both dealers are server-checked: you must be inside that building.
- Smoke any joint from the dealer panel or the bar menu (Step 1).

## Not done / honest limits
- Dealers are menu characters inside buildings, not walking 3D NPCs.
- Real police players are not yet pulled into busts; a bust is a server roll.
- Not run in a browser or against a database here.
