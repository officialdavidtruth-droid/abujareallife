import { weatherAt } from './worldClock';
import { activeCityEvents, districtProfile } from './livingCity';

// Base fares. Rain pushes taxi demand (price) up and bike demand down; traffic events add a surcharge.
// The city bus is deliberately the cheapest way around: it is shared, so the fare is a fraction of a taxi and drops further when the bus is full.
export const PRICE = { taxi: 2500, bike: 800, bus: 200, keke: 500, shuttle: 6000, train: 1500, private_driver: 15000 } as const;
export type Kind = keyof typeof PRICE;
export const BUS_MIN_FARE = 100;

export async function fareFor(kind: Kind, district?: string, riders = 1) {
  const wx = weatherAt(), events: { kind: string }[] = await activeCityEvents().catch(() => []);
  const rain = wx.rain > 0.5, storm = !!wx.storm;
  const surge = events.some(e => e.kind === 'traffic' || e.kind === 'flood') ? 1.2 : 1;
  const weather = kind === 'taxi' || kind === 'private_driver' ? (rain ? 1.3 : 1) : kind === 'bike' || kind === 'keke' ? (storm ? 1.5 : rain ? 0.85 : 1) : 1;
  const wealth = district ? 0.8 + districtProfile(district).wealth / 250 : 1; // Maitama costs more than Kubwa
  if (kind === 'bus') { // fare is shared: every extra passenger on board takes 5% off, up to 40%, and it never goes below the minimum fare
    const share = 1 - Math.min(0.4, 0.05 * Math.max(0, Math.min(40, Math.floor(riders) || 1) - 1));
    return Math.max(BUS_MIN_FARE, Math.round(PRICE.bus * wealth * share / 10) * 10);
  }
  return Math.round(PRICE[kind] * surge * weather * wealth / 50) * 50;
}
