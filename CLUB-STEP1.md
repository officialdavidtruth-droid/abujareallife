# Club companions, step 1: approach and talk (no payment yet)

NEW lib/clubNpc.ts - the club people (5 hostesses + 2 "Companion" NPCs, Chi and Lola), live positions, who you are talking to.
NEW components/ClubTalk.tsx - walk-up + talk panel, E prompt, 18+ confirmation (reuses /api/street-npc), price quote.
EDITED components/Interior.tsx - 2 new club NPCs; tapping one walks you to her; she stops dancing and turns to you.
No migration, no new API. Copy over and deploy.

Plan: 1 talk (this) > 2 pay + leave the club together > 3 walk/drive home + enter house > 4 bedroom, fade to black, wake up, she leaves.
