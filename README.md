# Abuja Real Life — Living City Update

## What's new
- **Drivable car** — press **E** to call your car (it appears in the nearest lane), **E** again to get in, **E** to get out.
  W/S throttle & brake/reverse · A/D steer · **Space** handbrake · **Shift** boost · **H** horn · **C** re-centre camera.
  Touch: joystick steers/accelerates, 🚗 button = get in/out, Sprint = boost, Jump = handbrake, 📣 = horn.
  Buildings and AI cars are solid, brake lights, speedometer, chase camera with speed FOV, and your car shows on the minimap.
  A car you walk >70 m away from returns to the garage — just call it again.
- **Pedestrians** (96) walk the pavements, wait at the kerb for a red light, and get knocked down (then stand back up) if you clip them.
- **AI traffic** now stops for you — on foot or in your car — and cars are solid for the player on foot.
- **Day / night cycle** driven by the in-game clock (Sim `S.min`): sun & moon arc, dusk colours, stars, lit windows, glowing street lamps and car headlights at night.
- **Sound** — procedural engine, horn and crash (no audio files). 🔊 button mutes.

## Files changed
- `components/CityWorld.tsx` — car physics, pedestrians, day/night, HUD, minimap car marker
- `components/City.tsx`, `components/Sim.tsx` — pass the game clock into the city
- `lib/cityAudio.ts` — new, Web Audio engine/horn/thud

---

# Abuja Real Life — Mobile/iPad Patch

This patch makes the Three.js/R3F world mobile-first:

- iPhone/Android touch joystick
- iPad/tablet controls
- Touch action buttons
- Responsive district selector
- Safe-area support for notched phones
- Landscape phone support
- Performance-friendly R3F DPR
- Fixes the R3F hook error by moving `useFrame()` player movement inside `<Canvas>`

## Install

1. Replace your existing `components/World.tsx` with the included file.
2. Import the CSS from your existing global stylesheet, for example:
   `import './globals.css';`
   or copy the CSS into your current global CSS file.
3. Keep the page as a client-only/dynamic import for the game world if you are using Next.js SSR:
   `dynamic(() => import('@/components/World'), { ssr: false })`.

The mobile controls are designed for the next Sims-like systems:
phone UI, interactions, inventory, needs, jobs, relationships, housing and vehicles.
