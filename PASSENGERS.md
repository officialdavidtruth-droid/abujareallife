# Passengers + "meet them" fix

No database change. Copy these files over your project (same paths).

## 1. Fix: transport took you to the wrong place when meeting a player
Causes (all fixed):
- **📍 on a player was a frozen snapshot.** It now follows them (`GAME.nav.follow`), so the waypoint and the map pin move with the player.
- **Taxi / bike / bus menus had no "go to this player" choice**, so you picked a building near them and got dropped up to a block away. The menus now list nearby players first ("🧍 @name · 120 m away"). The destination is read when you tap it, not when the menu opened.
- **While riding a taxi/bike/bus your own position was never broadcast**, so other players saw you stuck where you hailed the ride. Others now see the vehicle moving.
- **"Meet me here" (ordered rides)** used the spot where the sender stood when they opened the panel. It now uses where the sender is when the taxi picks you up.
- After the taxi drops you at the kerb, a live waypoint to the player appears so you can walk the last bit.

## 2. Passengers
**Your own car (up to 3 friends):** drive your car -> Players -> 🚗 on a friend -> they get an invite and tap *Get in*. Or a friend asks to join you while you are driving (🚗 on your name in their list); you tap *Let in*. Seats: front, rear left, rear right. Everyone sees them sitting in the car.

**Shared taxi (a couple):** hail a taxi -> in the taxi menu tick "👫 Bring someone along" (nearby players), pick the destination. When the taxi sets off your partner gets the invite. You can also invite/ask while the taxi is already moving. The host pays the fare. One guest per taxi.

Getting out: guest taps **🚪 Get out** (or E) once the vehicle is slow; the host can **Drop off** everyone. Guests are put out automatically when the host leaves the car, the taxi arrives, or the host disconnects.

## Files
- NEW `components/cityPax.ts` (state + per-frame logic), `components/PaxUi.tsx` (prompts, get-out, drop-off)
- `lib/cityNet.ts` (rd / pa / ps fields, `seat` message), `lib/destinations.ts`
- `components/CityWorld.tsx`, `CityTraffic.tsx`, `CityRemote.tsx`, `CityCars.tsx`, `CityPeds.tsx`, `cityShared.ts`, `GameLayer.tsx`

## Test with two browsers (two accounts)
1. A drives; B opens Players -> 🚗 on A (asks) or A taps 🚗 on B (invites). Accept. B's camera rides along; A sees B in the passenger seat.
2. A stops and gets out: B is dropped beside the car.
3. A hails a taxi, ticks B, picks a place: B accepts and rides along; at the destination both step out.
4. B opens Players -> 📍 on A while A drives: the pin keeps following A. B hails a taxi and picks "@A": the taxi goes to where A is at that moment.
