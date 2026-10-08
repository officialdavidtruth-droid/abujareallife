/* Phones: every character has one. The grade of the phone decides what its apps can do. Shared by the server (which enforces it) and the Messages app (which shows it).
   The three smartphones are the same items sold in the Tech store, so buying one there upgrades your phone too. */
export type PhoneTier = 0 | 1 | 2 | 3;
export type Phone = { tier: PhoneTier; itemId: string; name: string; e: string; maxLen: number; maxChats: number; read: boolean; maps: boolean; location: boolean; cash: boolean; perks: string[] };
export const PHONES: Phone[] = [
  { tier: 0, itemId: '', name: 'Basic phone', e: '📟', maxLen: 140, maxChats: 3, read: false, maps: false, location: false, cash: false, perks: ['Text messages (140 characters)', 'Up to 3 chats'] },
  { tier: 1, itemId: 'tec_budget_smartphone', name: 'Budget smartphone', e: '📱', maxLen: 300, maxChats: 999, read: true, maps: true, location: false, cash: false, perks: ['Unlimited chats', 'Longer texts (300)', 'Read receipts ✓✓', 'Maps: navigate to shared locations'] },
  { tier: 2, itemId: 'tec_mid_range_smartphone', name: 'Mid-range smartphone', e: '📱', maxLen: 500, maxChats: 999, read: true, maps: true, location: true, cash: false, perks: ['Everything in Budget', 'Share your live location 📍', 'Texts up to 500'] },
  { tier: 3, itemId: 'tec_flagship_smartphone', name: 'Flagship smartphone', e: '📲', maxLen: 800, maxChats: 999, read: true, maps: true, location: true, cash: true, perks: ['Everything in Mid-range', 'Send money 💸 to anyone', 'Texts up to 800'] },
];
export const phoneOf = (tier: number): Phone => PHONES[Math.max(0, Math.min(3, Math.floor(tier) || 0))];
export const tierFromItems = (keys: Iterable<string>): PhoneTier => { let t = 0; for (const k of keys) { const p = PHONES.find(x => x.itemId && x.itemId === k); if (p && p.tier > t) t = p.tier; } return t as PhoneTier; };
export const MAX_SEND_CASH = 500_000;
export const MSG_COOLDOWN_MS = 700;
