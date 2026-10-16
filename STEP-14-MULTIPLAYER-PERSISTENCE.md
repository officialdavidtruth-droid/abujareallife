# Step 14 — Multiplayer position persistence hardening

This patch hardens the existing `/api/position` endpoint while preserving its response shape (`{ ok, position }` and `{ me, players }`). It validates finite coordinates and rotation, normalizes rotation, bounds input sizes, and keeps the existing speed sanity check that rejects implausible position jumps by returning the previous saved position.

## Apply

Replace `app/api/position/route.ts` with the supplied file. No Prisma schema migration is required.

## Validate

Run:

```bash
npm run build
```

Then test with two separate signed-in accounts in the same game: both should see the other player move; refreshing should restore each player's last accepted position; signing out should not expose another user's private save data.

## Important limitation

This is database-backed polling, not a real-time socket transport. It persists the latest accepted position and exposes recent positions to other signed-in players. It does not make all movement server-authoritative, nor does it guarantee cheat-proof physics. Those require movement simulation on the server and a dedicated realtime transport.
