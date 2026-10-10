# Job mini-games (optional skill play during a shift)

NEW:  lib/jobGames.ts, components/JobGames.tsx
EDIT: app/api/shift/route.ts, components/Interior.tsx
No database migration, no new packages.

How it works
- Clock in as usual. On Restaurant/Hotel (🍳 Kitchen Rush), Logistics + taxi/bike/courier jobs (🚚 Delivery Run) and Mechanic (🔧 Garage Fix)
  a "🎮 Play" button appears next to the shift timer. The timer and base pay are unchanged; playing is optional.
- Each round ends with 0-3 stars. Each star = +2% of the shift pay, capped at +50%, and adds skill XP (max +24).
- Server is the authority: /api/shift action "play" only counts rounds while the shift is running, at most 24 rounds per shift,
  and at least 10s apart. The score lives in one hidden inventory row (key "shiftscore", quantity 0) tied to the shift's start time.
- Auto-work (free will) shifts get no bonus.

Tuning: lib/jobGames.ts (which jobs get which game, stars-to-bonus, caps, round spacing).
Note: round results are reported by the browser, so a determined cheater can claim stars, but the 10s spacing and +50% cap bound the gain.
