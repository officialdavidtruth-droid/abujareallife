/* Step 5: witness + reaction AI for NPC pedestrians.
   Pure logic (no React, no three) so it can be tested headlessly. CityWorld.tsx feeds it ped positions every frame
   (PEDVIEW), pushes crimes into it, and drains the queue to decide who saw / heard what and how they react.

   Personalities (fixed per pedestrian index):
     coward    ~40%  runs, cowers, hands up when aimed at
     bystander ~35%  freezes, films on a phone, calls the police
     brave     ~25%  squares up to the criminal and shouts

   Perception: a ped SEES a crime if it is inside the crime's sight radius and roughly facing it (or very close);
   it only HEARS it inside the (larger) hearing radius. Buildings do not block sight yet (known limit). */

export type Persona = 'coward' | 'bystander' | 'brave';
export type CrimeKind = 'gunshot' | 'armed' | 'assault' | 'mug' | 'pickpocket' | 'carjack' | 'runover';
export type ReactKind = 'freeze' | 'handsup' | 'cower' | 'flee' | 'film' | 'confront';
export type Crime = { kind: CrimeKind; x: number; z: number; victim?: number };
export type Reaction = { kind: ReactKind; until: number; fx: number; fz: number; sense: 'saw' | 'heard'; callAt: number; shoutAt: number; calledIn: boolean };
export type Shout = { id: number; i: number; text: string; until: number };

export const wnow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

export const personaOf = (i: number): Persona => { const r = (i * 0.6180339887 + .13) % 1; return r < .4 ? 'coward' : r < .75 ? 'bystander' : 'brave'; };   // golden-ratio spread: an even 40 / 35 / 25 mix across the crowd, same every session

/* Live view of every pedestrian, written by CityWorld each frame. yaw: forward vector is (cos yaw, -sin yaw) in (x, z). */
export const PEDVIEW: { x: number; z: number; yaw: number; on: boolean }[] = [];

/* sight / hearing radius in metres, how much the ped has to face the crime (cos of angle), and the "can't miss it" radius */
const RANGE: Record<CrimeKind, { see: number; hear: number; face: number; near: number }> = {
  gunshot:    { see: 40, hear: 70, face: -.2, near: 6 },
  armed:      { see: 16, hear: 0,  face: -.2, near: 4 },
  assault:    { see: 20, hear: 10, face: -.2, near: 5 },
  mug:        { see: 22, hear: 12, face: -.2, near: 5 },
  pickpocket: { see: 6,  hear: 0,  face: .3,  near: 0 },   // quiet: only people looking right at it
  carjack:    { see: 30, hear: 25, face: -.2, near: 6 },
  runover:    { see: 28, hear: 20, face: -.2, near: 6 },
};
export function perceive(kind: CrimeKind, d: number, facing: number): 'saw' | 'heard' | null {
  const R = RANGE[kind];
  if (d <= R.see && (d < R.near || facing >= R.face)) return 'saw';
  if (d <= R.hear) return 'heard';
  return null;
}

/* How strongly a reaction overrides another one already running (a fleeing ped is not downgraded to filming). */
export const PRI: Record<ReactKind, number> = { freeze: 1, confront: 2, film: 2, handsup: 3, cower: 3, flee: 3 };

