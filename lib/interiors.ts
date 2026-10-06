import type { Business } from './cityTypes';
import { CAR_PRICE, CRIMES, QUESTS, type CrimeId, type ProfessionId, type SkillId } from './profile';

/* Every building type gets a real room. Shared by the room scene (client) and the server (shop prices). */
export type Item = { x: number; z: number; w: number; d: number; h: number; c: string; y?: number; solid?: boolean; round?: boolean; glow?: boolean };
export type Opt = { t: 'shift'; idx: number; label: string; pay: number } | { t: 'shop'; id: string; label: string; cost: number } | { t: 'quest'; id: string } | { t: 'crime'; id: CrimeId } | { t: 'info'; text: string };
export type Spot = { id: string; x: number; z: number; e: string; label: string; opts: Opt[] };
export type Interior = { w: number; d: number; floor: string; wall: string; items: Item[]; spots: Spot[] };

export type ShopItem = { id: string; label: string; cost: number; grant?: 'car'; fx?: Partial<Record<'hunger' | 'energy' | 'hygiene' | 'bladder' | 'fun' | 'social', number>>; xp?: { skill: SkillId; amt: number } };
const food: ShopItem[] = [{ id: 'meal', label: 'Jollof & chicken', cost: 3500, fx: { hunger: 55, fun: 4 } }, { id: 'drink', label: 'Cold drink', cost: 800, fx: { hunger: 6, fun: 4 } }];
export const SHOP: Record<string, ShopItem[]> = {
  Restaurant: food, Hotel: [{ id: 'room', label: 'Room for the night', cost: 40_000, fx: { energy: 100, hygiene: 60 } }, ...food],
  Hospital: [{ id: 'checkup', label: 'Check-up', cost: 15_000, fx: { energy: 20, hygiene: 20 } }], Supermarket: [{ id: 'groc', label: 'Groceries', cost: 5000, fx: { hunger: 35 } }, { id: 'water', label: 'Water', cost: 300, fx: { bladder: -4, hunger: 2 } }],
  Pharmacy: [{ id: 'vit', label: 'Vitamins', cost: 2500, fx: { energy: 12 } }], Salon: [{ id: 'hair', label: 'Hair styling', cost: 12_000, fx: { social: 12, fun: 10, hygiene: 25 } }],
  Barber: [{ id: 'cut', label: 'Fresh cut', cost: 4000, fx: { social: 10, fun: 8, hygiene: 20 } }], Gym: [{ id: 'train', label: 'Personal training', cost: 8000, fx: { fun: 10, energy: -10 }, xp: { skill: 'fitness', amt: 10 } }],
  School: [{ id: 'tech', label: 'Coding course', cost: 60_000, xp: { skill: 'tech', amt: 30 } }, { id: 'biz', label: 'Business course', cost: 60_000, xp: { skill: 'business', amt: 30 } }, { id: 'law', label: 'Law course', cost: 60_000, xp: { skill: 'law', amt: 30 } }],
  Cinema: [{ id: 'ticket', label: 'Movie ticket + popcorn', cost: 5000, fx: { fun: 40, hunger: 8 } }], Nightclub: [{ id: 'drink', label: 'Drinks', cost: 3000, fx: { fun: 30, bladder: -10, social: 8 } }],
  Market: [{ id: 'snack', label: 'Suya', cost: 1500, fx: { hunger: 30 } }], 'Petrol Station': [{ id: 'snack', label: 'Snack & drink', cost: 1200, fx: { hunger: 18 } }],
  Mechanic: [{ id: 'tune', label: 'Driving lessons', cost: 40_000, xp: { skill: 'driving', amt: 25 } }], 'Car Dealer': [{ id: 'car', label: 'Buy your first car', cost: CAR_PRICE, grant: 'car' }], 'Police Station': [{ id: 'range', label: 'Combat training', cost: 30_000, xp: { skill: 'combat', amt: 20 } }],
  Airport: [{ id: 'cafe', label: 'Airport café', cost: 4500, fx: { hunger: 40 } }], 'Rail Station': [{ id: 'cafe', label: 'Station snack', cost: 1500, fx: { hunger: 25 } }],
};
export const SKILL_FOR: Record<string, SkillId> = { Bank: 'business', Office: 'business', 'Tech Company': 'tech', Hospital: 'medicine', Pharmacy: 'medicine', Gym: 'fitness', Logistics: 'driving', Mechanic: 'driving', 'Car Dealer': 'charisma', 'Police Station': 'law', Jail: 'law', Government: 'law', Nightclub: 'charisma', Salon: 'charisma', Barber: 'charisma', Hotel: 'charisma', 'Estate Agency': 'business' };
export const shiftPay = (pay: number) => Math.round(pay / 10); // one 25-second shift = a tenth of the monthly salary

