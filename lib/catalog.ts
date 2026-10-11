// The item catalog. Shared by the store screen (client) and the shop route (server, which owns every price).
// Food & drinks are used on the spot (they fill your needs). Everything else goes into your inventory, ready to be
// placed in your home (furnishing + house upgrades come with the housing update: `fp` is the footprint in metres).
import type { BusinessType } from './cityTypes';
import { WEAPONS, weaponItemId } from './weapons';
import { PARTS } from './chopData';

export type CatId = 'food' | 'grocery' | 'toiletry' | 'household' | 'kitchen' | 'furniture' | 'decor' | 'tech' | 'style' | 'fashion' | 'luxury' | 'kids' | 'arms' | 'parts';
export const CATS: { id: CatId; label: string; e: string }[] = [
  { id: 'food', label: 'Food & Drinks', e: '🍲' }, { id: 'grocery', label: 'Groceries', e: '🛒' }, { id: 'toiletry', label: 'Toiletries', e: '🧼' }, { id: 'household', label: 'Household', e: '🧺' }, { id: 'kitchen', label: 'Kitchen', e: '🍳' },
  { id: 'furniture', label: 'Furniture', e: '🛋️' }, { id: 'decor', label: 'Decor & Lights', e: '🪴' }, { id: 'tech', label: 'Tech', e: '📱' },
  { id: 'fashion', label: 'Clothes', e: '👕' }, { id: 'style', label: 'Accessories', e: '⌚' }, { id: 'luxury', label: 'Luxury & Fancy', e: '💎' }, { id: 'kids', label: 'Kids & Baby', e: '🧸' }, { id: 'arms', label: 'Firearms', e: '🔫' }, { id: 'parts', label: 'Car Parts', e: '🔩' },
];
export type Needs = Partial<Record<'hunger' | 'energy' | 'hygiene' | 'bladder' | 'fun' | 'social', number>>;
export type Item = { id: string; cat: CatId; name: string; e: string; cost: number; fx?: Needs; fp?: [number, number]; use?: boolean; tag?: string; units?: number; pantry?: 'meals' | 'supplies';
  /** Furniture varieties: `sub` = shelf label (Beds, Sofas…), `kind`/`style` = which 3D model + design, `col` = main colour. `variant` items live in the Online Mall / player market only. */
  sub?: string; kind?: string; style?: string; col?: string; colName?: string; variant?: boolean;
  /** Fashion: who it is cut for ('m' men, 'w' women). */ g?: 'm' | 'w' | 'u' };
/** Groceries and toiletries are not carried as items: they fill your pantry (meals / supplies), which cooking, showering etc. use up. */
export const PANTRY_CATS: CatId[] = ['grocery', 'toiletry'];
export const isStaple = (i: { cat: string }) => i.cat === 'food' || i.cat === 'grocery' || i.cat === 'toiletry';

