# LiveKit voice setup
1. Create a project at https://cloud.livekit.io (free tier is fine to start).
2. In Vercel, add these environment variables, then redeploy:
   - LIVEKIT_URL         = wss://<your-project>.livekit.cloud
   - LIVEKIT_API_KEY     = (from LiveKit project settings)
   - LIVEKIT_API_SECRET  = (from LiveKit project settings)
3. Voice rooms: one for the open city (`arl-city`) and one per building (`arl-bld-<id>`).
4. To go back to the old peer-to-peer voice: set NEXT_PUBLIC_VOICE=mesh and redeploy.