const ARCH: Record<string, string> = { Bank: 'hall', Government: 'hall', Office: 'hall', 'Tech Company': 'hall', 'Estate Agency': 'hall', Logistics: 'hall', Restaurant: 'dining', Hotel: 'dining', Nightclub: 'club', Supermarket: 'store', Pharmacy: 'store', Market: 'store', 'Petrol Station': 'store', 'Car Dealer': 'store', Mechanic: 'store', Hospital: 'service', Salon: 'service', Barber: 'service', Gym: 'service', School: 'service', Cinema: 'service', 'Police Station': 'station', Jail: 'station', Airport: 'terminal', 'Rail Station': 'terminal' };
const PAL: Record<string, [string, string]> = { Bank: ['#cfc9bd', '#2f4a63'], Government: ['#d8d2c4', '#3f5a40'], Hospital: ['#eef3f5', '#4aa3b5'], Restaurant: ['#caa77a', '#7a3b2e'], Hotel: ['#d9c7a3', '#5a3a2e'], Nightclub: ['#1a1330', '#2a1650'], Gym: ['#3a3f45', '#222831'], Cinema: ['#2b1d22', '#4a1d2a'], 'Police Station': ['#b9bfc8', '#1e3a8a'], Jail: ['#8a8d92', '#4b4f55'], Airport: ['#e3e5e8', '#3d5a80'], 'Rail Station': ['#d4cdbf', '#6b4a8a'], Supermarket: ['#e8e4da', '#2f7d4f'], School: ['#e8dcc0', '#3d5a80'] };
const F = (x: number, z: number, w: number, d: number, h: number, c: string, o: Partial<Item> = {}): Item => ({ x, z, w, d, h, c, solid: true, ...o });

