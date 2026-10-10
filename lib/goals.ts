/* Goals: a guided starter chain, 3 daily missions, a login streak and lifetime achievements.
   Shared by the server (/api/progress, the authority for every reward) and the client (display only).
   Nothing here needs a database table: progress is DERIVED from the transaction log and the save, and
   a claim is a hidden inventory row (quantity 0, unique per user+key) so it can never be claimed twice. */

export type Stats = {
  cash: number; fame: number; hasCar: boolean; skillLevel: number;
  earned: number; quests: number; shifts: number; buys: number; missions: number; helps: number; rides: number; sent: number;
  earnedToday: number; questsToday: number; shiftsToday: number; buysToday: number; missionsToday: number; helpsToday: number; ridesToday: number;
  bestStreak: number;
};
export type StatKey = keyof Stats;

/* ───────── day key: the game day rolls over at midnight in Nigeria (WAT, UTC+1) ───────── */
const WAT = 3_600_000, DAY = 86_400_000;
export const dayKey = (now = Date.now()) => new Date(now + WAT).toISOString().slice(0, 10);
export const dayStart = (now = Date.now()) => new Date(Math.floor((now + WAT) / DAY) * DAY - WAT);
const dayNum = (key: string) => Math.floor(Date.parse(key + 'T00:00:00Z') / DAY);
export const prevDay = (key: string) => new Date((dayNum(key) - 1) * DAY).toISOString().slice(0, 10);

/* ───────── starter chain: the first ~15 minutes ───────── */
export type Step = { id: string; e: string; title: string; how: string; reward: number; stat?: StatKey; target?: number };
export const STARTER: Step[] = [
  { id: 'welcome', e: '👋', title: 'Welcome to Abuja', how: 'Your life starts here. Claim your welcome bonus.', reward: 20_000 },
  { id: 'first_buy', e: '🛒', title: 'Buy something from a shop', how: 'Open ☰ Map or Shops, walk into any shop and buy an item.', reward: 10_000, stat: 'buys', target: 1 },
  { id: 'first_quest', e: '📜', title: 'Finish your first quest', how: 'Open ☰ Quests, pick one, then go inside the business it names and start it.', reward: 15_000, stat: 'quests', target: 1 },
  { id: 'first_shift', e: '💼', title: 'Work a shift', how: 'Open ☰ Jobs, choose a business, go inside and take a shift at the work spot.', reward: 20_000, stat: 'shifts', target: 1 },
  { id: 'first_ride', e: '🚕', title: 'Take a taxi or bike ride', how: 'Walk to a taxi or order a ride from the map to travel across the city.', reward: 10_000, stat: 'rides', target: 1 },
  { id: 'earn_100k', e: '💰', title: 'Earn ₦100,000', how: 'Quests, shifts and missions all pay. Keep working.', reward: 25_000, stat: 'earned', target: 100_000 },
  { id: 'skill_1', e: '📈', title: 'Reach level 1 in any skill', how: 'Skills grow from quests and work. Check ☰ My Life.', reward: 15_000, stat: 'skillLevel', target: 1 },
  { id: 'be_social', e: '🤝', title: 'Help or send money to another player', how: 'Tap a player nearby to Help them, or use ☰ Send Money.', reward: 15_000 },
  { id: 'fame_local', e: '🙂', title: 'Become Local (50 fame)', how: 'Fame comes from quests, shifts, helping players and time spent playing.', reward: 30_000, stat: 'fame', target: 50 },
  { id: 'buy_car', e: '🚗', title: 'Own a car', how: 'Save up and visit a Car Dealer. Cars make travel and jobs faster.', reward: 100_000 },
];
export const STARTER_BONUS = { id: 'insider', reward: 150_000, title: 'Abuja Insider' };

/** progress for a starter step */
export function stepProgress(s: Step, st: Stats): { have: number; need: number; done: boolean } {
  if (s.id === 'welcome') return { have: 1, need: 1, done: true };
  if (s.id === 'be_social') { const have = Math.min(1, st.helps + st.sent); return { have, need: 1, done: have >= 1 }; }
  if (s.id === 'buy_car') return { have: st.hasCar ? 1 : 0, need: 1, done: st.hasCar };
  const need = s.target || 1, have = Math.min(need, Number(st[s.stat as StatKey]) || 0);
  return { have, need, done: have >= need };
}

