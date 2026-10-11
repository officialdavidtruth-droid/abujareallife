# Fashion step 4 (part 1): wear what you buy (clothes + shoes)
No database migration (stored in the existing `look` JSON).
Changed: lib/fashionWear.ts (new), lib/characterModels.ts, lib/humanRig.ts, lib/roomNet.ts, lib/cityNet.ts, components/Human.tsx, components/Wardrobe.tsx, app/api/save/route.ts.

- Bedroom wardrobe mirror has a new section "My bought clothes & shoes": every clothing / shoe item in your bag, in its colour. Tap one to try it on in the live preview; "Wear it" saves.
- Tops, dresses, gowns, native wear, suits: pick the matching 3D outfit (hoodie, suit, agbada, kaftan, gown, ankara...) in the item's colour. Trousers/skirts set the bottoms colour.
- Shoes change the shoe on your character (sneaker, dress shoe, heel, boot, sandal) in the item's colour. Other players see them too.
- Shoes are checked on the server: if the pair is not in your bag (e.g. sold), you go back to the outfit's own shoes. Men's items only fit a male character, women's a female one.
- Existing free outfit/colour pickers still work as before.
Part 2 (next): jewellery, watches, bags, hats and glasses shown on the character.
