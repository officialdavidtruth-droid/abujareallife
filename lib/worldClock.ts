// One shared world: time of day, calendar, seasons and weather are pure functions of the real clock, so every player
// (and the server) sees exactly the same thing at the same moment, with nothing to sync. Safe to import on client and server.
export const GAME_MIN_PER_SEC = 1;            // 1 real second = 1 game minute → a game day lasts 24 real minutes (it used to race by in 4)
export const DAYS_PER_MONTH = 3;              // a game month = 72 real minutes, a game year = 14.4 real hours
const EPOCH = Date.UTC(2026, 0, 5);           // Monday 5 Jan 2026 (game day 0)
const START_MIN = 8 * 60;                     // the world clock reads 08:00 at the epoch
const DAY = 1440;

export const worldMinute = (now: number = Date.now()) => START_MIN + (now - EPOCH) / 1000 * GAME_MIN_PER_SEC;

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export type SeasonId = 'harmattan' | 'hot' | 'rainy';
export const SEASONS: Record<SeasonId, { id: SeasonId; label: string; e: string }> = {
  harmattan: { id: 'harmattan', label: 'Harmattan', e: '🌫️' },   // Nov–Feb: dry, dusty haze, cool nights
  hot: { id: 'hot', label: 'Hot season', e: '☀️' },              // Mar–Apr: hot, bright, the odd storm
  rainy: { id: 'rainy', label: 'Rainy season', e: '🌧️' },        // May–Oct: frequent rain and thunderstorms
};
export const seasonOfMonth = (m: number): SeasonId => (m >= 10 || m <= 1 ? 'harmattan' : m <= 3 ? 'hot' : 'rainy');

export function worldCalendar(minute: number = worldMinute()) {
  const day = Math.floor(minute / DAY), month = ((Math.floor(day / DAYS_PER_MONTH) % 12) + 12) % 12;
  const hh = Math.floor(((minute % DAY) + DAY) % DAY / 60), mm = Math.floor(((minute % 60) + 60) % 60);
  return { day, weekday: WEEKDAYS[((day % 7) + 7) % 7], month, monthName: MONTHS[month], dayOfMonth: (((day % DAYS_PER_MONTH) + DAYS_PER_MONTH) % DAYS_PER_MONTH) + 1, season: SEASONS[seasonOfMonth(month)], hh, mm, clock: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` };
}

/* ───────── weather ───────── */
type Kind = 'clear' | 'cloudy' | 'hazy' | 'rain' | 'storm';
const SLOT = 720; // weather changes every 12 game hours (12 real minutes) and fades over the first 15% of each slot
const P: Record<Kind, { cloud: number; rain: number; haze: number; storm: number; label: string; e: string }> = {
  clear: { cloud: .05, rain: 0, haze: 0, storm: 0, label: 'Clear', e: '☀️' },
  cloudy: { cloud: .6, rain: 0, haze: 0, storm: 0, label: 'Cloudy', e: '⛅' },
  hazy: { cloud: .3, rain: 0, haze: .9, storm: 0, label: 'Dusty haze', e: '🌫️' },
  rain: { cloud: .85, rain: .8, haze: 0, storm: 0, label: 'Rain', e: '🌧️' },
  storm: { cloud: 1, rain: 1, haze: 0, storm: 1, label: 'Thunderstorm', e: '⛈️' },
};
const ODDS: Record<SeasonId, [Kind, number][]> = {
  harmattan: [['clear', .5], ['hazy', .42], ['cloudy', .08]],
  hot: [['clear', .5], ['cloudy', .28], ['rain', .14], ['storm', .08]],
  rainy: [['clear', .18], ['cloudy', .24], ['rain', .40], ['storm', .18]],
};
const hash = (n: number) => { n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 16; return (n >>> 0) / 4294967296; };
const kindOf = (slot: number): Kind => {
  const month = ((Math.floor(slot * SLOT / DAY / DAYS_PER_MONTH) % 12) + 12) % 12, r = hash(slot * 7919 + 13);
  let a = 0; for (const [k, w] of ODDS[seasonOfMonth(month)]) { a += w; if (r < a) return k; } return 'clear';
};
const sm = (x: number) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

export function weatherAt(now: number = Date.now()) {
  const m = worldMinute(now), slot = Math.floor(m / SLOT), f = sm(((m % SLOT) / SLOT) / .15);
  const a = P[kindOf(slot - 1)], b = P[kindOf(slot)], k = f > .5 ? kindOf(slot) : kindOf(slot - 1), l = (x: number, y: number) => x + (y - x) * f;
  const season = seasonOfMonth(((Math.floor(m / DAY / DAYS_PER_MONTH) % 12) + 12) % 12);
  const haze = Math.max(l(a.haze, b.haze), season === 'harmattan' ? .35 : 0); // harmattan always has some dust in the air
  return { kind: k, label: P[k].label, e: P[k].e, cloud: l(a.cloud, b.cloud), rain: l(a.rain, b.rain), haze, storm: l(a.storm, b.storm) };
}

// Lightning: identical for everyone (driven by the shared real clock). Returns 0..1 flash strength.
export function lightningAt(now: number = Date.now(), storm = 1) {
  if (storm < .4) return 0;
  const slot = Math.floor(now / 5000), t = now - slot * 5000;
  if (hash(slot * 31 + 5) > .45) return 0;
  return t < 140 ? 1 : t < 260 ? .25 : t < 340 ? .8 * (1 - (t - 260) / 80) : 0;
}
