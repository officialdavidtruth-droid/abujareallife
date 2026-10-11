/* Home security + house break-ins. Pure data and maths, safe to import in the browser AND on the server.
   Guards are stored as hidden inventory rows (itemKey "sec_<id>", quantity = how many), so no database migration is needed.
   The SERVER owns prices, limits, the odds and the roll (app/api/security, app/api/burgle); the client only mirrors the odds as a risk label. */
export type GuardId = 'dog' | 'guard' | 'armed';
export type Guard = { id: GuardId; key: string; name: string; e: string; price: number; max: number; power: number; needs?: GuardId; blurb: string };
export const GUARDS: Guard[] = [
  { id: 'dog', key: 'sec_dog', name: 'Guard dog', e: '🐕', price: 1_500_000, max: 2, power: 16, blurb: 'A trained Rottweiler patrols your yard and barks the moment anyone touches the gate. Your phone gets the alert.' },
  { id: 'guard', key: 'sec_guard', name: 'Security guard', e: '💂', price: 4_000_000, max: 2, power: 28, blurb: 'A uniformed guard walks your plot day and night. He sees who is at the door, so you get their name.' },
  { id: 'armed', key: 'sec_armed', name: 'Armed response guard', e: '🛡️', price: 9_000_000, max: 1, power: 42, needs: 'guard', blurb: 'Radio, baton and a very short temper. Intruders he catches stay down twice as long.' },
];
export const guardById = (id: string) => GUARDS.find(g => g.id === id);
export const guardByKey = (key: string) => GUARDS.find(g => g.key === key);

export type Sec = { dog: number; guard: number; armed: number };
export const NO_SEC: Sec = { dog: 0, guard: 0, armed: 0 };
export const hasGuards = (s: Sec) => s.dog + s.guard + s.armed > 0;
/** Inventory rows (itemKey starting "sec_") to guard counts, never above each guard's limit. */
export function secFromRows(rows: { itemKey: string; quantity: number }[]): Sec {
  const s: Sec = { ...NO_SEC };
  for (const r of rows) { const g = guardByKey(r.itemKey); if (g) s[g.id] = Math.max(0, Math.min(g.max, Math.floor(r.quantity))); }
  return s;
}
/** Compact form sent with every house (/api/houses) so other players SEE the guards and the risk. */
export const packSec = (s: Sec) => (hasGuards(s) ? { d: s.dog, g: s.guard, a: s.armed } : undefined);
export const unpackSec = (p?: { d?: number; g?: number; a?: number } | null): Sec => (p ? { dog: Math.max(0, (p.d || 0) | 0), guard: Math.max(0, (p.g || 0) | 0), armed: Math.max(0, (p.a || 0) | 0) } : { ...NO_SEC });

export const BREAKIN = {
  secs: 8,                     // how long the lock takes: you stand at the door the whole time (the server checks the wait AND your position)
  cancelDist: 4.5,             // walk further than this from the door and the attempt is off
  maxAgeMs: 120_000,           // a lock ticket is only good for this long
  base: 0.8, floor: 0.06, ceil: 0.9,   // chance to get in: no guards -> 80%, a full security team -> 6%
  stealthPer: 0.012, stealthMax: 0.12, // stealth skill helps a little
  pct: 0.2, lootMax: 400_000, lootMin: 5_000,   // you take 20% of the owner's cash, max ₦400k (below lootMin there is nothing worth taking)
  heatWin: 30, heatEmpty: 15, heatFail: 45,
  shieldMs: 15 * 60_000,       // a house that was just cleaned out cannot be hit again for this long
  koMult: 2,                   // an armed guard keeps you down this many times longer
  alertGapMs: 60_000,          // the owner is alerted at most once a minute
};
export const danger = (s: Sec) => s.dog * GUARDS[0].power + s.guard * GUARDS[1].power + s.armed * GUARDS[2].power;
/** Chance a break-in gets through (0..1). */
export const winChance = (s: Sec, stealth = 0) =>
  Math.min(BREAKIN.ceil, Math.max(BREAKIN.floor, BREAKIN.base - danger(s) / 100 + Math.min(BREAKIN.stealthMax, Math.max(0, stealth) * BREAKIN.stealthPer)));
export function riskLabel(p: number): { t: string; c: string } {
  return p >= 0.7 ? { t: 'Easy target', c: '#7ee787' } : p >= 0.45 ? { t: 'Risky', c: '#f2cc60' } : p >= 0.2 ? { t: 'Dangerous', c: '#ff9b52' } : { t: 'Fortress', c: '#ff6b6b' };
}
export const secLine = (s: Sec) => [s.dog && `${GUARDS[0].e}×${s.dog}`, s.guard && `${GUARDS[1].e}×${s.guard}`, s.armed && `${GUARDS[2].e}×${s.armed}`].filter(Boolean).join(' ');
