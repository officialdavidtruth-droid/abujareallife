import type { BusinessType } from './cityTypes';

export type BusinessStatus = { open: boolean; label: 'OPEN' | 'CLOSED'; hours: string };

// Game clock is minutes since Day 1 00:00. These are intentionally simple, readable
// hours so players always know when a location can be entered.
const HOURS: Partial<Record<BusinessType, [number, number]>> = {
  Bank: [8, 16], Restaurant: [8, 23], Hotel: [0, 24], Hospital: [0, 24],
  Supermarket: [8, 22], Salon: [9, 20], Barber: [9, 20], Gym: [6, 23],
  Mechanic: [8, 19], 'Car Dealer': [8, 18], School: [7, 17], Office: [8, 18],
  Nightclub: [18, 3], Market: [7, 20], 'Petrol Station': [0, 24], Pharmacy: [8, 22],
  Cinema: [10, 23], 'Tech Company': [8, 18], 'Estate Agency': [8, 18], Logistics: [7, 22],
  Government: [8, 16], Airport: [0, 24], 'Rail Station': [5, 23], 'Police Station': [0, 24], Jail: [0, 24],
};

export function businessStatus(type: BusinessType, minute: number): BusinessStatus {
  const [start, end] = HOURS[type] || [8, 20];
  const h = ((minute / 60) % 24 + 24) % 24;
  const open = start === end || (start < end ? h >= start && h < end : h >= start || h < end);
  const fmt = (n: number) => `${String(Math.floor(n) % 24).padStart(2, '0')}:00`;
  return { open, label: open ? 'OPEN' : 'CLOSED', hours: `${fmt(start)}–${fmt(end)}` };
}