export function buildInterior(b: Business): Interior {
  const type = b.type, arch = ARCH[type] || 'hall', [floor, wall] = PAL[type] || ['#cfcac0', '#5b6875'];
  const W = arch === 'club' || arch === 'station' ? 20 : arch === 'terminal' ? 22 : 18, D = arch === 'club' || arch === 'station' || arch === 'terminal' ? 16 : 14, items: Item[] = [];
  const hx = W / 2, hz = D / 2, slot: Record<'work' | 'shop' | 'quest' | 'crime', [number, number]> = { work: [0, -hz + 3.4], shop: [-hx + 3, 0], quest: [-hx + 3, 2], crime: [hx - 3, -hz + 3.2] };
  if (arch === 'hall') {
    items.push(F(0, -hz + 2.2, W * .55, 1, 1.1, '#7a5a3a'), F(hx - 2, -hz + 1.1, 3, .7, 2.6, type === 'Bank' ? '#555b62' : '#8b6b4a'));
    [-5, 0, 5].forEach(x => items.push(F(x, 2, 2.4, 1.1, .8, '#8b6b4a'), F(x, 3.2, .6, .6, .5, '#333')));
    items.push(F(-hx + 1.2, hz - 4, .8, 4, .5, '#555'));
    slot.quest = [-hx + 3, 0];
  } else if (arch === 'dining') {
    items.push(F(0, -hz + 1.8, W * .6, 1, 1.1, '#6b3f2a'));
    [-5, 0, 5].forEach(x => [0, 3.5].forEach(z => { items.push(F(x, z, 1.6, 1.6, .8, '#d6b98c', { round: true })); [[-1.2, 0], [1.2, 0], [0, 1.2], [0, -1.2]].forEach(([a, c]) => items.push(F(x + a, z + c, .5, .5, .5, '#6b3f2a', { solid: false }))); }));
    slot.shop = [0, -hz + 3.2]; slot.work = [-hx + 3.4, -hz + 3.2]; slot.quest = [hx - 3, 0];
  } else if (arch === 'club') {
    items.push(F(0, 0, 8, 8, .05, '#7c3aed', { solid: false, glow: true }), F(0, -hz + 2, 8, 3, .6, '#222'), F(-hx + 1.5, -2, 1, 8, 1.1, '#3a2a55'), F(-6, -hz + 1.2, .8, .8, 2.4, '#111'), F(6, -hz + 1.2, .8, .8, 2.4, '#111'));
    slot.shop = [-hx + 3.4, -2]; slot.work = [0, -hz + 4.4]; slot.quest = [hx - 3, 2];
  } else if (arch === 'store') {
    [-4.5, 4.5].forEach(x => [-2, 2].forEach(z => items.push(F(x, z, 6, .8, 1.8, type === 'Mechanic' ? '#6b5a48' : '#b99a6a'))));
    items.push(F(hx - 3, hz - 3.5, 3, 1, 1.1, '#444'));
    if (type === 'Car Dealer') items.push(F(-4, -hz + 2.5, 3.2, 1.6, .9, '#b43c35', { round: false }), F(3, -hz + 2.5, 3.2, 1.6, .9, '#3d5a80'));
    slot.shop = [0, 0]; slot.work = [hx - 3, hz - 5.2]; slot.crime = [hx - 6, hz - 3.5]; slot.quest = [-hx + 2.5, -hz + 2.5];
  } else if (arch === 'service') {
    items.push(F(0, -hz + 2, 5, 1, 1.1, '#6b5a48'));
    if (type === 'Hospital') [-3, 0, 3].forEach(z => items.push(F(-hx + 1.5, z, 1, 2.2, .6, '#cfe8ff'), F(-hx + 2.6, z, .1, 2, 1.8, '#9ec5d6', { solid: false })));
    else if (type === 'Gym') [-5, -2, 1, 4].forEach(x => items.push(F(x, 1, 1, 2, 1.2, '#333'), F(x, 4.5, 1.6, .6, .5, '#8b0000')));
    else if (type === 'Cinema') { items.push(F(0, -hz + .4, 12, .2, 5, '#f4f4f4', { glow: true })); [1, 3, 5].forEach(z => [-4, -2, 0, 2, 4].forEach(x => items.push(F(x, z, 1.3, .8, .9, '#7a1f2e')))); }
    else if (type === 'School') [-4, 0, 4].forEach(x => [0, 3].forEach(z => items.push(F(x, z, 2.2, 1, .8, '#a9854f'))));
    else [-4, 0, 4].forEach(x => items.push(F(x, 1, 1, 1, .9, '#222'), F(x, -.2, 1.6, .1, 1.8, '#bcd', { solid: false })));
    slot.shop = [hx - 3, -2]; slot.quest = [-hx + 3, 4]; slot.crime = [hx - 3, -hz + 3];
  } else if (arch === 'station') {
    items.push(F(0, 2, 6, 1, 1.1, '#333'), F(-hx + 1, 4, .8, .8, 2, '#444'));
    [-6, 0, 6].forEach(x => { items.push(F(x, -hz + .3, 4.2, .2, 2.4, '#555'), F(x - 2.1, -hz + 2, .2, 3.4, 2.4, '#555'), F(x + 2.1, -hz + 2, .2, 3.4, 2.4, '#555')); for (let i = -3; i <= 3; i++) items.push(F(x + i * .55, -hz + 3.7, .08, .08, 2.4, '#222')); items.push(F(x - 1, -hz + 1.2, 1.6, .8, .5, '#6b5a48')); });
    slot.work = [0, 3.8]; slot.quest = [-hx + 3, 4]; slot.shop = [hx - 3, 3]; slot.crime = [hx - 3, -2];
  } else {
    [-6, -2, 2, 6].forEach(x => [2, 4.5].forEach(z => items.push(F(x, z, 3, .8, .5, '#3d5a80'))));
    items.push(F(0, -hz + 2, 10, 1, 1.1, '#555'), F(hx - 2, -hz + 1, 3, .5, 3, '#222', { glow: true }));
    slot.shop = [-hx + 3, 0]; slot.quest = [hx - 3, 2];
  }
  const spots: Spot[] = [], at = (k: keyof typeof slot) => slot[k];
  const jobs = b.jobs.map((j, idx) => ({ t: 'shift' as const, idx, label: j.title, pay: shiftPay(j.pay) }));
  if (jobs.length) spots.push({ id: 'work', x: at('work')[0], z: at('work')[1], e: '💼', label: 'Work a shift', opts: jobs });
  const shop = SHOP[type] || []; if (shop.length) spots.push({ id: 'shop', x: at('shop')[0], z: at('shop')[1], e: '🛒', label: type === 'Restaurant' || type === 'Nightclub' ? 'Order' : 'Buy', opts: shop.map(i => ({ t: 'shop' as const, id: i.id, label: i.label, cost: i.cost })) });
  const qs = QUESTS.filter(q => q.at?.includes(type)); if (qs.length) spots.push({ id: 'quest', x: at('quest')[0], z: at('quest')[1], e: '📜', label: 'Quests', opts: qs.map(q => ({ t: 'quest' as const, id: q.id })) });
  const cr = (Object.keys(CRIMES) as CrimeId[]).filter(k => CRIMES[k].at?.includes(type)); if (cr.length) spots.push({ id: 'crime', x: at('crime')[0], z: at('crime')[1], e: '🕶️', label: type === 'Bank' ? 'Vault' : 'Till', opts: cr.map(k => ({ t: 'crime' as const, id: k })) });
  if (type === 'Police Station') spots.push({ id: 'board', x: hx - 3, z: 6, e: '📋', label: 'Wanted board', opts: [{ t: 'info', text: 'Officers: arrest wanted players who are inside with you (within range). Others: keep your heat low.' }] });
  return { w: W, d: D, floor, wall, items, spots };
}
export type { ProfessionId };
