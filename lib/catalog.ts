// The item catalog. Shared by the store screen (client) and the shop route (server, which owns every price).
// Food & drinks are used on the spot (they fill your needs). Everything else goes into your inventory, ready to be
// placed in your home (furnishing + house upgrades come with the housing update: `fp` is the footprint in metres).
import type { BusinessType } from './cityTypes';

export type CatId = 'food' | 'household' | 'kitchen' | 'furniture' | 'decor' | 'tech' | 'style' | 'kids';
export const CATS: { id: CatId; label: string; e: string }[] = [
  { id: 'food', label: 'Food & Drinks', e: '🍲' }, { id: 'household', label: 'Household', e: '🧺' }, { id: 'kitchen', label: 'Kitchen', e: '🍳' },
  { id: 'furniture', label: 'Furniture', e: '🛋️' }, { id: 'decor', label: 'Decor & Lights', e: '🪴' }, { id: 'tech', label: 'Tech', e: '📱' },
  { id: 'style', label: 'Accessories', e: '⌚' }, { id: 'kids', label: 'Kids & Baby', e: '🧸' },
];
export type Needs = Partial<Record<'hunger' | 'energy' | 'hygiene' | 'bladder' | 'fun' | 'social', number>>;
export type Item = { id: string; cat: CatId; name: string; e: string; cost: number; fx?: Needs; fp?: [number, number]; use?: boolean; tag?: string };

const out: Item[] = [];
const slug = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const add = (cat: CatId, rows: [string, string, number, (Needs | [number, number] | null)?, string?][]) => rows.forEach(([name, e, cost, x, tag]) => {
  const it: Item = { id: cat.slice(0, 3) + '_' + slug(name), cat, name, e, cost };
  if (tag) it.tag = tag;
  if (cat === 'food') { it.use = true; it.fx = (x as Needs) || { hunger: 10 }; } else if (Array.isArray(x)) it.fp = x;
  out.push(it);
});

/* ───────── Food & drinks (eaten / drunk right away) ───────── */
add('food', [
  ['Bottle of water', '💧', 300, { bladder: -3, hunger: 2 }], ['Pure water (sachet)', '🧊', 100, { bladder: -1, hunger: 1 }], ['Zobo drink', '🍹', 500, { hunger: 4, fun: 3 }], ['Chilled malt', '🥤', 700, { hunger: 8, fun: 3 }],
  ['Fanta / Coke', '🥫', 600, { hunger: 5, fun: 5 }], ['Fresh juice', '🧃', 1200, { hunger: 8, fun: 4, hygiene: 1 }], ['Smoothie', '🥭', 2000, { hunger: 14, fun: 5 }], ['Energy drink', '⚡', 1200, { energy: 14, bladder: -2 }],
  ['Coffee', '☕', 1500, { energy: 12, fun: 2 }], ['Hot tea', '🍵', 700, { energy: 5, fun: 2 }], ['Yoghurt', '🥛', 900, { hunger: 9 }], ['Bread loaf', '🍞', 1200, { hunger: 22 }],
  ['Agege bread & akara', '🥖', 1800, { hunger: 32, fun: 3 }], ['Moi moi', '🫔', 1000, { hunger: 22 }], ['Boli & fish', '🍌', 1500, { hunger: 26, fun: 4 }], ['Suya (spicy beef)', '🍢', 2500, { hunger: 28, fun: 6 }],
  ['Meat pie', '🥧', 800, { hunger: 16 }], ['Puff-puff (bag)', '🍩', 500, { hunger: 12, fun: 3 }], ['Chin chin', '🥨', 600, { hunger: 10, fun: 3 }], ['Plantain chips', '🍟', 500, { hunger: 8 }],
  ['Groundnut & garri', '🥜', 800, { hunger: 18 }], ['Indomie & egg', '🍜', 1500, { hunger: 30, fun: 2 }], ['Shawarma', '🌯', 3500, { hunger: 45, fun: 5 }], ['Jollof rice & chicken', '🍛', 3500, { hunger: 55, fun: 4 }],
  ['Pepper soup', '🍲', 3000, { hunger: 38, fun: 4, energy: 3 }], ['Fruit basket', '🍎', 3000, { hunger: 24, hygiene: 2, fun: 2 }], ['Ice cream', '🍦', 1500, { hunger: 8, fun: 12 }], ['Chocolate bar', '🍫', 800, { hunger: 6, fun: 8 }],
  ['Biscuits pack', '🍪', 500, { hunger: 8 }], ['Family pizza', '🍕', 9000, { hunger: 70, fun: 10 }], ['Chicken & chips', '🍗', 4500, { hunger: 52, fun: 6 }], ['Birthday cake slice', '🍰', 2000, { hunger: 12, fun: 14, social: 4 }],
]);

