# Multiplayer in the Abuja city

Real players now share the open city: you see each other walk, sprint and drive, and you can chat.

## Turn it on (5 minutes)
1. Create a free project at supabase.com.
2. Project Settings → API: copy **Project URL** and the **anon public** key.
3. Add to `.env.local` AND to Vercel → Settings → Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Supabase → Realtime → Settings: allow **public access** to channels.
5. Redeploy. Open the game on two phones/browsers with two accounts, tap 🏙️ Neighborhood, and you will see each other.

No database tables are needed; it uses Supabase Realtime (presence + broadcast) only.

## What players get
- Other players appear with their own look, name tag, walking/sprint animation and their car when driving or parked.
- 🌍 button (top right on phones): who's online, tap a name to mute, and city chat. Chat also shows as a speech bubble above heads.
- Standing within ~7 m of another real player slowly fills the **Social** need.
- Each city instance holds up to 40 players; the 41st is placed in "City 2", and so on automatically.

## How it works
- `lib/cityNet.ts` – realtime hook: joins `city:abuja-N`, tracks look via presence, sends position ~5x/sec only while someone else is in your instance, chat rate-limited (1 msg / 1.2 s sending, 0.9 s receiving per user), 120-char limit, inbound values clamped and looks sanitised.
- `components/CityWorld.tsx` – `Remote` / `RemotePlayers` (smooth interpolation), chat panel, speech bubbles.
- `components/City.tsx`, `components/Sim.tsx` – pass the Social-need hook.

## Honest limits (read before launch)
- **Quota:** Supabase's free plan caps realtime messages per second for the whole project (about 100/s) and concurrent connections (about 200). At 5 updates/sec per moving player that supports roughly 15–20 people moving at once. Paid plans raise this a lot; beyond a few hundred daily players, move to a dedicated game server (Colyseus, PartyKit or Nakama).
- **Trust:** movement and chat are client-trusted, so a determined cheater could spoof another player's name in chat. Money is still server-owned (economy routes), so cheating can't give naira. For a public launch add server-side chat moderation/reporting and a profanity filter; mute is the only tool right now.
- **Not shared yet:** AI traffic and pedestrians are simulated separately on each phone (everyone sees different cars), and remote players are not solid for traffic or collisions. Jobs, businesses and the flat are single-player.
- **Untested here:** I could not run the game or connect to Supabase in my environment, so test with two real devices before inviting people.
