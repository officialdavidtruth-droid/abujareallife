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
- components/Sim.tsx
- components/Human.tsx
- components/Creator.tsx
- components/Account.tsx
- components/AuthScreen.tsx
- lib/auth.ts
- lib/verification.ts
- lib/characterModels.ts
- prisma/schema.prisma (replaces)
- prisma/migrations/0002_accounts/migration.sql
- public/models/Xbot.glb
- package.json (replaces; adds bcryptjs and jose)
- .env.example (replaces)

## Not touched (keep yours)
lib/prisma.ts, app/globals.css, app/layout.tsx, components/World.tsx, .env.local, prisma/seed.ts

## After copying
1. npm install
2. Add AUTH_SECRET (32+ random chars) to .env.local and Vercel env vars
3. npm run db:migrate:deploy
