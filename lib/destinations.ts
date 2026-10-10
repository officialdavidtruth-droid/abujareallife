/* Every place a ride can take you. Pure data (no React / three), shared by the street taxis, the bus and the "order a ride for a player" panel.
   World coordinates only: the raw CITY coordinates are on a smaller grid and must never be used as positions. */
import { CITY } from './cityData';
import { GRID } from './roadRoute';
import type { CityBuilding } from './cityTypes';

const ev = (n: number) => ((n % 2) + 2) % 2 === 0;

/** The city's buildings on the real 22 m street grid (this is the layout the world is drawn with). */
/* Layout inside each 16 m block: the outer 2.8 m is public pavement (pedestrians, kerbside taxis), so a building can use at most 10.4 x 10.4 m.
   Before, every building filled that square and there was no room for anything else. Now (by hash, same every session):
     lot    ~45%  building pushed to the back (6 m deep), a 4.4 m fenced forecourt in front with parked cars and a gate in line with the door
     alley  ~35%  building 6.8 m wide pushed to one side, leaving a 3.6 m walled alley beside it (dead end, a gap at the back)
   Landmarks and big public buildings keep the full footprint. */
const BUILDABLE = 5.2;   // half of the 10.4 m buildable square
const hsl = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };
const FULL = new Set(['Government', 'Hospital', 'Airport', 'Rail Station', 'Police Station', 'Jail', 'Gun Shop']);
export const BUILDS_WORLD: CityBuilding[] = CITY.buildings.map((b: CityBuilding) => {
  const bx = Math.round((b.x - 5.5) / 11), bz = Math.round((b.z - 5.5) / 11);
  const cx = bx * GRID + 11 + (ev(bx) ? .5 : -.5), cz = bz * GRID + 11 + (ev(bz) ? .5 : -.5), w = b.w * 1.15, d = b.d * 1.4;
  const r = hsl(b.id + 'lay');
  if (b.business && !FULL.has(b.business.type)) {
    if (r < .45) return { ...b, x: cx, z: cz - BUILDABLE + 3, w, d: 6, lay: 'lot' as const, front: cz + BUILDABLE };
    if (r < .8) { const side: 1 | -1 = hsl(b.id + 'sd') < .5 ? 1 : -1; return { ...b, x: cx - side * (BUILDABLE - 3.4), z: cz, w: 6.8, d, lay: 'alley' as const, side }; }
  }
  return { ...b, x: cx, z: cz, w, d };
});

export type Dest = { id: string; name: string; type: string; district: string; x: number; z: number };

const ICONS: Record<string, string> = {
  Bank: '🏦', Restaurant: '🍽️', Hotel: '🏨', Hospital: '🏥', Supermarket: '🛒', Salon: '💇', Barber: '💈', Gym: '🏋️', Mechanic: '🔧', 'Car Dealer': '🚘',
  School: '🏫', Office: '🏢', Nightclub: '🪩', Market: '🧺', 'Petrol Station': '⛽', Pharmacy: '💊', Cinema: '🎬', 'Tech Company': '💻', 'Estate Agency': '🏠',
  Logistics: '📦', Government: '🏛️', Airport: '✈️', 'Rail Station': '🚉', 'Police Station': '🚓', Jail: '⛓️', 'Gun Shop': '🔫', District: '📍',
};
export const destIcon = (type: string) => ICONS[type] || '🏢';

/** Every building with a business, as a stop on the pavement in front of its door (doors face +z). */
const buildingDests: Dest[] = BUILDS_WORLD.filter(b => b.business).map(b => ({
  id: b.business!.id, name: b.business!.name, type: b.business!.type, district: b.business!.district, x: b.x, z: (b.front ?? b.z + b.d / 2) + 1.8,   // the public pavement in front of the door (for a car-park building that is outside the fence)
}));

/** One stop per district (the middle of its buildings), so "take me to Wuse" still works. */
const districtDests: Dest[] = CITY.districts.flatMap(d => {
  const mine = buildingDests.filter(b => b.district === d.name); if (!mine.length) return [];
  return [{ id: `district-${d.name}`, name: d.name, type: 'District', district: d.name, x: mine.reduce((a, b) => a + b.x, 0) / mine.length, z: mine.reduce((a, b) => a + b.z, 0) / mine.length }];
});

export const DEST_DISTRICTS: string[] = CITY.districts.map(d => d.name).filter(n => districtDests.some(x => x.name === n));
export const ALL_DESTS: Dest[] = [...districtDests, ...buildingDests.sort((a, b) => a.district.localeCompare(b.district) || a.name.localeCompare(b.name))];
export const BUILDING_DESTS = buildingDests;

/** Search by name / type / district. */
export function filterDests(list: Dest[], q: string, district: string): Dest[] {
  const s = q.trim().toLowerCase();
  return list.filter(d => (!district || d.district === district) && (!s || `${d.name} ${d.type} ${d.district}`.toLowerCase().includes(s)));
}

/** The pavement spot nearest to any world point, so a player can be a destination ("meet me here"). */
export const pointDest = (name: string, x: number, z: number): Dest => ({ id: 'point', name, type: 'Meeting point', district: '', x, z });
