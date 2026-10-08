/* Home upgrades: rooms, comfort/utility upgrades and luxury items you add to your home. The server owns the prices (app/api/home).
   Owned upgrades are stored as hidden inventory rows (itemKey "home_<id>"), so they need no database migration and never show up as sellable stuff.
   Every id here is read by components/Sim.tsx (GATE, applyHome, tune and the has('...') checks), so keep the two in step. */
export type Upgrade = { id: string; kind: 'room' | 'comfort' | 'luxury'; name: string; e: string; price: number; blurb: string; needs?: string };
export const UPGRADES: Upgrade[] = [
  // Rooms
  { id: 'kids_room', kind: 'room', name: "Kids' bedroom", e: '🛏️', price: 12_000_000, blurb: 'Builds a new wing on the east side: two beds, a desk, a toy box and a play rug.' },
  { id: 'family', kind: 'room', name: 'Family moves in', e: '👨‍👩‍👧‍👦', price: 2_000_000, needs: 'kids_room', blurb: 'Ada, Chidi and Amara move into your home and live their own daily routine.' },
  { id: 'south_wing', kind: 'room', name: 'South wing extension', e: '🏗️', price: 8_000_000, blurb: 'Extends your home to the south with a big open floor. Gym, cinema and office rooms go in here.' },
  { id: 'gym_room', kind: 'room', name: 'Home gym', e: '🏋️', price: 3_000_000, needs: 'south_wing', blurb: 'A weight bench and a punching bag. Lift, box and stretch without leaving home.' },
  { id: 'cinema_room', kind: 'room', name: 'Home cinema', e: '🎬', price: 5_000_000, needs: 'south_wing', blurb: 'Big screen and a sofa. Movie night and big-screen gaming, any hour.' },
  { id: 'office_room', kind: 'room', name: 'Home office & library', e: '📚', price: 4_000_000, needs: 'south_wing', blurb: 'An executive desk to run your business and a library wall to study.' },
  // Comfort & utilities (household upgrades)
  { id: 'solar', kind: 'comfort', name: 'Solar power', e: '☀️', price: 6_000_000, blurb: 'No more NEPA blackouts. Your lights stay on without fuelling the generator.' },
  { id: 'split_ac', kind: 'comfort', name: 'Split air conditioner', e: '❄️', price: 1_800_000, blurb: 'Stay cool. Your energy drains about 30% slower.' },
  { id: 'water_heater', kind: 'comfort', name: 'Water heater', e: '🚿', price: 900_000, blurb: 'Hot showers feel great: every shower lifts your mood.' },
  { id: 'smart_home', kind: 'comfort', name: 'Smart home system', e: '🏠', price: 2_500_000, blurb: 'Lights, locks and routines run themselves. All your needs fall about 12% slower.' },
  { id: 'surround', kind: 'comfort', name: 'Surround sound system', e: '🔊', price: 1_500_000, blurb: 'TV, games, music and dancing are about 35% more fun.' },
  { id: 'chef_kitchen', kind: 'comfort', name: "Chef's kitchen", e: '👨‍🍳', price: 3_000_000, blurb: 'Pro cooker and worktops. Home cooking fills you up more and is more fun.' },
  { id: 'ortho', kind: 'comfort', name: 'Orthopedic mattress', e: '🛌', price: 1_200_000, blurb: 'Full rest in less time: a night of sleep is an hour shorter.' },
  { id: 'inverter', kind: 'comfort', name: 'Inverter & battery backup', e: '🔋', price: 3_200_000, blurb: 'NEPA light-offs become rare: blackouts happen about 4x less often.' },
  { id: 'borehole', kind: 'comfort', name: 'Borehole water', e: '💧', price: 2_200_000, blurb: 'Your own clean water. You stay fresh longer: hygiene drops about 25% slower.' },
  { id: 'fridge', kind: 'comfort', name: 'Double-door fridge freezer', e: '🧊', price: 1_400_000, blurb: 'Food stays fresh and filling: hunger drops about 12% slower.' },
  { id: 'gaming_rig', kind: 'comfort', name: 'Gaming rig', e: '🕹️', price: 2_000_000, blurb: 'Smooth, fast gaming. Video games and big-screen gaming are about 30% more fun.' },
  { id: 'fibre', kind: 'comfort', name: 'Fibre internet', e: '📶', price: 1_100_000, blurb: 'No more buffering. Social media, chats and calls are about 30% more fun and social.' },
  // Luxury items
  { id: 'massage', kind: 'luxury', name: 'Massage chair', e: '💆', price: 4_500_000, blurb: 'Melt away tiredness. Restores energy and lifts your mood.' },
  { id: 'aquarium', kind: 'luxury', name: 'Aquarium', e: '🐠', price: 6_000_000, blurb: 'A lit fish tank on the south wall. Calming to watch.' },
  { id: 'treadmill', kind: 'luxury', name: 'Home treadmill', e: '🏃', price: 3_500_000, blurb: 'Work out at home, any hour. Builds fitness and fun.' },
];
export const upgradeById = (id: string) => UPGRADES.find(u => u.id === id);
export const homeKey = (id: string) => 'home_' + id;
