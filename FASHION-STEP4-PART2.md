# Fashion step 4 (part 2): wear jewellery, watches, bags, hats, glasses, belts, ties
No database migration (stored in the `look` JSON). Changed: lib/fashionWear.ts, lib/humanRig.ts, lib/characterModels.ts, lib/roomNet.ts, lib/cityNet.ts, components/Human.tsx, components/Wardrobe.tsx, app/api/save/route.ts.
Also fixed a part 1 bug: women's bought items were blocked by a 'f' vs 'w' gender mix-up.

- Bedroom mirror > "My bought clothes, shoes & accessories": tap an item to put it on; tap a worn shoe/accessory again to take it off. Buttons: "Take off accessories", "Back to outfit shoes".
- Drawn on the 3D character (other players see it too), in the item's colour/metal:
  head: cap, beanie, fila, kufi, fedora, bucket hat, wide-brim hat, fascinator, gele, headscarf, hair band, tiara, beaded crown
  face: sunglasses, earrings (stud, hoop, drop)
  neck: chain, cuban chain, choker, beaded necklace, pendant, gemstone pendant, scarf/shawl, pocket watch (as a pendant)
  body: belt, necktie, bow tie, lapel/tie pin, pocket square, backpack
  hands/legs: watch, bangle/bracelet, cufflinks, ring, anklet, hand-held handbag / clutch / tote / briefcase / duffel
- One item per slot (one hat, one necklace, one pair of earrings, one bag...). Watch, bangle, ring, pin and cufflinks each have their own slot.
- Server check (/api/save): accessories and shoes are dropped unless the item is in your bag.
- Not wearable yet: wallets and suspenders (32 items).
