# Abuja Real Life — Mobile Game Guide

The game is now phone-first. Two ways to ship it:

## A) Install from the browser (PWA) — works today
1. Deploy to Vercel as before (`git push`).
2. Open the URL on your phone:
   - **Android (Chrome):** tap **⬇ Install game** (or menu → Install app).
   - **iPhone (Safari):** Share → **Add to Home Screen**.
3. Launch from the home screen: it opens fullscreen, landscape, with no browser bars.

## B) Real Android / iOS app (Capacitor)
```bash
npm install
export GAME_URL=https://your-app.vercel.app     # your deployed site
npx cap add android      # and/or: npx cap add ios  (iOS needs a Mac + Xcode)
npx cap sync
npx cap open android     # opens Android Studio → Build → Build APK / Bundle
```
Lock landscape natively: in `android/app/src/main/AndroidManifest.xml` add
`android:screenOrientation="sensorLandscape"` to the `<activity>`; in Xcode tick only Landscape Left/Right.

## What changed
- `app/layout.tsx` – mobile viewport (no zoom, notch-safe), manifest, iOS web-app meta
- `app/mobile.css` – safe areas, bigger touch targets, compact HUD, no text-select/pull-to-refresh
- `components/PWARegister.tsx` – service worker, rotate-to-landscape screen, fullscreen + install buttons
- `public/manifest.webmanifest`, `public/sw.js`, `public/icons/*` – installable app + caching of the 3D assets
- `capacitor.config.ts` + scripts in `package.json` – native wrapper
- `components/Sim.tsx` – hint text now says "Tap"

## Tips
- Replace `public/icons/*` with your own artwork (192, 512, maskable 512, 180 apple-touch).
- The city already has a touch joystick + buttons; the flat uses tap-to-walk and drag-to-rotate.
- If performance is low on older phones, lower `dpr={[1,1.75]}` to `[1,1.25]` in `components/Sim.tsx`.
