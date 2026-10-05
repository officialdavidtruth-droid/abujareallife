# Abuja Real Life

A Vercel-ready Next.js + React Three Fiber browser life-simulation foundation set in Abuja, Nigeria.

## Included in v1 foundation
- Procedural low-poly 3D player character with outfit customization
- Third-person-style 3D city scene with Abuja districts: Wuse, Garki, Maitama, Jabi, Gwarinpa, Asokoro
- NPCs, cars, roads, buildings and points of interest
- Jobs, salaries, XP and career selection
- Hunger, energy, mood, health and fitness systems
- Travel costs and district exploration
- Bank deposits/withdrawals
- Properties and vehicles economy
- Missions and activity feed
- Phone, city, jobs, bank and profile panels
- Browser persistence via localStorage
- Responsive desktop/mobile layout
- No external asset dependency required for the prototype

## Run
npm install
npm run build
npm run dev

## Deploy to Vercel
Import this repository/ZIP into Vercel. Framework preset: Next.js. Build command: `npm run build`.

## Next production systems
The client foundation is intentionally dependency-light. For persistent multiplayer, connect the same game state model to a database/auth provider and a realtime transport layer. Do not put secrets in client components.
