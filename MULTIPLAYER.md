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

---

# Update: voice, interactions, cleaner phone screen

## Player interactions
Tap a player (or their name above their head, or their name in the 🌍 list) to open the player card:
- 🎙️ **Talk (voice)** – private voice call, see below
- 👋 **Wave**, 🙌 **High-five**, 💃 **Dance** – they see the animation and get a notice with a one-tap "back" button. Both of you gain Social.
- 🔇 **Mute chat** – hides that player's chat and auto-declines their call requests.
Wave / high-five / dance work within 10 m.

## Voice rules (as designed)
1. You must be within **12 m** of a player to ask them to talk.
2. They get a banner: **Accept / Decline**. Nothing is heard until they accept.
3. After accepting, only the two of you hear each other (peer-to-peer WebRTC, encrypted). Everyone else hears nothing.
4. The voice **fades with distance** (full volume within 8 m, silent at 30 m). If you stay out of range for 4 seconds the call ends.
5. Either person can mute their mic or hang up. A person already on a call auto-replies "busy". Characters hold a phone to their ear while on a call.
Text chat still works for everyone at all times.

Files: `lib/cityVoice.ts` (calls), `components/CityPeople.tsx` (player card, call banners, chat), `lib/cityNet.ts` (signalling over the same Supabase channel).

## IMPORTANT: calls on mobile data need a TURN server
Free Google STUN servers connect most Wi-Fi users, but many phone networks (MTN/Airtel/Glo carrier-grade NAT) block direct peer-to-peer. For reliable voice add a TURN relay:
- Easiest: a free/paid TURN from metered.ca, Twilio Network Traversal, or Cloudflare Calls TURN.
- Add to `.env.local` and Vercel, then redeploy:
```
NEXT_PUBLIC_TURN_URL="turn:YOUR_HOST:3478,turns:YOUR_HOST:443?transport=tcp"
NEXT_PUBLIC_TURN_USERNAME="..."
NEXT_PUBLIC_TURN_CREDENTIAL="..."
```
(These are visible in the browser, so use a provider's short-lived/limited credentials where possible.)

## Microphone permission
- Browser/PWA: the site must be HTTPS (Vercel is) and the player taps **Allow** on the first call. On iPhone use Safari (or the installed Home Screen app on iOS 16.4+).
- Capacitor app: Android `AndroidManifest.xml` add `<uses-permission android:name="android.permission.RECORD_AUDIO" />` and `MODIFY_AUDIO_SETTINGS`; iOS `Info.plist` add `NSMicrophoneUsageDescription` ("Used for voice chat with other players").

## Phone screen cleanup
- Top bar is now just **clock · cash · 🏙️/🏠 · ☰**. Speed, power, account, character and free-will moved into the ☰ menu.
- In the city the needs panel became a small icon strip under the clock; Map / Jobs / Businesses / Players are round icon buttons down the right edge; the business card is a slim chip at top-centre; the keyboard hint text is hidden.

## Limits to know
- **Signalling is not authenticated.** Calls are encrypted, but because the channel is shared and names are trusted from the client, a determined attacker could try to impersonate a name during call setup. Before a big public launch, move signalling to Supabase *private* channels with Supabase Auth, or to your own server.
- **Quota:** voice audio doesn't use Supabase (it is peer-to-peer; only the setup messages do), but TURN relay traffic is billed by your TURN provider.
- **Only 1 call at a time** per player. No group/party voice yet.
- Not tested on real devices from here, so please test with two phones on mobile data before launch.

---

# Voice: fixing "Connecting…" (update)
Voice now asks the server for relay credentials (`/api/turn`), so you no longer need `NEXT_PUBLIC_TURN_*` in the browser. In Vercel → Settings → Environment Variables add ONE option from `.env.example` (Metered.ca has a free tier and is the quickest: create an app, copy its domain and API key into `METERED_DOMAIN` / `METERED_API_KEY`), then redeploy.
- Without a relay, calls still work on most Wi-Fi, but usually get stuck on mobile data. The call card now says so instead of failing silently.
- The call card shows the live network state while connecting, and a "Cancel" button.
- Both players must allow the microphone (the site needs https, which Vercel gives you).
- The remote voice plays through a normal audio element (more reliable than before). If a browser blocks autoplay, tap the screen once.
- Volume: Settings → Voice chat slider. Distance fade still applies (iPhones ignore volume changes, so they hear full volume).
