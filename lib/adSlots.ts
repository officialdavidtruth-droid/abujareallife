/* Billboard advertising: the sellable slots, prices, dates and ad-text rules. Used by the booking pages, the API and (slot order only) the 3D city.
   The slot index is the position in BILLBOARDS (components/CityScenery.tsx): keep the two lists in the same order. */
export type AdSlot = { index: number; name: string; where: string; perDay: number; views: string };

/* PRICES (naira per day). Change them here. */
export const AD_SLOTS: AdSlot[] = [
  { index: 0, name: 'City Centre North', where: 'Main road, near the city centre', perDay: 8000, views: 'Very high traffic' },
  { index: 1, name: 'City Centre South', where: 'Main road, near the city centre', perDay: 8000, views: 'Very high traffic' },
  { index: 2, name: 'Central Crossroads East', where: 'Busy junction, east side', perDay: 6000, views: 'High traffic' },
  { index: 3, name: 'Central Crossroads West', where: 'Busy junction, west side', perDay: 6000, views: 'High traffic' },
  { index: 4, name: 'Boulevard East', where: 'Long straight road, east', perDay: 4000, views: 'Medium traffic' },
  { index: 5, name: 'Boulevard North', where: 'Long straight road, north', perDay: 4000, views: 'Medium traffic' },
];
export const slotOf = (i: unknown) => AD_SLOTS.find(s => s.index === Number(i));

export const DURATIONS = [1, 3, 7, 14, 30] as const;
export const MAX_ADVANCE_DAYS = 90;
export const HOLD_MINUTES = 60;   // an unpaid booking holds its dates this long
/** 7+ days: 10% off. 14+: 15% off. 30: 20% off. */
export const discountFor = (days: number) => (days >= 30 ? 20 : days >= 14 ? 15 : days >= 7 ? 10 : 0);
export function priceFor(slot: AdSlot, days: number) { const gross = slot.perDay * days; return Math.round(gross * (100 - discountFor(days)) / 100); }

export const AD_COLORS = ['#1d7654', '#c9831f', '#2c5aa0', '#7a2fb0', '#b3261e', '#0f766e', '#111827', '#be185d'];

/* Dates are Lagos calendar days (UTC+1, no daylight saving) stored as plain DATEs: 'YYYY-MM-DD'. */
export const lagosToday = () => new Date(Date.now() + 3600_000).toISOString().slice(0, 10);
export const addDays = (ymd: string, n: number) => { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const isYmd = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
export const toDateOnly = (ymd: string) => new Date(ymd + 'T00:00:00Z');
export const ymdOf = (d: Date) => d.toISOString().slice(0, 10);

const clean = (s: unknown, max: number) => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const BLOCK = /\b(porn|xxx|nude|escort|sex\s?(shop|toy)|casino\s?bonus|forex\s?signal|investment\s?double|double\s?your\s?money|ponzi|loan\s?app|betting\s?tip|fuck|shit|cocaine|heroin|weed\s?for\s?sale)\b/i;
export type AdText = { title: string; sub: string; contact: string; website: string; color: string };
export function checkAdText(b: Record<string, unknown>): { ok: true; v: AdText } | { ok: false; message: string } {
  const title = clean(b.title, 28), sub = clean(b.sub, 44), contact = clean(b.contact, 40);
  let website = clean(b.website, 80).toLowerCase(); const color = AD_COLORS.includes(String(b.color)) ? String(b.color) : AD_COLORS[0];
  if (title.length < 2) return { ok: false, message: 'Write a headline (2 to 28 characters).' };
  if (sub.length < 2) return { ok: false, message: 'Write a short tagline (2 to 44 characters).' };
  if (BLOCK.test(title + ' ' + sub + ' ' + contact)) return { ok: false, message: 'This text is not allowed on a billboard. Adult, gambling-bonus, get-rich-quick and abusive ads are not accepted.' };
  if (website) { if (!/^https?:\/\//.test(website)) website = 'https://' + website; if (!/^https?:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/.test(website)) return { ok: false, message: 'That website address does not look right.' }; }
  return { ok: true, v: { title, sub, contact, website, color } };
}
export const naira = (n: number) => '₦' + n.toLocaleString('en-NG');
