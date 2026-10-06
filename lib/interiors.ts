import type { Business } from './cityTypes';
import { CAR_PRICE, CRIMES, QUESTS, type CrimeId, type ProfessionId, type SkillId } from './profile';
import { hasSeat, isSenior, seatTitle, shiftJobs } from './work';
import { OUTFITS, PANTS, HAIR_COLORS, SKIN_TONES, HAIRS, applyOutfitModel, sanitizeLook, type Look } from './characterModels';

/* Every building type gets a real room. Shared by the room scene (client) and the server (shop prices). */
export type Item = { x: number; z: number; w: number; d: number; h: number; c: string; y?: number; solid?: boolean; round?: boolean; glow?: boolean; sphere?: boolean; lay?: boolean };
/* A staff post: where an NPC employee works. Players who start a shift are placed at the matching post (stand overrides the spot). */
export type Office = { x: number; z: number; sx: number; sz: number; title: string };
export type Post = { idx: number; title: string; x: number; z: number; r: number; anim?: string; y?: number; stand?: [number, number]; patrol?: [number, number][] };
export type Opt = { t: 'mgmt' } | { t: 'shift'; idx: number; label: string; pay: number; senior: boolean } | { t: 'shop'; id: string; label: string; cost: number } | { t: 'quest'; id: string } | { t: 'crime'; id: CrimeId } | { t: 'info'; text: string };
export type Spot = { id: string; x: number; z: number; e: string; label: string; opts: Opt[] };
export type Interior = { w: number; d: number; floor: string; wall: string; items: Item[]; decor: Item[]; posts: Post[]; spots: Spot[]; office: Office | null };

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
export const shiftPay = (pay: number) => Math.round(pay / 10); // a ~50-minute shift = a tenth of the monthly salary
export const shiftPayFor = (pay: number, mins: number) => Math.round(shiftPay(pay) * mins / 50); // longer tasks pay a little more

const ARCH: Record<string, string> = { Bank: 'hall', Government: 'hall', Office: 'hall', 'Tech Company': 'hall', 'Estate Agency': 'hall', Logistics: 'hall', Restaurant: 'dining', Hotel: 'dining', Nightclub: 'club', Supermarket: 'store', Pharmacy: 'store', Market: 'store', 'Petrol Station': 'store', 'Car Dealer': 'store', Mechanic: 'store', Hospital: 'service', Salon: 'service', Barber: 'service', Gym: 'service', School: 'service', Cinema: 'service', 'Police Station': 'station', Jail: 'station', Airport: 'terminal', 'Rail Station': 'terminal' };
const PAL: Record<string, [string, string]> = { Bank: ['#cfc9bd', '#2f4a63'], Government: ['#d8d2c4', '#3f5a40'], Hospital: ['#eef3f5', '#4aa3b5'], Restaurant: ['#caa77a', '#7a3b2e'], Hotel: ['#d9c7a3', '#5a3a2e'], Nightclub: ['#1a1330', '#2a1650'], Gym: ['#3a3f45', '#222831'], Cinema: ['#2b1d22', '#4a1d2a'], 'Police Station': ['#b9bfc8', '#1e3a8a'], Jail: ['#8a8d92', '#4b4f55'], Airport: ['#e3e5e8', '#3d5a80'], 'Rail Station': ['#d4cdbf', '#6b4a8a'], Supermarket: ['#e8e4da', '#2f7d4f'], School: ['#e8dcc0', '#3d5a80'] };
const F = (x: number, z: number, w: number, d: number, h: number, c: string, o: Partial<Item> = {}): Item => ({ x, z, w, d, h, c, solid: true, ...o });

