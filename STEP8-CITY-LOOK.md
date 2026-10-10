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

## Tuning
All in `CityLook.tsx`: `NEON` (light colours), `BLADE` (which types get blade signs), `STRIPED`, `GRAF_TEXT`, chance values like `R('dm') > .35` (dumpsters), `r > .42` (graffiti), `PUDDLES` count, `SUB`/sag in `PowerLines`.

## Limits (honest)
- **No alleys, fences or parked cars.** Each building sits in a 16 m block and the whole gap around it is the pavement that pedestrians walk and kerbside taxis use, so props hug the walls instead. Real alleys or a car park need a layout change (smaller buildings or mid-block gaps); that is a separate decision.
- Wet roads have no real reflections (no environment map): they darken and get dark puddles, not mirror shine.
- Props are not in the pedestrian/NPC pathing, so an ambient NPC can clip a dumpster edge.
- Could not run `next build` here (no dependencies / network). Both files were syntax-checked with `tsc`. Please run `npm run build` once and send me any errors.