/* ───────── Household ───────── */
add('household', [
  ['Broom', '🧹', 1200, [.4, .4]], ['Mop & bucket', '🪣', 3500, [.5, .5]], ['Detergent (big)', '🧴', 3000], ['Bleach', '🧪', 1500], ['Toilet roll (12 pack)', '🧻', 4500], ['Hand soap', '🧼', 1200],
  ['Bath towels (set)', '🛁', 9000], ['Bed sheets (set)', '🛏️', 14000], ['Duvet', '🛌', 22000], ['Pillows (pair)', '💤', 8000], ['Mosquito net', '🦟', 6000], ['Insecticide spray', '🪰', 2500],
  ['Air freshener', '🌸', 2200], ['Doormat', '🚪', 3500, [1, .6]], ['Laundry basket', '🧺', 5000, [.6, .6]], ['Iron', '👔', 12000, [.4, .3]], ['Ironing board', '📏', 14000, [1.4, .4]],
  ['Washing machine', '🫧', 280000, [.7, .7]], ['Standing fan', '🌀', 28000, [.5, .5]], ['Ceiling fan', '🪭', 32000], ['Split AC (1.5HP)', '❄️', 420000], ['Water heater', '🚿', 45000],
  ['Rechargeable lamp', '🔦', 9000], ['Candle pack', '🕯️', 1500], ['Power strip', '🔌', 4500], ['Inverter 1.5kVA', '🔋', 260000, [.6, .5]], ['Solar panel kit', '☀️', 650000], ['Small generator', '⛽', 190000, [.6, .5]],
  ['Gas cylinder (12.5kg)', '🛢️', 28000, [.4, .4]], ['Dustbin', '🗑️', 6000, [.4, .4]], ['First-aid kit', '🩹', 7500], ['Fire extinguisher', '🧯', 18000], ['Bathroom scale', '⚖️', 8000],
  ['Shower curtain', '🚿', 5500], ['Clothes hangers (20)', '🧥', 3500], ['Water dispenser', '🚰', 85000, [.4, .4]], ['Wall clock', '🕰️', 7000], ['Vacuum cleaner', '🧼', 75000, [.4, .4]], ['Curtains (pair)', '🪟', 25000],
]);

