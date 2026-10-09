/* Best-effort memory of accepted shots (per server instance, like the other in-memory maps). Used to tell whether a
   reported death was really caused by that shooter, so a victim can never put heat on someone who did not shoot them. */
const shots = new Map<string, number>();
export function recordShot(shooterId: string, targetId: string) {
  const now = Date.now();
  if (shots.size > 2000) for (const [k, t] of shots) if (now - t > 120_000) shots.delete(k);
  shots.set(`${shooterId}>${targetId}`, now);
}
export const recentShot = (shooterId: string, targetId: string, ms = 30_000) => Date.now() - (shots.get(`${shooterId}>${targetId}`) || 0) < ms;
