import { prisma } from './prisma';
import { AD_SLOTS, type AdSlot } from './adSlots';

/* Billboard prices = the defaults in lib/adSlots.ts, overridden by whatever the admin saved at /adminad (table AdSlotPrice).
   If the table is not there yet (migration not run) the defaults are used, so booking keeps working. */
export async function getSlots(): Promise<AdSlot[]> {
  try {
    const rows = await prisma.adSlotPrice.findMany();
    const m = new Map<number, number>(rows.map((r: { slot: number; perDay: number }) => [r.slot, r.perDay] as [number, number]));
    return AD_SLOTS.map(s => (m.has(s.index) ? { ...s, perDay: m.get(s.index)! } : s));
  } catch { return AD_SLOTS; }
}
