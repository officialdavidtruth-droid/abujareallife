/** Step 6 vehicle damage model. Pure deterministic helpers so client/server code can share the same rules. */
export type DamageZone = 'front' | 'rear' | 'left' | 'right' | 'windshield' | 'headlight-left' | 'headlight-right';
export type VehicleDamageState = {
  health: number; // 0..100; 100 = undamaged
  dents: Partial<Record<'front' | 'rear' | 'left' | 'right', number>>;
  brokenLights: string[];
  crackedWindshield: boolean;
};
export type CollisionImpact = { speedKph: number; zone: DamageZone; severity?: number };
export const pristineVehicle = (): VehicleDamageState => ({ health: 100, dents: {}, brokenLights: [], crackedWindshield: false });

/**
 * Applies collision damage using impact speed and optional severity (0..1).
 * Low-speed bumps create cosmetic dents; harder impacts can break lights and crack glass.
 */
export function applyVehicleCollisionDamage(previous: VehicleDamageState, impact: CollisionImpact): VehicleDamageState {
  const speed = Math.max(0, Math.min(240, Number(impact.speedKph) || 0));
  const severity = Math.max(0, Math.min(1, impact.severity ?? 1));
  const impactForce = Math.max(0, speed - 4) * severity;
  if (impactForce < 2) return previous;
  const damage = Math.min(48, Math.round(impactForce * 0.72));
  const next: VehicleDamageState = {
    health: Math.max(0, previous.health - damage),
    dents: { ...previous.dents },
    brokenLights: [...previous.brokenLights],
    crackedWindshield: previous.crackedWindshield,
  };
  if (['front', 'rear', 'left', 'right'].includes(impact.zone)) {
    const zone = impact.zone as 'front' | 'rear' | 'left' | 'right';
    next.dents[zone] = Math.min(100, (next.dents[zone] || 0) + Math.max(8, Math.round(impactForce * 1.5)));
  }
  if (speed >= 22 && (impact.zone === 'headlight-left' || impact.zone === 'headlight-right') && !next.brokenLights.includes(impact.zone)) {
    next.brokenLights.push(impact.zone);
  }
  if (speed >= 38 && impact.zone === 'windshield') next.crackedWindshield = true;
  if (speed >= 30 && impact.zone === 'front' && !next.brokenLights.includes('headlight-left')) next.brokenLights.push('headlight-left');
  if (speed >= 30 && impact.zone === 'front' && !next.brokenLights.includes('headlight-right')) next.brokenLights.push('headlight-right');
  return next;
}

export function damagePercent(state: VehicleDamageState): number { return Math.round(100 - Math.max(0, Math.min(100, state.health))); }
export function damageStage(state: VehicleDamageState): 'clean' | 'scratched' | 'damaged' | 'wrecked' {
  const d = damagePercent(state);
  return d < 5 ? 'clean' : d < 25 ? 'scratched' : d < 65 ? 'damaged' : 'wrecked';
}
