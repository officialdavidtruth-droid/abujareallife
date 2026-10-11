# Club companions, step 2: pay and leave the club together

NEW app/api/club-company/route.ts - server-side payment (price from lib/clubNpc, must be inside a Nightclub, 18+, not police/jailed/KO, can afford, 5 min cooldown per companion, one transaction, +5 heat).
EDITED lib/clubNpc.ts - COMPANION state (who is with you, phase inside/outside).
EDITED components/ClubTalk.tsx - the Pay button works; "is with you" banner with Call it off.
EDITED components/Interior.tsx - the paid companion follows you around the club; walking out of the door takes her with you (phase = outside, picked up by step 3).
No migration. Copy over (this folder includes step 1 files, so it replaces them) and deploy.
Not run in a browser or against a database; tsc shows no errors in these files except the usual un-generated Prisma client type.
