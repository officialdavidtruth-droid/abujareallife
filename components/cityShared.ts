'use client';
import * as THREE from 'three';
import type { CityBuilding } from '../lib/cityTypes';
import { JAIL_CELL_POS } from '../lib/profile';
import { BUILDS_WORLD } from '../lib/destinations';
import { GRID, WS, halfW } from '../lib/roadRoute';
import { WORLD_LIM } from '../lib/terrain';
 // road grid, curb spots, taxi/bike driving
/* ───────────── types & helpers ───────────── */
export type Ctl = { punch: boolean; shoot: boolean; joy: { x: number; y: number }; look: { x: number; y: number }; keys: Set<string>; run: boolean; jump: boolean; recenter: boolean; interact: boolean; taxi: boolean; horn: boolean; crouch?: boolean };

export type Hud = { x: number; z: number; fx: number; fz: number; r: number; vx: number; vz: number; vp: boolean; spd: number; drv: boolean; prompt: string };

export type Kind = 'glass' | 'concrete' | 'brick' | 'plaster';

export type Prof = { kind: Kind; f: [number, number]; sign: string; wall?: string; balc?: boolean };

export type Box2 = { x: number; z: number; sx: number; sz: number };


export const hs = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };

/* ───────────── detail level of detail ─────────────
 * Each building has ~25 small meshes (door, glass, awning, roof kit, signs, AC units...). Drawn for the whole city that is 2,000+ draw calls a frame,
 * far too many for a phone. Those groups register here and are only shown within DETAIL_R metres of the player (fog hides the change). */
export const DETAIL_R = 85;
const DETAILS = new Set<{ g: THREE.Object3D; x: number; z: number }>();
let detailAt = 0;
export function registerDetail(g: THREE.Object3D | null, x: number, z: number) {
  if (!g) return undefined;
  const e = { g, x, z }; DETAILS.add(e); detailAt = 0;
  return () => { DETAILS.delete(e); };
}
/** call every frame; it only does work 4 times a second */
export function updateDetails(px: number, pz: number, now: number) {
  if (now - detailAt < 250) return; detailAt = now;
  const r2 = DETAIL_R * DETAIL_R;
  for (const e of DETAILS) { const dx = e.x - px, dz = e.z - pz, v = dx * dx + dz * dz < r2; if (e.g.visible !== v) e.g.visible = v; }
}

export const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));


/* ───────────── city layout: wide boulevards (22 m grid) ───────────── */
export const FH = 3;
 // metres per floor
export const WSCALE = WS;
 // (some functions below have a local called WS)
export const LIM = WORLD_LIM;
 // walkable limit: the whole map now (city core, countryside, river, lake and sea; see lib/terrain.ts)
export const ev = (n: number) => ((n % 2) + 2) % 2 === 0;

export const BUILDS: CityBuilding[] = BUILDS_WORLD;
 // shared with the ride destinations (lib/destinations.ts)
/** Where a player appears when they walk out of a building: on the frontage sidewalk, straight in front of the door (doors face +z).
 *  Uses the same scaled world layout as BUILDS (the raw CITY coordinates are on a different, smaller grid, so they must never be used for positions). */
export function buildingExitPoint(businessId: string | null | undefined): { x: number; z: number } | null {
  const b = BUILDS.find(x => x.business?.id === businessId); if (!b) return null;
  return { x: b.x, z: b.z + b.d / 2 + 1.8 };
}

export const INTER: { x: number; z: number; hv: number; hh: number }[] = [];

for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) INTER.push({ x: i * GRID, z: j * GRID, hv: halfW(i), hh: halfW(j) });


/* ───────────── shared world state (cars, pedestrians and the player talk through these) ───────────── */
export const TPOS: { x: number; z: number; r: number }[] = [];

export const PEDPOS: { x: number; z: number; d?: boolean }[] = [];
 // live position of every pedestrian (1e5 when hidden), read by the crime buttons // live position of every AI car
