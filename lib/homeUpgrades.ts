/* Home upgrades: rooms and luxury items you add to your home. The server owns the prices (app/api/home).
   Owned upgrades are stored as hidden inventory rows (itemKey "home_<id>"), so they need no database migration and never show up as sellable stuff. */
export type Upgrade = { id: string; kind: 'room' | 'luxury'; name: string; e: string; price: number; blurb: string; needs?: string };
export const UPGRADES: Upgrade[] = [
  { id: 'kids_room', kind: 'room', name: "Kids' bedroom", e: '🛏️', price: 12_000_000, blurb: 'Builds a new wing on the east side: two beds, a desk, a toy box and a play rug.' },
  { id: 'family', kind: 'room', name: 'Family moves in', e: '👨‍👩‍👧‍👦', price: 2_000_000, needs: 'kids_room', blurb: 'Ada, Chidi and Amara move into your home and live their own daily routine.' },
  { id: 'massage', kind: 'luxury', name: 'Massage chair', e: '💆', price: 4_500_000, blurb: 'Melt away tiredness. Restores energy and lifts your mood.' },
  { id: 'aquarium', kind: 'luxury', name: 'Aquarium', e: '🐠', price: 6_000_000, blurb: 'A lit fish tank on the south wall. Calming to watch.' },
  { id: 'treadmill', kind: 'luxury', name: 'Home treadmill', e: '🏃', price: 3_500_000, blurb: 'Work out at home, any hour. Builds fitness and fun.' },
];
export const upgradeById = (id: string) => UPGRADES.find(u => u.id === id);
export const homeKey = (id: string) => 'home_' + id;
