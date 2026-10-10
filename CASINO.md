# Casino (in-game cash only, with hard limits)

NEW:  lib/casino.ts, app/api/casino/route.ts, components/Casino.tsx
EDIT: components/GameLayer.tsx (☰ 🎰 Casino entry; this file also contains the 🏁 Racing entry, so it replaces the racing version),
      app/api/progress/route.ts (casino winnings no longer count as "earned" for Goals)
No database migration, no new packages.

Games (server-side RNG, crypto.randomInt): Slots (~92% return), European roulette (~97%), Dice roll-under (97%).
Bets ₦10k–₦500k.

Limits
- Daily loss limit (default ₦2M net loss per game day, midnight WAT). The casino closes for you when you hit it, and a bet can never exceed what the limit has left.
- Lowering the limit is instant; raising it only takes effect after 24h.
- "Take a 24-hour break": closes the casino for 24h and cannot be undone.
- Reality check every 10 rounds (session summary; keep playing or stop for 24h).
- Max payout per round ₦20M.
- State lives in one hidden inventory row "casino" (quantity 0), like Goals claims.

IMPORTANT: game money can be BOUGHT with real money (Paystack top-ups). Gambling with purchasable currency is "simulated gambling"
and can be restricted by app stores (your repo has a Capacitor app) and by Nigerian rules. So lib/casino.ts has
BLOCK_IF_TOPPED_UP = true: any account that has ever topped up is kept out of the casino. Check the rules that apply to you before turning it off.
