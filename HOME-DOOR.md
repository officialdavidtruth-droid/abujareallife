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

# Step 3: lock and unlock

Menu → 🚪 Front door → **Unlock the door** / **Lock the door** (owner only; housemates see the state).

- **Locked (default, as before):** visitors must knock or be invited.
- **Unlocked:** the sign on the street reads "· 🔓 open", the button says **Enter**, and anyone can walk in without knocking. Good for parties. A player you ask to leave cannot walk back in for 10 minutes.
- Enforced on the server: the house's rooms and furniture (`/api/home?visit=`) are only sent to players who may be there, and a guest's welcome is re-checked every few seconds, so locking the door or asking someone to leave puts them back on the street.
- Break-in still works on any door.
- The lock is a hidden inventory row (`home_open`), so there is **no new migration** for step 3.

## Files (step 3)
EDITED `lib/housemates.ts`, `lib/houses.ts`, `app/api/visit/route.ts`, `app/api/houses/route.ts`, `components/HomeDoor.tsx`, `components/PlayerHouses.tsx`

## Known limit
The live room itself (the Supabase channel `room:home-<slot>`) is not server-checked, so a modified client could still watch an empty house room. It cannot load the layout or furniture, and it only ever sees people who are really inside. Fixing that needs private realtime channels with a database rule.
