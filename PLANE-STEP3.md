# Plane — STEP 3: other players see the plane fly, and several players can board

Copy over the project root (same paths). Cumulative with steps 1 and 2. No new packages, no database change.

NEW:  components/planeNet.tsx
EDIT: components/cityPlane.tsx, components/cityPax.ts, components/CityWorld.tsx, components/CityRemote.tsx, components/PaxUi.tsx, lib/cityNet.ts

## What's new
- **Everybody sees the flight.** The pilot's plane pose (x, z, heading, altitude, pitch, roll, speed, airborne) rides on the normal 5/s "pos" broadcast, only while flying. Other players mirror it onto their own copy of the plane, smoothed and dead-reckoned between packets. The pilot's walking avatar is no longer drawn sliding along the ground.
- **One pilot at a time.** Nobody else can board while someone is flying. If two players press E in the same instant, the one whose name sorts first keeps the seat and the other is put beside the plane.
- **Passengers (3 seats + pilot)** reuse the ride-along handshake from `cityPax.ts` (new kind `plane`):
  - A player taps 🚗 on the pilot's player card to ask to ride along, or the pilot taps 🚗 on a player to invite them. The other side gets the usual Let in / Get in card (✈️ icon).
  - Only while the plane is **parked** and the passenger is within 40 m. Nobody can climb in mid-air.
  - Passengers get the same chase camera, **V** (or 📷 View) switches to the cockpit view. **E** or the Get out button leaves, but only once the plane has landed and slowed below ~25 km/h; otherwise "Wait until the plane has landed".
- **A label over the plane** shows who is flying and who is aboard ("✈️ @pilot · you, @friend").
- **When the pilot stops:** parks and steps out → passengers are dropped beside the plane and everyone sees it parked there. Crashes, disconnects or leaves while airborne → the plane is towed back to the runway for everyone and passengers are put on the runway.

## Limits (on purpose, for now)
- Passengers are not drawn inside the plane (the hull is opaque); the label shows who is aboard.
- A player who joins the city while the plane is parked away from the runway sees it at the runway until it is flown again or towed (90 s).
- Positions are not server-checked (same trust model as car ride-alongs).
- Cheap anti-teleport / flight-speed validation can come with the server part later if you want it.

## Test (needs two browsers / accounts in the same city)
1. A boards the plane and taxis: B should see the plane roll, and A's avatar not slide.
2. B walks up and presses E: "plane in use", no boarding.
3. A parks; B taps 🚗 on A's card → A accepts → B is inside (camera follows). A takes off: B sees the same flight; E while airborne is refused.
4. Land, stop: B presses E and steps out on the left. A crash (hit a building) tows the plane back for both.
