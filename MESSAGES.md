# Phone messages (free for everyone)

* Tap a player in the city -> **💬 Message**, or type a name in 📱 Phone -> Messages.
* **Chat is free**: unlimited chats, read receipts, maps, share location and send money (max ₦500,000 per transfer) for every player. No phone upgrade needed.
* Sending is instant: your bubble appears the moment you press Send (shown with … then ✓), and the server call runs in the background. A failed message shows "Not sent · tap to retry".
* Threads refresh every 1.5 s while open. The server checks name, cooldown and rate limit in a single parallel round trip.
* Rules live in `lib/phone.ts` (`FREE_PHONE`), `app/api/messages`.

## One-time setup
Run `prisma/migrations/0009_messages/migration.sql` once in the Supabase SQL editor (if not already done).
