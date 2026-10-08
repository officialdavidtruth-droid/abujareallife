# Phone messages & phone grades

* Tap a player in the city -> **💬 Message** opens your chat thread with them on your phone (📱 Phone -> Messages).
* Threads are saved in the `Message` table (polled every few seconds; unread badge + pop-up for new texts).
* **Phone grades** (best smartphone in your bag; the Tech store sells the same items, or upgrade from the phone itself):
  * Basic phone (everyone): texts up to 140 chars, 3 chats.
  * Budget smartphone: unlimited chats, 300 chars, read receipts, Maps (navigate to shared locations).
  * Mid-range: + share your location.
  * Flagship: + send money (max ₦500,000 per transfer).
* The server enforces all of it (`app/api/messages`, `app/api/phone`, rules in `lib/phone.ts`).

## One-time setup
Run `prisma/migrations/0009_messages/migration.sql` once in the Supabase SQL editor, then redeploy.