export function buildInterior(b: Business): Interior {
  const type = b.type, arch = ARCH[type] || 'hall', [floor, wall] = PAL[type] || ['#cfcac0', '#5b6875'];
  const W = arch === 'club' || arch === 'station' ? 20 : arch === 'terminal' ? 22 : 18, D = arch === 'club' || arch === 'station' || arch === 'terminal' ? 16 : 14, items: Item[] = [];
  const hx = W / 2, hz = D / 2, slot: Record<'work' | 'shop' | 'quest' | 'crime', [number, number]> = { work: [0, -hz + 3.4], shop: [-hx + 3, 0], quest: [-hx + 3, 2], crime: [hx - 3, -hz + 3.2] };
  const decor: Item[] = [], dc = (x: number, z: number, w: number, d: number, h: number, c: string, o: Partial<Item> = {}) => { decor.push({ x, z, w, d, h, c, ...o }); }, pick = (a: string[], k: number) => a[Math.abs(k) % a.length];
  const car = (x: number, z: number, c: string) => { items.push(F(x, z, 3.2, 1.5, .6, c, { y: .3 })); dc(x - .1, z, 1.7, 1.3, .5, '#a9cde0', { y: .9 }); [[-1, -.7], [1, -.7], [-1, .7], [1, .7]].forEach(([a, e]) => dc(x + a, z + e, .6, .6, .22, '#111', { round: true, lay: true })); dc(x + 1.55, z - .5, .1, .25, .15, '#ffe9a8', { y: .55 }); dc(x + 1.55, z + .5, .1, .25, .15, '#ffe9a8', { y: .55 }); };
  const stock = (pal: string[]) => items.filter(i => i.h === 1.8 && i.w === 6).forEach((sh, si) => { for (const side of [-1, 1]) for (let t = 0; t < 3; t++) for (let k = 0; k < 10; k++) dc(sh.x - 2.7 + k * .6, sh.z + side * .48, .46, .16, .34, pick(pal, k * 3 + t * 5 + si + (side > 0 ? 2 : 0)), { y: .2 + t * .55 }); for (let k = 0; k < 7; k++) dc(sh.x - 2.5 + k * .8, sh.z, .5, .5, .3 + (k % 3) * .1, pick(pal, k + si * 2), { y: 1.8 }); });
  const plant = (x: number, z: number) => { items.push(F(x, z, .55, .55, .45, '#8a5a3a', { round: true })); dc(x, z, .95, .95, .95, '#2f7d4f', { y: .45, sphere: true }); dc(x + .15, z - .1, .6, .6, .6, '#3f9a62', { y: .9, sphere: true }); };
  const monitor = (x: number, z: number, y: number) => { dc(x, z, .12, .12, .12, '#333', { y }); dc(x, z, .55, .05, .38, '#16324f', { y: y + .12 }); };
  const board = (x: number, z: number, w: number, c = '#1e2b25') => { dc(x, z, w, .06, 1.3, c, { y: 1.1 }); for (let k = 0; k < 4; k++) dc(x, z + .04, w * .8, .02, .07, '#f5f5f5', { y: 1.25 + k * .25 }); };
  const frames = (x0: number, z: number, n: number) => { for (let k = 0; k < n; k++) dc(x0 + k * 1.5, z, 1, .05, .7, pick(['#d18a22', '#3d5a80', '#b43c35', '#2f7d4f', '#6b4a8a'], k * 2 + n), { y: 1.7 }); };
  const PROD: Record<string, string[]> = { Supermarket: ['#e63946', '#f4a261', '#2a9d8f', '#e9c46a', '#457b9d', '#8ac926'], Market: ['#e76f51', '#f4a261', '#8ac926', '#ffca3a', '#6a4c93'], Pharmacy: ['#ffffff', '#4aa3b5', '#e63946', '#a8dadc'], 'Petrol Station': ['#e63946', '#ffd166', '#2a9d8f', '#264653'], Mechanic: ['#222222', '#e63946', '#555555', '#ffd166'], 'Car Dealer': ['#d9d9d9', '#3d5a80', '#b43c35'] };
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
    stock(PROD[type] || PROD.Supermarket);
    items.push(F(hx - 3, hz - 2.4, 3, 1, 1.1, '#444'));
    if (type === 'Car Dealer') { car(-4, -hz + 2.5, '#b43c35'); car(3, -hz + 2.5, '#3d5a80'); }
    if (type === 'Mechanic') { car(-4, -hz + 2.5, '#3d5a80'); items.push(F(hx - 2, -hz + 1, 1.4, .7, 1, '#b43c35')); [0, .25, .5].forEach(y => dc(hx - 4.2, -hz + 1.2, .8, .8, .25, '#1a1a1a', { y, round: true })); }
    slot.shop = [0, 0]; slot.work = [hx - 3, hz - 1.1]; slot.crime = [hx - 6, hz - 3.5]; slot.quest = [-hx + 2.5, -hz + 2.5];
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
  // ---- things on display, per building type ----
  const dining = arch === 'dining', counterTop = 1.1;
  if (arch === 'hall') {
    [0].forEach(() => { const n = Math.max(1, b.jobs.length); for (let i = 0; i < n; i++) monitor(n === 1 ? 0 : -3.4 + i * 6.8 / (n - 1), -hz + 2.2, counterTop); });
    [-5, 0, 5].forEach(x => { monitor(x, 2, .8); dc(x + .6, 2.2, .4, .3, .03, '#fff', { y: .8 }); });
    frames(-5, -hz + .2, 5); plant(-hx + .9, hz - 1); plant(hx - .9, hz - 1);
    if (type === 'Bank') { dc(hx - 2, -hz + 1.5, .9, .9, .12, '#b0b7c0', { y: 1.3, round: true, lay: true }); dc(hx - 2, -hz + 1.5, .2, .2, .2, '#555', { y: 1.2, round: true, lay: true }); [-1.6, 1.6].forEach(x => { dc(x, hz - 3, .08, .08, .9, '#c9a227', { round: true }); }); }
    if (type === 'Government') [-hx + 1.5, -hx + 2.9].forEach((x, k) => { dc(x, -hz + 1, .06, .06, 3, '#cfcfcf', { round: true }); [['#1d7a46', -.2], ['#ffffff', 0], ['#1d7a46', .2]].forEach(([c, dx]) => dc(x + .35 + (dx as number), -hz + 1, .2, .02, .5, c as string, { y: 2.3 - k * 0 })); });
    if (type === 'Logistics') { items.push(F(-hx + 1.2, -hz + 1.2, 1.2, 1.2, 1, '#b08a55'), F(-hx + 1.2, -hz + 2.6, 1.2, 1.2, .8, '#c49a60'), F(-hx + 2.6, -hz + 1.2, 1.2, 1.2, .6, '#a67c45')); dc(-hx + 1.2, -hz + 1.2, 1.25, .1, .06, '#e9d8a6', { y: 1 }); }
    if (type === 'Estate Agency') { dc(2, -hz + 2.2, .6, .5, .35, '#e9d8a6', { y: counterTop }); dc(2, -hz + 2.2, .7, .6, .15, '#b43c35', { y: counterTop + .35 }); frames(-3, -hz + .2, 4); }
    if (type === 'Tech Company') { dc(0, -hz + .2, 6, .05, .5, '#3fb98a', { y: 2.2 }); [-5, 0, 5].forEach(x => monitor(x + .6, 2, .8)); }
    if (type === 'Office' || type === 'Tech Company') { items.push(F(-hx + .8, -hz + 1, .6, .6, 1.3, '#9ec5d6')); dc(-hx + .8, -hz + 1, .5, .5, .4, '#8ecae6', { y: 1.3, round: true }); }
  } else if (dining) {
    [-5, 0, 5].forEach(x => [0, 3.5].forEach(z => { [-.35, .35].forEach((o, k) => { dc(x + o, z, .4, .4, .03, '#fff', { y: .8, round: true }); dc(x + o, z, .22, .22, .22, pick(['#d9822b', '#7a3b2e', '#e9c46a', '#8ac926'], x + z + k), { y: .83, sphere: true }); }); dc(x, z, .14, .14, .28, '#cfe3ee', { y: .8, round: true }); }));
    [-4, -2, 0, 2, 4].forEach((x, k) => dc(x, -hz + 1.8, .5, .5, .4, k % 2 ? '#f6e7c1' : '#f4a6b7', { y: counterTop, sphere: true })); dc(4.7, -hz + 1.8, .45, .35, .25, '#444', { y: counterTop });
    board(-hx + 4, -hz + .2, 3.2); frames(1, -hz + .2, 3); plant(-hx + .9, hz - 1); plant(hx - .9, hz - 1);
    if (type === 'Hotel') { for (let r = 0; r < 3; r++) for (let k = 0; k < 8; k++) dc(-2.1 + k * .6, -hz + .3, .22, .06, .22, '#d9b44a', { y: 1.05 + r * .35 }); dc(0, -hz + .22, 4.6, .06, 1.2, '#5a3a2e', { y: .95 }); }
    if (type === 'Restaurant') { items.push(F(hx - 3, -hz + .6, 2.6, .8, 1, '#8b8f94')); [-.7, .7].forEach(o => dc(hx - 3 + o, -hz + .6, .6, .6, .3, '#2b2b2b', { y: 1, round: true })); dc(hx - 3.7, -hz + .6, .5, .5, .35, '#cfd4d8', { y: 1.0, round: true }); }
  } else if (arch === 'club') {
    dc(0, 0, .9, .9, .9, '#d0d7de', { y: 2.2, sphere: true }); dc(-1, -hz + 2.7, .7, .7, .04, '#111', { y: .6, round: true }); dc(1, -hz + 2.7, .7, .7, .04, '#111', { y: .6, round: true }); dc(0, -hz + 2.7, 1, .4, .3, '#2563eb', { y: .6 });
    for (let k = 0; k < 10; k++) dc(-hx + 1.5, -5.5 + k * .8, .16, .16, .3, pick(['#e63946', '#2a9d8f', '#ffd166', '#a855f7', '#4cc9f0'], k * 2), { y: 1.1, round: true });
    dc(0, -hz + .2, 10, .05, .12, '#ff4fd8', { y: 2.3 }); dc(0, -hz + .2, 10, .05, .12, '#4fd8ff', { y: 1.9 });
    [[-7, 4], [-7, 6.2], [7, 4.2], [7, 6.2]].forEach(([x, z]) => { items.push(F(x, z, .9, .9, .9, '#2a1a40', { round: true })); dc(x, z, .16, .16, .3, '#ff8fab', { y: .9, round: true }); });
  } else if (arch === 'store') {
    frames(-4, -hz + .2, 4);
    if (type === 'Market') [-3.6, 0, 3.6].forEach((z, zi) => { items.push(F(-hx + 1.3, z, 1.4, 1.4, .5, '#9b7b4a')); for (let k = 0; k < 9; k++) dc(-hx + .9 + (k % 3) * .4, z - .4 + ((k / 3) | 0) * .4, .32, .32, .32, pick(['#e76f51', '#f4a261', '#8ac926', '#ffca3a', '#c1121f'], k + zi), { y: .5, sphere: true }); });
    if (type === 'Petrol Station') { items.push(F(hx - .9, -1, .8, 5, 2.1, '#cfe3ee')); for (let r = 0; r < 3; r++) for (let k = 0; k < 10; k++) dc(hx - 1.35, -3.1 + k * .45, .15, .3, .3, pick(['#e63946', '#2a9d8f', '#ffd166', '#4cc9f0'], k + r), { y: .25 + r * .6 }); }
    if (type === 'Pharmacy') { dc(0, -hz + .2, 1.4, .05, .35, '#2f9e6a', { y: 2.1 }); dc(0, -hz + .2, .35, .05, 1.2, '#2f9e6a', { y: 1.5 }); }
    dc(hx - 3, hz - 2.4, .5, .4, .35, '#222', { y: counterTop }); dc(hx - 3 + .9, hz - 2.4, .35, .3, .1, '#4ade80', { y: counterTop });
  } else if (arch === 'service') {
    if (type !== 'Cinema') frames(-hx + 3, -hz + .2, 5); plant(-hx + .9, hz - 1); plant(hx - .9, hz - 1);
    monitor(0, -hz + 2, counterTop);
    if (type === 'Hospital') { [-3, 0, 3].forEach(z => { dc(-hx + 1.5, z - .85, .6, .4, .12, '#fff', { y: .6 }); dc(-hx + 1.5, z + .3, .95, 1.2, .06, '#4aa3b5', { y: .6 }); dc(-hx + 2.2, z - .6, .05, .05, 1.6, '#aaaaaa', { round: true }); dc(-hx + 2.2, z - .6, .18, .06, .28, '#8ecae6', { y: 1.4 }); }); dc(0, -hz + .2, 1.2, .05, .35, '#e63946', { y: 2.1 }); dc(0, -hz + .2, .35, .05, 1.2, '#e63946', { y: 1.7 }); }
    else if (type === 'Gym') { [-5, -2, 1, 4].forEach(x => { dc(x, .3, .7, 1.7, .03, '#555', { y: 1.2 }); dc(x, 0, .7, .1, .4, '#1f4e79', { y: 1.2 }); dc(x, 4.4, 1.8, .06, .06, '#bbbbbb', { y: .95 }); [-.8, .8].forEach(o => dc(x + o, 4.4, .1, .5, .5, '#222', { y: .7 })); }); dc(0, -hz + .2, 10, .05, 1.8, '#9ec5d6', { y: .6 }); }
    else if (type === 'School') { board(0, -hz + .2, 8, '#244c3a'); dc(2, -hz + 2, .45, .45, .45, '#2a7fb8', { y: counterTop, sphere: true }); [-4, 0, 4].forEach(x => [0, 3].forEach((z, k) => dc(x, z, .5, .35, .04, pick(['#b43c35', '#3d5a80', '#f2c14e'], x + k), { y: .8 }))); }
    else if (type === 'Cinema') { items.push(F(hx - 1.2, -2, 1.2, 1.2, 1.7, '#c1272d')); dc(hx - 1.2, -2, 1, 1, .7, '#f6f1c7', { y: 1.7 }); for (let k = 0; k < 6; k++) dc(hx - 1.5 + (k % 3) * .3, -2.2 + ((k / 3) | 0) * .4, .3, .3, .3, '#fff3b0', { y: 2.3, sphere: true }); [-4, -1.5, 1].forEach((z, k) => dc(-hx + .25, z, .05, 1.2, 1.6, pick(['#b43c35', '#3d5a80', '#6b4a8a'], k), { y: 1 })); [1, 3, 5].forEach(z => [-4, -2, 0, 2, 4].forEach(x => dc(x, z + .45, 1.3, .15, .6, '#5a1420', { y: .9 }))); }
    else { for (let k = 0; k < 6; k++) dc(-1.5 + k * .55, -hz + 2, .14, .14, .3, pick(['#e07aa1', '#4cc9f0', '#ffd166', '#8ac926'], k), { y: counterTop, round: true }); dc(0, -hz + .35, 4, .3, .06, '#d7c3a5', { y: 1.9 }); for (let k = 0; k < 7; k++) dc(-1.8 + k * .6, -hz + .35, .16, .16, .3, pick(['#e07aa1', '#4cc9f0', '#ffd166', '#8ac926'], k + 1), { y: 1.96, round: true }); }
  } else if (arch === 'station') {
    monitor(0, 2, counterTop); dc(hx - .35, 6, .06, 3, 1.5, '#5a4a3a', { y: .8 }); for (let k = 0; k < 5; k++) dc(hx - .42, 5 + (k % 3) * .8 - .2, .03, .5, .35, '#ffffff', { y: 1.0 + (k % 2) * .55 });
    if (type === 'Jail') [-6, 0, 6].forEach(x => { dc(x - 1.7, -hz + 1.2, .4, .5, .1, '#ffffff', { y: .5 }); dc(x - .9, -hz + 1.2, .9, .7, .06, '#6b7280', { y: .5 }); dc(x + 1.3, -hz + .7, .4, .5, .4, '#e5e7eb'); });
    else { [-hx + 1.2].forEach(x => { dc(x, -2, .06, .06, 3, '#cfcfcf', { round: true }); [['#1d7a46', -.2], ['#ffffff', 0], ['#1d7a46', .2]].forEach(([c, dx]) => dc(x + .35 + (dx as number), -2, .2, .02, .5, c as string, { y: 2.3 })); }); [-6, 0, 6].forEach(x => dc(x - 1, -hz + 1.2, .4, .5, .1, '#ffffff', { y: .5 })); }
  } else { // terminal: Airport / Rail Station
    monitor(0, -hz + 2, counterTop); monitor(-3, -hz + 2, counterTop); monitor(3, -hz + 2, counterTop);
    for (let k = 0; k < 5; k++) dc(hx - 2, -hz + 1.3, 2.4, .02, .12, pick(['#ffd166', '#7bd88f', '#ffd166', '#ff8a8a', '#7bd88f'], k), { y: 1.5 + k * .22 });
    [-6, -2, 2, 6].forEach((x, k) => { dc(x + 1.2, 5.5, .5, .3, .7, pick(['#b43c35', '#3d5a80', '#222222', '#d18a22'], k), { y: 0 }); dc(x + 1.7, 5.5, .4, .25, .5, pick(['#d18a22', '#2f7d4f', '#6b4a8a'], k), { y: 0 }); });
    dc(hx - .6, 0, .15, D - 4, .02, '#ffd166'); plant(-hx + .9, hz - 1); plant(hx - .9, hz - 1);
    if (type === 'Airport') { dc(-hx + 3, -hz + .2, 5, .05, .9, '#2a6fb0', { y: 1.8 }); dc(-hx + 3, -hz + .22, 3, .02, .12, '#fff', { y: 2.2 }); } else frames(-hx + 2, -hz + .2, 4);
  }

  // ---- staff posts: every job in the building has somebody working it ----
  const PATROL: Record<string, [number, number][]> = {
    hall: [[-7, -1], [7, -1], [7, 5], [-4, 5]], dining: [[-2.5, 1.8], [2.5, 1.8], [2.5, 5.4], [-2.5, 5.4]], club: [[-5.5, 6], [5.5, 6], [5.5, -3], [-5.5, -3]],
    store: [[-4, 0], [0, 0], [0, -3.6], [0, 0], [4, 0], [0, 0], [0, 3.6]], service: [[-4.5, 5.5], [6, 5.5], [6, 3], [-4.5, 3]], Gym: [[-6, 3.2], [6, 3.2], [6, 6], [-6, 6]],
    Cinema: [[-6.5, -4], [-6.5, 5.5], [6.5, 5.5], [6.5, -4]], station: [[-7, 5], [7, 5], [7, .4], [-7, .4]], terminal: [[-9, .5], [9, .5], [9, -3], [-9, -3]],
  };
  const COUNTER: Record<string, { cx: number; half: number; z: number }> = { hall: { cx: 0, half: 3.4, z: -hz + 1 }, dining: { cx: 0, half: 3, z: -hz + .85 }, service: { cx: 0, half: 1.6, z: -hz + 1 }, terminal: { cx: 0, half: 4, z: -hz + 1 }, station: { cx: 0, half: 2.4, z: .9 }, store: { cx: hx - 3, half: 1, z: hz - 3.6 } };
  const WALK = /^(Dispatch Rider|Driver|Ground Crew|Housekeeper|Security|Store Attendant|Pump Attendant|Sales Attendant|Station Attendant|Police Officer|Prison Officer|Fitness Coach|Cinema Attendant|Waiter|Trader|Doctor)$/;
  const walkPath = (i: number) => { const w = PATROL[type] || PATROL[arch] || PATROL.hall, k = i % w.length; return [...w.slice(k), ...w.slice(0, k)] as [number, number][]; };
  const posts: Post[] = [], counterIdx: number[] = [], jobsList = shiftJobs(b);
  jobsList.forEach((j, i) => {
    const t = j.title, base = { idx: i, title: t };
    if (/^Chef$/.test(t) && dining) posts.push({ ...base, x: hx - 3, z: -hz + 1.7, r: Math.PI, anim: 'cook', stand: [hx - 3, -hz + 3.2] });
    else if (t === 'DJ') posts.push({ ...base, x: 0, z: -hz + 1.9, y: .6, r: 0, anim: 'work', stand: [0, -hz + 4.6] });
    else if (t === 'Bartender') posts.push({ ...base, x: -hx + .6, z: -2, r: Math.PI / 2, anim: 'cook', stand: [-hx + 3.4, -2] });
    else if (t === 'Auto Technician') posts.push({ ...base, x: -4, z: -hz + 3.9, r: Math.PI, anim: 'work' });
    else if (/^(Stylist|Barber)$/.test(t)) posts.push({ ...base, x: -4, z: 2.3, r: Math.PI, anim: 'work' });
    else if (t === 'Nurse') posts.push({ ...base, x: -hx + 3.4, z: -1.5, r: -Math.PI / 2 });
    else if (type === 'School' && t === 'Administrator') posts.push({ ...base, x: hx - 2.8, z: -hz + 1, r: 0, anim: 'work' });
    else if (t === 'Teacher') posts.push({ ...base, x: 0, z: -hz + 1, r: 0, anim: 'work' });
    else if (/Manager$/.test(t) && (dining || arch === 'store')) posts.push({ ...base, x: dining ? -3 : -hx + 2, z: hz - 1.9, r: 0 });
    else if (WALK.test(t)) { const w = walkPath(i); posts.push({ ...base, x: w[0][0], z: w[0][1], r: 0, patrol: w }); }
    else { posts.push({ ...base, x: 0, z: 0, r: 0, anim: 'work' }); counterIdx.push(posts.length - 1); }
  });
  const ctr = COUNTER[arch] || COUNTER.hall;
  counterIdx.forEach((pi, k) => { const m = counterIdx.length; posts[pi].x = m === 1 ? ctr.cx : ctr.cx - ctr.half + k * 2 * ctr.half / (m - 1); posts[pi].z = ctr.z; });

  const spots: Spot[] = [], at = (k: keyof typeof slot) => slot[k];
  const jobs = jobsList.map((j, idx) => ({ t: 'shift' as const, idx, label: j.title, pay: shiftPay(j.pay), senior: isSenior(j) }));
  if (jobs.length) spots.push({ id: 'work', x: at('work')[0], z: at('work')[1], e: '💼', label: 'Jobs', opts: jobs });
  const shop = SHOP[type] || []; if (shop.length) spots.push({ id: 'shop', x: at('shop')[0], z: at('shop')[1], e: '🛒', label: type === 'Restaurant' || type === 'Nightclub' ? 'Order' : 'Buy', opts: shop.map(i => ({ t: 'shop' as const, id: i.id, label: i.label, cost: i.cost })) });
  const qs = QUESTS.filter(q => q.at?.includes(type)); if (qs.length) spots.push({ id: 'quest', x: at('quest')[0], z: at('quest')[1], e: '📜', label: 'Quests', opts: qs.map(q => ({ t: 'quest' as const, id: q.id })) });
  const cr = (Object.keys(CRIMES) as CrimeId[]).filter(k => CRIMES[k].at?.includes(type)); if (cr.length) spots.push({ id: 'crime', x: at('crime')[0], z: at('crime')[1], e: '🕶️', label: type === 'Bank' ? 'Vault (rob)' : 'Till (rob)', opts: cr.map(k => ({ t: 'crime' as const, id: k })) });
  if (type === 'Police Station') spots.push({ id: 'board', x: hx - 3, z: 6, e: '📋', label: 'Wanted board', opts: [{ t: 'info', text: 'Officers: arrest wanted players who are inside with you (within range). Others: keep your heat low.' }] });
  // ---- the manager's office: a desk + a 'Management' ring, placed where nothing else is ----
  let office: Interior['office'] = null;
  if (hasSeat(b)) {
    const solids = items.filter(i => i.solid), hit = (x0: number, x1: number, z0: number, z1: number, m: number) => solids.some(o => o.x - o.w / 2 < x1 + m && o.x + o.w / 2 > x0 - m && o.z - o.d / 2 < z1 + m && o.z + o.d / 2 > z0 - m);
    const marks: [number, number][] = [...spots.map(sp => [sp.x, sp.z] as [number, number]), ...posts.filter(p => !p.patrol).map(p => [p.stand?.[0] ?? p.x, p.stand?.[1] ?? p.z] as [number, number])];
    const ok = (x: number, z: number) => { const sz = z - 1.05, rz = z + 1.8; if (Math.abs(x) > hx - 1.8 || sz < -hz + .5 || rz > hz - 2.2) return false;
      if (hit(x - 1.2, x + 1.2, z - .45, z + .45, .15) || hit(x - .4, x + .4, sz - .4, sz + .4, 0) || hit(x - .9, x + .9, rz - .9, rz + .9, .1)) return false;
      return marks.every(([mx, mz]) => Math.hypot(mx - x, mz - (rz)) >= 2.5 && Math.hypot(mx - x, mz - sz) >= 1.3 && Math.hypot(mx - x, mz - z) >= 1.2); };
    const cand: [number, number][] = []; for (let x = -hx + 1.8; x <= hx - 1.8 + 1e-6; x += .5) cand.push([x, -hz + 1.9]);
    for (let z = -hz + 2.4; z <= hz - 4.2; z += .6) for (let x = -hx + 1.8; x <= hx - 1.8 + 1e-6; x += .6) cand.push([x, z]);
    cand.sort((a, c) => (a[1] - c[1]) * 100 + (Math.abs(a[0] - hx / 2) - Math.abs(c[0] - hx / 2))); const hitC = cand.find(([x, z]) => ok(x, z));
    if (hitC) { const [x, z] = hitC; items.push(F(x, z, 2.4, .9, .8, '#6b4a2a')); monitor(x - .5, z, .8); dc(x + .5, z + .1, .4, .3, .03, '#ffffff', { y: .8 }); dc(x, z + .5, .7, .04, .12, '#c9a227', { y: .7 });
      office = { x, z, sx: x, sz: z - 1.05, title: seatTitle(b) }; spots.push({ id: 'mgmt', x, z: z + 1.8, e: '🏢', label: 'Management', opts: [{ t: 'mgmt' }] }); }
  }
  return { w: W, d: D, floor, wall, items, decor, posts, spots, office };
}
export type { ProfessionId };

