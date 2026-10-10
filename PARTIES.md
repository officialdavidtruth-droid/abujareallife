# Friends, emotes and parties

Players host owambes, house parties, club nights and small hangouts. Everything is player-to-player: no NPC guests.

## Setup (once)
1. Run `prisma/migrations/0021_parties/migration.sql` in the Supabase SQL editor (safe to re-run; `fix-database.sql` has the same statements appended).
2. `npm run db:generate`, then redeploy. No new environment variables.

## Using it
Open the menu (☰) → **🎉 Parties**. Four tabs: **Now** (while you are inside one), **Tonight** (live parties), **Host**, **Friends**.

| Kind | Setup (not refunded) | Max people | Lasts | Door fee | Notes |
|---|---|---|---|---|---|
| 🛋️ Hang out | free | 8 | 2 h | none | Friends only. Snacks and drinks. |
| 🏠 House party | ₦25,000 | 15 | 3 h | up to ₦20,000 | Held in the district where the host stands. |
| 🎊 Owambe | ₦150,000 | 60 | 5 h | none | Host names the occasion (wedding, birthday, naming...) and an asoebi colour. Spraying lifts the vibe ×1.6. |
| 🪩 Club night | ₦500,000 | 80 | 5 h | up to ₦100,000 | Books a real Nightclub (host must be in its district, one booking at a time). Dancing lifts the vibe ×1.4. |

**Joining:** walk into the party's district, open Tonight, tap Join. The server checks the district from the position the game last reported (must be under 2 minutes old), the door fee, the capacity, friends-only and kicks. Stepping out and back in is free.

**Inside:**
- 💃 **Dance** (10 s cooldown): fills Fun and Social, scaled by the vibe. When 3 or more people danced in the last minute the floor is "full" and everybody gets ×1.5. Other players nearby see the dance animation.
- 🔥 **Dance circle**: invites everyone within about 15 m to dance with you; the notice has a "Join in" button.
- 🍽️ **Food and drinks**: priced by the host (50% to 200% of list). The host keeps the margin; half of list price is the supplier cost. Alcohol adds to your drunk level and can make you pass out, same as the club bar.
- 💸 **Spray** (₦1k, 5k, 20k, 100k, 500k) on any guest or the host. The recipient gets 92%; the city keeps 8%, so parties cannot be used to launder money.
- 📨 **Invite** anyone by name (they get a phone message) or tap an online friend.
- Host only: change the music (a cheer and a vibe boost, once per 10 minutes), kick, end early.

**Vibe (0-100)** rises with people joining, dancing, spraying, ordering and new music, and fades 1.2 per minute. It scales every need gain a guest gets (×0.6 in a dead room, up to ×1.4 at the peak).

**Host rewards:** door fees, food margin and sprays received are paid immediately. When the party ends, fame is `peak vibe × guests who stayed 3+ min × 0.6`, capped per kind (house 8, owambe and club 20), then the existing daily fame cap applies. Hangouts earn no fame.

## Emotes and group fun (open city)
- New emote button 🕺 next to the online counter: Dance, Shaku shaku, Azonto, Clap, Greet/bow, Laugh, Spray, Wave, Cheer. Everyone nearby sees them.
- **Dance circle** in that menu notifies everyone within reach; replying makes you dance.
- Standing near more players raises Social faster; dancing together raises it more.
- Friends: the Friends tab shows who is online, where, and whether they are at a party you can join. Friend requests still go through a player's card or the ❤️ Love panel.

## Files
- `lib/parties.ts`: all rules and numbers (tune here). `app/api/party/route.ts`: the only writer of money.
- `components/Party.tsx`: the panel. `components/GameLayer.tsx`: menu entry. `components/Sim.tsx`: listens for `arl-need-fx` to apply need changes.
- `lib/cityNet.ts`, `components/CityPeople.tsx`, `lib/humanRig.ts`: emotes, dance circle, group social.
- Schema: `Party` and `PartyGuest`.

## Known limits
- Not run against a live database or in a browser here (my sandbox could not install your dependencies, so I only type-checked the new code against stubs and unit-checked the rules). Please try it with two accounts before shipping.
- A party is a virtual venue: you must be in its district to join, but staying inside is not enforced afterwards, and there is no 3D party room yet.
- Expired parties are closed the next time anyone opens the Party panel or acts on it.
- Vibe updates are read-modify-write, so two actions in the same instant can occasionally lose one small bump.
