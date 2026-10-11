# Come-back loop: daily, weekly, crew and parties

Already there (GOALS.md): check-in streak, 3 daily missions, starter chain, badges, the daily Crew Cup. New on top:

**Starter chain** is now 12 steps: added "Join a crew" and "Go to a party" before "Own a car". Players who already claimed earlier steps keep them; the Abuja Insider badge now needs the two new steps too.

**Week tab** (☰ Goals → Week), resets Monday 00:00 Nigerian time:
- **Spotlight** rotates weekly: Party Week, Race Week, Hustle Week, Neighbour Week. Its mission pays ₦200,000.
- 3 weekly missions (money or quests, shifts or missions, plus the Spotlight) and a ₦250,000 bonus once any 2 are claimed (so an unaffordable Spotlight, e.g. Race Week for a broke new player, never blocks it).
- **Crew chest**: the crew's quests, shifts and missions this week count together. Target = 10 per member (min 24, counted for up to 10 members). Everyone with at least 3 of those jobs claims ₦150,000. Not in a crew: the card tells you to join one.
- The "next goal" chip now also points at weekly missions and the crew chest when they are ready.

How the loop fits: daily check-in brings you back -> daily missions -> weekly Spotlight sends you to parties, races or helping -> the crew chest gives you a reason to play with and recruit your crew -> badges and the Crew Cup for the long run.

No database change. Claims are hidden inventory rows like the existing goals. Tuning is in `lib/goals.ts` (SPOTLIGHTS, W_A / W_B, WEEKLY_BONUS, CREW_WEEK).

## Files
EDITED `lib/goals.ts`, `app/api/progress/route.ts`, `components/Goals.tsx`; NEW `GOALS-LOOP.md`

## Known limits
- Crew chest counts a member's jobs from Monday even if they joined mid-week.
- Weekly "races" count race entries, "parties" count parties you joined or hosted this week.
- Tuned against the code: quests pay ₦25k-150k per ~30 s, shifts about 1/10 of a ₦90k+ monthly job pay, daily rewards ₦10-25k; weekly targets are about 4-8x the daily ones with matching rewards. LAPO starts with ₦50k, NEPO ₦5M, a car costs ₦2.5M, race entry ₦500k-5M, rooms ₦2M+. Not playtested.
- Hosting a free Hangout counts for "Go to a party", so a player with no friends online can still finish that step.
- Rewards are cash only. Treasury, cosmetic or house rewards would make the loop stickier; say if you want them.