export function decide(persona: Persona, kind: CrimeKind, sense: 'saw' | 'heard', d: number, isVictim: boolean, aimed: boolean, rnd: number): ReactKind | null {
  if (isVictim) {
    if (kind === 'mug') return persona === 'brave' && rnd < .35 ? 'confront' : 'handsup';
    if (kind === 'assault') return persona === 'coward' ? 'cower' : persona === 'bystander' ? 'flee' : 'confront';
    if (kind === 'pickpocket') return persona === 'brave' ? 'confront' : rnd < .5 ? 'freeze' : null;
    return null;   // run over: they are on the ground
  }
  if (sense === 'heard') {
    if (kind === 'gunshot' || kind === 'carjack' || kind === 'runover') return persona === 'coward' ? (rnd < .5 ? 'cower' : 'flee') : persona === 'bystander' ? (rnd < .6 ? 'flee' : 'freeze') : 'freeze';
    return 'freeze';   // heard a scuffle: just look round
  }
  switch (kind) {
    case 'armed':
      if (aimed) return persona === 'brave' && rnd < .5 ? 'freeze' : 'handsup';   // GTA: gun in your face, hands go up
      return persona === 'coward' ? 'flee' : persona === 'bystander' ? (rnd < .5 ? 'flee' : 'freeze') : 'freeze';
    case 'gunshot':
      return persona === 'coward' ? (d < 10 ? 'cower' : 'flee') : persona === 'bystander' ? (rnd < .5 ? 'flee' : 'film') : 'film';
    case 'pickpocket':
      return persona === 'brave' ? 'confront' : 'freeze';
    default: // assault, mug, carjack, runover
      return persona === 'coward' ? 'flee' : persona === 'bystander' ? (rnd < .25 ? 'flee' : 'film') : 'confront';
  }
}

export const duration = (k: ReactKind, rnd: number) => ({ freeze: 1.6 + rnd * 1.2, handsup: 6 + rnd * 2, cower: 7 + rnd * 3, flee: 8 + rnd * 3, film: 9 + rnd * 4, confront: 6 + rnd * 3 }[k]);

export const LINES: Record<ReactKind, string[]> = {
  flee: ['Run! Run!', 'Gun! Gun!', 'Abeg!', 'Wahala!', 'Somebody call the police!'],
  handsup: ['Oga, abeg, don\'t shoot!', 'Take am, take am!', 'I no want wahala!'],
  cower: ['Abeg no!', 'God, no!', 'Please, not me!'],
  film: ['I dey call police!', 'I dey record you!', 'Police! Police!'],
  confront: ['Oga, what are you doing?!', 'Thief! Thief!', 'Leave am!', 'Are you mad?!'],
  freeze: ['Wetin be that?', 'Eh? What happened?', 'Hmm?'],
};
export const lineFor = (k: ReactKind) => LINES[k][Math.floor(Math.random() * LINES[k].length)];

/* floating speech bubbles; the renderer shows the newest few */
export const SHOUTS: Shout[] = [];
let shoutId = 1;
export function shout(i: number, text: string, secs = 2.6) {
  const now = wnow();
  for (let k = SHOUTS.length - 1; k >= 0; k--) if (SHOUTS[k].until < now) SHOUTS.splice(k, 1);
  if (SHOUTS.some(s => s.i === i)) return;
  SHOUTS.push({ id: shoutId++, i, text, until: now + secs });
  if (SHOUTS.length > 8) SHOUTS.shift();
}

/* crime queue + sight count */
const QUEUE: Crime[] = [];
export const drainCrimes = () => QUEUE.splice(0, QUEUE.length);
let quietUntil = 0;
export const assaultQuiet = () => wnow() < quietUntil;

/** Queues a crime for the pedestrians and returns how many of them SAW it right now (victim not counted). */
export function pushCrime(c: Crime): number {
  QUEUE.push(c);
  if (c.kind === 'pickpocket') quietUntil = wnow() + .8;   // the swing animation of a pickpocket must not count as a street fight
  let saw = 0;
  for (let i = 0; i < PEDVIEW.length; i++) {
    const p = PEDVIEW[i]; if (!p || !p.on || i === c.victim) continue;
    const dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz) || .01;
    if (perceive(c.kind, d, (Math.cos(p.yaw) * dx - Math.sin(p.yaw) * dz) / d) === 'saw') saw++;
  }
  return saw;
}

/* A witness phoned the police. Returns true at most once per 15 s so the HUD is not spammed.
   Step 6 (police response) listens for the 'arl-witness-report' event this fires. */
let lastReport = 0;
export function reportCrime(x: number, z: number): boolean {
  const now = wnow();
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('arl-witness-report', { detail: { x, z } }));
  if (now - lastReport < 15) return false;
  lastReport = now; return true;
}
