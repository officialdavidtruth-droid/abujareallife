# Rides update

**Run first:** `prisma/migrations/0014_ride_requests/migration.sql` (or paste `prisma/fix-database.sql` into Supabase), then `npx prisma generate`.

- **Order a ride for a player:** 👥 Players → 🚕 on a player → pick "Meet me here" or any place → Send. The other player gets an Accept / Decline prompt (2 min). You are charged only when they accept; decline / no answer costs nothing. If their game can't start the ride, you are refunded.
- **All buildings are destinations:** taxi, bike and bus menus list every building + district, searchable, with a district filter (`lib/destinations.ts`, `components/DestPicker.tsx`).
- **Bus:** hail it like a taxi. Fare ~₦200 (taxi ₦2,500), 5% cheaper per extra passenger (max 40% off). Other passengers get off at their own stops, nearest first, and the bus ends at yours.