/* ───────── daily missions ───────── */
export type Daily = { id: string; e: string; title: string; stat: StatKey; target: number; reward: number };
const D = (id: string, e: string, title: string, stat: StatKey, target: number, reward: number): Daily => ({ id, e, title, stat, target, reward });
const SLOT_A = [D('earn', '💰', 'Earn ₦150,000 today', 'earnedToday', 150_000, 25_000), D('quests2', '📜', 'Finish 2 quests', 'questsToday', 2, 20_000)];
const SLOT_B = [D('shift1', '💼', 'Work a shift', 'shiftsToday', 1, 15_000), D('mission1', '🎯', 'Complete a city mission', 'missionsToday', 1, 20_000)];
const SLOT_C = [D('buy2', '🛒', 'Buy 2 things from shops', 'buysToday', 2, 12_000), D('help1', '🤝', 'Help another player', 'helpsToday', 1, 15_000), D('ride1', '🚕', 'Take a ride', 'ridesToday', 1, 10_000)];
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
/** the same 3 missions for every player on a given day (so people can compare notes) */
export const dailiesFor = (day: string): Daily[] => [SLOT_A[hash(day + 'a') % SLOT_A.length], SLOT_B[hash(day + 'b') % SLOT_B.length], SLOT_C[hash(day + 'c') % SLOT_C.length]];
export const DAILY_BONUS = 40_000;

/* ───────── login streak: day 1..7, then it loops ───────── */
export const STREAK_REWARDS = [5_000, 8_000, 10_000, 15_000, 20_000, 30_000, 60_000];
export const streakReward = (streak: number) => STREAK_REWARDS[(Math.max(1, streak) - 1) % STREAK_REWARDS.length];

/* ───────── achievements ───────── */
export type Ach = { id: string; e: string; title: string; how: string; reward: number; stat: StatKey; target: number };
const A = (id: string, e: string, title: string, how: string, reward: number, stat: StatKey, target: number): Ach => ({ id, e, title, how, reward, stat, target });
export const ACHIEVEMENTS: Ach[] = [
  A('earn_1m', '💵', 'First Million', 'Earn ₦1,000,000 in total', 50_000, 'earned', 1_000_000),
  A('earn_10m', '🏦', 'Big Earner', 'Earn ₦10,000,000 in total', 250_000, 'earned', 10_000_000),
  A('rich', '💎', 'Money in the Bank', 'Hold ₦10,000,000 cash at once', 150_000, 'cash', 10_000_000),
  A('quests_10', '📜', 'Quest Runner', 'Finish 10 quests', 40_000, 'quests', 10),
  A('quests_50', '🗺️', 'Quest Master', 'Finish 50 quests', 200_000, 'quests', 50),
  A('shifts_10', '💼', 'Reliable Worker', 'Work 10 shifts', 40_000, 'shifts', 10),
  A('shifts_50', '🏢', 'Employee of the Year', 'Work 50 shifts', 200_000, 'shifts', 50),
  A('skill_3', '🧠', 'Getting Good', 'Reach level 3 in any skill', 60_000, 'skillLevel', 3),
  A('skill_6', '🎓', 'Expert', 'Reach level 6 in any skill', 250_000, 'skillLevel', 6),
  A('fame_known', '⭐', 'Known', 'Reach 200 fame', 50_000, 'fame', 200),
  A('fame_influencer', '📱', 'Influencer', 'Reach 600 fame', 150_000, 'fame', 600),
  A('fame_elite', '👑', 'Elite', 'Reach 1,500 fame', 500_000, 'fame', 1500),
  A('helper', '🤝', 'Good Neighbour', 'Help other players 5 times', 50_000, 'helps', 5),
  A('streak_7', '🔥', 'On Fire', 'Log in 7 days in a row', 100_000, 'bestStreak', 7),
];

/* ───────── claim markers (hidden inventory rows) ───────── */
export const keyStarter = (id: string) => `goal_s_${id}`;
export const keyDaily = (day: string, id: string) => `goal_d_${day}_${id}`;
export const keyBonus = (day: string) => `goal_b_${day}`;
export const keyCheckin = (day: string) => `goal_c_${day}`;
export const keyAch = (id: string) => `goal_a_${id}`;
export const KEY_INSIDER = 'goal_s_insider';
