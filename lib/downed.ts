/* Knocked out / passed out. The server owns Save.downUntil; everything else is derived from it.
   down  : now < downUntil           you lie on the ground, cannot act, and can be robbed for much more than usual
   safe  : downUntil <= now < downUntil + SAFE_AFTER_WAKE_MS   you just woke up: cannot be robbed, shot or hit
   Pure data + maths, safe to import in the browser. */
export const KO_DOWN_MS = 15_000;            // punched to 0 HP
export const PASSOUT_DOWN_MS = 45_000;       // blacked out from drink / weed
export const SAFE_AFTER_WAKE_MS = 8_000;     // protection after getting back up (same as the respawn protection)
export const DOWN_REPEAT_MS = 60_000;        // a KO reported by the player's own client only counts if their last one ended this long ago
export const PASSOUT_LEVEL_AFTER = 60;       // drunk / high are capped to this when you black out, so you do not pass out again on the next sip
export const DOWN_ROB_PCT = 0.5, DOWN_ROB_MAX = 300_000;   // robbing someone who is out cold (normal robbery: 30%, max ₦150k)

export type DownState = { down: boolean; safe: boolean; downLeft: number; safeLeft: number };
export function downState(downUntil: Date | null | undefined, now = Date.now()): DownState {
  const t = downUntil ? downUntil.getTime() : 0;
  const downLeft = Math.max(0, t - now), safeLeft = t && now >= t ? Math.max(0, t + SAFE_AFTER_WAKE_MS - now) : 0;
  return { down: downLeft > 0, safe: safeLeft > 0, downLeft, safeLeft };
}
