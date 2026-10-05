import { createClient } from '@supabase/supabase-js';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
// null when env vars are missing, so the game still runs without multiplayer.
export const supabase = url && key ? createClient(url, key, { realtime: { params: { eventsPerSecond: 12 } } }) : null;
