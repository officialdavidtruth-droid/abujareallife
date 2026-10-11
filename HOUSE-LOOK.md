# Glamorous houses + "🎨 House look" customiser

Copy over the project root (same paths). No new packages, **no database change** (the look is one hidden inventory row `home_style`, like the home upgrades).

NEW:  lib/houseStyle.ts, app/api/housestyle/route.ts, components/HouseStyle.tsx
EDIT: lib/houses.ts, app/api/houses/route.ts, components/PlayerHouses.tsx, components/Sim.tsx

## NEPO babies
A NEPO account's house on the street now shows the **Mansion** look by default, with every extra on: two storeys, cream walls, gold trim and gold double doors, hip roof with chimneys, corner pilasters, grand columns and pediment, glass balcony, lamp posts at the steps, gate and boundary wall with lit pillars, palms, hedges with flower beds, and a glowing light strip that brightens at night. LAPO (and anyone else) keep the classic house until they change it.

## Customising (menu → 🎨 House look)
Live 3D preview (drag to turn it, ☀️/🌙 toggle), then:
- **Colours, free anytime:** walls (18), roof (10), trim (8), front door (7).
- **Designs:** Classic (free) · Modern ₦2.5M · Villa ₦5M · Mansion ₦15M. Bought once, then switch freely.
- **Extras (bought once, toggle freely):** Gate & wall ₦1.5M · Grand columns ₦1.2M · Balcony ₦2M · Palm trees ₦0.9M · Garden ₦0.8M · Night glow ₦1.8M.
- NEPO babies own every design and extra for free. Prices live in `lib/houseStyle.ts`; the server checks ownership and charges the cash (never trusts the browser).
- Other players see your new look as soon as their house list refreshes (on load, and every 90 s).

## Notes
- Exterior only (the street house). The inside of the home is a separate step if you want it glamorous too.
- House footprints and plots did not change, so doors, driveways and parked cars stay where they were. The gate wall and columns are visual only (you can walk through them); the driveway is left open.
- Wall/roof colours of existing houses are unchanged (the old palettes are the first entries of the new ones).
- Rendering is still instanced (about 10 draw calls for the whole street).
- Not seen in a browser yet: I only type-checked and ran the layout code, so please look at each design once and tell me what to adjust.
