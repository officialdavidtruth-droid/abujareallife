# Abuja Real Life — drop-in files

Copy this folder's contents over your project root (same paths, overwrite when asked).

## New or replaced files
- app/page.tsx (replaces)
- app/api/auth/signup/route.ts
- app/api/auth/login/route.ts
- app/api/auth/logout/route.ts
- app/api/auth/me/route.ts
- app/api/email/send/route.ts
- app/api/email/verify/route.ts
- app/api/save/route.ts
- components/Sim.tsx (updated for step 3)
- components/Neighborhood.tsx (step 3, new)
- components/Human.tsx
- components/Creator.tsx
- components/Account.tsx
- components/AuthScreen.tsx
- lib/auth.ts
- lib/verification.ts
- lib/characterModels.ts
- lib/supabaseClient.ts (step 3, new)
- prisma/schema.prisma (replaces)
- prisma/migrations/0002_accounts/migration.sql
- public/models/Xbot.glb
- package.json (replaces; adds bcryptjs, jose, @supabase/supabase-js)
- .env.example (replaces)

## Not touched (keep yours)
lib/prisma.ts, app/globals.css, app/layout.tsx, components/World.tsx, .env.local, prisma/seed.ts

## After copying
1. npm install
2. Add AUTH_SECRET (32+ random chars) to .env.local and Vercel env vars
3. npm run db:migrate:deploy

## Step 3 setup (multiplayer)
- Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (Supabase > Project Settings > API) to .env.local and Vercel
- Supabase > Realtime > Settings: make sure public access is allowed for channels
- Run npm install again (new dependency)
