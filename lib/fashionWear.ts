// Fashion step 4: what a bought garment does when you wear it (see Wardrobe.tsx). Pure helpers, shared by client and server.
import { itemById, type Item } from './catalog';
import type { Look } from './characterModels';
import { applyOutfitModel, outfitOk } from './characterModels';

export type ShoeStyle = 'sneaker' | 'dress' | 'heel' | 'sandal' | 'boot';
export type Wear =
  | { kind: 'outfit'; model: string }   // a top / dress / full outfit: picks the 3D garment and its colour
  | { kind: 'bottom' }                  // trousers / skirts: sets the bottoms colour
  | { kind: 'shoes'; style: ShoeStyle } // shoes: style + colour
  | { kind: 'acc'; acc: string }        // jewellery, watches, bags, hats, glasses, belts, ties: drawn by humanRig ('kind' of accessory)
  | null;

const SHOE_STYLE: [RegExp, ShoeStyle][] = [[/Formal|Flats/, 'dress'], [/Sneakers/, 'sneaker'], [/Boots/, 'boot'], [/Heels/, 'heel'], [/Sandals/, 'sandal']];
const MEN: [RegExp, string][] = [[/Hoodie|Sweatshirt|Tracksuit/, 'hoodie'], [/Bomber|Denim Jacket|Leather Jacket/, 'bomber'], [/Blazer|Suit|Tuxedo|Waistcoat/, 'suit'], [/Agbada|Aso-Oke|Buba/, 'agbada'],
  [/Senator|Kaftan|Dashiki|Ankara Shirt/, 'kaftan'], [/Jersey|Gym Tank|Swim|Singlet/, 'jersey'], [/Polo|Button-Up/, 'polo']];
const WOMEN: [RegExp, string][] = [[/Hoodie/, 'hoodie'], [/Pantsuit|Skirt Suit|Blazer|Denim Jacket|Leather Jacket|Cardigan|Fur Coat/, 'blazer'], [/Jumpsuit/, 'designer'], [/Evening|Mermaid|Wedding/, 'gown'],
  [/Ankara|Iro|Aso-Ebi|Aso-Oke|Boubou|Kaftan|Peplum/, 'ankara'], [/Dress|Nightgown/, 'dress'], [/Activewear|Sports Bra|Tracksuit|Swimsuit|Bikini/, 'active']];