/* Deterministic NPC look for a staff post, so the same person works the same desk for every visitor. */
const hashStr = (str: string) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const NAMES_M = ['Emeka', 'Tunde', 'Musa', 'Chidi', 'Ibrahim', 'Femi', 'Segun', 'Yusuf', 'Obinna', 'Kelechi'], NAMES_F = ['Ada', 'Amina', 'Ngozi', 'Funke', 'Zainab', 'Chioma', 'Bisi', 'Hauwa', 'Ife', 'Tolu'];
export function staffLook(b: Business, post: Post): Look {
  const r = hashStr(`${b.id}:${post.idx}`), f = r % 2 === 1, names = f ? NAMES_F : NAMES_M, name = names[(r >>> 3) % names.length];
  let l = sanitizeLook({ gender: f ? 'f' : 'm', hair: HAIRS[(r >>> 5) % HAIRS.length].id, hairColor: HAIR_COLORS[(r >>> 7) % HAIR_COLORS.length], skin: SKIN_TONES[(r >>> 9) % SKIN_TONES.length], outfit: OUTFITS[(r >>> 11) % OUTFITS.length], pants: PANTS[(r >>> 13) % PANTS.length], height: .95 + ((r >>> 15) % 9) / 100 }, name);
  const t = b.type, job = post.title;
  if (t === 'Police Station' || t === 'Jail') l = applyOutfitModel(l, 'uniform');
  else if (t === 'Hospital' || t === 'Pharmacy' || /Chef|Pharmacist/.test(job)) l = { ...l, outfit: '#f2f2f2', pants: '#cfc9bd' };
  else if (['Bank', 'Government', 'Office', 'Tech Company', 'Estate Agency'].includes(t) || /Manager/.test(job)) l = applyOutfitModel(l, 'suit');
  else if (job === 'Security') l = { ...l, outfit: '#111111', pants: '#111111' };
  return l;
}