const out: Item[] = [];
const slug = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const add = (cat: CatId, rows: [string, string, number, (Needs | [number, number] | number | null)?, string?][]) => rows.forEach(([name, e, cost, x, tag]) => {
  const it: Item = { id: cat.slice(0, 3) + '_' + slug(name), cat, name, e, cost };
  if (tag) it.tag = tag;
  if (cat === 'food') { it.use = true; it.fx = (x as Needs) || { hunger: 10 }; }
  else if (cat === 'grocery' || cat === 'toiletry') { it.units = typeof x === 'number' ? x : 5; it.pantry = cat === 'grocery' ? 'meals' : 'supplies'; }
  else if (Array.isArray(x)) it.fp = x;
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

/* ───────── Groceries (go in your pantry: each unit is one home-cooked meal) ───────── */
add('grocery', [
  ['Rice (1kg)', '🍚', 2200, 3], ['Rice (5kg bag)', '🍚', 10000, 16], ['Rice (25kg bag)', '🌾', 46000, 85], ['Beans (1kg)', '🫘', 2600, 3], ['Garri (1kg)', '🥣', 1200, 2], ['Garri (big bag)', '🥣', 9000, 14],
  ['Yam tuber', '🍠', 3500, 4], ['Yam (bundle of 5)', '🍠', 15000, 22], ['Sweet potatoes (1kg)', '🍠', 1800, 3], ['Irish potatoes (1kg)', '🥔', 2400, 3], ['Plantain (bunch)', '🍌', 2800, 4], ['Cassava flour (1kg)', '🌾', 1800, 3],
  ['Semovita (2kg)', '🍘', 3600, 6], ['Pounded yam flour (2kg)', '🥣', 4200, 6], ['Spaghetti (500g pack)', '🍝', 1100, 2], ['Spaghetti (carton)', '🍝', 22000, 40], ['Macaroni (500g pack)', '🍝', 1100, 2], ['Noodles (carton)', '🍜', 9000, 20],
  ['Oats (500g)', '🥣', 2800, 4], ['Cornflakes box', '🥣', 3800, 4], ['Custard & milk set', '🥛', 3200, 4], ['Flour (2kg)', '🌾', 3400, 5], ['Bread (family loaf)', '🍞', 1500, 3], ['Eggs (crate of 30)', '🥚', 6500, 15],
  ['Fresh tomatoes (basket)', '🍅', 6000, 8], ['Tatashe & pepper (basket)', '🌶️', 5000, 8], ['Onions (1kg)', '🧅', 1800, 4], ['Garlic & ginger pack', '🧄', 1500, 3], ['Ugu / spinach bunch', '🥬', 700, 2], ['Carrots & cabbage pack', '🥕', 2200, 4],
  ['Cucumbers (5)', '🥒', 1500, 2], ['Bell peppers (bag)', '🫑', 3000, 4], ['Okra (bundle)', '🥬', 1500, 3], ['Ogbono (cup)', '🥣', 4500, 6], ['Egusi (1kg)', '🥜', 5200, 8], ['Crayfish pack', '🦐', 3500, 6],
  ['Smoked fish (large)', '🐟', 6500, 8], ['Fresh fish (1kg)', '🐟', 5500, 5], ['Frozen chicken (1kg)', '🍗', 6800, 6], ['Whole chicken', '🐔', 12000, 12], ['Turkey (1kg)', '🦃', 11000, 8], ['Beef (1kg)', '🥩', 9500, 8],
  ['Goat meat (1kg)', '🐐', 11000, 8], ['Ponmo & assorted meat', '🥩', 4500, 5], ['Sausage pack', '🌭', 3800, 5], ['Corned beef tin', '🥫', 3200, 4], ['Sardine tins (3)', '🐟', 3000, 4], ['Tomato paste tins (carton)', '🥫', 8500, 20],
  ['Vegetable oil (5L)', '🛢️', 17000, 25], ['Palm oil (2L)', '🧈', 6500, 10], ['Groundnut oil (3L)', '🥜', 13000, 18], ['Sugar (1kg)', '🍬', 2200, 8], ['Salt & seasoning cubes', '🧂', 1200, 10], ['Curry, thyme & spice kit', '🌿', 2800, 10],
  ['Milk powder (tin)', '🥛', 8500, 12], ['Evaporated milk (carton)', '🥛', 14000, 24], ['Butter / margarine', '🧈', 3200, 6], ['Peanut butter jar', '🥜', 4200, 6], ['Honey (jar)', '🍯', 5500, 6], ['Jam & spread set', '🍓', 3600, 5],
  ['Fruit crate (mixed)', '🍍', 9000, 10], ['Oranges (bag)', '🍊', 3000, 5], ['Watermelon', '🍉', 3500, 5], ['Bananas (bunch)', '🍌', 1500, 3], ['Apples (6)', '🍎', 3600, 4], ['Frozen veg & fries pack', '🍟', 5200, 8],
  ['Tea & coffee pack', '☕', 4800, 10], ['Bottled water (12 pack)', '💧', 4500, 12], ['Soft drinks (crate)', '🥤', 8500, 12], ['Family grocery hamper', '🧺', 38000, 60], ['Premium grocery hamper', '🎁', 95000, 150],
]);

/* ───────── Toiletries (go in your pantry: each unit is one wash / one toilet visit) ───────── */
add('toiletry', [
  ['Bathing soap (3 bars)', '🧼', 1500, 6], ['Soap (carton of 24)', '🧼', 10500, 48], ['Body wash', '🧴', 3800, 12], ['Luxury body wash', '🧴', 9500, 20], ['Shower gel (family size)', '🧴', 6500, 24], ['Sponge & loofah set', '🧽', 2000, 8],
  ['Shampoo', '🧴', 3200, 10], ['Conditioner', '🧴', 3400, 10], ['Hair cream', '💈', 2800, 8], ['Hair oil', '🫗', 2500, 8], ['Toothpaste (2 pack)', '🪥', 2200, 20], ['Toothbrushes (4)', '🪥', 2400, 12],
  ['Mouthwash', '🫧', 3200, 12], ['Dental floss', '🧵', 1500, 8], ['Deodorant roll-on', '🧴', 2400, 14], ['Antiperspirant spray', '🧴', 3600, 16], ['Body lotion', '🧴', 4200, 14], ['Shea butter jar', '🧈', 3500, 10],
  ['Face wash', '🧴', 3800, 10], ['Sunscreen', '☀️', 6500, 10], ['Razor pack', '🪒', 3000, 10], ['Shaving cream', '🧴', 2800, 8], ['Toilet roll (12 pack)', '🧻', 4500, 24], ['Toilet roll (48 bulk)', '🧻', 16000, 96],
  ['Tissue boxes (6)', '🤧', 3000, 12], ['Wet wipes (3 packs)', '🧻', 2800, 10], ['Cotton buds & pads', '🧼', 1500, 8], ['Sanitary pads (pack)', '🩹', 2500, 12], ['Hand wash refill', '🧼', 2200, 12], ['Hand sanitizer', '🧴', 1800, 8],
  ['Bathroom cleaner', '🪣', 2600, 12], ['Toilet cleaner', '🚽', 2400, 12], ['Bath salts & bubble bath', '🛁', 6000, 12], ['Perfumed talc', '🌸', 2500, 8], ['Spa treatment kit', '💆', 25000, 30], ['Toiletries starter bundle', '🧺', 18000, 40],
  ['Family toiletries bundle', '🎁', 42000, 100],
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
  ['Curtain rails & blinds', '🪟', 38000], ['Smart air purifier', '🌬️', 110000], ['Dehumidifier', '💧', 90000], ['Floor polisher', '🧽', 65000], ['Steam cleaner', '♨️', 80000], ['Robot vacuum', '🤖', 260000, [.4, .4]],
  ['Tumble dryer', '🌀', 320000, [.7, .7]], ['Front-load washer-dryer', '🫧', 520000, [.7, .7]], ['Air conditioner (2HP)', '❄️', 520000], ['Industrial standing fan', '🌀', 55000, [.6, .6]], ['Gas heater', '🔥', 48000], ['Solar lamp set', '☀️', 22000],
  ['Inverter battery (200Ah)', '🔋', 240000], ['Voltage stabiliser', '⚡', 38000], ['Smoke detector', '🚨', 14000], ['Door lock set', '🔐', 22000], ['Welcome mat deluxe', '🚪', 12000], ['Laundry detergent pods', '🫧', 8500], ['Storage boxes (set)', '📦', 18000],
  ['Shoe cabinet', '👟', 52000, [.8, .35]], ['Coat stand', '🧥', 24000, [.4, .4]], ['Step ladder', '🪜', 22000, [.5, .5]], ['Toolbox (full)', '🧰', 45000], ['Garden hose set', '🌱', 18000], ['Pressure washer', '💦', 120000],
]);

/* ───────── Kitchen ───────── */
add('kitchen', [
  ['Gas cooker (4 burner)', '🔥', 160000, [.9, .6]], ['Microwave', '📡', 85000, [.5, .4]], ['Electric kettle', '🫖', 14000], ['Blender', '🥤', 32000], ['Toaster', '🍞', 18000], ['Rice cooker', '🍚', 38000],
  ['Air fryer', '🍟', 95000, [.4, .4]], ['Pressure cooker', '🥘', 45000], ['Pots (5 piece set)', '🍲', 38000], ['Frying pan', '🍳', 9000], ['Knife set', '🔪', 22000], ['Cutlery (24 piece)', '🍴', 15000],
  ['Dinner plates (12)', '🍽️', 20000], ['Drinking glasses (12)', '🥛', 9000], ['Mug set', '☕', 7000], ['Chopping board', '🪵', 4500], ['Food flask', '🍱', 12000], ['Food containers', '🥡', 8500],
  ['Mortar & pestle', '🪨', 9500], ['Fridge (double door)', '🧊', 420000, [.8, .7]], ['Chest freezer', '🥶', 380000, [1.1, .6]], ['Water filter', '🚰', 40000], ['Dish rack', '🍽️', 6500],
  ['Coffee maker', '☕', 55000], ['Juicer', '🍊', 48000], ['Stand mixer', '🎂', 140000], ['Electric oven', '♨️', 210000, [.6, .5]], ['Dishwasher', '🧽', 480000, [.6, .6]], ['Kitchen scale', '⚖️', 7500],
  ['Spice rack', '🧂', 8500], ['Grater & peeler set', '🥕', 5500], ['Lunch box', '🍱', 5000], ['Thermos', '🫗', 12000], ['Cooking spoon set', '🥄', 4500], ['Baking tray set', '🧁', 11000], ['Kitchen island', '🏝️', 380000, [2, 1]],
  ['Industrial blender', '🥤', 120000], ['Slow cooker', '🍲', 52000], ['Waffle maker', '🧇', 28000], ['Sandwich maker', '🥪', 18000], ['Deep fryer', '🍟', 64000], ['Cast-iron skillet', '🍳', 28000], ['Dutch oven', '🥘', 75000],
  ['Wine fridge', '🍷', 340000, [.6, .6]], ['Built-in oven & hob', '🔥', 780000, [.9, .6]], ['Double-door freezer', '🧊', 520000, [.9, .7]], ['Water cooler (hot & cold)', '🚰', 120000, [.4, .4]], ['Glass cookware set', '🥣', 42000], ['Steel pot set (10 pc)', '🍲', 95000],
  ['Premium cutlery (gold)', '🍴', 180000], ['Crystal glass set', '🥂', 150000], ['China dinner set (24 pc)', '🍽️', 240000], ['Tea set', '🫖', 55000], ['Cake stand & domes', '🍰', 32000], ['Pizza oven (electric)', '🍕', 190000], ['Ice maker', '🧊', 160000], ['Meat grinder', '🥩', 55000], ['Rotisserie grill', '🍗', 110000],
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
  ['Canopy bed', '👑', 680000, [2, 2.2]], ['Leather sofa (3 seat)', '🛋️', 520000, [2.2, .95]], ['Velvet chesterfield', '🛋️', 640000, [2.2, .95]], ['Marble coffee table', '☕', 360000, [1.2, .7]], ['Glass dining table (8)', '🍽️', 780000, [2.4, 1]],
  ['Leather dining chairs (6)', '🪑', 420000, [.5, .5]], ['Bar cart', '🍸', 120000, [.5, .9]], ['Writing bureau', '🗂️', 260000, [1, .5]], ['Rocking chair', '🪑', 90000, [.7, .9]], ['Daybed', '🛏️', 310000, [.9, 2]], ['Vanity table', '💄', 190000, [1, .5]],
  ['Entertainment wall unit', '📺', 480000, [2.6, .5]], ['Library ladder bookcase', '📚', 380000, [2, .4]], ['Floating shelves (luxury)', '📐', 140000], ['Massage recliner', '💆', 480000, [.9, .9]], ['Leather office chair', '💼', 220000, [.7, .7]], ['Conference table', '🗂️', 640000, [2.4, 1.1]],
  ['Rattan sofa set', '🛋️', 280000, [2, 1]], ['Outdoor sun lounger', '🏖️', 140000, [.7, 2]], ['Swing chair', '🪢', 130000, [.9, .9]], ['Poker table', '♠️', 360000, [1.4, 1.4]], ['Foosball table', '⚽', 190000, [1.2, .7]], ['Arcade cabinet', '🕹️', 520000, [.7, .7]],
]);

/* ───────── Decor & lighting ───────── */
add('decor', [
  ['Area rug', '🟫', 55000, [2, 1.4]], ['Persian rug', '🧶', 260000, [3, 2]], ['Floor lamp', '💡', 32000, [.4, .4]], ['Table lamp', '🪔', 14000, [.3, .3]], ['Chandelier', '✨', 380000],
  ['Wall art (canvas)', '🖼️', 30000], ['Framed family photo', '🖼️', 9000], ['Large mirror', '🪞', 70000, [.9, .1]], ['Small plant', '🪴', 5500, [.4, .4]], ['Big indoor plant', '🌿', 28000, [.7, .7]],
  ['Flower vase', '💐', 12000, [.3, .3]], ['Throw pillows (4)', '🛋️', 16000], ['Ankara wall hanging', '🧵', 35000], ['African mask', '🗿', 48000], ['Neon sign', '🪧', 65000], ['Fairy lights', '🎇', 9000],
  ['Aquarium', '🐠', 220000, [1.2, .4]], ['Indoor fountain', '⛲', 150000, [.6, .6]], ['Trophy shelf', '🏆', 85000, [.8, .3]], ['Wall shelves (set)', '📐', 24000], ['Lava lamp', '🫧', 12000], ['Bronze statue', '🗽', 340000, [.5, .5]],
  ['Oil painting', '🎨', 450000], ['Disco ball', '🪩', 38000], ['Scented diffuser', '🌸', 18000], ['Photo wall frames', '📸', 20000], ['Wall clock (grand)', '🕰️', 95000],
  ['Crystal chandelier XL', '✨', 950000], ['Gold-framed mirror', '🪞', 240000, [.9, .1]], ['Marble sculpture', '🗿', 620000, [.5, .5]], ['Handwoven wall tapestry', '🧵', 120000], ['Benin bronze replica', '🏺', 480000, [.4, .4]], ['Nok terracotta replica', '🏺', 320000, [.4, .4]],
  ['Abstract canvas set', '🖼️', 160000], ['Artist-signed portrait', '🎨', 850000], ['Indoor tree (6ft)', '🌳', 80000, [.8, .8]], ['Orchid arrangement', '🌺', 28000, [.3, .3]], ['Bonsai tree', '🌳', 65000, [.4, .4]], ['Himalayan salt lamp', '🧂', 15000], ['LED strip lights', '💡', 12000],
  ['Smart mood lighting', '🌈', 45000], ['Glass lantern set', '🏮', 32000], ['Candle holders (gold)', '🕯️', 26000], ['Silk curtains (gold)', '🪟', 180000], ['Velvet drapes', '🪟', 140000], ['Wool rug (large)', '🧶', 340000, [3, 2]], ['Zebra-print rug', '🦓', 220000, [2.4, 1.6]],
  ['Grandfather clock', '🕰️', 520000, [.5, .4]], ['Globe on stand', '🌍', 85000, [.5, .5]], ['Telescope', '🔭', 190000, [.5, .5]], ['Wall-mounted fireplace', '🔥', 420000], ['Water wall feature', '⛲', 360000, [1.2, .2]], ['Fairy-light curtain', '🎇', 24000], ['Memory photo wall', '📸', 38000],
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
  ['Smart TV 85" OLED', '📺', 2400000, [1.9, .1]], ['Dolby Atmos soundbar', '🔊', 380000, [1, .15]], ['5.1 surround speakers', '🔊', 520000], ['Turntable & vinyl set', '💿', 260000], ['DJ controller', '🎛️', 480000], ['Electric guitar & amp', '🎸', 420000],
  ['Keyboard piano (88 key)', '🎹', 380000, [1.4, .4]], ['Podcast studio kit', '🎙️', 360000], ['4K action camera', '📷', 280000], ['Mirrorless camera pro', '📸', 1700000], ['Gimbal stabiliser', '🎥', 190000], ['Foldable phone', '📱', 1500000],
  ['Ultra-wide gaming monitor', '🖥️', 640000, [.8, .25]], ['Gaming laptop', '💻', 1900000, [.4, .3]], ['Workstation PC', '🖥️', 2600000, [.5, .5]], ['3D printer', '🖨️', 780000, [.5, .5]], ['Mesh Wi-Fi system', '📶', 160000], ['Starlink kit', '🛰️', 650000],
  ['Smart thermostat', '🌡️', 90000], ['Video doorbell', '🔔', 85000], ['Smart lock + keypad', '🔐', 160000], ['Home security system', '🚨', 520000], ['Robot lawn mower', '🤖', 700000], ['Electric bike', '🚲', 780000, [.6, 1.7]], ['Smart mirror', '🪞', 380000, [.9, .1]], ['VR racing rig', '🏎️', 1400000, [1.2, 1.6]],
]);

/* ───────── Accessories & style ───────── */
add('style', [
  ['Sunglasses', '🕶️', 18000], ['Designer shades', '🕶️', 160000], ['Casual wristwatch', '⌚', 45000], ['Luxury watch', '⌚', 1800000], ['Gold chain', '📿', 650000], ['Silver chain', '⛓️', 90000],
  ['Gold ring', '💍', 420000], ['Bracelet', '📿', 35000], ['Earrings', '💎', 60000], ['Fila cap (Yoruba)', '🎩', 20000], ['Baseball cap', '🧢', 9000], ['Beanie', '🧶', 6500], ['Coral beads', '📿', 280000],
  ['Handbag', '👜', 85000], ['Designer handbag', '👜', 1500000], ['Backpack', '🎒', 35000], ['Leather wallet', '👛', 25000], ['Leather belt', '🪢', 18000], ['Silk scarf', '🧣', 20000], ['Necktie', '👔', 12000],
  ['Bow tie', '🎀', 8000], ['Sneakers', '👟', 65000], ['Designer sneakers', '👟', 480000], ['Formal shoes', '👞', 90000], ['Sandals (leather)', '🩴', 20000], ['Boots', '🥾', 85000], ['High heels', '👠', 70000],
  ['Perfume', '🧴', 55000], ['Luxury cologne', '🧴', 220000], ['Umbrella', '☂️', 7000], ['Hand fan', '🪭', 3500], ['Gele (head tie)', '🧕', 30000], ['Walking cane', '🦯', 40000], ['Briefcase', '💼', 120000],
  ['Agbada (embroidered)', '👘', 320000], ['Aso-oke set', '🧵', 280000], ['Lace aso-ebi (5 yards)', '🧵', 140000], ['Ankara dress', '👗', 45000], ['Kaftan', '👘', 60000], ['Tailored suit', '🤵', 380000], ['Tuxedo', '🤵', 620000], ['Evening gown', '👗', 520000],
  ['Wedding gown', '👰', 1400000], ['Leather jacket', '🧥', 180000], ['Designer jeans', '👖', 95000], ['Polo shirts (3)', '👕', 42000], ['Hoodie', '🧥', 38000], ['Track suit', '🏃', 55000], ['Swimwear', '🩱', 30000], ['Fur stole', '🧣', 340000],
  ['Designer sunglasses (gold)', '🕶️', 380000], ['Pearl necklace', '📿', 480000], ['Diamond earrings', '💎', 1600000], ['Tennis bracelet', '💎', 2400000], ['Ruby ring', '💍', 1800000], ['Gold watch (lady)', '⌚', 2100000], ['Designer belt', '🪢', 220000], ['Crocodile-skin shoes', '👞', 780000],
  ['Luxury sneakers (limited)', '👟', 950000], ['Designer scarf', '🧣', 180000], ['Travel luggage set', '🧳', 320000], ['Cufflinks (gold)', '🔗', 160000], ['Pocket watch (antique)', '🕰️', 540000], ['Jewellery box', '🧰', 120000],
]);

/* ───────── Luxury & fancy (the good stuff) ───────── */
add('luxury', [
  ['Gold-plated tap set', '🚰', 650000], ['Marble bathtub', '🛁', 1900000, [1.8, .9]], ['Jacuzzi (6 person)', '🛁', 3800000, [2, 2]], ['Steam sauna cabin', '🧖', 2600000, [1.4, 1.4]], ['Rain-shower panel', '🚿', 480000], ['Heated towel rail', '🛁', 220000],
  ['Grand piano (Steinway-style)', '🎹', 9500000, [2.2, 1.5]], ['Crystal ball chandelier', '✨', 2800000], ['Italian leather sofa set', '🛋️', 3200000, [3, 2]], ['Hand-carved ebony bed', '👑', 4200000, [2.2, 2.3]], ['Silk Persian carpet', '🧶', 3600000, [3.5, 2.5]],
  ['Gold-leaf dining set (10)', '🍽️', 5200000, [3, 1.2]], ['Murano glass lamp', '🪔', 780000], ['Antique Benin throne', '🪑', 2900000, [.8, .8]], ['Original oil masterpiece', '🎨', 6800000], ['Rare vinyl collection', '💿', 1200000], ['Cigar humidor', '🚬', 450000],
  ['Vintage wine collection', '🍷', 2400000], ['Champagne case (6)', '🍾', 1500000], ['Whisky cabinet (rare)', '🥃', 2200000], ['Caviar & truffle hamper', '🎁', 780000], ['Gold bar (100g)', '🥇', 11000000], ['Diamond watch', '⌚', 14500000], ['Platinum chain', '⛓️', 4800000],
  ['Emerald necklace', '💎', 7600000], ['Pink diamond ring', '💍', 18000000], ['Crocodile Birkin-style bag', '👜', 9200000], ['Chinchilla fur coat', '🧥', 6500000], ['Bespoke Savile Row suit', '🤵', 2800000], ['Limited edition sneaker vault', '👟', 3400000],
  ['Yacht model (collector)', '🛥️', 2200000], ['Supercar scale model', '🏎️', 1400000], ['Private jet model', '✈️', 2600000], ['Home cinema (Dolby 4K)', '🎞️', 7200000, [3, 2]], ['Wall of 8K screens', '📺', 9800000, [3, .2]], ['Smart-home master system', '🏠', 5400000],
  ['Rooftop infinity hot tub', '🛁', 6200000, [2, 2]], ['Indoor koi pond', '🐟', 3300000, [2.4, 1.2]], ['Elevator (home)', '🛗', 24000000, [1.4, 1.4]], ['Wine cellar rack (200)', '🍷', 3900000, [1.2, .5]], ['Golden Buddha statue', '🗿', 4400000, [.8, .8]], ['Meteorite display', '☄️', 2700000],
  ['Telescope observatory kit', '🔭', 1900000], ['Bulletproof safe', '🔐', 1300000, [.7, .6]], ['Personal chef starter (annual)', '👨‍🍳', 3600000], ['Spa day voucher (VIP)', '💆', 600000], ['Helicopter ride voucher', '🚁', 1100000], ['Island weekend voucher', '🏝️', 2800000],
]);

/* ───────── Kids & baby (for the family update) ───────── */
add('kids', [
  ['Baby cot', '🛏️', 90000, [.7, 1.3]], ['High chair', '🪑', 45000, [.5, .5]], ['Stroller', '🛒', 120000], ['Diapers (big pack)', '🧷', 18000], ['Baby bottles (set)', '🍼', 9000], ['Baby monitor', '📡', 55000],
  ['Play mat', '🟨', 25000, [1.4, 1.4]], ['Teddy bear', '🧸', 12000], ['Building blocks', '🧱', 18000], ['Toy cars (set)', '🚗', 14000], ['Doll house', '🏠', 70000, [.8, .5]], ['Kids bicycle', '🚲', 85000, [.5, 1.1]],
  ['Football', '⚽', 9000], ['Board games', '🎲', 20000], ['School bag', '🎒', 22000], ['Story books (10)', '📚', 25000], ['Baby clothes (set)', '👶', 28000], ['Baby car seat', '💺', 110000], ['Toy chest', '🧰', 45000, [.8, .45]],
  ['Kids tablet', '📲', 95000], ['Swing set', '🎠', 380000, [2.5, 2]], ['Paddling pool', '🏊', 60000, [1.8, 1.8]],
]);

/* ───────── Furniture & appliance varieties (designs × colours) ─────────
   Generated, so every design comes in every colour of its palette. Ids are `<cat>_<colour>_<design>`; they are stable, never reorder or rename.
   Variants are sold in the Online Mall and between players; the walk-in shops keep the classic range above. */
type Pal = [string, string][];
const FABRIC: Pal = [['Charcoal Grey', '#464a52'], ['Ivory Cream', '#e6dcc6'], ['Royal Blue', '#2a4fa3'], ['Emerald Green', '#1f7d5a'], ['Burgundy Red', '#7d1f33'], ['Blush Pink', '#e0a3b3'], ['Mustard Gold', '#c9992b'], ['Midnight Black', '#1a1b20']];
const WOOD: Pal = [['Walnut', '#5b3d29'], ['Dark Mahogany', '#4a2418'], ['Natural Oak', '#b98d58'], ['Ebony Black', '#1d1b1a'], ['Whitewash', '#e9e3d6'], ['Golden Teak', '#a8702f'], ['Ash Grey', '#8c8d8a'], ['Cherry Red', '#8b3a2b']];
const METAL: Pal = [['Matte Black', '#202226'], ['Antique Gold', '#b8923a'], ['Brushed Silver', '#b9bec4'], ['Pure White', '#f1f1ee'], ['Bronze', '#7a5636'], ['Rose Gold', '#c98e83']];
const LEATHER: Pal = [['Black Leather', '#1c1b1b'], ['Tan Leather', '#a8703d'], ['Chocolate Leather', '#4a2b1b'], ['Cream Leather', '#e5d9c0'], ['Oxblood Leather', '#5e1a1f'], ['Navy Leather', '#1d2a4a']];
const APPL: Pal = [['White', '#f2f2f0'], ['Black', '#1c1d20'], ['Stainless Steel', '#b4b9be'], ['Cream', '#eadfc4'], ['Retro Red', '#b3262e'], ['Sky Blue', '#79b4d8']];
const KITCH: Pal = [['White Gloss', '#f0efec'], ['Matte Black', '#222326'], ['Sage Green', '#8ea58a'], ['Navy Blue', '#27406b'], ['Walnut', '#5b3d29'], ['Cream', '#e8dcc2'], ['Slate Grey', '#6a6f76'], ['Natural Oak', '#b98d58']];
const TVC: Pal = [['Black', '#101114'], ['Silver', '#b7bcc2'], ['White', '#eeeeec'], ['Rose Gold', '#c99a8e']];
type D = [label: string, cost: number, fp: [number, number], style: string, pal?: Pal];
const taken = new Set(out.map(i => i.id));
function addV(cat: CatId, sub: string, kind: string, e: string, pal: Pal, rows: D[]) {
  rows.forEach(([label, cost, fp, style, p]) => (p || pal).forEach(([cn, hex]) => {
    const name = `${cn} ${label}`, id = cat.slice(0, 3) + '_' + slug(name);
    if (taken.has(id)) return; taken.add(id);
    out.push({ id, cat, name, e, cost, fp, sub, kind, style, col: hex, colName: cn, variant: true });
  }));
}

/* Beds: 4 sizes × 10 designs × 6-8 colours */
const BED_SIZES: [string, number, number, number][] = [['Single', 1, 2, .7], ['Double', 1.5, 2, 1], ['Queen', 1.8, 2.05, 1.25], ['King', 2, 2.1, 1.6]];
const BED_DESIGNS: [string, number, string, Pal][] = [['Classic Panel Bed', 150000, 'panel', WOOD], ['Tufted Headboard Bed', 260000, 'tufted', FABRIC], ['Slatted Wood Bed', 170000, 'slat', WOOD], ['Metal Frame Bed', 110000, 'metal', METAL], ['Storage Ottoman Bed', 320000, 'storage', FABRIC],
  ['Low Platform Bed', 210000, 'platform', WOOD], ['Four-Poster Bed', 420000, 'poster', WOOD], ['Sleigh Bed', 380000, 'sleigh', WOOD], ['Wingback Upholstered Bed', 360000, 'wingback', FABRIC], ['Floating LED Bed', 480000, 'led', FABRIC]];
BED_DESIGNS.forEach(([n, c, st, p]) => BED_SIZES.forEach(([s, w, l, m]) => addV('furniture', 'Beds', 'bed', '🛏️', p, [[`${s} ${n}`, Math.round(c * m / 1000) * 1000, [w, l], st]])));

/* Couches & sofas */
addV('furniture', 'Sofas', 'sofa', '🛋️', FABRIC, [
  ['2-Seater Modern Sofa', 210000, [1.6, .9], 'modern'], ['3-Seater Modern Sofa', 330000, [2.2, .9], 'modern'], ['Velvet Loveseat', 240000, [1.4, .85], 'love'], ['Mid-Century Sofa', 410000, [2, .85], 'mid'], ['Convertible Sofa Bed', 360000, [1.9, .95], 'modern'],
  ['Rattan Garden Sofa', 280000, [2, .9], 'rattan'], ['Modular Cloud Sofa', 720000, [2.6, 1.1], 'cloud'], ['L-Shaped Sectional Sofa', 780000, [3, 2], 'sectional'], ['U-Shaped Corner Sofa', 980000, [3.2, 2.4], 'ushape'],
  ['3-Seater Chesterfield Sofa', 640000, [2.2, .95], 'chester', LEATHER], ['Tuxedo Leather Sofa', 520000, [2.2, .95], 'tuxedo', LEATHER], ['Power Recliner Sofa', 560000, [2.3, .95], 'recsofa', LEATHER],
]);

/* Chairs */
addV('furniture', 'Chairs', 'chair', '🪑', FABRIC, [
  ['Cushioned Dining Chair', 35000, [.45, .45], 'dc_cush'], ['Modern Shell Dining Chair', 28000, [.45, .45], 'dc_shell'], ['Wingback Dining Chair', 55000, [.5, .5], 'dc_wing'],
  ['Classic Wooden Dining Chair', 22000, [.45, .45], 'dc_classic', WOOD], ['Ladderback Dining Chair', 30000, [.45, .45], 'dc_ladder', WOOD], ['Cross-Back Dining Chair', 33000, [.45, .45], 'dc_cross', WOOD],
  ['Club Armchair', 120000, [.9, .9], 'club'], ['Wingback Armchair', 160000, [.9, .9], 'wing'], ['Scoop Armchair', 95000, [.8, .8], 'scoop'], ['Velvet Barrel Accent Chair', 140000, [.8, .8], 'barrel'], ['Rattan Cane Armchair', 110000, [.8, .8], 'cane', WOOD],
  ['Manual Recliner', 260000, [.9, .9], 'recl', LEATHER], ['Power Recliner', 380000, [.95, .95], 'recl', LEATHER],
  ['Mesh Office Chair', 65000, [.6, .6], 'off_mesh', APPL], ['Executive Leather Office Chair', 220000, [.7, .7], 'off_exec', LEATHER], ['Ergonomic Office Chair', 180000, [.65, .65], 'off_ergo', APPL], ['Racing Gaming Chair', 140000, [.7, .7], 'game', APPL],
  ['Tall Bar Stool', 28000, [.4, .4], 'stool_tall', METAL], ['Backrest Bar Stool', 38000, [.42, .42], 'stool_back', METAL], ['Padded Swivel Bar Stool', 45000, [.45, .45], 'stool_pad'],
  ['Folding Garden Chair', 18000, [.5, .5], 'folding', WOOD], ['Rocking Chair', 90000, [.7, .9], 'rock', WOOD], ['Bean Bag', 35000, [.9, .9], 'bean'], ['Hanging Egg Chair', 150000, [.9, .9], 'egg', WOOD],
]);

/* Wardrobes */
addV('furniture', 'Wardrobes', 'wardrobe', '🚪', WOOD, [
  ['2-Door Hinged Wardrobe', 190000, [1.2, .6], 'h2'], ['3-Door Hinged Wardrobe', 260000, [1.8, .6], 'h3'], ['4-Door Hinged Wardrobe', 340000, [2.4, .6], 'h4'], ['2-Door Sliding Wardrobe', 280000, [1.5, .65], 's2'], ['3-Door Sliding Wardrobe', 380000, [2.2, .65], 's3'],
  ['Mirror-Door Wardrobe', 420000, [1.8, .6], 'mirror'], ['Corner Wardrobe', 360000, [1.2, 1.2], 'corner'], ['Open Walk-in Rack Wardrobe', 300000, [2, .5], 'open'], ['Louvre-Door Wardrobe', 230000, [1.2, .55], 'louvre'],
  ['Gold-Trim Luxury Wardrobe', 720000, [2.4, .65], 'gold'], ['Kids Wardrobe', 120000, [.9, .5], 'kids'], ['Classic Armoire', 450000, [1.2, .65], 'armoire'],
]);

/* Televisions: type × screen size × bezel colour */
const TV_SIZES: [number, number, number][] = [[24, .55, 60000], [32, .75, 140000], [43, 1, 250000], [50, 1.15, 340000], [55, 1.28, 420000], [65, 1.5, 700000], [75, 1.7, 1100000], [85, 1.95, 1900000], [98, 2.25, 3400000]];
const TV_TYPES: [string, string, number, number[], string][] = [['LED Smart TV', 'led', 1, [24, 32, 43, 50, 55, 65, 75], '📺'], ['QLED 4K TV', 'qled', 1.5, [43, 50, 55, 65, 75, 85], '📺'], ['OLED TV', 'oled', 2.2, [55, 65, 75, 85, 98], '📺'],
  ['Curved Gaming TV', 'curved', 1.4, [43, 55, 65], '🖥️'], ['Mini-LED 8K TV', 'mini', 1.9, [65, 75, 85, 98], '📺']];
TV_TYPES.forEach(([n, st, m, sizes]) => sizes.forEach(sz => { const r = TV_SIZES.find(x => x[0] === sz)!; addV('tech', 'Televisions', 'tv', '📺', TVC, [[`${sz}" ${n}`, Math.round(r[2] * m / 1000) * 1000, [r[1], .1], `${st}:${sz}`]]); }));

/* TV stands, tables, desks & storage */
addV('furniture', 'TV Stands', 'tvstand', '📺', WOOD, [
  ['Low TV Stand', 95000, [1.5, .45], 'low'], ['Drawer TV Console', 160000, [1.8, .45], 'drawers'], ['TV Wall Unit with Shelves', 480000, [2.6, .5], 'wall'], ['Floating TV Cabinet', 210000, [1.8, .35], 'float'], ['Corner TV Stand', 130000, [1, .7], 'corner'], ['Glass-Door TV Cabinet', 260000, [1.6, .5], 'glass'],
]);
addV('furniture', 'Tables & Storage', 'table', '🪵', WOOD, [
  ['Round Coffee Table', 75000, [1, 1], 'coffee_round'], ['Rectangular Coffee Table', 75000, [1.1, .6], 'coffee_rect'], ['Glass-Top Coffee Table', 120000, [1.1, .6], 'coffee_glass'], ['4-Seat Dining Table', 220000, [1.3, .9], 'dine'], ['6-Seat Dining Table', 380000, [1.8, .9], 'dine'],
  ['8-Seat Dining Table', 620000, [2.4, 1], 'dine'], ['Round Dining Table', 300000, [1.3, 1.3], 'dine_round'], ['Study Desk', 90000, [1.2, .6], 'desk'], ['L-Shaped Corner Desk', 240000, [1.6, 1.4], 'desk_l'], ['Standing Desk', 320000, [1.4, .7], 'desk_stand'],
  ['Side Table', 28000, [.5, .5], 'side'], ['Bedside Table', 38000, [.5, .4], 'bedside'], ['Dresser with Mirror', 190000, [1.2, .5], 'dresser'], ['Bookshelf', 85000, [1, .35], 'shelf'], ['Chest of Drawers', 110000, [1, .5], 'drawers'], ['Shoe Rack', 25000, [.8, .3], 'shoe'],
]);

/* Kitchen: appliances, units and gadgets */
addV('kitchen', 'Fridges & Freezers', 'fridge', '🧊', APPL, [
  ['Single-Door Fridge', 380000, [.6, .65], 'single'], ['Double-Door Fridge', 780000, [.75, .7], 'double'], ['Side-by-Side Fridge', 1100000, [.95, .75], 'sbs'], ['French-Door Fridge', 1500000, [.95, .75], 'french'], ['Chest Freezer', 420000, [1, .6], 'chest'], ['Mini Bar Fridge', 190000, [.5, .5], 'mini'],
]);
addV('kitchen', 'Cookers & Ovens', 'cooker', '🍳', APPL, [
  ['4-Burner Gas Cooker', 280000, [.6, .6], 'gas4'], ['5-Burner Gas Range', 520000, [.9, .65], 'gas5'], ['6-Burner Range Cooker', 900000, [1.2, .65], 'gas6'], ['Induction Cooker', 380000, [.6, .6], 'induct'], ['Built-in Oven', 450000, [.6, .55], 'oven'], ['Microwave Oven', 85000, [.5, .4], 'micro'], ['Extractor Hood', 160000, [.9, .5], 'hood'],
]);
addV('kitchen', 'Washers & Dishwashers', 'laundry', '🧺', APPL, [
  ['Dishwasher', 600000, [.6, .6], 'dish'], ['Front-Load Washing Machine', 520000, [.6, .6], 'washer'], ['Twin-Tub Washing Machine', 190000, [.7, .5], 'twin'], ['Tumble Dryer', 480000, [.6, .6], 'dryer'],
]);
addV('kitchen', 'Kitchen Units', 'cabinet', '🗄️', KITCH, [
  ['Base Cabinet Unit', 110000, [.6, .6], 'base'], ['Wall Cabinet Unit', 90000, [.8, .35], 'wall'], ['Kitchen Island', 520000, [1.8, .9], 'island'], ['Double Sink Unit', 240000, [1.4, .6], 'sink'], ['Breakfast Bar Counter', 340000, [1.6, .6], 'bar'],
]);
addV('kitchen', 'Kitchen Gadgets', 'gadget', '☕', APPL, [
  ['Air Fryer', 85000, [.35, .35], 'airfryer'], ['Blender', 45000, [.25, .25], 'blender'], ['Toaster', 28000, [.3, .2], 'toaster'], ['Electric Kettle', 22000, [.25, .2], 'kettle'], ['Coffee Machine', 190000, [.3, .35], 'coffee'], ['Stand Mixer', 130000, [.3, .25], 'mixer'],
]);

/* ───────── Fashion Boutique: clothes (garments × colours) ─────────
   Sold ONLY in person at a Fashion Boutique (never in the Online Mall). Ids are `fas_<colour>_<garment>`; stable, never rename.
   Step 1 = clothes, step 2 = shoes, step 3 = jewellery & accessories (same generator, new rows). */
const CLOTH_COLS: Pal = [['Black', '#1a1b20'], ['White', '#f2f2f0'], ['Navy Blue', '#1d2a4a'], ['Royal Blue', '#2a4fa3'], ['Sky Blue', '#79b4d8'], ['Emerald Green', '#1f7d5a'], ['Olive Green', '#5a6b3a'],
  ['Burgundy', '#7d1f33'], ['Red', '#c0262e'], ['Blush Pink', '#e0a3b3'], ['Mustard Yellow', '#c9992b'], ['Burnt Orange', '#d4702a'], ['Royal Purple', '#6b3fa0'], ['Chocolate Brown', '#6b4a2f'], ['Ash Grey', '#8c8d8a'], ['Cream', '#e6dcc6']];
type G = [label: string, emoji: string, cost: number, sub: string];
function addF(g: 'm' | 'w' | 'u', rows: G[], pal: Pal = CLOTH_COLS) {
  rows.forEach(([label, e, cost, sub]) => pal.forEach(([cn, hex]) => {
    const name = `${cn} ${label}`, id = 'fas_' + slug(name);
    if (taken.has(id)) return; taken.add(id);
    out.push({ id, cat: 'fashion', name, e, cost, sub, col: hex, colName: cn, g });
  }));
}
addF('m', [
  ["Men's T-Shirt", '👕', 9000, 'Tops'], ["Men's Polo Shirt", '👕', 16000, 'Tops'], ["Men's Button-Up Shirt", '👔', 24000, 'Tops'], ["Men's Long-Sleeve Tee", '👕', 13000, 'Tops'], ["Men's Singlet", '🎽', 6000, 'Tops'],
  ["Men's Hoodie", '🧥', 38000, 'Jackets & Hoodies'], ["Men's Sweatshirt", '🧥', 30000, 'Jackets & Hoodies'], ["Men's Bomber Jacket", '🧥', 95000, 'Jackets & Hoodies'], ["Men's Denim Jacket", '🧥', 80000, 'Jackets & Hoodies'], ["Men's Leather Jacket", '🧥', 180000, 'Jackets & Hoodies'], ["Men's Blazer", '🧥', 140000, 'Jackets & Hoodies'],
  ["Men's Slim Jeans", '👖', 42000, 'Trousers & Shorts'], ["Men's Chinos", '👖', 38000, 'Trousers & Shorts'], ["Men's Joggers", '👖', 28000, 'Trousers & Shorts'], ["Men's Cargo Pants", '👖', 45000, 'Trousers & Shorts'], ["Men's Shorts", '🩳', 18000, 'Trousers & Shorts'], ["Men's Corporate Slacks", '👖', 48000, 'Trousers & Shorts'],
  ["Senator Kaftan Set", '👘', 85000, 'Native Wear'], ["Agbada (3-piece)", '👘', 320000, 'Native Wear'], ["Dashiki Top", '👘', 32000, 'Native Wear'], ["Ankara Shirt", '👕', 28000, 'Native Wear'], ["Aso-Oke Set (Men)", '🧵', 280000, 'Native Wear'], ["Buba & Sokoto", '👘', 65000, 'Native Wear'],
  ["Two-Piece Suit (Men)", '🤵', 380000, 'Suits & Formal'], ["Three-Piece Suit (Men)", '🤵', 520000, 'Suits & Formal'], ["Tuxedo (Men)", '🤵', 620000, 'Suits & Formal'], ["Waistcoat", '🦺', 55000, 'Suits & Formal'],
  ["Men's Tracksuit", '🏃', 55000, 'Sports & Casual'], ["Football Jersey (Men)", '⚽', 22000, 'Sports & Casual'], ["Men's Gym Tank", '🎽', 12000, 'Sports & Casual'], ["Men's Swim Trunks", '🩳', 15000, 'Sports & Casual'], ["Men's Pyjamas", '🛌', 20000, 'Sports & Casual'],
]);
addF('w', [
  ["Women's Crop Top", '👚', 10000, 'Tops'], ["Women's Blouse", '👚', 22000, 'Tops'], ["Women's Tank Top", '🎽', 8000, 'Tops'], ["Women's Off-Shoulder Top", '👚', 18000, 'Tops'], ["Women's Corset Top", '👚', 35000, 'Tops'], ["Women's Bodysuit", '👚', 20000, 'Tops'],
  ["Women's Hoodie", '🧥', 38000, 'Jackets & Hoodies'], ["Women's Denim Jacket", '🧥', 80000, 'Jackets & Hoodies'], ["Women's Leather Jacket", '🧥', 180000, 'Jackets & Hoodies'], ["Women's Blazer", '🧥', 120000, 'Jackets & Hoodies'], ["Long Cardigan", '🧥', 45000, 'Jackets & Hoodies'], ["Faux Fur Coat", '🧥', 340000, 'Jackets & Hoodies'],
  ["Women's High-Waist Jeans", '👖', 45000, 'Trousers & Skirts'], ["Women's Leggings", '👖', 15000, 'Trousers & Skirts'], ["Palazzo Trousers", '👖', 35000, 'Trousers & Skirts'], ["Mini Skirt", '👗', 20000, 'Trousers & Skirts'], ["Pencil Skirt", '👗', 28000, 'Trousers & Skirts'], ["Pleated Maxi Skirt", '👗', 38000, 'Trousers & Skirts'], ["Women's Shorts", '🩳', 16000, 'Trousers & Skirts'],
  ["Bodycon Dress", '👗', 45000, 'Dresses & Gowns'], ["Midi Dress", '👗', 55000, 'Dresses & Gowns'], ["Maxi Dress", '👗', 65000, 'Dresses & Gowns'], ["Mini Party Dress", '👗', 48000, 'Dresses & Gowns'], ["Wrap Dress", '👗', 52000, 'Dresses & Gowns'], ["Evening Gown", '👗', 520000, 'Dresses & Gowns'], ["Mermaid Gown", '👗', 680000, 'Dresses & Gowns'], ["Wedding Gown", '👰', 1400000, 'Dresses & Gowns'],
  ["Ankara Dress", '👗', 45000, 'Native Wear'], ["Iro & Buba Set", '👘', 90000, 'Native Wear'], ["Lace Aso-Ebi Gown", '👗', 140000, 'Native Wear'], ["Aso-Oke Set (Women)", '🧵', 260000, 'Native Wear'], ["Ankara Peplum Top", '👚', 30000, 'Native Wear'], ["Kaftan Gown", '👘', 60000, 'Native Wear'], ["Boubou Gown", '👘', 75000, 'Native Wear'],
  ["Women's Pantsuit", '🥼', 160000, 'Suits & Formal'], ["Designer Jumpsuit", '👗', 120000, 'Suits & Formal'], ["Skirt Suit", '🥼', 150000, 'Suits & Formal'],
  ["Activewear Set", '🏃‍♀️', 42000, 'Sports & Casual'], ["Sports Bra & Leggings", '🏃‍♀️', 30000, 'Sports & Casual'], ["Women's Tracksuit", '🏃‍♀️', 55000, 'Sports & Casual'], ["Swimsuit", '🩱', 30000, 'Sports & Casual'], ["Bikini Set", '👙', 24000, 'Sports & Casual'], ["Satin Nightgown", '🛌', 26000, 'Sports & Casual'],
]);

/* Step 2: shoes (styles × colours) */
const SHOE_COLS: Pal = [['Black', '#1a1b20'], ['White', '#f2f2f0'], ['Brown', '#6b4a2f'], ['Tan', '#a8703d'], ['Navy Blue', '#1d2a4a'], ['Burgundy', '#7d1f33'], ['Red', '#c0262e'], ['Nude Beige', '#d9b99b'],
  ['Gold', '#c9a23a'], ['Silver', '#b9bec4'], ['Blush Pink', '#e0a3b3'], ['Royal Blue', '#2a4fa3'], ['Emerald Green', '#1f7d5a'], ['Ash Grey', '#8c8d8a'], ['Royal Purple', '#6b3fa0'], ['Cream', '#e6dcc6']];
addF('m', [
  ["Men's Oxford Shoes", '👞', 95000, 'Shoes: Formal'], ["Men's Derby Shoes", '👞', 85000, 'Shoes: Formal'], ["Men's Loafers", '👞', 70000, 'Shoes: Formal'], ["Men's Monk-Strap Shoes", '👞', 110000, 'Shoes: Formal'], ["Men's Crocodile-Skin Shoes", '👞', 780000, 'Shoes: Formal'],
  ["Men's Sneakers", '👟', 65000, 'Shoes: Sneakers'], ["Men's Designer Sneakers", '👟', 480000, 'Shoes: Sneakers'], ["Men's High-Top Sneakers", '👟', 85000, 'Shoes: Sneakers'], ["Men's Running Shoes", '👟', 75000, 'Shoes: Sneakers'], ["Men's Canvas Shoes", '👟', 28000, 'Shoes: Sneakers'], ["Men's Limited-Edition Sneakers", '👟', 950000, 'Shoes: Sneakers'],
  ["Men's Chelsea Boots", '🥾', 120000, 'Shoes: Boots'], ["Men's Combat Boots", '🥾', 95000, 'Shoes: Boots'], ["Men's Timberland-Style Boots", '🥾', 140000, 'Shoes: Boots'],
  ["Men's Leather Sandals", '🩴', 20000, 'Shoes: Sandals & Slides'], ["Men's Slides", '🩴', 9000, 'Shoes: Sandals & Slides'], ["Men's Palm Slippers", '🩴', 12000, 'Shoes: Sandals & Slides'], ["Men's Flip-Flops", '🩴', 5000, 'Shoes: Sandals & Slides'], ["Men's Football Boots", '⚽', 70000, 'Shoes: Sandals & Slides'],
], SHOE_COLS);
addF('w', [
  ["Women's High Heels", '👠', 70000, 'Shoes: Heels'], ["Women's Stiletto Pumps", '👠', 85000, 'Shoes: Heels'], ["Women's Block Heels", '👠', 60000, 'Shoes: Heels'], ["Women's Platform Heels", '👠', 95000, 'Shoes: Heels'], ["Women's Wedge Heels", '👠', 55000, 'Shoes: Heels'], ["Women's Kitten Heels", '👠', 50000, 'Shoes: Heels'], ["Women's Designer Heels", '👠', 650000, 'Shoes: Heels'],
  ["Women's Ballet Flats", '🥿', 35000, 'Shoes: Flats'], ["Women's Loafers", '🥿', 48000, 'Shoes: Flats'], ["Women's Pointed Flats", '🥿', 40000, 'Shoes: Flats'], ["Women's Mules", '🥿', 45000, 'Shoes: Flats'],
  ["Women's Sneakers", '👟', 60000, 'Shoes: Sneakers'], ["Women's Designer Sneakers", '👟', 480000, 'Shoes: Sneakers'], ["Women's Running Shoes", '👟', 70000, 'Shoes: Sneakers'], ["Women's Chunky Platform Sneakers", '👟', 90000, 'Shoes: Sneakers'],
  ["Women's Ankle Boots", '👢', 110000, 'Shoes: Boots'], ["Women's Knee-High Boots", '👢', 160000, 'Shoes: Boots'], ["Women's Chelsea Boots", '👢', 120000, 'Shoes: Boots'],
  ["Women's Strappy Sandals", '👡', 38000, 'Shoes: Sandals & Slides'], ["Women's Gladiator Sandals", '👡', 45000, 'Shoes: Sandals & Slides'], ["Women's Slides", '🩴', 9000, 'Shoes: Sandals & Slides'], ["Women's Beaded Slippers", '🩴', 30000, 'Shoes: Sandals & Slides'], ["Women's Flip-Flops", '🩴', 5000, 'Shoes: Sandals & Slides'],
], SHOE_COLS);

/* Step 3: jewellery & accessories (pieces × metals / stones / colours) */
const METALS: Pal = [['Yellow Gold', '#d4af37'], ['White Gold', '#e8e6df'], ['Rose Gold', '#c98e83'], ['Sterling Silver', '#b9bec4'], ['Platinum', '#d9dde2'], ['Black Steel', '#26282c'], ['Antique Bronze', '#8a5a32']];
const GEMS: Pal = [['Diamond', '#e9f4ff'], ['Ruby', '#b3122f'], ['Sapphire', '#1f3f9a'], ['Emerald', '#12875a'], ['Pearl', '#f3ece0'], ['Amethyst', '#8a4fc2'], ['Topaz', '#e0a32b'], ['Onyx', '#16161a']];
const BEADS: Pal = [['Coral Red', '#d6452f'], ['Gold & Black', '#3a2f1a'], ['Royal Blue', '#2a4fa3'], ['Turquoise', '#2ab5b0'], ['White Pearl', '#f3ece0'], ['Amber', '#d98a1c'], ['Emerald Green', '#1f7d5a'], ['Purple', '#6b3fa0']];
const jw = (g: 'm' | 'w' | 'u', pal: Pal, rows: G[]) => addF(g, rows, pal);
// Necklaces, rings, bracelets, earrings (metals)
jw('w', METALS, [["Women's Chain Necklace", '📿', 180000, 'Jewellery: Necklaces'], ["Pendant Necklace", '📿', 240000, 'Jewellery: Necklaces'], ["Choker Necklace", '📿', 150000, 'Jewellery: Necklaces'], ["Layered Necklace Set", '📿', 320000, 'Jewellery: Necklaces'],
  ["Hoop Earrings", '💎', 90000, 'Jewellery: Earrings'], ["Stud Earrings", '💎', 60000, 'Jewellery: Earrings'], ["Drop Earrings", '💎', 140000, 'Jewellery: Earrings'], ["Chandelier Earrings", '💎', 220000, 'Jewellery: Earrings'],
  ["Women's Ring", '💍', 160000, 'Jewellery: Rings'], ["Band Ring Set", '💍', 120000, 'Jewellery: Rings'], ["Women's Bangle", '📿', 130000, 'Jewellery: Bracelets'], ["Charm Bracelet", '📿', 110000, 'Jewellery: Bracelets'], ["Anklet", '📿', 45000, 'Jewellery: Bracelets'],
  ["Women's Wristwatch", '⌚', 380000, 'Watches'], ["Women's Luxury Watch", '⌚', 2100000, 'Watches']]);
jw('m', METALS, [["Men's Chain", '⛓️', 220000, 'Jewellery: Necklaces'], ["Cuban Link Chain", '⛓️', 650000, 'Jewellery: Necklaces'], ["Dog-Tag Pendant", '📿', 130000, 'Jewellery: Necklaces'],
  ["Men's Signet Ring", '💍', 280000, 'Jewellery: Rings'], ["Men's Band Ring", '💍', 170000, 'Jewellery: Rings'], ["Men's Bracelet", '📿', 120000, 'Jewellery: Bracelets'], ["Men's Cuff Bangle", '📿', 160000, 'Jewellery: Bracelets'], ["Men's Stud Earring", '💎', 70000, 'Jewellery: Earrings'],
  ["Cufflinks", '🔗', 160000, 'Jewellery: Pins & Cufflinks'], ["Tie Pin", '📌', 60000, 'Jewellery: Pins & Cufflinks'], ["Lapel Pin", '📌', 45000, 'Jewellery: Pins & Cufflinks'],
  ["Men's Wristwatch", '⌚', 420000, 'Watches'], ["Men's Luxury Watch", '⌚', 1800000, 'Watches'], ["Pocket Watch", '🕰️', 540000, 'Watches']]);
// Gemstone pieces
jw('w', GEMS, [["Gemstone Necklace", '📿', 650000, 'Jewellery: Gemstones'], ["Gemstone Earrings", '💎', 520000, 'Jewellery: Gemstones'], ["Gemstone Ring", '💍', 780000, 'Jewellery: Gemstones'], ["Gemstone Bracelet", '📿', 590000, 'Jewellery: Gemstones'], ["Tiara", '👑', 1500000, 'Jewellery: Gemstones']]);
jw('m', GEMS, [["Men's Gemstone Ring", '💍', 720000, 'Jewellery: Gemstones'], ["Men's Gemstone Cufflinks", '🔗', 380000, 'Jewellery: Gemstones']]);
// Traditional beads
jw('u', BEADS, [["Beaded Necklace", '📿', 55000, 'Jewellery: Beads'], ["Beaded Bracelet", '📿', 25000, 'Jewellery: Beads'], ["Beaded Anklet", '📿', 20000, 'Jewellery: Beads'], ["Chief's Coral Beads", '📿', 280000, 'Jewellery: Beads'], ["Beaded Crown", '👑', 160000, 'Jewellery: Beads']]);
// Bags, hats, eyewear, belts, scarves (colours)
jw('w', SHOE_COLS, [["Handbag", '👜', 85000, 'Bags'], ["Designer Handbag", '👜', 1500000, 'Bags'], ["Clutch Bag", '👛', 60000, 'Bags'], ["Tote Bag", '👜', 55000, 'Bags'], ["Crossbody Bag", '👜', 70000, 'Bags'], ["Mini Bag", '👜', 95000, 'Bags'],
  ["Gele (Head Tie)", '🧕', 30000, 'Hats & Headwear'], ["Wide-Brim Hat", '👒', 35000, 'Hats & Headwear'], ["Fascinator", '🎩', 60000, 'Hats & Headwear'], ["Silk Headscarf", '🧣', 20000, 'Hats & Headwear'], ["Hair Band Set", '🎀', 8000, 'Hats & Headwear'],
  ["Cat-Eye Sunglasses", '🕶️', 45000, 'Eyewear'], ["Oversized Sunglasses", '🕶️', 60000, 'Eyewear'], ["Designer Sunglasses", '🕶️', 380000, 'Eyewear'], ["Women's Waist Belt", '🪢', 30000, 'Belts & Scarves'], ["Silk Scarf", '🧣', 20000, 'Belts & Scarves'], ["Designer Scarf", '🧣', 180000, 'Belts & Scarves'], ["Shawl", '🧣', 40000, 'Belts & Scarves']]);
jw('m', SHOE_COLS, [["Men's Backpack", '🎒', 35000, 'Bags'], ["Leather Briefcase", '💼', 120000, 'Bags'], ["Messenger Bag", '👜', 65000, 'Bags'], ["Duffel Bag", '🧳', 70000, 'Bags'], ["Leather Wallet", '👛', 25000, 'Bags'],
  ["Fila Cap (Yoruba)", '🎩', 20000, 'Hats & Headwear'], ["Baseball Cap", '🧢', 9000, 'Hats & Headwear'], ["Beanie", '🧶', 6500, 'Hats & Headwear'], ["Fedora Hat", '🎩', 45000, 'Hats & Headwear'], ["Bucket Hat", '👒', 12000, 'Hats & Headwear'], ["Kufi Cap", '🧢', 15000, 'Hats & Headwear'],
  ["Aviator Sunglasses", '🕶️', 55000, 'Eyewear'], ["Wayfarer Sunglasses", '🕶️', 40000, 'Eyewear'], ["Designer Shades", '🕶️', 160000, 'Eyewear'], ["Leather Belt", '🪢', 18000, 'Belts & Ties'], ["Designer Belt", '🪢', 220000, 'Belts & Ties'], ["Necktie", '👔', 12000, 'Belts & Ties'], ["Bow Tie", '🎀', 8000, 'Belts & Ties'], ["Pocket Square", '🧣', 10000, 'Belts & Ties'], ["Suspenders", '🪢', 14000, 'Belts & Ties']]);

WEAPONS.forEach(w => out.push({ id: weaponItemId(w.id), cat: 'arms', name: w.name, e: w.icon, cost: w.price, tag: 'weapon' }));
/* Car parts come ONLY from a chop shop job (lib/chop.ts). No store lists the 'parts' category and the Online Mall refuses tag 'part'. */
PARTS.forEach(p => out.push({ id: p.id, cat: 'parts', name: p.name, e: p.e, cost: p.cost, tag: 'part' }));
export const CATALOG: Item[] = out;
const BY_ID = new Map(CATALOG.map(i => [i.id, i]));
export const itemById = (id: string) => BY_ID.get(id);

/* Which shops sell what. The Market is the big one (Wuse Market has a bit of everything); the Supermarket sells everyday goods. */
export const STORE_CATS: Partial<Record<BusinessType, CatId[]>> = {
  Market: ['food', 'grocery', 'toiletry', 'household', 'kitchen', 'furniture', 'decor', 'tech', 'style', 'luxury', 'kids'],
  Supermarket: ['food', 'grocery', 'toiletry', 'household', 'kitchen', 'kids', 'decor'],
  'Petrol Station': ['food'],
  Pharmacy: ['toiletry', 'household', 'kids'],
  'Fashion Boutique': ['fashion', 'style'],
  Salon: ['style', 'toiletry'],
  Barber: ['style', 'toiletry'],
  'Gun Shop': ['arms'],
};
export const storeCats = (type: string): CatId[] => STORE_CATS[type as BusinessType] || [];
export const storeItems = (type: string): Item[] => { const c = storeCats(type); return CATALOG.filter(i => c.includes(i.cat) && !i.variant); };
export const storeItem = (type: string, id: string): Item | undefined => { const i = BY_ID.get(id); return i && !i.variant && storeCats(type).includes(i.cat) ? i : undefined; };
/** Things you can only buy in person at a shop that stocks them: never in the Online Mall. */
export const inPersonOnly = (i: { cat: string; tag?: string }) => i.tag === 'part' || i.cat === 'fashion';
export const MAX_STACK = 99;
