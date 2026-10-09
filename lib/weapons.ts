/* Single source of truth for weapons. Used by the loadout UI, the shooting code in CityWorld and the damage rules in cityNet. */
export type Weapon = { id: string; name: string; icon: string; damage: number; range: number; mag: number; reserve: number; rate: number; price: number };
export const WEAPONS: Weapon[] = [
  { id: 'pistol', name: 'Service Pistol', icon: '🔫', damage: 24, range: 32, mag: 12, reserve: 48, rate: 420, price: 450_000 },
  { id: 'smg', name: 'Compact SMG', icon: '⚡', damage: 14, range: 24, mag: 24, reserve: 96, rate: 150, price: 900_000 },
  { id: 'rifle', name: 'Carbine Rifle', icon: '🎯', damage: 32, range: 55, mag: 30, reserve: 90, rate: 500, price: 1_600_000 },
];
export const WEAPON_RULES: Record<string, { damage: number; range: number; cooldown: number }> =
  Object.fromEntries(WEAPONS.map(w => [w.id, { damage: w.damage, range: w.range, cooldown: w.rate }]));
/** Inventory key of a weapon. Weapons are only usable by players who bought them at a Gun Shop (the server checks this on every shot). */
export const weaponItemId = (id: string) => `arm_${id}`;