/* ───────── Kitchen ───────── */
add('kitchen', [
  ['Gas cooker (4 burner)', '🔥', 160000, [.9, .6]], ['Microwave', '📡', 85000, [.5, .4]], ['Electric kettle', '🫖', 14000], ['Blender', '🥤', 32000], ['Toaster', '🍞', 18000], ['Rice cooker', '🍚', 38000],
  ['Air fryer', '🍟', 95000, [.4, .4]], ['Pressure cooker', '🥘', 45000], ['Pots (5 piece set)', '🍲', 38000], ['Frying pan', '🍳', 9000], ['Knife set', '🔪', 22000], ['Cutlery (24 piece)', '🍴', 15000],
  ['Dinner plates (12)', '🍽️', 20000], ['Drinking glasses (12)', '🥛', 9000], ['Mug set', '☕', 7000], ['Chopping board', '🪵', 4500], ['Food flask', '🍱', 12000], ['Food containers', '🥡', 8500],
  ['Mortar & pestle', '🪨', 9500], ['Fridge (double door)', '🧊', 420000, [.8, .7]], ['Chest freezer', '🥶', 380000, [1.1, .6]], ['Water filter', '🚰', 40000], ['Dish rack', '🍽️', 6500],
  ['Coffee maker', '☕', 55000], ['Juicer', '🍊', 48000], ['Stand mixer', '🎂', 140000], ['Electric oven', '♨️', 210000, [.6, .5]], ['Dishwasher', '🧽', 480000, [.6, .6]], ['Kitchen scale', '⚖️', 7500],
  ['Spice rack', '🧂', 8500], ['Grater & peeler set', '🥕', 5500], ['Lunch box', '🍱', 5000], ['Thermos', '🫗', 12000], ['Cooking spoon set', '🥄', 4500], ['Baking tray set', '🧁', 11000], ['Kitchen island', '🏝️', 380000, [2, 1]],
]);

/* ───────── Furniture ───────── */
add('furniture', [
  ['Single bed', '🛏️', 120000, [1, 2]], ['Double bed', '🛏️', 260000, [1.6, 2]], ['King-size bed', '👑', 520000, [2, 2.1]], ['Bunk bed', '🪜', 230000, [1, 2]], ['Orthopaedic mattress', '😴', 180000, [1.6, 2]],
  ['Wardrobe (2 door)', '🚪', 190000, [1.2, .6]], ['Walk-in closet unit', '👗', 650000, [2.4, .8]], ['Dresser with mirror', '🪞', 150000, [1.2, .5]], ['Bedside table', '🛋️', 38000, [.5, .4]], ['Chest of drawers', '🗄️', 110000, [1, .5]],
  ['2-seater sofa', '🛋️', 210000, [1.6, .9]], ['3-seater sofa', '🛋️', 330000, [2.2, .9]], ['L-shaped sectional', '🛋️', 780000, [3, 2]], ['Recliner', '💺', 260000, [.9, .9]], ['Armchair', '🪑', 95000, [.8, .8]],
  ['Coffee table', '☕', 75000, [1.1, .6]], ['TV stand', '📺', 95000, [1.5, .45]], ['Side table', '🪵', 28000, [.5, .5]], ['Dining table (4 seat)', '🍽️', 220000, [1.3, .9]], ['Dining table (6 seat)', '🍽️', 380000, [1.8, .9]],
  ['Dining table (8 seat)', '🍽️', 620000, [2.4, 1]], ['Dining chair', '🪑', 22000, [.45, .45]], ['Bar stool', '🍸', 28000, [.4, .4]], ['Bookshelf', '📚', 85000, [1, .35]], ['Study desk', '🖥️', 90000, [1.2, .6]],
  ['Office chair', '💼', 65000, [.6, .6]], ['Gaming chair', '🎮', 140000, [.7, .7]], ['Shoe rack', '👟', 25000, [.8, .3]], ['Display cabinet', '🏺', 240000, [1, .4]], ['Console table', '🪑', 70000, [1.2, .35]],
  ['Bench', '🪑', 45000, [1.2, .4]], ['Bean bag', '🫘', 35000, [.9, .9]], ['Hammock chair', '🪢', 60000, [.9, .9]], ['Patio set (4 piece)', '⛱️', 340000, [2, 2]], ['Garden bench', '🌳', 90000, [1.4, .5]],
  ['Piano (upright)', '🎹', 1400000, [1.5, .7]], ['Pool table', '🎱', 950000, [2.4, 1.4]], ['Home bar counter', '🍹', 720000, [2, .7]], ['Executive desk', '🗂️', 480000, [1.8, .9]],
]);

