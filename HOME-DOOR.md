# Home door, step 2: knock and invite

Guests can now come into a house, and everyone inside sees them (step 1 presence).

- **Knock:** stand at a stranger's door and tap the blue 🚪 Knock button (next to Break in). Whoever is home (owner or a housemate) gets a card: **Let in** or **Turn away**. Let in, and you walk into their house automatically if you are still at the door, otherwise a **Come in** card appears.
- **Invite:** Menu → 🚪 Front door → type a player name → Invite. They get a phone message and a **Come in** card, from anywhere.
- **Ask to leave:** the same panel lists who is in the house right now, with an **Ask to leave** button. A kicked guest is walked out within a few seconds.
- **As a guest** you see the host's rooms, furniture and layout, read-only: Home upgrades, security, housemates, house look and Edit home are hidden. Go outside to leave, and you come out at that front door. Death or E at your own door ends the visit too.
- A welcome lasts 90 minutes and stays fresh while you are inside. A knock waits 60 s. Break-in is unchanged and still works on any door.

## Setup
Run `prisma/migrations/0025_home_visits/migration.sql` (also appended to `prisma/fix-database.sql` and `prisma/setup-database.sql`) in the Supabase SQL editor, then `npm run db:generate`.

## Files
NEW `app/api/visit/route.ts`, `components/HomeDoor.tsx`, `prisma/migrations/0025_home_visits/migration.sql`, `HOME-DOOR.md`
EDITED `prisma/schema.prisma`, `prisma/fix-database.sql`, `prisma/setup-database.sql`, `lib/housemates.ts` (resolveView), `app/api/home/route.ts`, `app/api/home/layout/route.ts`, `app/api/home/furniture/route.ts`, `components/HomePresence.tsx`, `components/Sim.tsx`

## Known limits
- Knocks and the host's cards update every 4 s (polling), not instantly.
- A host who is outside does not get the knock; the guest sees "Nobody answers" after 60 s.
- Chat bubbles at home are still missing.
- Step 3 adds lock/unlock (unlocked = walk in without knocking).
