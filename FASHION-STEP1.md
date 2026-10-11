# Fashion step 1: Fashion Boutique + clothes

No database migration needed.

## What is new
- New business type **Fashion Boutique** (5 in the city: Wuse, Garki, Utako, Jabi, Lugbe). Pink neon sign, glass shopfront, map icon 👗,
  clothing rails + mannequins inside, 3 jobs (Fashion Sales Assistant, Personal Stylist, Boutique Manager), open 09:00-20:00, ownable by players.
- New **Clothes** shelf: 75 garments x 16 colours = 1,200 items (512 men's, 688 women's), sold ONLY in person at a Fashion Boutique
  (hidden from the Online Mall and refused by the mall API).
  Men: tops, jackets & hoodies, trousers & shorts, native wear (senator, agbada, dashiki, aso-oke...), suits & formal, sports & casual.
  Women: tops, jackets, trousers & skirts, dresses & gowns, native wear (ankara, iro & buba, aso-ebi, boubou...), suits, sports & casual.
- Store screen: Men / Women switch, garment-type chips and colour dots on the Clothes tab; each tile is coloured like the garment.
- The boutique also stocks the older Accessories items (they are still sold in Market/Salon/Barber as before).

## Next steps
3. Jewellery & accessories (many varieties)  4. Wear what you buy (show on your character)

## Files changed
lib/catalog.ts, lib/cityTypes.ts, lib/cityData.ts, lib/cityEconomy.ts, lib/businessHours.ts, lib/profile.ts, lib/work.ts, lib/destinations.ts, lib/interiors.ts,
components/StoreModal.tsx, components/Market.tsx, components/City.tsx, components/CityLook.tsx, components/CityScenery.tsx,
app/api/market/route.ts, app/api/businesses/route.ts
