/* Billboard advertising: the sellable slots, prices, dates and ad-text rules. Used by the booking pages, the API and (slot order only) the 3D city.
   The slot index is the position in BILLBOARDS (components/CityScenery.tsx): keep the two lists in the same order. */
export type AdSlot = { index: number; name: string; where: string; perDay: number; views: string };

/* DEFAULT PRICES (naira per day). The admin changes the real prices at /adminad (stored in the AdSlotPrice table, 0 = free); these are only used for a board the admin has not priced yet. */
/* Each board is named after the real in-game building it stands next to (nearest business building to the board's post in the 3D city),
   and "views" uses the game's own district traffic figure (lib/livingCity.ts). If you move a board in components/CityScenery.tsx, rename it here. */
export const AD_SLOTS: AdSlot[] = [
  { index: 0, name: 'Central Area Market', where: 'By Central Area Market, Central Area crossroads', perDay: 8000, views: 'Central Area · 90% district traffic' },
  { index: 1, name: 'Central Area Logistics', where: 'By Central Area Logistics, Central Area crossroads', perDay: 8000, views: 'Central Area · 90% district traffic' },
  { index: 2, name: 'National Civic Centre', where: 'Next to the National Civic Centre, Central Area', perDay: 6000, views: 'Central Area · 90% district traffic' },
  { index: 3, name: 'Central Area School', where: 'By Central Area School, Central Area crossroads', perDay: 6000, views: 'Central Area · 90% district traffic' },
  { index: 4, name: 'Jabi Market', where: 'By Jabi Market, east of the National Civic Centre', perDay: 4000, views: 'Jabi · 82% district traffic' },
  { index: 5, name: 'Garki Gun Shop', where: 'By Garki Gun Shop, south of the Central Area', perDay: 4000, views: 'Garki · 86% district traffic' },
];
export const slotOf = (i: unknown) => AD_SLOTS.find(s => s.index === Number(i));

export const DURATIONS = [1, 3, 7, 14, 30] as const;
export const MAX_ADVANCE_DAYS = 90;
export const HOLD_MINUTES = 60;   // an unpaid booking holds its dates this long
/** 7+ days: 10% off. 14+: 15% off. 30: 20% off. */
export const discountFor = (days: number) => (days >= 30 ? 20 : days >= 14 ? 15 : days >= 7 ? 10 : 0);
export function priceFor(slot: AdSlot, days: number) { const gross = slot.perDay * days; return Math.round(gross * (100 - discountFor(days)) / 100); }

/* Flyer pictures. The 3D board face is 5.2 x 2.3 metres, so every uploaded flyer is turned (in the advertiser's browser) into a picture of exactly this ratio:
   it then maps 1:1 onto the board and can never look stretched. */
export const AD_IMG_W = 1600, AD_IMG_H = 708;          // 1600 / 708 = 2.26 = 5.2 / 2.3
export const AD_IMG_MAX_BYTES = 900_000;
export const priceLabel = (n: number) => (n <= 0 ? 'FREE' : '₦' + n.toLocaleString('en-NG'));
export const MIN_PAID_PER_DAY = 100;                   // Paystack will not charge tiny amounts: a price is either 0 or at least this

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
export function checkAdText(b: Record<string, unknown>, hasImage = false): { ok: true; v: AdText } | { ok: false; message: string } {
  const title = clean(b.title, 28), sub = clean(b.sub, 44), contact = clean(b.contact, 40);
  let website = clean(b.website, 80).toLowerCase(); const color = AD_COLORS.includes(String(b.color)) ? String(b.color) : AD_COLORS[0];
  if (title.length < 2) return { ok: false, message: 'Write a headline (2 to 28 characters).' };
  if (!hasImage && sub.length < 2) return { ok: false, message: 'Write a short tagline (2 to 44 characters).' };
  if (BLOCK.test(title + ' ' + sub + ' ' + contact)) return { ok: false, message: 'This text is not allowed on a billboard. Adult, gambling-bonus, get-rich-quick and abusive ads are not accepted.' };
  if (website) { if (!/^https?:\/\//.test(website)) website = 'https://' + website; if (!/^https?:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/.test(website)) return { ok: false, message: 'That website address does not look right.' }; }
  return { ok: true, v: { title, sub, contact, website, color } };
}
export const naira = (n: number) => '₦' + n.toLocaleString('en-NG');
