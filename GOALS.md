# Goals: guided start, daily missions, streak, badges

NEW:  lib/goals.ts, app/api/progress/route.ts, components/Goals.tsx
EDIT: components/GameLayer.tsx (☰ Goals menu entry, Goals panel, floating "next goal" chip)

No database migration, no new packages.

How it works
- Progress is DERIVED on the server from the existing Transaction log (quests, shifts, shop buys, missions, helps, rides, money sent)
  plus the Save (cash, fame, car, skills). The browser only displays it.
- A claim is a hidden InventoryItem row (quantity 0, unique per user+key), so a reward can never be claimed twice, even with parallel requests.
- Rewards are paid in one DB transaction and logged as EARN "goal:<kind>:<id>" (excluded from "earned" stats so they cannot feed themselves).
- The game day rolls over at midnight Nigerian time (WAT). Everyone gets the same 3 daily missions on a given day.
- Starter chain (10 steps + "Abuja Insider" bonus), daily check-in streak (7-day cycle), 3 daily missions + all-3 bonus, 14 badges.

Tuning: all names, targets and reward amounts live in lib/goals.ts.