/* ───────── Decor & lighting ───────── */
add('decor', [
  ['Area rug', '🟫', 55000, [2, 1.4]], ['Persian rug', '🧶', 260000, [3, 2]], ['Floor lamp', '💡', 32000, [.4, .4]], ['Table lamp', '🪔', 14000, [.3, .3]], ['Chandelier', '✨', 380000],
  ['Wall art (canvas)', '🖼️', 30000], ['Framed family photo', '🖼️', 9000], ['Large mirror', '🪞', 70000, [.9, .1]], ['Small plant', '🪴', 5500, [.4, .4]], ['Big indoor plant', '🌿', 28000, [.7, .7]],
  ['Flower vase', '💐', 12000, [.3, .3]], ['Throw pillows (4)', '🛋️', 16000], ['Ankara wall hanging', '🧵', 35000], ['African mask', '🗿', 48000], ['Neon sign', '🪧', 65000], ['Fairy lights', '🎇', 9000],
  ['Aquarium', '🐠', 220000, [1.2, .4]], ['Indoor fountain', '⛲', 150000, [.6, .6]], ['Trophy shelf', '🏆', 85000, [.8, .3]], ['Wall shelves (set)', '📐', 24000], ['Lava lamp', '🫧', 12000], ['Bronze statue', '🗽', 340000, [.5, .5]],
  ['Oil painting', '🎨', 450000], ['Disco ball', '🪩', 38000], ['Scented diffuser', '🌸', 18000], ['Photo wall frames', '📸', 20000], ['Wall clock (grand)', '🕰️', 95000],
]);

/* ───────── Tech ───────── */
add('tech', [
  ['Budget smartphone', '📱', 85000], ['Mid-range smartphone', '📱', 260000], ['Flagship smartphone', '📱', 1100000], ['Basic laptop', '💻', 350000, [.4, .3]], ['Pro laptop', '💻', 1300000, [.4, .3]],
  ['Tablet', '📲', 280000], ['Smart TV 32"', '📺', 140000, [.8, .1]], ['Smart TV 55"', '📺', 420000, [1.25, .1]], ['Smart TV 75"', '📺', 1100000, [1.7, .1]], ['Home theatre system', '🔊', 220000, [1.2, .3]],
  ['Bluetooth speaker', '🔈', 38000], ['Headphones', '🎧', 65000], ['Wireless earbuds', '🎧', 90000], ['Gaming console', '🎮', 620000, [.4, .3]], ['Extra controller', '🕹️', 55000], ['VR headset', '🥽', 480000],
  ['Wi-Fi router', '📶', 28000], ['Power bank', '🔋', 15000], ['Smartwatch', '⌚', 150000], ['Digital camera', '📷', 520000], ['Drone', '🛸', 880000], ['Printer', '🖨️', 140000, [.5, .4]],
  ['Monitor (27")', '🖥️', 260000, [.6, .2]], ['Mechanical keyboard', '⌨️', 45000], ['Gaming mouse', '🖱️', 22000], ['Webcam', '📹', 40000], ['Studio microphone', '🎙️', 120000], ['Ring light', '💡', 28000],
  ['Smart bulbs (4)', '💡', 30000], ['CCTV kit (4 cameras)', '📹', 220000], ['Smart door lock', '🔐', 130000], ['E-reader', '📖', 160000], ['Projector', '📽️', 380000, [.4, .4]],
  ['Fitness tracker', '⌚', 55000], ['Electric scooter', '🛴', 540000, [.6, 1.2]], ['Gaming PC', '🖥️', 1800000, [.5, .5]], ['Smart speaker', '🗣️', 70000], ['Karaoke machine', '🎤', 190000, [.6, .5]], ['Treadmill', '🏃', 700000, [.9, 1.8]],
]);