const ACC: [RegExp, RegExp, string | null][] = [ // [sub, name, accessory kind]
  [/Necklaces/, /Cuban/, 'cuban'], [/Necklaces/, /Pendant|Dog-Tag/, 'pendant'], [/Necklaces/, /Choker/, 'choker'], [/Necklaces/, /./, 'chain'],
  [/Beads/, /Necklace|Coral/, 'beads'], [/Beads/, /Bracelet/, 'bangle'], [/Beads/, /Anklet/, 'anklet'], [/Beads/, /Crown/, 'crown'],
  [/Gemstones/, /Necklace/, 'gem'], [/Gemstones/, /Earrings/, 'drop'], [/Gemstones/, /Ring/, 'ring'], [/Gemstones/, /Bracelet/, 'bangle'], [/Gemstones/, /Tiara/, 'tiara'], [/Gemstones/, /Cufflinks/, 'cuff'],
  [/Earrings/, /Hoop/, 'hoop'], [/Earrings/, /Drop|Chandelier/, 'drop'], [/Earrings/, /./, 'stud'], [/Rings/, /./, 'ring'],
  [/Bracelets/, /Anklet/, 'anklet'], [/Bracelets/, /Earring/, 'stud'], [/Bracelets/, /./, 'bangle'],
  [/Pins/, /Cufflinks/, 'cuff'], [/Pins/, /./, 'pin'], [/Watches/, /Pocket/, 'pendant'], [/Watches/, /./, 'watch'],
  [/Bags/, /Wallet/, null], [/Bags/, /Backpack/, 'backpack'], [/Bags/, /Clutch/, 'clutch'], [/Bags/, /Tote/, 'tote'], [/Bags/, /Briefcase|Duffel/, 'case'], [/Bags/, /./, 'handbag'],
  [/Hats/, /Fila/, 'fila'], [/Hats/, /Baseball/, 'cap'], [/Hats/, /Beanie/, 'beanie'], [/Hats/, /Fedora/, 'fedora'], [/Hats/, /Bucket/, 'bucket'], [/Hats/, /Kufi/, 'kufi'], [/Hats/, /Wide-Brim/, 'brim'],
  [/Hats/, /Fascinator/, 'fascinator'], [/Hats/, /Gele/, 'gele'], [/Hats/, /Headscarf/, 'wrap'], [/Hats/, /Hair Band/, 'band'],
  [/Eyewear/, /./, 'shades'], [/Belts/, /Belt/, 'belt'], [/Belts/, /Scarf|Shawl/, 'scarf'], [/Belts/, /Necktie/, 'tie'], [/Belts/, /Bow Tie/, 'bowtie'], [/Belts/, /Pocket Square/, 'pin'], [/Belts/, /Suspenders/, null],
];
export function wearOf(it: Pick<Item, 'cat' | 'name' | 'sub' | 'g'>): Wear {
  if (it.cat !== 'fashion' || !it.sub) return null;
  if (/^(Jewellery|Watches|Bags|Hats|Eyewear|Belts)/.test(it.sub)) { const hit = ACC.find(([a, b]) => a.test(it.sub!) && b.test(it.name)); return hit && hit[2] ? { kind: 'acc', acc: hit[2] } : null; }
  if (it.sub.startsWith('Shoes')) return { kind: 'shoes', style: (SHOE_STYLE.find(([r]) => r.test(it.sub!)) || [, 'sneaker'])[1] as ShoeStyle };
  if (it.sub === 'Trousers & Shorts' || it.sub === 'Trousers & Skirts') return /Skirt|Palazzo|Leggings|Jeans|Shorts|Chinos|Joggers|Cargo|Slacks/.test(it.name) ? { kind: 'bottom' } : null;
  if (['Tops', 'Jackets & Hoodies', 'Native Wear', 'Suits & Formal', 'Sports & Casual', 'Dresses & Gowns'].includes(it.sub)) {
    const list = it.g === 'w' ? WOMEN : MEN, hit = list.find(([r]) => r.test(it.name));
    return { kind: 'outfit', model: hit ? hit[1] : it.g === 'w' ? 'crop' : 'tee' };
  }
  return null;
}
export const WEAR_ICON = { outfit: '👕', bottom: '👖', shoes: '👟', acc: '💍' } as const;
/** Same slot = replaces what you wear there (one hat, one necklace, one pair of shoes...). Watches, bangles, rings, pins and cufflinks each have their own slot. */
export const slotOf = (w: NonNullable<Wear>) => (w.kind === 'acc' ? 'acc:' + (['cap', 'fila', 'beanie', 'fedora', 'bucket', 'kufi', 'brim', 'wrap', 'gele', 'fascinator', 'band', 'tiara', 'crown'].includes(w.acc) ? 'head' : ['chain', 'cuban', 'choker', 'beads', 'pendant', 'gem', 'scarf'].includes(w.acc) ? 'neck' : ['hoop', 'stud', 'drop'].includes(w.acc) ? 'ears' : ['handbag', 'clutch', 'tote', 'case', 'backpack'].includes(w.acc) ? 'bag' : ['tie', 'bowtie'].includes(w.acc) ? 'tie' : w.acc) : w.kind);
/** The 'kind:#hex' string a worn accessory adds to look.acc (also used by the server to check it). */
export const accOf = (it: Item) => { const w = wearOf(it); return w?.kind === 'acc' && it.col ? `${w.acc}:${it.col}` : null; };

/** Put a bought item on a look. `worn` remembers which items so the server can check you own them. */
export function wearItem(l: Look, it: Item): Look {
  const w = wearOf(it); if (!w || !it.col) return l;
  const f = l.gender === 'f';
  if (it.g && it.g !== 'u' && it.g !== (f ? 'w' : 'm')) return l; // men's items on a man, women's on a woman
  if (w.kind !== 'outfit' && w.kind !== 'bottom' && (l.worn || []).includes(it.id)) return takeOff(l, it); // tap again to take off
  const slot = slotOf(w), worn = [...(l.worn || []).filter(id => id !== it.id && !sameSlot(id, slot)), it.id];
  if (w.kind === 'acc') return { ...l, worn, acc: [...(l.acc || []).filter(a => !sameSlot2(a, slot)), `${w.acc}:${it.col}`] };
  if (w.kind === 'shoes') return { ...l, shoeStyle: w.style, shoeColor: it.col, worn };
  if (w.kind === 'bottom') return { ...l, pants: it.col, worn };
  if (!outfitOk(w.model, f ? 'f' : 'm')) return l;
  return { ...applyOutfitModel(l, w.model), outfit: it.col, worn };
}
function sameSlot(id: string, slot: string) { const i = itemById(id); const w = i && wearOf(i); return !!w && slotOf(w) === slot; }
const sameSlot2 = (a: string, slot: string) => slotOf({ kind: 'acc', acc: a.split(':')[0] }) === slot;
/** Take a worn item off again (shoes/accessories; clothes just get replaced). */
export function takeOff(l: Look, it: Item): Look { const w = wearOf(it); if (!w) return l; const worn = (l.worn || []).filter(id => id !== it.id);
  if (w.kind === 'acc') return { ...l, worn, acc: (l.acc || []).filter(a => a !== accOf(it)) };
  if (w.kind === 'shoes') return { ...l, worn, shoeColor: undefined, shoeStyle: undefined };
  return { ...l, worn }; }