export const OBS = [{ x: 0, z: 0, on: false, sp: 4.5 }, { x: 0, z: 0, on: false, sp: 7 }, { x: 0, z: 0, on: false, sp: 7 }, { x: 0, z: 0, on: false, sp: 7 }, { x: 0, z: 0, on: false, sp: 7 }];
 // things AI cars must stop for: [0] player on foot, [1] player's car, [2] the taxi/bike carrying the player
export const OWN = { had: false, x: 0, z: 0, r: 0 };
   // where your own car was parked while you drive a stolen one
export const VEH = { x: 0, z: 0, r: 0, v: 0, placed: false, drv: false, brake: false, homed: false };
 // the player's own car
export const NIGHT = { n: 0 };


/* ───────────── traffic lights + cars that obey them ───────────── */
// 32 s cycle with long greens: x green 0–14, amber 14–16, z green 16–30, amber 30–32. Cars only obey it at boulevard × boulevard junctions (see signalised).
export { lightState } from '../lib/worldClock';   // the signal cycle lives with the shared clock

export const LCOL = { g: new THREE.Color('#2ee66b'), y: new THREE.Color('#ffc400'), r: new THREE.Color('#ff2a2a') };

export const smooth = (u: number) => { const c = Math.max(0, Math.min(1, u)); return c * c * (3 - 2 * c); };
 // Keep NPCs as light ambient life; real users are the primary population.
export const pick = <T,>(a: T[], k: string) => a[Math.floor(hs(k) * a.length) % a.length];

export const distTo = (s: { x0: number; x1: number; z0: number; z1: number }, x: number, z: number) => Math.hypot(Math.max(s.x0 - x, 0, x - s.x1), Math.max(s.z0 - z, 0, z - s.z1));


/* ───────────── the 3D scene ───────────── */
export const START = { x: 0, z: 16, r: Math.PI };
 // overwritten with a random sidewalk spot each time a player steps outside (see CityWorld)
/** Driving camera: 0 = chase (behind the car), 1 = cockpit (through the windscreen, from the driver's seat). Remembered between sessions. */
export const CAMV = { mode: (() => { try { const v = typeof localStorage !== 'undefined' ? localStorage.getItem('arl-drivecam') : null; return v === '0' ? 0 : 1; } catch { return 1; } })(), saved: { x: 0, y: 0, z: 0, on: false } };
export const toggleDriveCam = () => { CAMV.mode = CAMV.mode ? 0 : 1; try { localStorage.setItem('arl-drivecam', String(CAMV.mode)); } catch { /* ignore */ } };
export const GAME = { jailed: false, heat: 0, drunk: 0, high: 0, hasCar: false, vehicleModel: 'Toyota Camry', notice: '', tp: null as { x: number; z: number; r?: number } | null, nav: null as { x: number; z: number; name: string; mission?: string; auto?: boolean; follow?: string } | null, route: null as { pts: [number, number][]; i: number } | null, missionFinal: null as { x: number; z: number; name: string } | null, player: { x: START.x, z: START.z, r: 0 }, ride: null as null | { kind: 'taxi' | 'bike' | 'bus'; x: number; z: number; r: number; name: string; path: [number, number][]; i: number; speed: number; stand?: number; pax?: boolean; vOn?: boolean; vx?: number; vz?: number; vr?: number; exiting?: boolean } };
 // set by the game layer
export const CELL = { x: JAIL_CELL_POS.x, z: JAIL_CELL_POS.z, h: 2.6 };

export const sm = THREE.MathUtils.smoothstep;

export const WX = { over: new THREE.Color('#7d8791'), dust: new THREE.Color('#d6bf9b'), flash: new THREE.Color('#e8f0ff'), tmp: new THREE.Color() };

export const SKY = { day: new THREE.Color('#8fc3ea'), dusk: new THREE.Color('#ee9a68'), night: new THREE.Color('#060b19'), fogDay: new THREE.Color('#c9dff0'), fogDusk: new THREE.Color('#e3a888'), fogNight: new THREE.Color('#0a1226'), sun: new THREE.Color('#fff0d4'), sunLow: new THREE.Color('#ff9a55'), moon: new THREE.Color('#8fa6e8') };
