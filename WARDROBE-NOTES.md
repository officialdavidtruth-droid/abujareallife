# Wardrobe update

Copy these files over your project (same paths):
- lib/characterModels.ts, lib/profile.ts, lib/humanRig.ts, lib/interiors.ts
- components/Creator.tsx, components/Sim.tsx, components/Wardrobe.tsx (new)

No database migration needed: outfit/hair ids are stored inside the existing `look` JSON.

## Men's outfits
Tee & chinos, Polo & slacks, Hoodie & joggers, Bomber jacket, Business suit (jacket, lapels, tie, pocket square),
Agbada & fila (robe, wide sleeves, gold trim), Senator kaftan, Football kit (shorts + socks), Designer fit (long coat, chain, shades, watch)

## Women's outfits
Crop top & jeans, Midi dress, Evening gown, Iro & buba + gele, Power pantsuit (heels), Activewear,
Hoodie & joggers, Designer jumpsuit (halter, gold belt, hoops, shades). Skirts/gowns swing with the legs when walking.

## Hair
Men: Low fade, Fade + beard, Flat top, 360 waves, Twists, Dreadlocks, Cornrows, Short crop
Women: Bob, Long straight, High ponytail, Afro puffs, Knotless braids, Pixie, Box braids, Top bun
Both: Afro, Bald

Old saves still load: a style that does not suit the saved gender falls back to that gender's default.
The bedroom wardrobe now opens a mirror panel (outfit, colours, hair, live preview) instead of cycling one colour.
Police keep their uniform in the wardrobe (hair only).