/* ───────── Accessories & style ───────── */
add('style', [
  ['Sunglasses', '🕶️', 18000], ['Designer shades', '🕶️', 160000], ['Casual wristwatch', '⌚', 45000], ['Luxury watch', '⌚', 1800000], ['Gold chain', '📿', 650000], ['Silver chain', '⛓️', 90000],
  ['Gold ring', '💍', 420000], ['Bracelet', '📿', 35000], ['Earrings', '💎', 60000], ['Fila cap (Yoruba)', '🎩', 20000], ['Baseball cap', '🧢', 9000], ['Beanie', '🧶', 6500], ['Coral beads', '📿', 280000],
  ['Handbag', '👜', 85000], ['Designer handbag', '👜', 1500000], ['Backpack', '🎒', 35000], ['Leather wallet', '👛', 25000], ['Leather belt', '🪢', 18000], ['Silk scarf', '🧣', 20000], ['Necktie', '👔', 12000],
  ['Bow tie', '🎀', 8000], ['Sneakers', '👟', 65000], ['Designer sneakers', '👟', 480000], ['Formal shoes', '👞', 90000], ['Sandals (leather)', '🩴', 20000], ['Boots', '🥾', 85000], ['High heels', '👠', 70000],
  ['Perfume', '🧴', 55000], ['Luxury cologne', '🧴', 220000], ['Umbrella', '☂️', 7000], ['Hand fan', '🪭', 3500], ['Gele (head tie)', '🧕', 30000], ['Walking cane', '🦯', 40000], ['Briefcase', '💼', 120000],
]);

/* ───────── Kids & baby (for the family update) ───────── */
add('kids', [
  ['Baby cot', '🛏️', 90000, [.7, 1.3]], ['High chair', '🪑', 45000, [.5, .5]], ['Stroller', '🛒', 120000], ['Diapers (big pack)', '🧷', 18000], ['Baby bottles (set)', '🍼', 9000], ['Baby monitor', '📡', 55000],
  ['Play mat', '🟨', 25000, [1.4, 1.4]], ['Teddy bear', '🧸', 12000], ['Building blocks', '🧱', 18000], ['Toy cars (set)', '🚗', 14000], ['Doll house', '🏠', 70000, [.8, .5]], ['Kids bicycle', '🚲', 85000, [.5, 1.1]],
  ['Football', '⚽', 9000], ['Board games', '🎲', 20000], ['School bag', '🎒', 22000], ['Story books (10)', '📚', 25000], ['Baby clothes (set)', '👶', 28000], ['Baby car seat', '💺', 110000], ['Toy chest', '🧰', 45000, [.8, .45]],
  ['Kids tablet', '📲', 95000], ['Swing set', '🎠', 380000, [2.5, 2]], ['Paddling pool', '🏊', 60000, [1.8, 1.8]],
]);

export const CATALOG: Item[] = out;
const BY_ID = new Map(CATALOG.map(i => [i.id, i]));
export const itemById = (id: string) => BY_ID.get(id);

/* Which shops sell what. The Market is the big one (Wuse Market has a bit of everything); the Supermarket sells everyday goods. */
export const STORE_CATS: Partial<Record<BusinessType, CatId[]>> = {
  Market: ['food', 'household', 'kitchen', 'furniture', 'decor', 'tech', 'style', 'kids'],
  Supermarket: ['food', 'household', 'kitchen', 'kids', 'decor'],
  'Petrol Station': ['food'],
  Pharmacy: ['household', 'kids'],
  Salon: ['style'],
  Barber: ['style'],
};
export const storeCats = (type: string): CatId[] => STORE_CATS[type as BusinessType] || [];
export const storeItems = (type: string): Item[] => { const c = storeCats(type); return CATALOG.filter(i => c.includes(i.cat)); };
export const storeItem = (type: string, id: string): Item | undefined => { const i = BY_ID.get(id); return i && storeCats(type).includes(i.cat) ? i : undefined; };
export const MAX_STACK = 99;
