# Abuja Real Life – update 2 (cumulative: includes the game-style label update)
Copy over the project root (same paths, overwrite). No new npm packages, no database migration.

NEW:   lib/audio.ts, lib/settings.ts, lib/catalog.ts, components/AudioRoot.tsx, components/StoreModal.tsx,
       app/api/turn/route.ts, app/api/inventory/route.ts, lib/gameLabels.ts
EDIT:  app/layout.tsx, components/{Sim,CityWorld,Interior,CityPeople}.tsx, lib/{cityAudio,cityVoice,interiors}.ts,
       app/api/shop/route.ts, .env.example, MULTIPLAYER.md

Voice on phones: add Metered/Cloudflare/TURN env vars in Vercel (see .env.example + MULTIPLAYER.md), then redeploy.
 