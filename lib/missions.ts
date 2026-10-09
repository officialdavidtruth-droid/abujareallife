/* Mission contracts. Rewards, stages, deadlines and heat live here so the SERVER decides what a mission pays and when it expires. */
export type Goto = { name?: string; type?: string; district?: string };
export type Stage = { label: string; goto: Goto; hold?: number };   // hold = seconds you must stay in the area after arriving
export type Mission = {
  id: string; title: string; type: string; difficulty: 'EASY' | 'MEDIUM' | 'HARD'; reward: number; desc: string; icon: string;
  target: string;            // final destination, shown on the card
  stages: Stage[];
  deadlineSecs: number;      // the contract fails when this runs out
  minSecs: number;           // fastest believable completion (server refuses faster claims)
  heat: number;              // police heat applied the moment the contract starts
  failOnKo?: boolean;        // being knocked out fails the contract (the person you protect is left exposed)
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
];
export const MISSION_COOLDOWN_MS = 60 * 60_000;   // a contract can be taken again an hour after it was paid
export const MISSION_WINDOW_MS = 45 * 60_000;     // hard cap on how long a started contract row is kept
export const MISSION_GRACE_MS = 15_000;           // network slack on top of the deadline
