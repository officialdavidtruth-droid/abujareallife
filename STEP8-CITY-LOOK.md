# Step 8: city look (visual only, no server or database changes)

## Files
- `components/CityLook.tsx` (NEW): all the new visuals.
- `components/CityWorld.tsx` (EDITED, 6 small changes): import, +/-1 storey variety, striped awnings, `<BuildingDress/>` in each building, wet-road material on `Roads`, new scene layers, dumpsters/crates added to `SOLIDS`.

## What you get
- **Building variety**: +/-1 storey per building (not Government, Hospital, Airport, Rail, Police, Jail). One of 5 rooftop looks per building (solar panels, satellite dish, lit rooftop name sign, generator, stair-head with parapet). Accent band under the first floor, split AC units and drain pipes on side walls.
- **Signage**: every shop now has its real business name on its sign board, plus a blade sign with the type icon sticking out over the pavement (clubs, cinemas, restaurants, pharmacies, hotels, barbers, salons, gyms, banks, markets, petrol, gun shops). Signs glow with the in-game night. Striped awnings on food/retail types.
- **Night lighting**: coloured light pools on the pavement in front of each shop (pink for clubs, green for pharmacies, and so on), on top of the existing lamp glow. No real lights were added, so it stays cheap.
- **Street clutter** (instanced): dumpsters + bin bags behind buildings, wheelie bins, crate stacks at markets, benches, bollards at banks/hotels/government, cones and drums at mechanics/petrol/logistics, hydrants at corners, hawker table + umbrella at food/market shops. Dumpsters and crates are solid; the rest are not.
- **Graffiti** on about 40% of side/back walls (4 tags: 9JA, NO RULES, WUSE, ABUJA 4 LIFE).
- **Utility poles and sagging wires** along every road.
- **Wet roads**: roads darken and puddles appear when it rains or storms, then dry out slowly (about 30 s).

## Car parks, fences and alleys (layout change)
Every 16 m block has a 2.8 m public pavement ring (pedestrian lines, kerbside taxi stops), leaving a 10.4 x 10.4 m buildable square. Buildings used to fill it. `lib/destinations.ts` (`BUILDS_WORLD`, single source for rendering, collision, map and ride destinations) now picks a layout per building by hash (same every session):
- **lot (~37 buildings)**: building 6 m deep, pushed to the back. A 4.4 m forecourt in front with paving, up to 2 parked cars (`parkedCar`), and a fence on the street edge and both sides with a 1.9 m gate in line with the door. Fence style by type: chain-link for Mechanic / Petrol / Logistics / Car Dealer, iron railing for Bank / Hotel / School / Office / Tech / Cinema / Estate Agency, brick wall for the rest.
- **alley (~29 buildings)**: building 6.8 m wide, pushed to one side. A 3.6 m alley beside it with a dark floor, a brick wall on the street side (open at the front end), a back wall with a 1.1 m squeeze gap, crates, a pallet, two bins and a lamp.
- **unchanged (~34)**: Government, Hospital, Airport, Rail Station, Police Station, Jail, Gun Shop and the rest of the hash.
- Fences, parked cars and alley walls/crates are in `LOOK_SOLIDS`, so you and your car cannot pass through them. Pavements, taxi kerb spots and pedestrian lines are untouched.
- Ride destinations still point at the public pavement in front of the gate (`CityBuilding.front`); `buildingExitPoint` puts you inside the gate, in front of the door.
- Doors need you within 2.6 m, so for a lot building you now walk in through the gate.

## Tuning
All in `CityLook.tsx`: `NEON` (light colours), `BLADE` (which types get blade signs), `STRIPED`, `GRAF_TEXT`, chance values like `R('dm') > .35` (dumpsters), `r > .42` (graffiti), `PUDDLES` count, `SUB`/sag in `PowerLines`. Layout shares: `r < .45` (lot) and `r < .8` (alley) in `lib/destinations.ts`; `GATE`, `CAR_COL`, fence kinds in `CityLook.tsx`.

## Limits (honest)
- Alleys, fences and parked cars now exist (see below). They are static scenery plus solid obstacles. The map route finder (`findPath`) does not know about them, and AI traffic does not park or drive in them.
- Wet roads have no real reflections (no environment map): they darken and get dark puddles, not mirror shine.
- Props are not in the pedestrian/NPC pathing, so an ambient NPC can clip a dumpster edge.
- Could not run `next build` here (no dependencies / network). Both files were syntax-checked with `tsc`. Please run `npm run build` once and send me any errors.
