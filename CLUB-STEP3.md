# Club companions, step 3: getting home together

NEW components/ClubCompanion.tsx - CityCompanion (3D, city), HomeCompanion (3D, house), CompanionHud (banner).
EDITED components/CityWorld.tsx - mounts <CityCompanion/> (one import + one line).
EDITED components/Sim.tsx - mounts <HomeCompanion/> next to your avatar and <CompanionHud/>.
EDITED lib/clubNpc.ts - COMPANION gets phase 'home'; the club looks moved here (CLUB_LOOKS) so city/house can reuse them.
EDITED components/Interior.tsx - imports CLUB_LOOKS instead of its own copy.
Includes steps 1 and 2 files (ClubTalk.tsx, app/api/club-company/route.ts): copy the whole folder over. No migration.

Flow: pay > she follows you out of the club > city: walks behind you / rides hidden in your car / stands by the car when you get out > front door + E > she walks into your house and follows you around > "Send her home" (until step 4 adds the bedroom).
Not run in a browser; tsc shows no errors in these files.
