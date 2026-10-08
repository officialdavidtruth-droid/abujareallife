# Fixes in this drop

Copy these files over the same paths in your repo (do not delete folders), then redeploy.

- lib/homeUpgrades.ts       full catalog: south wing, gym, cinema, office, solar, AC, water heater, smart home, surround sound, chef's kitchen, orthopedic mattress + the old items
- components/HomeUpgrades.tsx  new "Comfort & utilities" group
- lib/sell.ts               adds mallPrice (the Online Mall in Market.tsx and /api/market need it)
- lib/collision.ts          adds setSouthLimit (Sim.tsx imports it; without it the build fails)
- components/Sim.tsx        building exits at the real position; sleep 240→120 min (orthopedic mattress 75), movie night 110→55, big-screen gaming 80→45; effects for 5 new upgrades
- components/CityWorld.tsx  exports buildingExitPoint; camera/start point match where you arrive
- prisma/fix-database.sql   now includes the Message table (run the whole file in Supabase SQL Editor)

## Chat checklist
1. Run prisma/fix-database.sql in the Supabase SQL Editor (creates the Message table for phone messages).
2. For in-world chat: Vercel > Settings > Environment Variables must have NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then redeploy. Supabase > Realtime settings: allow public access.
- lib/cityVoice.ts + components/CityPeople.tsx  mic: remembers permission on phones (the "Allow microphone" card no longer returns every time you go outside; Cancel stays cancelled), no random auto-prompt on touch screens, audio unlocks inside the tap so voice works on phones
- New upgrades: inverter, borehole, fridge freezer, gaming rig, fibre internet
