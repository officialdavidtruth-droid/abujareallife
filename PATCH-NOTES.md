# Bug-fix pass (all changes in this zip)

Not run against a database: `prisma generate` was blocked in the sandbox, so only a filtered typecheck was done. Test on a staging DB first.

## Changed files
- lib/game.ts: new `clampHeat` (keeps heat 0..200) and `lockedSkillXp` (locks the Save row, re-reads profile, adds XP).
- app/api/deal, escort, dealer: seller role re-checked on accept, stings use status `sting` (no scene for the seller), atomic heat with cap, locked profile XP, bribe accept checks briber is fresh and not jailed.
- components/Underworld.tsx: shows "caught in a sting" for sting offers.
- app/api/auth/signup: throttle uses the real client IP and runs before validation.
- app/api/casino: every action runs in one transaction with a row lock (loss limit, break and limit changes can no longer be raced).
- app/api/holdup: finish pays once per ticket; start cooldowns (player and shop) are checked under locks.
- app/api/rob: cooldown and victim shield re-checked under a lock; atomic heat.
- app/api/transport: driver-fare cooldown under a lock; rides cannot take cash below zero; jail check.
- app/api/economy/start: charge + ticket + record in one transaction; jail/down checks.
- app/api/race: ticket can only be claimed once; atomic heat and XP.
- app/api/mission: start and claim under a lock; claim re-checks cooldown and consumes all start rows; heat clamped.
- app/api/crew: re-inviting the same player no longer sends another message for 10 min.
- app/api/businesses: collect uses compare-and-set on the till; buy/upgrade/hire charges are guarded; upgrade only applies to the level you saw.
- app/api/arrest + components/GameLayer.tsx: server-side proximity check, atomic arrest (one reward), no reward for re-arresting the same player within 30 min.

## Known and NOT fixed
- Age gate only applies at signup; accounts older than migration 0022 are not checked.
- throttled(), shot cooldowns and shot tickets are in-memory per instance (need Redis/DB).
- Home jobs (work/hustle/bizplan) and driver fares have no daily cap.
- Shot damage is applied by the victim's browser.
