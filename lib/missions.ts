/* Mission contracts. Rewards, stages, deadlines and heat live here so the SERVER decides what a mission pays and when it expires. */
export type Goto = { name?: string; type?: string; district?: string };
export type Stage = { label: string; goto?: Goto; hold?: number; follow?: boolean };   // hold = seconds you must stay in the area after arriving. follow = the stage is the stealth tail (no waypoint; the target car is tracked live)
/* A stealth tail: a dealer's car sits parked at `from`, then drives through `stops` while you follow it without being made. */
export type TailStop = Goto & { dwell?: number };
export type TailSpec = { from: Goto; stops: TailStop[]; vmax: number; dwell: number; model: string; color: string };
/* How the tail is judged. All of it is tuned here so the feel can be changed without touching the logic. */
export const TAIL_RULES = {
  closeDist: 12, closeRate: 20,      // closer than this and he notices you quickly (alertness per second)
  midDist: 22, midRate: 3,           // 12-22 m: still risky, alertness creeps up
  coneDist: 40, coneCos: .72, coneRate: 12,   // being AHEAD of him inside his forward view is worse than being behind
  watchDist: 25, watchRate: 6,       // while he is parked he watches the street: hang back
  cool: 14,                          // alertness drops this fast while you stay at a safe distance
  loseDist: 100, loseSecs: 8,        // farther than this for this long and he is gone
  shotDist: 90,                      // a gunshot this close blows the tail at once
  witnessDist: 55, witnessSecs: 6,   // at the handover you must get eyes on it from a safe distance for this long
  handoverMaxSecs: 40,               // the meet ends after this long whether or not you saw it
  departSecs: 6,                     // he sets off this long after you reach the market
} as const;
export type Mission = {
  id: string; title: string; type: string; difficulty: 'EASY' | 'MEDIUM' | 'HARD'; reward: number; desc: string; icon: string;
  target: string;            // final destination, shown on the card
  stages: Stage[];
  deadlineSecs: number;      // the contract fails when this runs out
  minSecs: number;           // fastest believable completion (server refuses faster claims)
  heat: number;              // police heat applied the moment the contract starts
  failOnKo?: boolean;        // being knocked out fails the contract (the person you protect is left exposed)
  tail?: TailSpec;           // set on stealth-tail contracts: the dealer's car that is spawned for the mission
};
export const MISSIONS: Mission[] = [
  { id: 'courier', title: 'The Wuse Delivery', type: 'DELIVERY', difficulty: 'EASY', reward: 18000, icon: '📦', target: 'Wuse Market', deadlineSecs: 420, minSecs: 25, heat: 0,
    desc: 'Collect the sealed package from the logistics depot, then deliver it to Wuse Market before the deadline.',
    stages: [{ label: 'Pick up the package at the depot', goto: { type: 'Logistics' } }, { label: 'Deliver it to Wuse Market', goto: { name: 'Wuse Market' } }] },
  { id: 'recovery', title: 'Recover the Goods', type: 'RECOVERY', difficulty: 'MEDIUM', reward: 42000, icon: '🧰', target: 'Logistics depot', deadlineSecs: 600, minSecs: 45, heat: 0,
    desc: 'Find the stolen shipment in Jabi, hold the area while it is loaded, then return it to the depot.',
    stages: [{ label: 'Reach the stash in Jabi', goto: { district: 'Jabi' }, hold: 10 }, { label: 'Return the goods to the depot', goto: { type: 'Logistics' } }] },
  { id: 'escape', title: 'Last Ride Out', type: 'CHASE', difficulty: 'HARD', reward: 65000, icon: '🚘', target: 'Airport', deadlineSecs: 240, minSecs: 40, heat: 25,
    desc: 'The police are already on you. Reach the airport before time runs out.',
    stages: [{ label: 'Get to the airport', goto: { type: 'Airport' } }] },
  { id: 'protection', title: 'VIP Escort', type: 'PROTECTION', difficulty: 'MEDIUM', reward: 35000, icon: '🛡️', target: 'Maitama', deadlineSecs: 480, minSecs: 40, heat: 0, failOnKo: true,
    desc: 'Meet the VIP at the hotel and escort them to Maitama. If you are knocked out, the escort fails.',
    stages: [{ label: 'Meet the VIP at the hotel', goto: { type: 'Hotel' }, hold: 5 }, { label: 'Escort the VIP to Maitama', goto: { district: 'Maitama' } }] },
  { id: 'tail', title: 'Wuse Market Tail', type: 'SURVEILLANCE', difficulty: 'MEDIUM', reward: 48000, icon: '🕶️', target: 'Wuse Supermarket', deadlineSecs: 600, minSecs: 90, heat: 0,
    desc: 'A dealer is meeting a buyer. Find his black SUV outside Wuse Supermarket and follow it without being made: close enough not to lose him, far enough that he does not notice you. No gunfire. Get eyes on the handover.',
    tail: { from: { name: 'Wuse Supermarket' }, vmax: 7.5, dwell: 14, model: 'lexus-lx-2024', color: '#17191c', stops: [{ district: 'Garki', type: 'Restaurant', dwell: 14 }, { district: 'Maitama', type: 'Hotel', dwell: 20 }] },
    stages: [{ label: 'Find the dealer\'s black SUV outside Wuse Supermarket', goto: { name: 'Wuse Supermarket' } }, { label: 'Tail him without being spotted', follow: true }] },
];
export const MISSION_COOLDOWN_MS = 60 * 60_000;   // a contract can be taken again an hour after it was paid
export const MISSION_WINDOW_MS = 45 * 60_000;     // hard cap on how long a started contract row is kept
export const MISSION_GRACE_MS = 15_000;           // network slack on top of the deadline
