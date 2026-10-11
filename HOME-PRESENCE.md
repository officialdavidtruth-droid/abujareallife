# Home presence, step 1: see each other inside a house

Everyone inside the same house now sees each other walking, sitting and sleeping, with a name tag. Right now that means the owner and their housemates (the only people who can be in a house). Guests and the knock at the door come in step 2, and lock/unlock in step 3.

- One realtime room per house: `room:home-<plot slot>`, on the same channel code the shops use (`lib/roomNet.ts`). Nothing to migrate, no new API.
- `lib/roomNet.ts`: new `p` field (0 standing, 1 sitting, 2 asleep) sent with position updates. Shops always send 0.
- `components/HomePresence.tsx` (new): joins the house room while you are home and draws the other people. Your own avatar is unchanged.
- `components/Sim.tsx`: mounts `<HomePeers>` in the home scene and supplies your position and pose (`homeSample`).

## Known limits
- Room names are guessable (plot slot), so a modified client could join and watch. Step 3 will gate this on the server.
- No chat bubbles at home yet.
