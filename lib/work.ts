import type { Business, Job } from './cityTypes';

/* Work rules shared by the room scene (client) and the server routes. Tweak the numbers here. */

// ---- shifts: 45 min – 1 hour, decided by the job and the task the server assigns when you clock in ----
export type Task = { id: string; label: string; mins: number };
const GROUPS: Record<string, Task[]> = {
  desk: [{ id: 'counter', label: 'Serve clients at the desk', mins: 45 }, { id: 'records', label: 'File and reconcile records', mins: 50 }, { id: 'appts', label: 'Run client appointments', mins: 52 }, { id: 'month', label: 'Month-end paperwork', mins: 55 }],
  food: [{ id: 'service', label: 'Cover the dining floor', mins: 45 }, { id: 'clean', label: 'Deep clean and inventory', mins: 48 }, { id: 'prep', label: 'Prep and stock the kitchen', mins: 50 }, { id: 'party', label: 'Host a booked party', mins: 55 }],
  club: [{ id: 'door', label: 'Work the door and floor', mins: 45 }, { id: 'setup', label: 'Set up and sound check', mins: 48 }, { id: 'rush', label: 'Run the bar rush', mins: 50 }, { id: 'close', label: 'Close out and clean up', mins: 55 }],
  shop: [{ id: 'till', label: 'Man the till', mins: 45 }, { id: 'restock', label: 'Restock the shelves', mins: 50 }, { id: 'count', label: 'Stock count', mins: 52 }, { id: 'delivery', label: 'Receive a delivery', mins: 55 }],
  care: [{ id: 'clients', label: 'See scheduled clients', mins: 45 }, { id: 'supplies', label: 'Restock supplies', mins: 48 }, { id: 'rounds', label: 'Do your rounds', mins: 50 }, { id: 'notes', label: 'Case notes and records', mins: 55 }],
  station: [{ id: 'patrol', label: 'Patrol the building', mins: 45 }, { id: 'reports', label: 'Write up reports', mins: 50 }, { id: 'drill', label: 'Training drill', mins: 52 }, { id: 'handover', label: 'Shift handover log', mins: 55 }],
  travel: [{ id: 'boarding', label: 'Handle a boarding rush', mins: 45 }, { id: 'baggage', label: 'Sort baggage and cargo', mins: 50 }, { id: 'safety', label: 'Safety walk-through', mins: 52 }, { id: 'timetable', label: 'Update the timetable', mins: 55 }],
};
const GROUP_OF: Record<string, string> = {
  Bank: 'desk', Office: 'desk', 'Tech Company': 'desk', 'Estate Agency': 'desk', Government: 'desk', Logistics: 'desk', Restaurant: 'food', Hotel: 'food', Nightclub: 'club',
  Supermarket: 'shop', Market: 'shop', Pharmacy: 'shop', 'Petrol Station': 'shop', 'Car Dealer': 'shop', Mechanic: 'shop',
  Hospital: 'care', Salon: 'care', Barber: 'care', Gym: 'care', School: 'care', Cinema: 'care', 'Police Station': 'station', Jail: 'station', Airport: 'travel', 'Rail Station': 'travel',
};
export const tasksFor = (type: string): Task[] => GROUPS[GROUP_OF[type] || 'shop'];
export const isSenior = (j: Job) => j.pay >= 200_000; // senior roles need rank 2
export const shiftMins = (job: Job, t: Task) => Math.min(60, t.mins + (isSenior(job) ? 5 : 0)); // always 45–60
export const fmtClock = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

// ---- managers: one seat per business, first applicant gets it, 7-day term, tasks needed before every appointment ----
export const MANAGER_RE = /Manager$/;
export const NO_SEAT = new Set(['Police Station', 'Jail', 'Government', 'Airport', 'Rail Station']); // run by the state, not by a manager
export const MGR_TERM_MS = 7 * 24 * 3600_000, MGR_TASKS_NEEDED = 3, MGR_TASK_PAY = 20_000;
export const MGR_TASKS: Task[] = [{ id: 'rota', label: 'Plan the staff rota', mins: 30 }, { id: 'complaints', label: 'Handle customer complaints', mins: 35 }, { id: 'suppliers', label: 'Review suppliers and stock', mins: 40 }, { id: 'targets', label: 'Weekly targets report', mins: 45 }];
export const shiftJobs = (b: Business): Job[] => b.jobs.filter(j => !MANAGER_RE.test(j.title)); // the manager is a seat, not a shift job
export const hasSeat = (b: Business) => !NO_SEAT.has(b.type);
const seatJob = (b: Business) => b.jobs.find(j => MANAGER_RE.test(j.title));
export const seatTitle = (b: Business) => seatJob(b)?.title || `${b.type} Manager`;
export const managerDaily = (b: Business) => Math.round((seatJob(b)?.pay || 160_000) / 5); // collectable once every 24h while in office
