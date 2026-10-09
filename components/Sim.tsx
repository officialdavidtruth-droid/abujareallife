'use client';
import HomeUpgrades from './HomeUpgrades';
import RuntimeStyle from './RuntimeStyle';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, RoundedBox, Html } from '@react-three/drei';
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import Human from './Human';
import Creator from './Creator';
import Account, { type AccountUser } from './Account';
import AuthScreen from './AuthScreen';
import Loader from './Loader';
import { worldMinute, worldCalendar, weatherAt } from '../lib/worldClock';
import { businessStatus } from '../lib/businessHours';
import { AUTO, idleFor } from '../lib/autoState';
import AssetLoader from './AssetLoader';
import City from './City';
import { setMusicMood, sfx } from '../lib/audio';
import { openSettings } from '../lib/settings';
import GameLayer from './GameLayer';
import Interior from './Interior';
import { CITY } from '../lib/cityData';
import { GAME, buildingExitPoint } from './CityWorld';
import { DEFAULT_PROFILE, type Profile } from '../lib/profile';
import { DEFAULT_LOOK, type Look } from '../lib/characterModels';
import Wardrobe from './Wardrobe';
import { findPath, blocked, inside, HARD, type Blk, type Box, type P, setEastLimit, setSouthLimit } from '../lib/collision';
import { USES } from '../lib/pantry';
import { itemById } from '../lib/catalog';

type N = 'hunger' | 'energy' | 'hygiene' | 'bladder' | 'fun' | 'social';
type Pose = 'stand' | 'sit' | 'sleep';
type Act = { k: string; label: string; e: string; dur: number; fx: Partial<Record<N, number>>; pose: Pose; cost?: number; pay?: number; pow?: boolean; anim?: string; bond?: number; all?: 'dinner' | 'kids' };
type Obj = { id: string; name: string; p: [number, number]; rot: number; spot: [number, number]; face: number; acts: Act[]; boxes?: Box[]; appr?: [number, number]; fam?: string; bp?: string[]; sp?: string }; // bp = which movable part each box belongs to ('' = the object itself), sp = part the seat/approach spot follows; boxes = solid footprint, appr = free spot in front of a seat/bed/shower where the walk starts and ends
type Task = { t: 'walk'; x: number; z: number; own?: string } | { t: 'act'; a: Act; o: Obj; low?: boolean };

const NEEDS: [N, string, string][] = [['hunger', 'Hunger', '🍲'], ['energy', 'Energy', '😴'], ['hygiene', 'Hygiene', '🚿'], ['bladder', 'Bladder', '🚽'], ['fun', 'Fun', '🎮'], ['social', 'Social', '💬']];
const DECAY: Record<N, number> = { hunger: .03, energy: .02, hygiene: .05, bladder: .09, fun: .06, social: .04 };
const cl = (n: number) => Math.max(0, Math.min(100, n));
const naira = (n: number) => '₦' + Math.round(n).toLocaleString();

const OBJ: Obj[] = [
  { id: 'bed', bp: ['', 'bed.stand'], name: 'Bed', p: [-4.6, -3.3], rot: 0, spot: [-3.3, -1.9], face: 0, boxes: [[-5.5, -3.7, -4.6, -2], [-3.7, -3.2, -4.55, -4.05]], acts: [
    { k: 'sleep', label: 'Sleep', e: '💤', dur: 120, fx: { energy: 100, hunger: -10 }, pose: 'sleep' },
    { k: 'nap', label: 'Nap', e: '😴', dur: 60, fx: { energy: 35 }, pose: 'sleep' }] },
  { id: 'wardrobe', name: 'Wardrobe & mirror', p: [-2.25, -4.3], rot: 0, spot: [-2.25, -3.4], face: Math.PI, boxes: [[-2.95, -1.55, -4.6, -4]], acts: [
    { k: 'outfit', label: 'Change outfit', e: '👕', dur: 8, fx: { fun: 8 }, pose: 'stand', anim: 'wardrobe' },
    { k: 'mirror', label: 'Check the mirror', e: '🪞', dur: 10, fx: { fun: 10, social: 4 }, pose: 'stand', anim: 'groom' }] },
  { id: 'fridge', bp: ['', 'fridge.counter'], sp: 'fridge.counter', name: 'Kitchen', p: [-1, -4.1], rot: 0, spot: [0, -3.35], face: Math.PI, boxes: [[-1.4, -.6, -4.6, -3.8], [-.6, 1.3, -4.6, -3.8]], acts: [
    { k: 'cook', label: 'Cook jollof', e: '🍛', dur: 30, fx: { hunger: 60, fun: 6 }, pose: 'stand', anim: 'cook' },
    { k: 'snack', label: 'Snack', e: '🥜', dur: 10, fx: { hunger: 25 }, pose: 'stand', anim: 'eat' },
    { k: 'water', label: 'Drink water', e: '💧', dur: 5, fx: { hunger: 3, bladder: -6 }, pose: 'stand', anim: 'eat' }] },
  { id: 'dining', bp: ['', 'dining.c1', 'dining.c3', 'dining.c4', 'dining.c2'], sp: 'dining.c1', name: 'Dining table', p: [-.3, -2.3], rot: 0, spot: [-.3, -1.5], face: Math.PI, boxes: [[-1.05, .45, -2.725, -1.875], [-.55, -.05, -1.75, -1.25], [-1.55, -1.05, -2.55, -2.05], [.45, .95, -2.55, -2.05], [-1.02, -.58, -1.75, -1.25]], appr: [-.3, -.8], acts: [
    { k: 'meal', label: 'Sit down & eat', e: '🍽️', dur: 25, fx: { hunger: 55, fun: 8, social: 3 }, pose: 'sit', anim: 'eatsit' },
    { k: 'famdinner', label: 'Family dinner', e: '👨‍👩‍👧‍👦', dur: 40, fx: { hunger: 60, fun: 12, social: 28 }, pose: 'sit', anim: 'eatsit', bond: 6, all: 'dinner' }] },
  { id: 'shower', name: 'Shower', p: [5.3, -3.7], rot: 0, spot: [5.3, -3.75], face: Math.PI, boxes: [[4.65, 5.95, -4.6, -3.2]], appr: [5.3, -2.7], acts: [
    { k: 'shower', label: 'Take a shower', e: '🚿', dur: 25, fx: { hygiene: 100, fun: 5 }, pose: 'stand', anim: 'wash' }] },
  { id: 'toilet', bp: ['', 'toilet.sink'], name: 'Toilet', p: [3.2, -4.1], rot: 0, spot: [3.2, -4.1], face: 0, boxes: [[2.95, 3.45, -4.6, -3.78], [3.8, 4.3, -4.6, -4.15]], appr: [3.2, -3.2], acts: [
    { k: 'wc', label: 'Use toilet', e: '🚽', dur: 8, fx: { bladder: 100 }, pose: 'sit', anim: 'wc' }] },
  { id: 'tv', bp: ['', 'tv.cab', 'tv.side'], name: 'Sofa & TV', p: [-3, 1.2], rot: -Math.PI / 2, spot: [-3, 1.2], face: -Math.PI / 2, boxes: [[-3.5, -2.5, .1, 2.3], [-5.9, -5.3, .4, 2], [-3.3, -2.7, 2.4, 3]], appr: [-4, 1.2], acts: [
    { k: 'tv', label: 'Watch Nollywood', e: '📺', dur: 90, fx: { fun: 45, energy: -5 }, pose: 'sit', pow: true, anim: 'tv' },
    { k: 'game', label: 'Play video games', e: '🎮', dur: 80, fx: { fun: 55, energy: -8, hunger: -6 }, pose: 'sit', pow: true, anim: 'game' },
    { k: 'chill', label: 'Relax on sofa', e: '🛋️', dur: 45, fx: { fun: 15, energy: 10 }, pose: 'sit', anim: 'chill' }] },
  { id: 'desk', bp: ['', 'desk.chair'], sp: 'desk.chair', name: 'Computer', p: [3.4, 2], rot: 0, spot: [3.4, 2.85], face: Math.PI, boxes: [[2.55, 4.25, 1.6, 2.4], [3.15, 3.65, 2.55, 3.1]], appr: [3.4, 3.6], acts: [
    { k: 'work', label: 'Freelance gig', e: '💻', dur: 180, fx: { energy: -25, fun: -15, hunger: -10 }, pose: 'sit', pay: 6000, pow: true, anim: 'work' },
    { k: 'hustle', label: 'Side hustle', e: '🧾', dur: 150, fx: { energy: -18, fun: -8, hunger: -7 }, pose: 'sit', pay: 3500, pow: true, anim: 'work' },
    { k: 'browse', label: 'Scroll social media', e: '📱', dur: 40, fx: { fun: 25, social: 10, energy: -4 }, pose: 'sit', pow: true, anim: 'browse' }] },
  { id: 'phone', name: 'Phone', p: [-1.2, 3.2], rot: 0, spot: [-1.2, 2.4], face: 0, boxes: [[-1.5, -.9, 2.9, 3.5]], acts: [
    { k: 'call', label: 'Call a friend', e: '📞', dur: 40, fx: { social: 45, fun: 10 }, pose: 'stand', anim: 'phone' },
    { k: 'chat', label: 'Chat on WhatsApp', e: '💬', dur: 20, fx: { social: 22 }, pose: 'stand', anim: 'chat' },
    { k: 'order', label: 'Order food delivery', e: '🛵', dur: 25, fx: { hunger: 45, fun: 5 }, pose: 'stand', cost: 6500, anim: 'phone' }] },
  { id: 'mat', name: 'Workout mat', p: [1.4, -.9], rot: 0, spot: [1.4, -.9], face: 0, acts: [
    { k: 'squat', label: 'Squats workout', e: '🏋️', dur: 45, fx: { energy: -22, hunger: -12, hygiene: -15, fun: 15 }, pose: 'stand', anim: 'squat' },
    { k: 'yoga', label: 'Yoga', e: '🧘', dur: 40, fx: { energy: 8, fun: 12 }, pose: 'stand', anim: 'yoga' }] },
  { id: 'radio', name: 'Speaker', p: [4.2, -1.3], rot: 0, spot: [3.5, -1.3], face: Math.PI / 2, boxes: [[4, 4.4, -1.55, -1.05]], acts: [
    { k: 'music', label: 'Play Afrobeats', e: '🎵', dur: 40, fx: { fun: 25 }, pose: 'stand', pow: true, anim: 'music' },
    { k: 'dance', label: 'Dance party', e: '💃', dur: 35, fx: { fun: 40, energy: -12, social: 5, hygiene: -8 }, pose: 'stand', pow: true, anim: 'dance' }] },
  { id: 'shelf', name: 'Bookshelf', p: [-6.05, -.45], rot: 0, spot: [-5.2, -.45], face: -Math.PI / 2, boxes: [[-6.25, -5.8, -1, .1]], acts: [
    { k: 'read', label: 'Read a book', e: '📖', dur: 60, fx: { fun: 20, energy: -4 }, pose: 'stand', anim: 'read' }] },
  { id: 'plant', name: 'Plant', p: [5.5, 3.4], rot: 0, spot: [4.6, 3.4], face: Math.PI / 2, boxes: [[5.2, 5.8, 3.1, 3.7]], acts: [
    { k: 'plant', label: 'Water the plant', e: '🌿', dur: 10, fx: { fun: 8 }, pose: 'stand', anim: 'water' }] },
  { id: 'door', name: 'Front door', p: [-6.2, 3.5], rot: 0, spot: [-5.3, 3.5], face: -Math.PI / 2, acts: [
    { k: 'door', label: 'Go outside', e: '🚪', dur: 4, fx: {}, pose: 'stand', anim: 'door' }] },
  { id: 'gen', name: 'Generator', p: [5.3, .4], rot: 0, spot: [4.4, .4], face: Math.PI / 2, boxes: [[4.85, 5.75, .1, .7]], acts: [
    { k: 'gen', label: 'Fuel generator', e: '⛽', dur: 15, fx: {}, pose: 'stand', cost: 2000, anim: 'fuel' }] },
  { id: 'toybox', name: 'Toy box', p: [7.3, 3.95], rot: 0, spot: [7.3, 3.0], face: 0, boxes: [[6.78, 7.82, 3.62, 4.28]], acts: [
    { k: 'toys', label: 'Build blocks with the kids', e: '🧱', dur: 30, fx: { fun: 30, social: 8 }, pose: 'stand', anim: 'squat', bond: 4, all: 'kids' }] },
  { id: 'kdesk', name: "Kids' desk", p: [10.9, .5], rot: -Math.PI / 2, spot: [10.05, .5], face: Math.PI / 2, boxes: [[10.45, 11.3, -.35, 1.35], [9.8, 10.3, .25, .75]], appr: [9.2, .5], acts: [
    { k: 'kread', label: 'Read a storybook', e: '📖', dur: 25, fx: { fun: 12, social: 6 }, pose: 'sit', anim: 'read', bond: 4, all: 'kids' }] },
  // South wing rooms (bought under Menu > Home upgrades; only present once built)
  { id: 'gbench', name: 'Weight bench', p: [-4.6, 6.3], rot: 0, spot: [-4.6, 7.25], face: Math.PI, boxes: [[-5.35, -3.85, 5.75, 6.85]], acts: [
    { k: 'lift', label: 'Lift weights', e: '🏋️', dur: 45, fx: { energy: -22, hunger: -10, hygiene: -14, fun: 18 }, pose: 'stand', anim: 'squat' },
    { k: 'stretchg', label: 'Stretch & warm down', e: '🤸', dur: 15, fx: { energy: 6, fun: 6 }, pose: 'stand', anim: 'stretch' }] },
  { id: 'gbag', name: 'Punching bag', p: [-3.0, 8.2], rot: 0, spot: [-3.0, 7.5], face: 0, boxes: [[-3.3, -2.7, 7.95, 8.5]], acts: [
    { k: 'box', label: 'Box the punching bag', e: '🥊', dur: 35, fx: { energy: -20, hygiene: -12, fun: 22, hunger: -8 }, pose: 'stand', anim: 'cheer' }] },
  { id: 'cinema', bp: ['', 'cinema.seats'], sp: 'cinema.seats', name: 'Home cinema', p: [.3, 6.3], rot: 0, spot: [.3, 7.6], face: Math.PI, boxes: [[-1.3, 1.9, 4.75, 5.15], [-1.3, 1.9, 7.1, 8.1]], appr: [.3, 6.6], acts: [
    { k: 'movie', label: 'Movie night', e: '🎬', dur: 55, fx: { fun: 60, energy: -4, social: 4 }, pose: 'sit', pow: true, anim: 'tv' },
    { k: 'cgame', label: 'Big-screen gaming', e: '🎮', dur: 45, fx: { fun: 58, energy: -8, hunger: -6 }, pose: 'sit', pow: true, anim: 'game' }] },
  { id: 'odesk', bp: ['', 'odesk.chair'], sp: 'odesk.chair', name: 'Executive desk', p: [4.4, 5.4], rot: 0, spot: [4.4, 6.2], face: Math.PI, boxes: [[3.5, 5.3, 5.0, 5.8], [4.15, 4.65, 5.95, 6.5]], appr: [4.4, 7.0], acts: [
    { k: 'bizplan', label: 'Run the business', e: '📈', dur: 160, fx: { energy: -22, fun: -12, hunger: -8 }, pose: 'sit', pay: 14000, pow: true, anim: 'work' },
    { k: 'obrowse', label: 'Catch up online', e: '📱', dur: 30, fx: { fun: 20, social: 8, energy: -3 }, pose: 'sit', pow: true, anim: 'browse' }] },
  { id: 'oshelf', name: 'Library wall', p: [5.85, 7.7], rot: 0, spot: [5.0, 7.7], face: Math.PI / 2, boxes: [[5.6, 6.1, 6.9, 8.6]], acts: [
    { k: 'lread', label: 'Study in the library', e: '📚', dur: 60, fx: { fun: 22, energy: -5 }, pose: 'stand', anim: 'read' }] },
  // Luxury items (bought under Menu > Home upgrades; only present once owned)
  { id: 'massage', name: 'Massage chair', p: [-2.2, 4.0], rot: 0, spot: [-2.2, 3.2], face: 0, boxes: [[-2.6, -1.8, 3.6, 4.3]], acts: [
    { k: 'massage', label: 'Massage', e: '💆', dur: 30, fx: { energy: 45, fun: 12, hygiene: 3 }, pose: 'stand', pow: true, anim: 'stretch' }] },
  { id: 'aquarium', name: 'Aquarium', p: [.2, 4.05], rot: 0, spot: [.2, 3.2], face: 0, boxes: [[-.4, .8, 3.8, 4.3]], acts: [
    { k: 'fish', label: 'Watch the fish', e: '🐠', dur: 15, fx: { fun: 18, energy: 4 }, pose: 'stand', anim: 'think' }] },
  { id: 'treadmill', name: 'Treadmill', p: [1.7, 3.65], rot: 0, spot: [1.7, 2.7], face: 0, boxes: [[1.35, 2.05, 3.0, 4.3]], acts: [
    { k: 'run', label: 'Run on the treadmill', e: '🏃', dur: 40, fx: { energy: -20, hunger: -10, hygiene: -12, fun: 20 }, pose: 'stand', pow: true, anim: 'squat' }] },
];
// Objects that only exist once the matching home upgrade is bought (object id -> upgrade id).
const GATE: Record<string, string> = { massage: 'massage', aquarium: 'aquarium', treadmill: 'treadmill', gbench: 'gym_room', gbag: 'gym_room', cinema: 'cinema_room', odesk: 'office_room', oshelf: 'office_room' };
const LUX_IDS = new Set(Object.keys(GATE));
const has = (id: string) => HOME.own.has(id);
const hasObj = (id: string) => !GATE[id] || HOME.own.has(GATE[id]);
const EMOTES: Act[] = [
  { k: 'wave', label: 'Wave', e: '👋', dur: 6, fx: { social: 8 }, pose: 'stand', anim: 'wave' },
  { k: 'edance', label: 'Dance', e: '🕺', dur: 20, fx: { fun: 22, energy: -6 }, pose: 'stand', anim: 'dance' },
  { k: 'cheer', label: 'Cheer', e: '🙌', dur: 8, fx: { fun: 10 }, pose: 'stand', anim: 'cheer' },
  { k: 'stretch', label: 'Stretch', e: '🤸', dur: 10, fx: { energy: 4, fun: 4 }, pose: 'stand', anim: 'stretch' },
  { k: 'think', label: 'Think', e: '🤔', dur: 8, fx: { fun: 3 }, pose: 'stand', anim: 'think' },
];
const DECOR: { id: string; p: [number, number]; rot: number; boxes: Box[]; vis: string }[] = [
  { id: 'coffee', p: [-4.75, 1.2], rot: 0, boxes: [[-5, -4.5, .75, 1.65]], vis: 'coffee' },
  { id: 'fan', p: [5.5, -1.8], rot: -Math.PI / 2, boxes: [[5.3, 5.7, -2, -1.6]], vis: 'fan' },
  { id: 'kbedA', p: [7.5, -3.4], rot: 0, boxes: [[6.85, 8.15, -4.4, -2.4]], vis: 'kbedA' },
  { id: 'kbedB', p: [10.2, -3.4], rot: 0, boxes: [[9.55, 10.85, -4.4, -2.4]], vis: 'kbedB' },
  { id: 'nstand', p: [8.85, -4.15], rot: 0, boxes: [[8.6, 9.1, -4.4, -3.9]], vis: 'nstand' },
  { id: 'kwar', p: [11.0, -1.4], rot: -Math.PI / 2, boxes: [[10.7, 11.3, -2.1, -.7]], vis: 'kwar' },
];
// Half-height wall between the flat and the kids' wing, with a doorway at z 1.0 to 2.6.
const SWALLS: Blk[] = [{ id: 'swall', b: [6.1, 11.4, 4.65, 9.3] }]; // fills the void south of the kids' wing and walls off the east side of the south wing
const WALLS: Blk[] = [{ id: 'wall', b: [6.1, 6.3, -4.6, 1.0] }, { id: 'wall', b: [6.1, 6.3, 2.6, 4.6] }];

// Every solid footprint in the flat. Walking is planned around these (see lib/collision.ts) and re-checked every frame.
// What your home has: rooms and luxury items bought under Menu > Home upgrades (saved on the server, see /api/home).
const HOME = { own: new Set<string>() };
type HomeLayout = Record<string, { x: number; z: number; r: number }>;
const HOME_LAYOUT: HomeLayout = {};
const HOME_OWNED: { id:string; itemKey:string; name:string; e:string; cat:string; cost:number; condition:number; x:number; z:number; r:number; fp?:[number,number] }[] = [];
const HOME_SOLD = new Set<string>();
// Pieces of a bigger object that can be moved on their own (key = '<object>.<part>', value = pivot in the object's local frame).
const PART_AT: Record<string, [number, number]> = { 'tv.cab': [0, 2.6], 'tv.side': [1.5, 0], 'desk.chair': [0, .85], 'odesk.chair': [0, .95], 'dining.c1': [0, .8], 'dining.c2': [-.5, .8], 'dining.c3': [-1, 0], 'dining.c4': [1, 0], 'bed.stand': [1.15, -1], 'fridge.counter': [1.34, -.19], 'toilet.sink': [.85, -.3], 'cinema.seats': [0, 1.3] };
const PART_NAMES: Record<string, string> = { 'tv.cab': 'TV & TV stand', 'tv.side': 'Side table & lamp', 'desk.chair': 'Desk chair', 'odesk.chair': 'Office chair', 'dining.c1': 'Dining chair', 'dining.c2': 'Small dining chair', 'dining.c3': 'Dining chair (left)', 'dining.c4': 'Dining chair (right)', 'bed.stand': 'Bedside table & lamp', 'fridge.counter': 'Kitchen counter', 'toilet.sink': 'Sink & mirror', 'cinema.seats': 'Cinema seats' };
const BASE_NAMES: Record<string, string> = { tv: 'Sofa', desk: 'Desk', odesk: 'Executive desk', bed: 'Bed', dining: 'Dining table', fridge: 'Fridge', toilet: 'Toilet', coffee: 'Coffee table', fan: 'Standing fan', kbedA: "Kids' bed (left)", kbedB: "Kids' bed (right)", nstand: "Kids' nightstand", kwar: "Kids' wardrobe" };
const EDITABLE_HOME_IDS = new Set(OBJ.map(o => o.id).concat(DECOR.map(d => d.id), Object.keys(PART_AT)).filter(id => id !== 'door'));
const homeName = (id: string) => HOME_OWNED.find(i => i.id === id)?.name || PART_NAMES[id] || BASE_NAMES[id] || OBJ.find(o => o.id === id)?.name || id;
const rotXZ = (a: number, x: number, z: number): [number, number] => [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];
const homeT = (id: string) => HOME_LAYOUT[id] || { x: 0, z: 0, r: 0 };
const movedP = (p: P, id: string): P => { const t = homeT(id); return [p[0] + t.x, p[1] + t.z]; };
const movedObj = (o: Obj): Obj => { const t = homeT(o.id); const sk = o.sp || o.id; const p = movedP(o.p, o.id); const spot = movedP(o.spot, sk); const appr = o.appr ? movedP(o.appr, sk) : undefined; const boxes = (o.boxes || []).map((b, i) => { const tb = homeT(o.bp?.[i] || o.id); return [b[0] + tb.x, b[1] + tb.x, b[2] + tb.z, b[3] + tb.z] as Box; }); return { ...o, p, rot: o.rot + t.r, spot, appr, boxes, face: o.face + homeT(sk).r }; };
const movedDecor = (d: typeof DECOR[number]) => { const t = homeT(d.id); return { ...d, p: movedP(d.p, d.id), rot: d.rot + t.r, boxes: d.boxes.map(b => [b[0] + t.x, b[1] + t.x, b[2] + t.z, b[3] + t.z] as Box) }; };
const movedOwned = (i: typeof HOME_OWNED[number]) => { const t=homeT(i.id); return { ...i, x:i.x+t.x, z:i.z+t.z, r:i.r+t.r }; };
const ownedBox = (i: typeof HOME_OWNED[number]): Box => { const m=movedOwned(i), w=i.fp?.[0]||.8, d=i.fp?.[1]||.6; return [m.x-w/2,m.x+w/2,m.z-d/2,m.z+d/2]; };
const resetHomeLayout = () => { for (const k of Object.keys(HOME_LAYOUT)) delete HOME_LAYOUT[k]; };

// Drag-and-drop bridge: World fills this in every render so pieces rendered inside VIS (see Part) can start a drag.
const EDIT: { on: boolean; down: (id: string, e: any) => void; pick: (id: string) => void } = { on: false, down: () => {}, pick: () => {} };
// Wraps one piece of a composite object so it moves independently of the rest (cancels the parent's own move, then applies its own).
function Part({ id, children, rel }: { id: string; children: ReactNode; rel?: boolean }) {
  const base = id.split('.')[0], raw = OBJ.find(o => o.id === base)!, at = PART_AT[id], tb = homeT(base), own = homeT(id);
  const a = rotXZ(raw.rot, at[0], at[1]);
  const [lx, lz] = rotXZ(-(raw.rot + tb.r), a[0] - tb.x + own.x, a[1] - tb.z + own.z);
  return <group position={[lx, 0, lz]} rotation-y={own.r - tb.r}
    onPointerDown={EDIT.on ? (e: any) => EDIT.down(id, e) : undefined}
    onClick={EDIT.on ? (e: any) => { if (e.delta > 4) return; e.stopPropagation(); EDIT.pick(id); } : undefined}>
    {rel ? children : <group position={[-at[0], 0, -at[1]]}>{children}</group>}</group>;
}
// Where an editable piece currently stands (for the selection ring).
const homePos = (id: string): P | null => {
  const t = homeT(id);
  if (id.includes('.')) { const raw = OBJ.find(o => o.id === id.split('.')[0]), at = PART_AT[id]; if (!raw || !at) return null; const a = rotXZ(raw.rot, at[0], at[1]); return [raw.p[0] + a[0] + t.x, raw.p[1] + a[1] + t.z]; }
  const o = OBJ.find(x => x.id === id); if (o) return [o.p[0] + t.x, o.p[1] + t.z];
  const d = DECOR.find(x => x.id === id); if (d) return [d.p[0] + t.x, d.p[1] + t.z];
  const w = HOME_OWNED.find(x => x.id === id); if (w) { const m = movedOwned(w); return [m.x, m.z]; }
  return null;
};

const southOn = () => HOME.own.has('south_wing'); // the south wing extension (gym, cinema and office go in it)
const wingOn = () => HOME.own.has('kids_room'); // the kids' wing (beds, desk, toy box, dividing wall) only exists once you build it
const WING_IDS = new Set(['toybox', 'kdesk', 'kbedA', 'kbedB', 'nstand', 'kwar']);
const BL_BASE: Blk[] = [...HOME_OWNED.flatMap(o => [{ id:o.id, b:ownedBox(o) }]), ...OBJ.flatMap(o => (o.boxes || []).map(b => ({ id: o.id, b }))), ...DECOR.flatMap(d => d.boxes.map(b => ({ id: d.id, b }))), ...WALLS];
let blKey = '\0', blList: Blk[] = [];
const BL = (): Blk[] => {
  const key = (wingOn() ? 'w' : '') + (southOn() ? 's' : '') + [...LUX_IDS].filter(hasObj).join(',') + JSON.stringify(HOME_LAYOUT);
  if (key !== blKey) { blKey = key; blList = [...HOME_OWNED.flatMap(o => [{ id:o.id, b:ownedBox(o) }]), ...OBJ.flatMap(o => (movedObj(o).boxes || []).map(b => ({ id: o.id, b }))), ...DECOR.flatMap(d => movedDecor(d).boxes.map(b => ({ id: d.id, b }))), ...WALLS, ...(southOn() ? SWALLS : [])].filter(k => (wingOn() || (!WING_IDS.has(k.id) && k.id !== 'wall')) && hasObj(k.id)); }
  return blList;
};
// Apply what the server says you own: build/remove the wing, move the family in, show the luxury items.
function applyHome(ids: string[]) {
  HOME.own = new Set(ids); setEastLimit(wingOn()); setSouthLimit(southOn());
  if (!wingOn() && S.pos[0] > 5.5) { S.pos = [4.8, S.pos[1]]; S.q = []; S.cur = null; }
  if (!southOn() && S.pos[1] > 4.1) { S.pos = [S.pos[0], 3.7]; S.q = []; S.cur = null; }
  if (has('solar')) S.power = true;
  const fam = HOME.own.has('family') && wingOn(); if (fam !== F.on) F.setOn(fam);
}
const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const W = (p: P, own?: string): Task => ({ t: 'walk', x: p[0], z: p[1], own });
const within = (p: P) => OBJ.map(movedObj).find(o => o.appr && o.boxes?.some(b => inside(p, b)));
// Route that first steps OUT of whatever you are sitting/standing in, walks around furniture, then steps INTO the target seat/shower.
function route(from: P, to: P, tgt?: Obj): Task[] {
  const so = within(from), out: Task[] = []; let a = from;
  if (so && so === tgt) return [];
  if (so) { out.push(W(so.appr!, so.id)); a = so.appr!; }
  if (tgt?.appr) { out.push(...findPath(BL(), a, tgt.appr).map(p => W(p))); out.push(W(to, tgt.id)); } else out.push(...findPath(BL(), a, to).map(p => W(p)));
  return out;
}
// Lets the React shell react to things that happen inside the sim (leave the house, change clothes).
const H: { door?: () => void; outfit?: () => void } = {};
const find = (id: string) => movedObj(OBJ.find(o => o.id === id)!);

const NEW = () => ({ pos: [0, .5] as [number, number], rot: 0, pose: 'stand' as Pose, needs: { hunger: 78, energy: 72, hygiene: 70, bladder: 70, fun: 55, social: 50 } as Record<N, number>,
  min: worldMinute(), cash: 0, meals: 0, supplies: 0, power: true, speed: 1, free: true, q: [] as Task[], cur: null as Task | null, prog: 0, toast: '', toastT: 0, cool: 0, stuck: 0 });
const S = NEW();
const say = (m: string) => { S.toast = m; S.toastT = Date.now(); };
AUTO.minNeed = () => Math.min(...Object.values(S.needs)); // free-will work: the building / city drivers read these
AUTO.drain = () => { (['hunger', 'energy', 'hygiene', 'bladder', 'fun'] as N[]).forEach(k => { S.needs[k] = cl(S.needs[k] - (k === 'hunger' || k === 'energy' ? 7 : 4)); }); };
const walk = (x: number, z: number) => { S.cur = null; S.q = route(S.pos as P, [x, z]); };
const tail = (): P => { let p: P = [S.pos[0], S.pos[1]]; if (S.cur?.t === 'walk') p = [S.cur.x, S.cur.z]; for (const t of S.q) if (t.t === 'walk') p = [t.x, t.z]; return p; };
const enq = (o: Obj, a: Act) => { if (S.q.length > 12) return; S.q.push(...route(tail(), o.spot, o), { t: 'act', a, o }); };
// Emotes play right where you stand, no furniture needed.
const emote = (a: Act) => { S.q = []; S.prog = 0; S.cur = { t: 'act', a, o: { id: 'self', name: 'You', p: [0, 0], rot: 0, spot: [S.pos[0], S.pos[1]], face: S.rot, acts: [] } }; };
const turn = (r: number, t: number, f: number) => r + ((((t - r + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) * f;

// ---- Family: a spouse and two kids who live in the house and follow their own daily routine (see plan()). ----
type WP = { x: number; z: number; own?: string };
type Dest = { key: string; label: string; e: string; spot: P; face: number; pose: Pose; anim?: string; appr?: P; own?: string; lie?: { x: number; y: number; z: number } };
type Mem = { id: string; name: string; kid: boolean; h: number; pos: P; rot: number; pose: Pose; anim?: string; q: WP[]; cur: WP | null; dest: Dest | null; at: Dest | null; away: boolean; bond: number; hold: { key: string; until: number } | null; stuck: number; init: boolean };
const dst = (key: string, label: string, e: string, spot: P, face: number, pose: Pose, anim?: string, x: Partial<Dest> = {}): Dest => ({ key, label, e, spot, face, pose, anim, ...x });
const PI = Math.PI;
// Every place a family member can be. `appr` = free spot beside a seat/bed where they step in/out, `own` = furniture they are allowed to overlap there.
const DEST: Record<string, Dest> = {
  'bed.spouse': dst('bed.spouse', 'Sleeping', '💤', [-3.3, -1.9], 0, 'sleep', undefined, { lie: { x: -4.25, y: .86, z: -2.45 } }),
  'bed.chidi': dst('bed.chidi', 'Sleeping', '💤', [10.2, -1.95], PI, 'sleep', undefined, { lie: { x: 10.2, y: .64, z: -2.95 } }),
  'bed.amara': dst('bed.amara', 'Sleeping', '💤', [7.5, -1.95], PI, 'sleep', undefined, { lie: { x: 7.5, y: .61, z: -2.95 } }),
  'eat.spouse': dst('eat.spouse', 'Eating', '🍽️', [.7, -2.3], -PI / 2, 'sit', 'eatsit', { appr: [.9, -1.55], own: 'dining' }),
  'eat.chidi': dst('eat.chidi', 'Eating', '🍽️', [-1.3, -2.3], PI / 2, 'sit', 'eatsit', { appr: [-1.45, -1.55], own: 'dining' }),
  'eat.amara': dst('eat.amara', 'Eating', '🍽️', [-.8, -1.5], PI, 'sit', 'eatsit', { appr: [-1.0, -.85], own: 'dining' }),
  cook: dst('cook', 'Cooking', '🍛', [-.7, -3.3], PI, 'stand', 'cook'),
  'tv.spouse': dst('tv.spouse', 'Watching TV', '📺', [-3, .6], -PI / 2, 'sit', 'tv', { appr: [-4, .55], own: 'tv' }),
  'tv.chidi': dst('tv.chidi', 'Watching TV', '📺', [-3, 1.85], -PI / 2, 'sit', 'tv', { appr: [-4, 1.9], own: 'tv' }),
  'desk.chidi': dst('desk.chidi', 'Homework', '📚', [10.05, .5], PI / 2, 'sit', 'read', { appr: [9.2, .5], own: 'kdesk' }),
  'rug.chidi': dst('rug.chidi', 'Playing', '🧸', [8.4, 1.1], 2.2, 'stand', 'cheer'),
  'rug.amara': dst('rug.amara', 'Playing', '🧸', [9.3, 2.0], -.8, 'stand', 'dance'),
  'toy.chidi': dst('toy.chidi', 'Playing', '🧸', [7.0, 3.0], 0, 'stand', 'squat'),
  'toy.amara': dst('toy.amara', 'Playing', '🧸', [7.7, 3.0], 0, 'stand', 'squat'),
  shelf: dst('shelf', 'Reading', '📖', [-5.2, -.5], -PI / 2, 'stand', 'read'),
  phone: dst('phone', 'On the phone', '📞', [-1.2, 2.4], 0, 'stand', 'chat'),
  yoga: dst('yoga', 'Doing yoga', '🧘', [1.4, -.9], 0, 'stand', 'yoga'),
  water: dst('water', 'Watering the plant', '🌿', [4.6, 3.4], PI / 2, 'stand', 'water'),
  groom: dst('groom', 'Getting ready', '🪞', [-1.9, -3.4], PI, 'stand', 'groom'),
  away: dst('away', 'Heading out', '🚪', [-5.3, 3.5], -PI / 2, 'stand'),
};
const mkMem = (id: string, name: string, kid: boolean, h: number): Mem => ({ id, name, kid, h, pos: [0, 0], rot: 0, pose: 'stand', q: [], cur: null, dest: null, at: null, away: false, bond: 30, hold: null, stuck: 0, init: false });
const F = {
  last: 0, on: false,   // nobody lives with you until YOU choose to start a family (Menu > Family)
  all: [mkMem('spouse', 'Ada', false, 1), mkMem('chidi', 'Chidi', true, .62), mkMem('amara', 'Amara', true, .48)],
  get mem(): Mem[] { return this.on ? this.all : []; },
  setOn(v: boolean) { this.on = v; setEastLimit(wingOn()); this.last = 0; this.all.forEach(m => Object.assign(m, { pos: [0, 0] as P, rot: 0, pose: 'stand' as Pose, anim: undefined, q: [], cur: null, dest: null, at: null, away: false, hold: null, stuck: 0, init: false })); },
  reset() { this.on = false; HOME.own = new Set(); setEastLimit(false); setSouthLimit(false); this.last = 0; this.all.forEach(m => Object.assign(m, { pos: [0, 0] as P, rot: 0, pose: 'stand' as Pose, anim: undefined, q: [], cur: null, dest: null, at: null, away: false, bond: 30, hold: null, stuck: 0, init: false })); },
  load(b: unknown, on?: unknown) { this.on = on === true; setEastLimit(wingOn()); const o = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>; this.all.forEach(m => { const v = o[m.id]; m.bond = typeof v === 'number' && isFinite(v) ? cl(v) : 30; }); },
  bonds() { return Object.fromEntries(this.all.map(m => [m.id, Math.round(m.bond * 10) / 10])); },
  hold(id: string, key: string, mins: number) { const m = this.mem.find(x => x.id === id); if (m) m.hold = { key, until: S.min + mins }; },
  bump(id: string, n: number) { const m = this.mem.find(x => x.id === id); if (m) m.bond = cl(m.bond + n); },
};
const famAvg = () => F.mem.length ? F.mem.reduce((a, m) => a + m.bond, 0) / F.mem.length : 0;
const famSnap = () => F.mem.map(m => ({ id: m.id, name: m.name, bond: Math.round(m.bond), away: m.away, e: m.away ? (m.kid ? '🏫' : '🛍️') : m.dest?.e ?? '🏠', label: m.away ? (m.kid ? 'At school' : 'Out shopping') : m.dest?.label ?? 'At home' }));

// What each person wants to be doing at hour h. Kids go to school Mon-Fri (a week = 7 days, days 6-7 are the weekend).
function plan(m: Mem, h: number, wd: boolean, slot: number): string {
  const pick = (a: string[]) => a[(slot + (m.id === 'chidi' ? 1 : m.id === 'amara' ? 2 : 0)) % a.length];
  if (!m.kid) {
    if (h >= 22.5 || h < 6.5) return 'bed';
    if (h < 7.4) return 'cook'; if (h < 8.3) return 'eat';
    if (h < 10) return pick(['water', 'groom', 'shelf']);
    if (h < 12.5) return wd ? 'away' : pick(['yoga', 'phone']);
    if (h < 13.2) return 'cook'; if (h < 14.2) return 'eat';
    if (h < 17) return pick(['shelf', 'phone', 'tv', 'water']);
    if (h < 18.4) return 'cook'; if (h < 19.4) return 'eat';
    return 'tv';
  }
  const bed = m.id === 'amara' ? 20.5 : 21.5;
  if (h >= bed || h < 6.8) return 'bed';
  if (h < 7.8) return 'eat';
  if (wd && h < 14.2) return 'away';
  if (h >= 18.6 && h < 19.5) return 'eat';
  if (!wd && h >= 12.3 && h < 13.2) return 'eat';
  if (m.id === 'chidi' && h >= 15 && h < 16.5) return 'desk';
  if (m.id === 'chidi' && h >= 19.5) return 'tv';
  return pick(['rug', 'toy']);
}
function goTo(m: Mem, d: Dest) {
  const out = m.at?.appr && m.at.key !== d.key ? m.at : null; // step out of the seat first
  m.dest = d; m.cur = null; m.q = []; m.at = null; m.pose = 'stand'; m.anim = undefined;
  if (m.away) { m.away = false; m.pos = [-5.3, 3.5]; }
  let a: P = [m.pos[0], m.pos[1]];
  if (out?.appr) { m.q.push({ x: out.appr[0], z: out.appr[1], own: out.own }); a = out.appr; }
  const target = d.appr || d.spot;
  findPath(BL(), a, target).forEach(p => m.q.push({ x: p[0], z: p[1] }));
  if (d.appr) m.q.push({ x: d.spot[0], z: d.spot[1], own: d.own });
}
function famTick(dt: number) {
  const hh = (S.min / 60) % 24, wd = Math.floor(S.min / 1440) % 7 < 5, slot = Math.floor(S.min / 70);
  if (Math.abs(S.min - F.last) > 45) F.mem.forEach(m => { m.init = false; m.hold = null; m.q = []; m.cur = null; }); // big time jump (back from the city): everyone is simply where they should be
  F.last = S.min;
  for (const m of F.mem) {
    m.bond = cl(m.bond - .0012 * dt * 6 * S.speed);
    if (m.hold && m.hold.until <= S.min) m.hold = null;
    const key = m.hold ? m.hold.key : plan(m, hh, wd, slot);
    const d = key === 'stay' ? (m.at || m.dest) : (DEST[key + '.' + m.id] || DEST[key]);
    if (!d) continue;
    if (!m.init) { m.init = true; m.dest = m.at = d; m.away = d.key === 'away'; if (!m.away) { m.pos = [d.spot[0], d.spot[1]]; m.rot = d.face; m.pose = d.pose; m.anim = d.anim; } continue; }
    if (d !== m.dest) goTo(m, d);
    if (m.away) continue;
    if (!m.cur) m.cur = m.q.shift() || null;
    if (m.cur) {
      m.pose = 'stand'; m.anim = undefined;
      const dx = m.cur.x - m.pos[0], dz = m.cur.z - m.pos[1], dd = Math.hypot(dx, dz);
      if (dd < .1) { m.cur = null; continue; }
      const st = Math.min(dd, (m.kid ? 1.8 : 2.2) * dt * S.speed);
      let nx = m.pos[0] + dx / dd * st, nz = m.pos[1] + dz / dd * st;
      if (blocked(BL(), [nx, nz], m.cur.own, HARD)) { // same rule as the player: never step into furniture
        if (!blocked(BL(), [nx, m.pos[1]], m.cur.own, HARD)) nz = m.pos[1]; else if (!blocked(BL(), [m.pos[0], nz], m.cur.own, HARD)) nx = m.pos[0]; else { nx = m.pos[0]; nz = m.pos[1]; }
      }
      m.stuck = Math.hypot(nx - m.pos[0], nz - m.pos[1]) < st * .3 ? m.stuck + dt : 0;
      if (m.stuck > 1.2) { m.stuck = 0; m.q = []; m.cur = null; if (m.dest) m.pos = [m.dest.spot[0], m.dest.spot[1]]; continue; } // wedged: just place them at their spot
      m.pos = [nx, nz]; m.rot = turn(m.rot, Math.atan2(dx, dz), Math.min(1, dt * 10));
    } else if (m.dest) {
      m.at = m.dest;
      if (m.dest.key === 'away') m.away = true;
      else { m.pose = m.dest.pose; m.anim = m.dest.anim; m.rot = turn(m.rot, m.dest.face, Math.min(1, dt * 8)); }
    }
  }
}
// Things you can do with them. Bonds are saved with the game; a happy home slows how fast your Social need drops.
const FA: Record<string, Act> = {
  talk: { k: 'ftalk', label: 'Have a chat', e: '💬', dur: 15, fx: { social: 18 }, pose: 'stand', anim: 'chat', bond: 3 },
  hug: { k: 'fhug', label: 'Give a hug', e: '🤗', dur: 6, fx: { social: 8, fun: 4 }, pose: 'stand', anim: 'cheer', bond: 4 },
  play: { k: 'fplay', label: 'Play together', e: '🧸', dur: 40, fx: { fun: 35, social: 12, energy: -6 }, pose: 'stand', anim: 'dance', bond: 7 },
  hw: { k: 'fhw', label: 'Help with homework', e: '📚', dur: 35, fx: { social: 8, fun: 3 }, pose: 'stand', anim: 'read', bond: 6 },
  story: { k: 'fstory', label: 'Read a story', e: '📖', dur: 20, fx: { social: 10, fun: 6 }, pose: 'stand', anim: 'read', bond: 5 },
  date: { k: 'datenight', label: 'Date night', e: '🌹', dur: 60, fx: { fun: 30, social: 35, hunger: 25 }, pose: 'stand', cost: 8000, anim: 'chat', bond: 10 },
  kiss: { k: 'fkiss', label: 'Kiss goodnight', e: '😘', dur: 4, fx: { social: 5 }, pose: 'stand', anim: 'wave', bond: 3 },
};
function famObj(id: string): Obj {
  const m = F.mem.find(x => x.id === id)!, asleep = m.pose === 'sleep', base: P = asleep && m.at?.lie ? [m.at.lie.x, m.at.lie.z] : [m.pos[0], m.pos[1]];
  const sp: P = [m.pos[0] + .6, m.pos[1] + .15], acts = asleep ? [FA.kiss] : !m.kid ? [FA.talk, FA.hug, FA.date] : m.id === 'chidi' ? [FA.talk, FA.hug, FA.play, FA.hw] : [FA.talk, FA.hug, FA.play, FA.story];
  return { id: 'fam:' + id, name: m.name + (asleep ? ' 💤' : ''), p: base, rot: 0, spot: sp, face: Math.atan2(m.pos[0] - sp[0], m.pos[1] - sp[1]), acts, fam: id };
}
function famStart(o: Obj, a: Act) {
  if (a.all === 'dinner') F.mem.forEach(m => { if (!m.away) m.hold = { key: 'eat', until: S.min + a.dur + 6 }; });
  else if (o.fam) F.hold(o.fam, 'stay', a.dur + 3);
}
function famDone(o: Obj, a: Act) {
  const n = a.bond || 0; if (!n) return;
  if (a.all) F.mem.forEach(m => { if (!m.away && (a.all === 'dinner' || m.kid)) m.bond = cl(m.bond + n); });
  else if (o.fam) F.bump(o.fam, n); else return;
  say('💞 Family bond +' + n);
}
function famLooks(look: Look): Look[] {
  const man = look.gender === 'm', base = { model: 'citizen', outfitModel: 'tee' };
  F.all[0].name = man ? 'Ada' : 'Emeka';
  return [
    { ...base, name: F.all[0].name, gender: man ? 'f' : 'm', hair: man ? 'braids' : 'short', hairColor: '#0d0907', skin: look.skin, outfit: man ? '#e07aa1' : '#3d5a80', pants: man ? '#2b3a55' : '#222831', height: 1 },
    { ...base, name: 'Chidi', gender: 'm', hair: 'short', hairColor: '#0d0907', skin: look.skin, outfit: '#d18a22', pants: '#3a5a40', height: .62 },
    { ...base, name: 'Amara', gender: 'f', hair: 'bun', hairColor: '#0d0907', skin: look.skin, outfit: '#b43c35', pants: '#6b5a48', height: .5 },
  ];
}

function auto() {
  if (Date.now() < S.cool) return; S.cool = Date.now() + 2500;
  const [k, v] = (Object.entries(S.needs) as [N, number][]).sort((a, b) => a[1] - b[1])[0];
  if (v > 25) return;
  const m: Record<N, [string, string]> = { hunger: S.meals > 0 ? ['fridge', 'cook'] : S.cash >= 6500 ? ['phone', 'order'] : ['fridge', 'water'], energy: ['bed', 'sleep'], hygiene: ['shower', 'shower'], bladder: ['toilet', 'wc'], fun: ['tv', S.power ? 'tv' : 'chill'], social: ['phone', 'call'] };
  const o = find(m[k][0]); enq(o, o.acts.find(a => a.k === m[k][1])!);
}

function tick(dt: number) {
  if (!S.speed) return;
  const gm = dt * 6; S.min = worldMinute(); // time is shared by every player: it follows the world clock and can't be paused or sped up
  const calm = (has('smart_home') ? .88 : 1);
  (Object.keys(S.needs) as N[]).forEach(k => { S.needs[k] = cl(S.needs[k] - DECAY[k] * gm * calm * (k === 'energy' && has('split_ac') ? .7 : 1) * (k === 'hygiene' && has('borehole') ? .75 : 1) * (k === 'hunger' && has('fridge') ? .88 : 1) * (k === 'social' ? 1 - famAvg() / 250 : 1)); });
  famTick(dt);
  if (S.power && !has('solar') && Math.random() < gm / (has('inverter') ? 9000 : 2200)) say('⚡ NEPA took light! Fuel the generator.'), S.power = false;
  if (!S.cur) {
    const t = S.q.shift();
    if (t?.t === 'act') {
      if (t.a.pow && !S.power) { say('No light — fuel the generator first.'); S.q = []; }
      else if (t.a.all === 'dinner' && F.mem.every(m => m.away)) { say("Nobody's home right now."); S.q = []; }
      else if ((t.a.cost || 0) > S.cash) { say("You can't afford that."); S.q = []; }
      else if ((USES[t.a.k]?.meals || 0) > S.meals) { say('🛒 No groceries left! Buy some at the Market or a Supermarket.'); S.q = []; }
      else {
        const u = USES[t.a.k]; let low = false;
        if (u) { S.meals -= u.meals || 0; if (u.supplies) { if (S.supplies >= u.supplies) S.supplies -= u.supplies; else { low = true; say('🧼 Out of toiletries! Restock at the Market, Supermarket or Pharmacy.'); } } pantryUse(t.a.k); }
        S.cash -= t.a.cost || 0; S.cur = { ...t, a: tune(t.a), ...(low ? { low } : {}) }; S.prog = 0; if (t.a.cost || t.a.pay) econ('start', t.a); famStart(t.o, t.a);
      }
    } else if (t) S.cur = t; else if (S.free) auto();
  }
  const c = S.cur;
  if (!c) { S.pose = 'stand'; return; }
  if (c.t === 'walk') {
    S.pose = 'stand';
    const dx = c.x - S.pos[0], dz = c.z - S.pos[1], d = Math.hypot(dx, dz);
    if (d < .1) { S.cur = null; return; }
    const st = Math.min(d, 3 * dt * S.speed);
    let nx = S.pos[0] + dx / d * st, nz = S.pos[1] + dz / d * st;
    if (blocked(BL(), [nx, nz], c.own, HARD)) { // never step into furniture: slide along it, or stop
      if (!blocked(BL(), [nx, S.pos[1]], c.own, HARD)) nz = S.pos[1]; else if (!blocked(BL(), [S.pos[0], nz], c.own, HARD)) nx = S.pos[0]; else { nx = S.pos[0]; nz = S.pos[1]; }
    }
    S.stuck = Math.hypot(nx - S.pos[0], nz - S.pos[1]) < st * .3 ? S.stuck + dt : 0;
    if (S.stuck > .7) { S.stuck = 0; S.cur = null; S.q = []; say('Something is in the way.'); return; }
    S.pos[0] = nx; S.pos[1] = nz; S.rot = turn(S.rot, Math.atan2(dx, dz), Math.min(1, dt * 12));
  } else {
    S.pose = c.a.pose; S.rot = turn(S.rot, c.o.face, Math.min(1, dt * 10));
    const f = Math.min(gm, c.a.dur - S.prog) / c.a.dur; S.prog += gm;
    (Object.entries(c.a.fx) as [N, number][]).forEach(([k, v]) => { S.needs[k] = cl(S.needs[k] + v * f * (c.low && k === 'hygiene' && v > 0 ? .4 : 1)); });
    if (S.prog >= c.a.dur) {
      if (c.a.pay) econ('finish', c.a);
      if (c.a.k === 'gen') { S.power = true; say('💡 Light is back!'); }
      famDone(c.o, c.a);
      if (c.a.k === 'door') H.door?.();
      if (c.a.k === 'outfit') H.outfit?.();
      S.cur = null;
    }
  }
}
/* Home upgrades that change how an action works (see lib/homeUpgrades.ts). */
const tune = (a: Act): Act => {
  let fx = a.fx, dur = a.dur;
  if (a.k === 'shower' && has('water_heater')) fx = { ...fx, fun: (fx.fun || 0) + 10 };
  if (['tv', 'game', 'music', 'dance', 'edance', 'movie', 'cgame'].includes(a.k) && has('surround')) fx = { ...fx, fun: Math.round((fx.fun || 0) * 1.35) };
  if (a.k === 'cook' && has('chef_kitchen')) fx = { ...fx, hunger: Math.round((fx.hunger || 0) * 1.2), fun: (fx.fun || 0) + 10 };
  if (['game', 'cgame'].includes(a.k) && has('gaming_rig')) fx = { ...fx, fun: Math.round((fx.fun || 0) * 1.3) };
  if (['browse', 'obrowse', 'chat', 'call'].includes(a.k) && has('fibre')) fx = { ...fx, fun: Math.round((fx.fun || 0) * 1.3), social: Math.round((fx.social || 0) * 1.3) };
  if (a.k === 'sleep' && has('ortho')) dur = 75;
  return fx === a.fx && dur === a.dur ? a : { ...a, fx, dur };
};
// Tell the server a home action used up groceries / toiletries; it is the source of truth for what is left.
const pantryUse = async (act: string) => {
  try {
    const r = await fetch('/api/pantry', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ act }) }), d = await r.json().catch(() => ({}));
    if (typeof d.meals === 'number') S.meals = d.meals; if (typeof d.supplies === 'number') S.supplies = d.supplies;
    if (!r.ok && S.cur?.t === 'act' && S.cur.a.k === act) { say(d.error || 'You are out of groceries.'); S.cur = null; }
  } catch { /* offline: keep the local count */ }
};
const loadPantry = async () => { try { const r = await fetch('/api/pantry', { cache: 'no-store' }); if (r.ok) { const d = await r.json(); S.meals = d.meals; S.supplies = d.supplies; } } catch { /* offline */ } };
const econ = async (kind: 'start' | 'finish', a: Act) => {
  try {
    const r = await fetch('/api/economy/' + kind, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ act: a.k }) }), d = await r.json();
    if (typeof d.cash === 'number') S.cash = d.cash;
    if (!r.ok) { say(d.error || 'Payment problem.'); if (kind === 'start' && S.cur?.t === 'act' && S.cur.a.k === a.k) S.cur = null; }
    else if (kind === 'finish' && d.paid) say(`Gig done: +${naira(d.paid)}`);
  } catch { say('Offline — payment not recorded.'); }
};
const saveNow = (look: Look) => fetch('/api/save', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ look, state: { needs: S.needs, min: S.min, bonds: F.bonds(), family: F.on } }) }).catch(() => {});
const mood = () => Object.values(S.needs).reduce((a, b) => a + b, 0) / 6;
const moodFace = (m: number) => m > 75 ? '😄' : m > 55 ? '🙂' : m > 35 ? '😐' : '😫';
const snap = () => ({ homeOwned: [...HOME_OWNED], homeSold: [...HOME_SOLD], needs: { ...S.needs }, min: S.min, cash: S.cash, power: S.power, speed: S.speed, free: S.free, q: S.q.flatMap(t => t.t === 'act' ? [t.a.e] : []),
  cur: S.cur?.t === 'act' ? S.cur.a : null, prog: S.cur?.t === 'act' ? S.prog / S.cur.a.dur : 0, toast: Date.now() - S.toastT < 3500 ? S.toast : '', mood: mood(), fam: famSnap(), famOn: F.on, wing: wingOn(), south: southOn(), meals: S.meals, supplies: S.supplies, home: [...HOME.own] });
type UI = ReturnType<typeof snap>;

type V3 = [number, number, number];
// Rounded box / cylinder / ellipsoid primitives used to build the furniture.
const B = ({ p, s, c, r = .03, ro = .7, m = 0, rot, op }: { p: V3; s: V3; c: string; r?: number; ro?: number; m?: number; rot?: V3; op?: number }) =>
  <RoundedBox args={s} radius={Math.max(.002, Math.min(r, Math.min(...s) / 2 - .002))} smoothness={2} position={p} rotation={rot} castShadow={op === undefined} receiveShadow>
    <meshStandardMaterial color={c} roughness={ro} metalness={m} transparent={op !== undefined} opacity={op ?? 1} depthWrite={op === undefined} /></RoundedBox>;
const Bx = ({ p, s, c, ro = .8, rot }: { p: V3; s: V3; c: string; ro?: number; rot?: V3 }) =>
  <mesh position={p} rotation={rot} castShadow receiveShadow><boxGeometry args={s} /><meshStandardMaterial color={c} roughness={ro} /></mesh>;
const C = ({ p, r, h, c, rt, ro = .6, m = 0, rot, e, ei = .6 }: { p: V3; r: number; h: number; c: string; rt?: number; ro?: number; m?: number; rot?: V3; e?: string; ei?: number }) =>
  <mesh position={p} rotation={rot} castShadow receiveShadow><cylinderGeometry args={[rt ?? r, r, h, 24]} /><meshStandardMaterial color={c} roughness={ro} metalness={m} emissive={e ?? '#000'} emissiveIntensity={e ? ei : 0} /></mesh>;
const Sp = ({ p, r, c, sc = [1, 1, 1], ro = .85, rot }: { p: V3; r: number; c: string; sc?: V3; ro?: number; rot?: V3 }) =>
  <mesh position={p} rotation={rot} scale={sc} castShadow receiveShadow><sphereGeometry args={[r, 18, 14]} /><meshStandardMaterial color={c} roughness={ro} /></mesh>;
const Screen = ({ p, w, h, on, col, ry = 0 }: { p: V3; w: number; h: number; on: boolean; col: string; ry?: number }) =>
  <mesh position={p} rotation-y={ry}><planeGeometry args={[w, h]} /><meshStandardMaterial color="#05070a" emissive={on ? col : '#000'} emissiveIntensity={on ? .9 : 0} roughness={.2} /></mesh>;
const Chair = ({ p, ry = 0, c = '#6b4a2f', pad = '#8c3a2f' }: { p: V3; ry?: number; c?: string; pad?: string }) => <group position={p} rotation-y={ry}>
  <B p={[0, .4, 0]} s={[.44, .05, .44]} c={c} /><B p={[0, .445, 0]} s={[.4, .04, .4]} c={pad} ro={.95} r={.02} />
  {[[-.19, -.19], [.19, -.19], [-.19, .19], [.19, .19]].map(([x, z]) => <B key={x + '' + z} p={[x, .19, z]} s={[.04, .38, .04]} c={c} r={.01} />)}
  {[-.19, .19].map(x => <B key={x} p={[x, .68, .2]} s={[.04, .5, .04]} c={c} r={.01} />)}
  <B p={[0, .86, .2]} s={[.4, .09, .03]} c={c} r={.01} /><B p={[0, .7, .2]} s={[.38, .07, .03]} c={c} r={.01} /><B p={[0, .56, .2]} s={[.38, .06, .03]} c={c} r={.01} /></group>;
const Zone = ({ x, z, w, d, c, y = .02 }: { x: number; z: number; w: number; d: number; c: string; y?: number }) =>
  <mesh rotation-x={-Math.PI / 2} position={[x, y, z]} receiveShadow><planeGeometry args={[w, d]} /><meshStandardMaterial color={c} roughness={.9} /></mesh>;
const Rug = ({ x, z, w, d, c1, c2, y = .015 }: { x: number; z: number; w: number; d: number; c1: string; c2: string; y?: number }) => <group position={[x, y, z]}>
  <mesh rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[w, d]} /><meshStandardMaterial color={c1} roughness={1} /></mesh>
  <mesh rotation-x={-Math.PI / 2} position-y={.003} receiveShadow><planeGeometry args={[w - .36, d - .36]} /><meshStandardMaterial color={c2} roughness={1} /></mesh>
  <mesh rotation-x={-Math.PI / 2} position-y={.006} receiveShadow><planeGeometry args={[w - .7, d - .7]} /><meshStandardMaterial color={c1} roughness={1} /></mesh></group>;
function rng(seed: number) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function mkTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, rx: number, ry: number) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const woodTex = (rx: number, ry: number) => mkTex(512, 512, g => { // oak planks, 20cm wide, joints staggered row by row
  const r = rng(11), rows = 10, h = 512 / rows;
  for (let i = 0; i < rows; i++) {
    const o1 = r() * 512, o2 = (o1 + 170 + r() * 170) % 512, js = [o1, o2].sort((a, b) => a - b);
    for (let k = 0; k < 2; k++) {
      const a = js[k], b = k === 0 ? js[1] : js[0] + 512, shade = r(), col = `hsl(${27 + shade * 5},${38 + shade * 8}%,${44 + shade * 12}%)`;
      for (const [x0, x1] of [[a, Math.min(b, 512)], [0, b - 512]] as [number, number][]) if (x1 > x0) {
        g.fillStyle = col; g.fillRect(x0, i * h, x1 - x0, h);
        for (let n = 0; n < 7; n++) { g.fillStyle = `rgba(70,40,15,${.05 + r() * .09})`; g.fillRect(x0, i * h + r() * h, x1 - x0, 1 + r() * 1.5); }
        g.fillStyle = 'rgba(30,15,5,.5)'; g.fillRect(x0, i * h, 2, h);
      }
    }
    g.fillStyle = 'rgba(30,15,5,.45)'; g.fillRect(0, i * h, 512, 2);
  }
}, rx, ry);
const tileTex = (rx: number, ry: number, a: string, b: string) => mkTex(256, 256, g => {
  g.fillStyle = a; g.fillRect(0, 0, 256, 256); g.fillStyle = b; g.fillRect(0, 0, 128, 128); g.fillRect(128, 128, 128, 128);
  g.strokeStyle = 'rgba(90,86,76,.7)'; g.lineWidth = 3; for (const v of [0, 128, 256]) { g.beginPath(); g.moveTo(v, 0); g.lineTo(v, 256); g.moveTo(0, v); g.lineTo(256, v); g.stroke(); }
}, rx, ry);
const Tiles = ({ x, z, w, d, a, b }: { x: number; z: number; w: number; d: number; a: string; b: string }) => {
  const t = useMemo(() => tileTex(w / .7, d / .7, a, b), [w, d, a, b]);
  return <mesh rotation-x={-Math.PI / 2} position={[x, .02, z]} receiveShadow><planeGeometry args={[w, d]} /><meshStandardMaterial map={t} roughness={.35} /></mesh>;
};
const Win = ({ p, ry = 0, w, h }: { p: V3; ry?: number; w: number; h: number }) => <group position={p} rotation-y={ry}>
  <mesh><planeGeometry args={[w, h]} /><meshStandardMaterial color="#a9d6f2" emissive="#a9d6f2" emissiveIntensity={.5} /></mesh>
  <B p={[0, h / 2, .02]} s={[w + .12, .07, .07]} c="#f2f0ea" ro={.5} /><B p={[0, -h / 2, .02]} s={[w + .12, .07, .07]} c="#f2f0ea" ro={.5} />
  <B p={[-w / 2, 0, .02]} s={[.07, h, .07]} c="#f2f0ea" ro={.5} /><B p={[w / 2, 0, .02]} s={[.07, h, .07]} c="#f2f0ea" ro={.5} />
  <B p={[0, 0, .02]} s={[.035, h, .04]} c="#f2f0ea" ro={.5} /><B p={[0, 0, .02]} s={[w, .035, .04]} c="#f2f0ea" ro={.5} />
  <B p={[0, -h / 2 - .045, .08]} s={[w + .28, .04, .2]} c="#f6f4ee" ro={.5} />
  <C p={[0, h / 2 + .22, .14]} r={.014} h={w + .7} c="#4a4038" m={.6} rot={[0, 0, Math.PI / 2]} />
  {[-1, 1].map(s => <group key={s}><B p={[s * (w / 2 + .2), -.02, .15]} s={[.38, h + .5, .07]} c="#d8c7a4" ro={1} r={.03} />{[-.1, 0, .1].map(f => <B key={f} p={[s * (w / 2 + .2) + f, -.02, .19]} s={[.05, h + .46, .03]} c="#cdb88f" ro={1} r={.015} />)}</group>)}</group>;
const FanHead = ({ on }: { on: boolean }) => { const g = useRef<THREE.Group>(null!); useFrame((_, dt) => { if (on) g.current.rotation.z -= dt * 14; }); return <group ref={g}><C p={[0, 0, .01]} r={.035} h={.05} c="#2a2a2a" rot={[Math.PI / 2, 0, 0]} />{[0, 1, 2].map(i => <group key={i} rotation-z={i * 2.094}><B p={[0, .1, 0]} s={[.09, .17, .008]} c="#bcd3de" r={.004} op={.9} /></group>)}</group>; };

function Avatar({ bubble, look }: { bubble: string; look: Look }) {
  const g = useRef<THREE.Group>(null!), inner = useRef<THREE.Group>(null!), plumb = useRef<THREE.Mesh>(null!), pg = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    const sleep = S.pose === 'sleep', sit = S.pose === 'sit';
    g.current.position.set(sleep ? -4.95 : S.pos[0], sleep ? .86 : 0, sleep ? -2.45 : S.pos[1]); g.current.rotation.y = sleep ? 0 : S.rot;
    inner.current.rotation.x = sleep ? -Math.PI / 2 : 0; inner.current.position.y = 0; void sit;
    pg.current.position.set(0, sleep ? 1.1 : 2.45 * look.height + Math.sin(clock.elapsedTime * 2) * .06, sleep ? -1.7 : 0); plumb.current.rotation.y = clock.elapsedTime * 1.6;
    const m = mood(), col = m > 60 ? '#35e07a' : m > 35 ? '#f2c230' : '#ef4b4b';
    const mat = plumb.current.material as THREE.MeshStandardMaterial; mat.color.set(col); mat.emissive.set(col);
  });
  return <group ref={g}>
    <group ref={inner}><Human look={look} getState={() => S.pose !== 'stand' ? S.pose : S.cur?.t === 'walk' && S.speed > 0 ? 'walk' : 'idle'} getAnim={() => (S.speed && S.cur?.t === 'act' ? S.cur.a.anim : undefined)} getSpeed={() => S.speed} /></group>
    <group ref={pg}><mesh ref={plumb}><octahedronGeometry args={[.14]} /><meshStandardMaterial emissiveIntensity={.8} /></mesh></group>
    <Html position={[0, 2.9 * look.height + .2, 0]} center zIndexRange={[5, 0]}><div className="bubble">{bubble}</div></Html>
  </group>;
}

const books = (seed: number, levels: number[]) => { const r = rng(seed), cols = ['#b43c35', '#3d5a80', '#d18a22', '#1d7654', '#6b4a8a', '#8a5a3a', '#2b2f36', '#c9b98a'], out: ReactNode[] = [];
  levels.forEach((y, i) => { let z = -.48; while (z < .46) { const w = .035 + r() * .05, h = .2 + r() * .13; if (r() < .1) { z += .09; continue; } out.push(<Bx key={i + '-' + z} p={[.03, y + h / 2, z + w / 2]} s={[.2, h, w]} c={cols[Math.floor(r() * cols.length)]} rot={[0, 0, r() < .12 ? .12 : 0]} />); z += w + .004; } }); return out; };

const VIS: Record<string, (ui: UI) => ReactNode> = {
  bed: ui => <>
    <B p={[0, .2, 0]} s={[1.8, .26, 2.45]} c="#4a2f1d" ro={.55} /><B p={[0, .66, -1.22]} s={[1.88, 1.32, .12]} c="#4a2f1d" ro={.5} />
    <B p={[-.45, .72, -1.15]} s={[.7, .8, .05]} c="#5d3b25" ro={.6} /><B p={[.45, .72, -1.15]} s={[.7, .8, .05]} c="#5d3b25" ro={.6} />
    <B p={[0, .36, 1.22]} s={[1.88, .52, .1]} c="#4a2f1d" ro={.5} />
    {[[-.88, -1.22], [.88, -1.22], [-.88, 1.22], [.88, 1.22]].map(([x, z]) => <B key={x + '' + z} p={[x, .04, z]} s={[.1, .08, .1]} c="#2a1a10" />)}
    <B p={[0, .48, .02]} s={[1.68, .27, 2.3]} c="#f4f0e6" ro={.95} r={.07} />
    <B p={[0, .66, .56]} s={[1.74, .12, 1.4]} c="#0f5c45" ro={1} r={.05} /><B p={[0, .67, -.18]} s={[1.74, .14, .3]} c="#ece6d6" ro={1} r={.05} />
    {[-.5, .5, 1.1].map(z => <B key={z} p={[0, .735, z + .08]} s={[1.5, .01, .02]} c="#0c4d3a" />)}
    <B p={[0, .72, -.84]} s={[.95, .17, .44]} c="#fbfaf6" ro={1} r={.08} rot={[-.08, 0, 0]} /><B p={[0, .84, -1.0]} s={[.85, .19, .34]} c="#f1eee6" ro={1} r={.08} rot={[-.35, 0, 0]} />
    <B p={[.54, .76, .1]} s={[.34, .13, .3]} c="#d99a42" ro={1} r={.05} rot={[0, .3, 0]} />
    <Part id="bed.stand">
    <B p={[1.15, .26, -1.0]} s={[.5, .52, .5]} c="#5d3b25" ro={.55} /><B p={[1.15, .38, -.74]} s={[.42, .2, .02]} c="#4a2f1d" /><B p={[1.15, .14, -.74]} s={[.42, .2, .02]} c="#4a2f1d" />
    <C p={[1.15, .38, -.73]} r={.015} h={.03} c="#d9a22b" m={.8} rot={[Math.PI / 2, 0, 0]} /><C p={[1.15, .14, -.73]} r={.015} h={.03} c="#d9a22b" m={.8} rot={[Math.PI / 2, 0, 0]} />
    <C p={[1.15, .55, -1.0]} r={.08} h={.03} c="#333" /><C p={[1.15, .67, -1.0]} r={.014} h={.22} c="#333" /><C p={[1.15, .86, -1.0]} r={.15} rt={.1} h={.2} c="#f2e6c9" ro={1} e={ui.power ? '#ffd9a0' : undefined} ei={.45} /></Part></>,
  fridge: ui => <>
    <B p={[0, .93, -.125]} s={[.75, 1.86, .75]} c="#e8ecee" ro={.3} m={.15} r={.05} /><B p={[0, 1.2, .255]} s={[.76, .012, .02]} c="#8c9499" />
    <B p={[.29, 1.5, .27]} s={[.03, .42, .04]} c="#9aa3a8" m={.8} ro={.25} /><B p={[.29, .9, .27]} s={[.03, .55, .04]} c="#9aa3a8" m={.8} ro={.25} />
    <B p={[-.15, 1.7, .26]} s={[.14, .05, .01]} c="#2b3a42" /><B p={[0, .03, .15]} s={[.7, .06, .05]} c="#555" />
    <B p={[.2, 1.88, -.05]} s={[.3, .1, .3]} c="#c9a56b" ro={1} />
    <Part id="fridge.counter">
    <B p={[1.34, .4, -.19]} s={[1.93, .8, .62]} c="#6b4a30" ro={.8} />
    {[.6, 1.08, 1.56, 2.04].map(x => <group key={x}><B p={[x, .42, .135]} s={[.46, .7, .025]} c="#8a6240" ro={.6} /><B p={[x, .42, .15]} s={[.34, .58, .01]} c="#7b563a" /><B p={[x + (x < 1.3 ? .17 : -.17), .72, .17]} s={[.02, .12, .025]} c="#c9ced1" m={.9} ro={.2} /></group>)}
    <B p={[1.34, .85, -.17]} s={[1.98, .05, .68]} c="#cfc9bd" ro={.3} m={.05} /><B p={[1.34, .96, -.485]} s={[1.93, .16, .03]} c="#ece5d3" ro={.4} />
    <B p={[1.75, .88, -.15]} s={[.5, .012, .36]} c="#aeb7bc" m={.9} ro={.25} /><B p={[1.75, .9, -.15]} s={[.4, .012, .28]} c="#8f999f" m={.9} ro={.3} />
    <C p={[1.75, 1.0, -.38]} r={.014} h={.2} c="#c9ced1" m={.9} ro={.2} /><B p={[1.75, 1.1, -.3]} s={[.02, .02, .16]} c="#c9ced1" m={.9} ro={.2} />
    <B p={[1.0, .875, -.1]} s={[.56, .02, .44]} c="#14171a" ro={.15} m={.3} />
    {[[.9, -.2], [1.12, -.2], [.9, .02], [1.12, .02]].map(([x, z]) => <C key={x + '' + z} p={[x, .89, z]} r={.075} h={.01} c="#3a3f45" />)}
    <C p={[.9, .98, .02]} r={.1} h={.16} c="#b9bec2" m={.8} ro={.3} /><C p={[.9, 1.07, .02]} r={.1} h={.015} c="#9aa0a4" m={.8} /><C p={[1.12, .93, -.2]} r={.12} rt={.14} h={.06} c="#2b2f33" m={.6} />
    <C p={[2.1, .93, -.3]} r={.12} h={.08} c="#8a5a3a" /><Sp p={[2.07, .99, -.3]} r={.05} c="#d9452b" /><Sp p={[2.15, .99, -.28]} r={.05} c="#f0b53a" /><Sp p={[2.1, .99, -.34]} r={.05} c="#6da944" />
    <B p={[2.15, .885, .03]} s={[.38, .025, .22]} c="#a9784a" ro={.7} />
    <B p={[.75, 1.8, -.31]} s={[.62, .72, .36]} c="#7b563a" ro={.7} /><B p={[.45, 1.8, -.13]} s={[.27, .66, .02]} c="#8a6240" /><B p={[1.05, 1.8, -.13]} s={[.27, .66, .02]} c="#8a6240" /><B p={[.62, 1.8, -.11]} s={[.02, .1, .02]} c="#c9ced1" m={.9} /><B p={[.88, 1.8, -.11]} s={[.02, .1, .02]} c="#c9ced1" m={.9} /></Part></>,
  wardrobe: () => <>
    <B p={[0, 1.07, 0]} s={[1.4, 2.0, .6]} c="#5a3b25" ro={.55} r={.03} /><B p={[0, .05, .02]} s={[1.34, .1, .56]} c="#3b2616" /><B p={[0, 2.12, 0]} s={[1.46, .08, .66]} c="#4a2f1d" />
    <B p={[-.35, 1.07, .31]} s={[.66, 1.82, .03]} c="#6b4630" ro={.5} /><B p={[-.35, 1.07, .33]} s={[.5, 1.62, .015]} c="#5a3b25" />
    <B p={[.35, 1.07, .31]} s={[.66, 1.82, .03]} c="#4a2f1d" /><mesh position={[.35, 1.07, .33]}><planeGeometry args={[.54, 1.7]} /><meshStandardMaterial color="#cfe3ee" metalness={.9} roughness={.04} /></mesh>
    <B p={[-.05, 1.05, .35]} s={[.025, .3, .03]} c="#d9a22b" m={.8} ro={.3} /><B p={[.05, 1.05, .35]} s={[.025, .3, .03]} c="#d9a22b" m={.8} ro={.3} /></>,
  dining: () => <>
    <B p={[0, .75, 0]} s={[1.5, .06, .85]} c="#8a6240" ro={.45} r={.02} /><B p={[0, .68, 0]} s={[1.3, .08, .66]} c="#6b4a30" />
    {[[-.65, -.35], [.65, -.35], [-.65, .35], [.65, .35]].map(([x, z]) => <B key={x + '' + z} p={[x, .36, z]} s={[.07, .72, .07]} c="#6b4a30" r={.015} />)}
    <Part id="dining.c1"><Chair p={[0, 0, .8]} ry={0} /></Part><Part id="dining.c2"><group position={[-.5, 0, .8]} scale={.82}><Chair p={[0, 0, 0]} c="#c0622d" pad="#2f6bb0" /></group></Part><Part id="dining.c3"><Chair p={[-1.0, 0, 0]} ry={-Math.PI / 2} /></Part><Part id="dining.c4"><Chair p={[1.0, 0, 0]} ry={Math.PI / 2} /></Part>
    <B p={[0, .785, .2]} s={[.5, .006, .36]} c="#c0392b" ro={1} r={.002} /><C p={[0, .8, .2]} r={.115} h={.015} c="#f6f4ee" ro={.2} /><C p={[0, .815, .2]} r={.07} rt={.085} h={.03} c="#f6f4ee" ro={.2} /><C p={[0, .82, .2]} r={.07} h={.012} c="#e0742a" ro={.9} />
    <C p={[.38, .83, .15]} r={.03} h={.08} c="#cfe6f2" ro={.1} /><B p={[-.45, .8, -.05]} s={[.3, .03, .2]} c="#f6f4ee" /><C p={[-.45, .87, -.05]} r={.1} rt={.13} h={.1} c="#e9e2d2" ro={.3} />
    <Sp p={[-.5, .95, -.05]} r={.045} c="#d9452b" /><Sp p={[-.4, .95, -.02]} r={.045} c="#f0b53a" /></>,
  shower: () => <>
    <B p={[0, .04, -.2]} s={[1.3, .08, 1.4]} c="#e8edf0" ro={.3} /><C p={[0, .085, -.2]} r={.055} h={.012} c="#c9ced1" m={.9} ro={.2} />
    <B p={[0, 1.2, -.885]} s={[1.3, 2.4, .03]} c="#cfe0e6" ro={.25} />{[.4, .8, 1.2, 1.6, 2.0].map(y => <B key={y} p={[0, y, -.865]} s={[1.3, .008, .01]} c="#9db4bd" />)}
    <B p={[-.66, 1.04, -.2]} s={[.03, 2.0, 1.4]} c="#bfe6f2" op={.22} ro={.05} /><B p={[.66, 1.04, -.2]} s={[.03, 2.0, 1.4]} c="#bfe6f2" op={.22} ro={.05} /><B p={[.33, 1.04, .5]} s={[.64, 2.0, .03]} c="#bfe6f2" op={.22} ro={.05} />
    <B p={[-.66, 2.05, -.2]} s={[.05, .05, 1.4]} c="#c9ced1" m={.9} ro={.2} /><B p={[.66, 2.05, -.2]} s={[.05, .05, 1.4]} c="#c9ced1" m={.9} ro={.2} /><B p={[.33, 2.05, .5]} s={[.64, .05, .05]} c="#c9ced1" m={.9} ro={.2} /><B p={[.02, 1.04, .5]} s={[.04, 2.0, .05]} c="#c9ced1" m={.9} ro={.2} />
    <C p={[0, 1.2, -.86]} r={.014} h={2} c="#c9ced1" m={.9} ro={.2} /><B p={[0, 2.12, -.6]} s={[.025, .025, .5]} c="#c9ced1" m={.9} ro={.2} /><C p={[0, 2.1, -.36]} r={.1} rt={.08} h={.03} c="#d7dcdf" m={.9} ro={.2} />
    <B p={[0, 1.0, -.86]} s={[.14, .06, .05]} c="#c9ced1" m={.9} ro={.2} /><B p={[-.45, 1.1, -.82]} s={[.34, .03, .12]} c="#c9ced1" m={.9} ro={.2} /><C p={[-.5, 1.19, -.82]} r={.03} h={.14} c="#e8742a" ro={.3} /><C p={[-.4, 1.17, -.82]} r={.028} h={.1} c="#3f9ad6" ro={.3} /></>,
  toilet: () => <>
    <B p={[0, .64, -.42]} s={[.44, .42, .16]} c="#f6f6f3" ro={.2} r={.05} /><B p={[0, .86, -.42]} s={[.46, .03, .18]} c="#eeeeea" ro={.2} /><C p={[.12, .89, -.42]} r={.03} h={.015} c="#c9ced1" m={.9} />
    <B p={[0, .17, -.15]} s={[.3, .34, .36]} c="#f6f6f3" ro={.2} r={.08} /><B p={[0, .4, -.02]} s={[.4, .22, .56]} c="#f6f6f3" ro={.2} r={.1} />
    <mesh position={[0, .52, .0]} rotation-x={Math.PI / 2} scale={[1, 1.22, 1]} castShadow><torusGeometry args={[.16, .028, 10, 28]} /><meshStandardMaterial color="#fbfbf8" roughness={.25} /></mesh>
    <mesh position={[0, .506, 0]} rotation-x={-Math.PI / 2} scale={[1, 1.22, 1]}><circleGeometry args={[.14, 24]} /><meshStandardMaterial color="#bfe0ee" roughness={.05} /></mesh>
    <B p={[0, .55, -.28]} s={[.36, .02, .08]} c="#fbfbf8" ro={.25} />
    <Part id="toilet.sink">
    <B p={[.85, .74, -.3]} s={[.52, .12, .4]} c="#f6f6f3" ro={.2} r={.05} /><B p={[.85, .81, -.3]} s={[.4, .02, .3]} c="#dfe5e8" ro={.1} /><B p={[.85, .38, -.4]} s={[.13, .72, .13]} c="#f2f2ee" ro={.25} />
    <C p={[.85, .9, -.42]} r={.014} h={.16} c="#c9ced1" m={.9} ro={.2} /><B p={[.85, .98, -.37]} s={[.02, .02, .1]} c="#c9ced1" m={.9} ro={.2} />
    <B p={[.85, 1.5, -.49]} s={[.52, .66, .02]} c="#444" ro={.4} /><mesh position={[.85, 1.5, -.478]}><planeGeometry args={[.46, .6]} /><meshStandardMaterial color="#cfe4ee" metalness={.9} roughness={.04} /></mesh>
    <B p={[1.25, 1.2, -.48]} s={[.26, .5, .02]} c="#2f6bb0" ro={1} /><C p={[1.25, 1.5, -.47]} r={.012} h={.32} c="#c9ced1" m={.9} rot={[0, 0, Math.PI / 2]} /></Part></>,
  tv: ui => <>
    <B p={[0, .19, 0]} s={[2.2, .26, .9]} c="#243a5e" ro={.95} r={.05} />
    {[-.44, .44].map(x => <B key={x} p={[x, .395, .1]} s={[.86, .15, .62]} c="#2d4263" ro={.95} r={.06} />)}
    <B p={[0, .55, -.34]} s={[2.2, .62, .22]} c="#243a5e" ro={.95} r={.07} />
    {[-.44, .44].map(x => <B key={x} p={[x, .64, -.17]} s={[.84, .44, .2]} c="#2d4263" ro={.95} r={.07} rot={[-.12, 0, 0]} />)}
    {[-1, 1].map(s => <B key={s} p={[s * .99, .36, 0]} s={[.22, .6, .9]} c="#243a5e" ro={.95} r={.08} />)}
    {[[-1, -.38], [1, -.38], [-1, .38], [1, .38]].map(([x, z]) => <C key={x + '' + z} p={[x * .98, .04, z]} r={.04} rt={.03} h={.08} c="#3b2616" />)}
    <B p={[-.72, .63, .0]} s={[.36, .34, .12]} c="#d99a42" ro={1} r={.06} rot={[-.2, .3, .15]} /><B p={[.72, .63, .0]} s={[.36, .34, .12]} c="#b43c35" ro={1} r={.06} rot={[-.2, -.3, -.15]} />
    <Part id="tv.side"><B p={[1.5, .3, 0]} s={[.5, .6, .5]} c="#6b4a30" ro={.5} r={.02} /><B p={[1.5, .6, 0]} s={[.58, .03, .58]} c="#8a6240" ro={.4} /><B p={[1.5, .5, .26]} s={[.4, .22, .02]} c="#5a3b25" /><C p={[1.5, .64, 0]} r={.08} h={.02} c="#333" /><C p={[1.5, .78, 0]} r={.014} h={.28} c="#333" /><C p={[1.5, .98, 0]} r={.14} rt={.1} h={.2} c="#f2e6c9" ro={1} e={ui.power ? '#ffd9a0' : undefined} ei={.45} /></Part>
    <Part id="tv.cab">
    <B p={[0, .3, 2.6]} s={[1.6, .6, .5]} c="#3a2a1e" ro={.5} /><B p={[-.4, .3, 2.34]} s={[.76, .5, .02]} c="#4a3626" /><B p={[.4, .3, 2.34]} s={[.76, .5, .02]} c="#4a3626" />
    <C p={[-.05, .3, 2.325]} r={.015} h={.03} c="#d9a22b" m={.8} rot={[Math.PI / 2, 0, 0]} /><C p={[.05, .3, 2.325]} r={.015} h={.03} c="#d9a22b" m={.8} rot={[Math.PI / 2, 0, 0]} />
    {[[-.7, -.2], [.7, -.2], [-.7, .2], [.7, .2]].map(([x, z]) => <B key={x + '' + z} p={[x, .03, 2.6 + z]} s={[.06, .06, .06]} c="#222" />)}
    <B p={[0, .67, 2.6]} s={[.7, .05, .12]} c="#15171a" m={.5} ro={.3} /><B p={[0, .98, 2.62]} s={[1.3, .74, .05]} c="#0d0e10" ro={.25} r={.015} />
    <Screen p={[0, .98, 2.59]} w={1.24} h={.68} on={ui.power} col="#4a9fe8" ry={Math.PI} /><B p={[0, .64, 2.6]} s={[.3, .04, .2]} c="#15171a" m={.5} />
    <C p={[.55, .74, 2.5]} r={.06} rt={.04} h={.14} c="#e8e2d2" ro={.4} /><Sp p={[.55, .86, 2.5]} r={.08} c="#2f8a3a" /></Part></>,
  desk: ui => <>
    <B p={[0, .75, 0]} s={[1.6, .045, .8]} c="#8a6240" ro={.45} r={.015} />
    <B p={[-.75, .37, 0]} s={[.04, .74, .7]} c="#2b2b2e" m={.5} ro={.4} /><B p={[.52, .37, 0]} s={[.52, .72, .7]} c="#6b4a30" ro={.6} />
    {[.2, .37, .54].map(y => <group key={y}><B p={[.52, y, .36]} s={[.46, .14, .02]} c="#7a5638" ro={.55} /><B p={[.52, y + .04, .375]} s={[.14, .015, .02]} c="#c9ced1" m={.9} ro={.2} /></group>)}
    <B p={[0, .63, -.34]} s={[1.3, .3, .02]} c="#6b4a30" />
    <B p={[0, .79, -.15]} s={[.3, .012, .18]} c="#2b2b2e" m={.6} /><B p={[0, .9, -.2]} s={[.04, .2, .03]} c="#2b2b2e" m={.6} /><B p={[0, 1.2, -.22]} s={[.7, .4, .03]} c="#0d0e10" ro={.3} r={.01} />
    <Screen p={[0, 1.2, -.2]} w={.64} h={.35} on={ui.power} col="#7fd0ff" /><B p={[.02, .785, .14]} s={[.42, .016, .14]} c="#d8d8d8" ro={.5} /><B p={[.34, .785, .14]} s={[.06, .02, .1]} c="#2b2b2e" r={.02} />
    <C p={[-.62, .79, -.25]} r={.07} h={.02} c="#333" m={.6} /><B p={[-.62, .95, -.25]} s={[.02, .3, .02]} c="#333" /><B p={[-.62, 1.1, -.18]} s={[.03, .03, .2]} c="#333" rot={[.3, 0, 0]} />
    <C p={[.55, .82, 0]} r={.04} h={.09} c="#e8e2d2" ro={.4} /><B p={[-.45, .775, .2]} s={[.22, .012, .3]} c="#f6f4ee" rot={[0, .2, 0]} /><B p={[-.45, .79, .2]} s={[.2, .02, .27]} c="#d9d4c6" rot={[0, -.1, 0]} />
    <Part id="desk.chair" rel><C p={[0, .04, 0]} r={.25} rt={.03} h={.03} c="#2b2b2e" /><C p={[0, .22, 0]} r={.025} h={.36} c="#555" m={.8} /><B p={[0, .43, 0]} s={[.48, .08, .46]} c="#2f3a4a" ro={.95} r={.04} />
      <B p={[0, .72, .22]} s={[.46, .5, .07]} c="#2f3a4a" ro={.95} r={.05} rot={[.08, 0, 0]} /><B p={[-.26, .6, 0]} s={[.04, .04, .3]} c="#2b2b2e" /><B p={[.26, .6, 0]} s={[.04, .04, .3]} c="#2b2b2e" /></Part></>,
  phone: ui => <>
    <B p={[0, .77, 0]} s={[.62, .04, .62]} c="#8a6240" ro={.45} r={.015} /><B p={[0, .24, 0]} s={[.54, .025, .54]} c="#6b4a30" />
    {[[-.26, -.26], [.26, -.26], [-.26, .26], [.26, .26]].map(([x, z]) => <B key={x + '' + z} p={[x, .37, z]} s={[.04, .75, .04]} c="#5a3b25" r={.01} />)}
    <B p={[.1, .8, .12]} s={[.075, .012, .15]} c="#14161a" r={.01} rot={[0, .5, 0]} /><B p={[-.02, .8, .1]} s={[.16, .02, .22]} c="#c9b98a" ro={.9} rot={[0, -.2, 0]} />
    <C p={[-.2, .81, -.2]} r={.07} h={.02} c="#333" /><C p={[-.2, .93, -.2]} r={.014} h={.22} c="#333" /><C p={[-.2, 1.1, -.2]} r={.12} rt={.08} h={.16} c="#f2e6c9" ro={1} e={ui.power ? '#ffd9a0' : undefined} ei={.4} />
    <C p={[.2, .86, -.2]} r={.05} h={.12} c="#6bb7d9" ro={.1} /><Sp p={[.2, .96, -.2]} r={.05} c="#d9452b" /><Sp p={[.24, .98, -.17]} r={.04} c="#f0b53a" /></>,
  massage: () => <>
    <B p={[0, .12, 0]} s={[.8, .24, .9]} c="#241a16" ro={.5} /><B p={[0, .38, -.05]} s={[.66, .26, .7]} c="#4a3329" ro={.55} r={.07} />
    <B p={[0, .85, .32]} s={[.66, .95, .22]} c="#4a3329" ro={.55} r={.08} rot={[-.12, 0, 0]} /><B p={[0, 1.4, .36]} s={[.4, .22, .14]} c="#5a4034" ro={.55} r={.06} />
    <B p={[-.38, .6, -.02]} s={[.1, .22, .7]} c="#2f211b" ro={.5} r={.04} /><B p={[.38, .6, -.02]} s={[.1, .22, .7]} c="#2f211b" ro={.5} r={.04} />
    <B p={[0, .2, -.62]} s={[.5, .3, .35]} c="#4a3329" ro={.55} r={.06} /><C p={[.38, .74, -.3]} r={.012} h={.03} c="#7cf0b0" e="#7cf0b0" ei={1.4} /></>,
  aquarium: ui => <>
    <B p={[0, .38, 0]} s={[1.1, .76, .46]} c="#5a3b24" ro={.55} /><B p={[0, .8, 0]} s={[1.16, .05, .52]} c="#2a1b10" ro={.4} />
    <B p={[0, 1.2, 0]} s={[1.02, .72, .4]} c="#7fd6ff" op={.35} ro={.15} r={.02} /><B p={[0, .93, 0]} s={[.98, .06, .36]} c="#e8d9a8" ro={1} />
    <B p={[0, 1.58, 0]} s={[1.1, .05, .46]} c="#1c1c20" ro={.4} />
    {[[-.3, 1.2, 0], [.1, 1.35, .04], [.32, 1.1, -.03]].map(([x, y, z], i) => <Sp key={i} p={[x, y, z]} r={.05} c={i === 1 ? '#ffd24a' : '#ff7a2f'} sc={[1.6, 1, .6]} />)}
    <C p={[-.4, 1.1, .08]} r={.03} h={.35} c="#2f8f4a" ro={1} /><C p={[.42, 1.08, .05]} r={.03} h={.3} c="#3fb86a" ro={1} />
    <C p={[0, 1.55, 0]} r={.015} h={.8} c="#bfeaff" e={ui.power ? '#bfeaff' : undefined} ei={1.2} rot={[0, 0, Math.PI / 2]} /></>,
  treadmill: ui => <>
    <B p={[0, .12, 0]} s={[.62, .16, 1.3]} c="#1d2024" ro={.5} r={.04} /><B p={[0, .21, 0]} s={[.5, .02, 1.14]} c="#2b2f36" ro={.9} />
    {[-.3, .3].map(x => <B key={x} p={[x, .75, -.55]} s={[.05, 1.2, .05]} c="#9aa3a8" m={.7} ro={.3} />)}
    <B p={[0, 1.3, -.55]} s={[.7, .05, .06]} c="#9aa3a8" m={.7} ro={.3} /><B p={[0, 1.15, -.57]} s={[.44, .26, .06]} c="#111418" ro={.4} />
    <B p={[0, 1.15, -.605]} s={[.34, .16, .01]} c={ui.power ? '#7cf0b0' : '#20262b'} ro={.3} />
    {[-.34, .34].map(x => <B key={x} p={[x, .58, 0]} s={[.04, .04, 1.1]} c="#9aa3a8" m={.6} ro={.3} />)}</>,
  gbench: () => <>
    <B p={[0, .012, 0]} s={[1.6, .024, 1.3]} c="#1c1f23" ro={1} />
    <B p={[0, .4, 0]} s={[.46, .12, 1.15]} c="#1d2126" ro={.5} r={.05} /><B p={[0, .46, .05]} s={[.4, .06, 1.0]} c="#c8372d" ro={.7} r={.03} />
    {[[-.18, -.45], [.18, -.45], [-.18, .45], [.18, .45]].map(([x, z]) => <B key={x + '' + z} p={[x, .19, z]} s={[.05, .38, .05]} c="#9aa3a8" m={.7} ro={.3} />)}
    {[-.38, .38].map(x => <B key={x} p={[x, .95, -.4]} s={[.05, 1.0, .05]} c="#9aa3a8" m={.7} ro={.3} />)}
    <C p={[0, 1.38, -.4]} r={.018} h={1.5} c="#aeb6ba" m={.8} ro={.25} rot={[0, 0, Math.PI / 2]} />
    {[-.62, .62].map(x => <group key={x}><C p={[x, 1.38, -.4]} r={.2} h={.06} c="#25282d" rot={[0, 0, Math.PI / 2]} /><C p={[x + Math.sign(x) * .07, 1.38, -.4]} r={.15} h={.05} c="#3a3f46" rot={[0, 0, Math.PI / 2]} /></group>)}
    {[0, 1, 2].map(i => <C key={i} p={[.95, .08 + i * .13, .35]} r={.1} h={.07} c={['#c8372d', '#d99a42', '#3a7bd5'][i]} />)}
  </>,
  gbag: () => <>
    <B p={[0, .02, 0]} s={[.9, .04, .9]} c="#1c1f23" ro={1} />
    <B p={[0, 1.2, -.3]} s={[.07, 2.4, .07]} c="#9aa3a8" m={.7} ro={.3} /><B p={[0, 2.38, -.1]} s={[.07, .07, .5]} c="#9aa3a8" m={.7} ro={.3} />
    <C p={[0, 2.2, .1]} r={.012} h={.4} c="#555" /><C p={[0, 1.35, .1]} r={.17} h={1.0} c="#b3302b" ro={.55} /><C p={[0, 1.88, .1]} r={.18} h={.06} c="#222" /><C p={[0, .83, .1]} r={.18} h={.06} c="#222" />
  </>,
  cinema: ui => <>
    <B p={[0, .75, -1.5]} s={[3.2, 1.75, .12]} c="#0c0d10" ro={.4} r={.03} /><B p={[0, .75, -1.43]} s={[3.0, 1.55, .02]} c={ui.power ? '#6aa0ff' : '#14161a'} ro={.2} />
    {ui.power && <B p={[0, .75, -1.415]} s={[2.6, 1.15, .01]} c="#f0c987" ro={.3} />}
    <B p={[0, .12, -1.45]} s={[3.2, .24, .3]} c="#1a1c20" ro={.6} />
    <Part id="cinema.seats">
    <Rug x={0} z={1.1} w={3.4} d={2.2} c1="#5a1620" c2="#7d2330" y={.02} />
    {[-1.05, 0, 1.05].map(x => <group key={x} position={[x, 0, 1.3]}>
      <B p={[0, .22, 0]} s={[.84, .36, .8]} c="#3a1218" ro={.55} r={.08} /><B p={[0, .62, .3]} s={[.82, .84, .22]} c="#4a171e" ro={.55} r={.08} rot={[-.1, 0, 0]} />
      <B p={[-.46, .45, 0]} s={[.1, .3, .76]} c="#2a0d12" ro={.5} r={.04} /><B p={[.46, .45, 0]} s={[.1, .3, .76]} c="#2a0d12" ro={.5} r={.04} />
      <B p={[0, .12, -.5]} s={[.6, .14, .3]} c="#3a1218" ro={.55} r={.05} /></group>)}</Part>
    <B p={[1.9, .45, .5]} s={[.5, .9, .5]} c="#d9452b" ro={.5} r={.04} /><B p={[1.9, 1.05, .5]} s={[.42, .3, .42]} c="#fff4d6" ro={.6} r={.05} />
  </>,
  odesk: ui => <>
    <B p={[0, .72, 0]} s={[1.8, .06, .8]} c="#3a2418" ro={.4} r={.02} />
    {[[-.82, -.3], [.82, -.3], [-.82, .3], [.82, .3]].map(([x, z]) => <B key={x + '' + z} p={[x, .35, z]} s={[.06, .7, .06]} c="#2a1a10" />)}
    <B p={[.5, .4, 0]} s={[.6, .6, .7]} c="#2f1d13" ro={.5} r={.02} />
    <B p={[-.2, .93, -.1]} s={[.62, .36, .03]} c="#0d0f12" ro={.3} /><B p={[-.2, .93, -.083]} s={[.56, .3, .005]} c={ui.power ? '#7fb8ff' : '#14161a'} ro={.2} /><B p={[-.2, .76, -.1]} s={[.1, .06, .1]} c="#222" />
    <B p={[.55, .76, .1]} s={[.4, .015, .14]} c="#d8d8d8" ro={.4} /><C p={[-.78, .84, .2]} r={.07} rt={.1} h={.18} c="#f2e6c9" e={ui.power ? '#ffd9a0' : undefined} ei={.4} />
    <Part id="odesk.chair"><B p={[0, .38, .95]} s={[.6, .08, .6]} c="#14161a" ro={.5} r={.06} /><B p={[0, .85, 1.22]} s={[.58, .86, .1]} c="#14161a" ro={.5} r={.06} /><C p={[0, .16, .95]} r={.03} h={.34} c="#9aa3a8" m={.7} /></Part>
  </>,
  oshelf: () => <>
    <B p={[0, .9, 0]} s={[.4, 1.8, 1.8]} c="#4a2f1d" ro={.55} r={.02} /><B p={[-.02, .9, 0]} s={[.36, 1.7, 1.7]} c="#2b1a10" ro={.8} />
    {[.35, .75, 1.15, 1.55].map(y => <B key={y} p={[-.04, y, 0]} s={[.34, .03, 1.7]} c="#5d3b25" ro={.6} />)}
    {[.35, .75, 1.15, 1.55].map((y, r) => Array.from({ length: 9 }, (_, i) => <B key={r + '-' + i} p={[-.05, y + .14, -.75 + i * .18]} s={[.2, .22 + ((i * 7 + r * 3) % 5) * .02, .12]} c={['#8c2f39', '#2f5d8c', '#3f7d4a', '#c8943c', '#5d3b6e', '#2b2b2b'][(i + r * 2) % 6]} ro={.8} />))}
  </>,
  mat: () => <><B p={[0, .018, 0]} s={[.8, .035, 1.85]} c="#7b3f8a" ro={1} r={.015} /><B p={[0, .037, 0]} s={[.74, .004, 1.79]} c="#8d4f9a" ro={1} r={.002} /><C p={[0, .045, -.95]} r={.05} h={.78} c="#7b3f8a" ro={1} rot={[0, 0, Math.PI / 2]} /></>,
  radio: ui => <>
    <B p={[0, .56, 0]} s={[.38, 1.0, .34]} c="#1d2127" ro={.45} r={.04} /><B p={[0, .04, 0]} s={[.46, .05, .4]} c="#111" /><B p={[-.196, .56, 0]} s={[.015, .96, .3]} c="#14171a" />
    {[[.38, .13], [.7, .085], [.93, .045]].map(([y, r]) => <group key={y}><C p={[-.205, y, 0]} r={r + .02} h={.02} c="#0d0f12" rot={[0, 0, Math.PI / 2]} /><C p={[-.21, y, 0]} r={r} h={.03} c="#2b2f36" ro={.9} rot={[0, 0, Math.PI / 2]} /><C p={[-.225, y, 0]} r={r * .35} h={.02} c="#444a52" m={.6} rot={[0, 0, Math.PI / 2]} /></group>)}
    <C p={[-.2, .16, 0]} r={.012} h={.012} c="#3fb98a" e={ui.power ? '#3fb98a' : undefined} ei={1.2} rot={[0, 0, Math.PI / 2]} /></>,
  shelf: () => <>
    <B p={[-.165, 1, 0]} s={[.02, 2, 1.1]} c="#5a3b25" ro={.7} /><B p={[0, 1, -.53]} s={[.35, 2, .04]} c="#6b4630" ro={.6} /><B p={[0, 1, .53]} s={[.35, 2, .04]} c="#6b4630" ro={.6} />
    {[.03, .4, .78, 1.16, 1.54, 1.98].map(y => <B key={y} p={[0, y, 0]} s={[.35, .035, 1.06]} c="#6b4630" ro={.6} r={.01} />)}
    {books(5, [.05, .42, .8, 1.18])}
    <Sp p={[.04, 1.72, -.3]} r={.12} c="#2f6b8a" ro={.3} /><C p={[.04, 1.6, -.3]} r={.04} h={.04} c="#444" /><C p={[.03, 1.7, .25]} r={.06} rt={.04} h={.2} c="#c9a56b" ro={.4} /><B p={[.1, 1.7, .0]} s={[.03, .22, .16]} c="#2a1b10" rot={[0, 0, -.1]} />
    <C p={[.04, 1.6, .38]} r={.07} rt={.09} h={.12} c="#b5651d" /><Sp p={[.04, 1.72, .38]} r={.08} c="#2f8a3a" /></>,
  plant: () => <>
    <C p={[0, .25, 0]} r={.22} rt={.3} h={.5} c="#b5651d" ro={.8} /><C p={[0, .51, 0]} r={.27} h={.03} c="#3a2a1c" ro={1} /><C p={[0, .5, 0]} r={.31} h={.04} c="#9a5418" ro={.8} />
    <C p={[0, .9, 0]} r={.022} rt={.015} h={.8} c="#6a4a2a" />
    {Array.from({ length: 12 }, (_, i) => { const a = i * 2.4, up = .65 + (i % 4) * .22, t = .35 + (i % 3) * .22; return <Sp key={i} p={[Math.cos(a) * (.14 + t * .22), up, Math.sin(a) * (.14 + t * .22)]} r={.2} sc={[.8, .12, .5]} c={i % 2 ? '#2f8a3a' : '#3fa84b'} rot={[Math.sin(a) * t, -a, -Math.cos(a) * t]} />; })}</>,
  door: () => <>
    <B p={[.03, 1.025, 0]} s={[.06, 2.05, .95]} c="#5a3a24" ro={.55} r={.01} />
    {[1.55, .55].map(y => [-.2, .2].map(z => <B key={y + '' + z} p={[.066, y, z]} s={[.015, .8, .34]} c="#4a2f1d" ro={.6} r={.01} />))}
    <B p={[.045, 1.0, -.53]} s={[.09, 2.1, .07]} c="#3b2616" ro={.6} /><B p={[.045, 1.0, .53]} s={[.09, 2.1, .07]} c="#3b2616" ro={.6} /><B p={[.045, 2.1, 0]} s={[.09, .08, 1.14]} c="#3b2616" ro={.6} />
    <B p={[.085, 1.0, .36]} s={[.02, .035, .15]} c="#d9a22b" m={.9} ro={.25} /><C p={[.075, 1.0, .42]} r={.035} h={.025} c="#d9a22b" m={.9} ro={.25} rot={[0, 0, Math.PI / 2]} /><C p={[.075, 1.2, .38]} r={.025} h={.03} c="#d9a22b" m={.9} ro={.25} rot={[0, 0, Math.PI / 2]} />
    <B p={[.075, 1.72, 0]} s={[.01, .1, .16]} c="#d9a22b" m={.9} ro={.25} /><C p={[.075, 1.58, 0]} r={.012} h={.02} c="#111" rot={[0, 0, Math.PI / 2]} /></>,
  gen: ui => <>
    <B p={[0, .12, 0]} s={[.92, .05, .6]} c="#1c1c1e" m={.5} />{[[-.4, -.26], [.4, -.26], [-.4, .26], [.4, .26]].map(([x, z]) => <C key={x + '' + z} p={[x, .36, z]} r={.018} h={.46} c="#1c1c1e" m={.5} />)}
    <B p={[0, .62, .26]} s={[.9, .03, .03]} c="#1c1c1e" m={.5} /><B p={[0, .62, -.26]} s={[.9, .03, .03]} c="#1c1c1e" m={.5} />
    <B p={[.05, .42, 0]} s={[.62, .38, .46]} c="#c23a2b" ro={.45} r={.05} /><B p={[-.1, .74, 0]} s={[.5, .18, .36]} c="#e0a82b" ro={.4} r={.06} /><C p={[-.1, .85, .1]} r={.04} h={.03} c="#111" />
    <B p={[-.38, .42, 0]} s={[.04, .32, .4]} c="#1c1c1e" /><C p={[-.405, .5, -.1]} r={.035} h={.02} c="#eee" rot={[0, 0, Math.PI / 2]} /><C p={[-.405, .5, .1]} r={.035} h={.02} c="#eee" rot={[0, 0, Math.PI / 2]} />
    <C p={[-.405, .35, 0]} r={.02} h={.02} c="#3fb98a" e={ui.power ? undefined : '#e04a3a'} ei={1} rot={[0, 0, Math.PI / 2]} />
    <C p={[.32, .72, .17]} r={.03} h={.34} c="#555" m={.7} rot={[0, 0, -.5]} /><B p={[.38, .5, -.27]} s={[.06, .04, .26]} c="#111" /><C p={[.34, .1, 0]} r={.1} h={.06} c="#111" rot={[Math.PI / 2, 0, Math.PI / 2]} /></>,
  coffee: () => <>
    <B p={[0, .4, 0]} s={[.52, .04, .92]} c="#6b4a30" ro={.45} r={.015} /><B p={[0, .41, 0]} s={[.44, .01, .84]} c="#cfe3ee" op={.35} ro={.05} />
    {[[-.22, -.4], [.22, -.4], [-.22, .4], [.22, .4]].map(([x, z]) => <B key={x + '' + z} p={[x, .19, z]} s={[.04, .38, .04]} c="#4a2f1d" r={.01} />)}<B p={[0, .15, 0]} s={[.44, .02, .8]} c="#5a3b25" />
    <B p={[0, .44, -.2]} s={[.2, .035, .28]} c="#2f6bb0" ro={1} /><B p={[.02, .47, -.2]} s={[.18, .03, .25]} c="#b43c35" ro={1} rot={[0, .2, 0]} /><C p={[0, .46, .24]} r={.05} h={.07} c="#f6f4ee" ro={.3} /><Sp p={[.05, .5, .1]} r={.045} c="#d9452b" /></>,
  fan: ui => <>
    <C p={[0, .03, 0]} r={.2} h={.045} c="#2b2b2e" /><C p={[0, .5, 0]} r={.022} h={.95} c="#9aa3a8" m={.85} ro={.25} /><B p={[0, 1.02, 0]} s={[.2, .18, .22]} c="#d8dcde" ro={.4} />
    <mesh position={[0, 1.05, .14]} castShadow><torusGeometry args={[.21, .01, 8, 32]} /><meshStandardMaterial color="#9aa3a8" metalness={.8} roughness={.3} /></mesh>
    <mesh position={[0, 1.05, .16]}><circleGeometry args={[.21, 24]} /><meshStandardMaterial color="#cfe3ee" transparent opacity={.12} side={THREE.DoubleSide} /></mesh>
    <group position={[0, 1.05, .15]}><FanHead on={ui.power} /></group></>,
  kbedA: () => kbed('#e07aa1', '#d99a42'),
  kbedB: () => kbed('#3d7fc4', '#8a5a3a'),
  nstand: ui => <>
    <B p={[0, .25, 0]} s={[.5, .5, .4]} c="#c79a63" ro={.55} r={.02} /><B p={[0, .36, .205]} s={[.42, .2, .01]} c="#b8864f" /><B p={[0, .14, .205]} s={[.42, .2, .01]} c="#b8864f" />
    <C p={[0, .365, .215]} r={.014} h={.03} c="#d9a22b" m={.8} rot={[Math.PI / 2, 0, 0]} /><C p={[0, .145, .215]} r={.014} h={.03} c="#d9a22b" m={.8} rot={[Math.PI / 2, 0, 0]} />
    <C p={[0, .52, 0]} r={.07} h={.03} c="#333" /><C p={[0, .64, 0]} r={.012} h={.22} c="#333" /><C p={[0, .8, 0]} r={.11} rt={.07} h={.16} c="#f2e6c9" ro={1} e={ui.power ? '#ffd9a0' : undefined} ei={.45} /></>,
  kwar: () => <>
    <B p={[0, .75, 0]} s={[1.4, 1.5, .55]} c="#c79a63" ro={.55} r={.03} /><B p={[0, 1.53, 0]} s={[1.46, .06, .6]} c="#b8864f" />
    <B p={[-.35, .75, .285]} s={[.66, 1.38, .02]} c="#d9b07a" ro={.5} /><B p={[.35, .75, .285]} s={[.66, 1.38, .02]} c="#d9b07a" ro={.5} />
    <B p={[-.05, .75, .305]} s={[.025, .2, .025]} c="#d9a22b" m={.8} ro={.3} /><B p={[.05, .75, .305]} s={[.025, .2, .025]} c="#d9a22b" m={.8} ro={.3} />
    {[['#d9452b', -.55], ['#f0b53a', -.3]].map(([c, x]) => <Sp key={c as string} p={[x as number, 1.0, .3]} r={.05} c={c as string} sc={[1, 1, .3]} />)}</>,
  toybox: () => <>
    <B p={[0, .26, 0]} s={[1.0, .5, .6]} c="#d9772b" ro={.6} r={.04} /><B p={[0, .52, 0]} s={[1.04, .05, .64]} c="#f0b53a" ro={.6} r={.02} /><B p={[0, .3, .31]} s={[.9, .06, .01]} c="#2f6bb0" />
    <B p={[-.28, .62, -.05]} s={[.16, .16, .16]} c="#d9452b" ro={.6} rot={[0, .4, 0]} /><B p={[-.1, .6, .12]} s={[.14, .14, .14]} c="#3fa84b" ro={.6} rot={[0, .2, 0]} /><B p={[-.2, .76, -.02]} s={[.14, .14, .14]} c="#2f6bb0" ro={.6} rot={[0, .7, 0]} />
    <Sp p={[.25, .64, .05]} r={.1} c="#f0b53a" /><Sp p={[.4, .6, -.15]} r={.07} c="#d9452b" />
    <Sp p={[.62, .12, .5]} r={.14} c="#8a5a3a" /><Sp p={[.62, .3, .5]} r={.1} c="#8a5a3a" /><Sp p={[.55, .38, .5]} r={.035} c="#8a5a3a" /><Sp p={[.69, .38, .5]} r={.035} c="#8a5a3a" />
    <B p={[-.7, .08, .55]} s={[.4, .1, .16]} c="#d9452b" ro={.5} r={.03} /><B p={[-.78, .17, .55]} s={[.16, .1, .14]} c="#3d5a80" r={.03} /><C p={[-.6, .03, .64]} r={.03} h={.03} c="#222" rot={[0, 0, Math.PI / 2]} /><C p={[-.8, .03, .64]} r={.03} h={.03} c="#222" rot={[0, 0, Math.PI / 2]} /></>,
  kdesk: () => <>
    <B p={[0, .6, 0]} s={[1.7, .04, .75]} c="#e8c98f" ro={.5} r={.015} />
    {[[-.78, -.32], [.78, -.32], [-.78, .32], [.78, .32]].map(([x, z]) => <B key={x + '' + z} p={[x, .29, z]} s={[.05, .58, .05]} c="#b8864f" r={.01} />)}
    <B p={[.55, .4, 0]} s={[.5, .3, .62]} c="#c79a63" ro={.6} /><B p={[.55, .4, .32]} s={[.44, .24, .01]} c="#b8864f" /><C p={[.55, .4, .335]} r={.014} h={.03} c="#d9a22b" m={.8} rot={[Math.PI / 2, 0, 0]} />
    <B p={[-.5, .635, -.15]} s={[.3, .03, .22]} c="#2f6bb0" ro={.9} /><B p={[-.5, .66, -.15]} s={[.28, .025, .2]} c="#d9452b" ro={.9} rot={[0, .2, 0]} /><B p={[-.2, .625, .12]} s={[.3, .008, .22]} c="#f6f4ee" rot={[0, -.15, 0]} />
    <C p={[.2, .68, -.2]} r={.04} h={.09} c="#2f6bb0" ro={.5} />{['#d9452b', '#f0b53a', '#3fa84b'].map((c, i) => <C key={c} p={[.19 + i * .015, .76, -.2]} r={.005} h={.12} c={c} rot={[0, 0, (i - 1) * .18]} />)}
    <C p={[-.75, .63, -.28]} r={.06} h={.02} c="#333" /><C p={[-.75, .78, -.28]} r={.01} h={.28} c="#333" /><C p={[-.75, .95, -.28]} r={.1} rt={.06} h={.14} c="#f2e6c9" ro={1} />
    <group position={[0, 0, .85]} scale={.8}><Chair p={[0, 0, 0]} c="#c0622d" pad="#2f6bb0" /></group></>,
};

// Static shell of the flat: tiles, rugs, walls, windows, wall decor.
function Room() {
  return <>
    <Tiles x={-.05} z={-3.55} w={2.9} d={2.1} a="#ebe5d6" b="#a9b4b8" /><Tiles x={4.2} z={-3.5} w={3.6} d={2.2} a="#e9f0f2" b="#cfdde2" />
    <Rug x={-4.2} z={-2.6} w={3.4} d={3.6} c1="#6d3f66" c2="#8d5a86" /><Rug x={-4} z={1.2} w={3.4} d={3.2} c1="#a67c4a" c2="#c9a56b" />
    <B p={[0, 1.3, -4.7]} s={[12.6, 2.6, .2]} c="#e6dccb" ro={.95} r={.01} /><B p={[-6.3, 1.3, 0]} s={[.2, 2.6, 9.4]} c="#ddd2bf" ro={.95} r={.01} />
    <B p={[0, .07, -4.58]} s={[12.4, .14, .04]} c="#f4f0e6" ro={.5} r={.01} /><B p={[-6.18, .07, 0]} s={[.04, .14, 9.2]} c="#f4f0e6" ro={.5} r={.01} />
    <B p={[0, 2.57, -4.58]} s={[12.4, .06, .05]} c="#f4f0e6" ro={.5} r={.01} /><B p={[-6.18, 2.57, 0]} s={[.05, .06, 9.2]} c="#f4f0e6" ro={.5} r={.01} />
    <Win p={[.75, 1.6, -4.59]} w={1.4} h={1.2} /><Win p={[-6.19, 1.6, -2.9]} ry={Math.PI / 2} w={1.8} h={1.2} />
    <group position={[-4.6, 1.95, -4.57]}><B p={[0, 0, 0]} s={[1.0, .66, .04]} c="#2a1b10" ro={.5} /><B p={[0, 0, .02]} s={[.88, .54, .02]} c="#f1e3c0" ro={1} /><B p={[0, .12, .035]} s={[.88, .26, .005]} c="#e0742a" ro={1} /><B p={[0, -.06, .035]} s={[.88, .12, .005]} c="#d9a22b" ro={1} /><B p={[0, -.17, .035]} s={[.88, .2, .005]} c="#1d7654" ro={1} /><Sp p={[0, .1, .045]} r={.08} c="#f6d36b" sc={[1, 1, .1]} /></group>
    <group position={[2.0, 2.0, -4.57]}><C p={[0, 0, .02]} r={.2} h={.04} c="#2b2b2e" rot={[Math.PI / 2, 0, 0]} /><C p={[0, 0, .045]} r={.17} h={.01} c="#f6f2e6" ro={.4} rot={[Math.PI / 2, 0, 0]} /><B p={[0, .05, .06]} s={[.012, .1, .006]} c="#222" /><B p={[.04, 0, .06]} s={[.08, .012, .006]} c="#222" /></group>
    {[.6, 1.2, 1.8].map((z, i) => <Frame key={z} p={[-6.17, 1.95 + (i === 1 ? .08 : 0), z]} ry={Math.PI / 2} w={i === 1 ? .46 : .36} h={i === 1 ? .56 : .46} />)}
    <B p={[-5.75, .02, 3.5]} s={[.55, .02, .85]} c="#5a4a38" ro={1} r={.008} /><B p={[-5.75, .032, 3.5]} s={[.45, .006, .75]} c="#7a6650" ro={1} r={.003} />
  </>;
}

// Kids' bed (shared model; blanket and plush toy colour tell the two apart).
const kbed = (blanket: string, toy: string): ReactNode => <>
  <B p={[0, .17, 0]} s={[1.2, .18, 1.95]} c="#c79a63" ro={.55} />
  <B p={[0, .56, -.95]} s={[1.26, .95, .07]} c="#b8864f" ro={.55} r={.03} /><B p={[0, .34, .95]} s={[1.26, .5, .07]} c="#b8864f" ro={.55} r={.03} />
  {[[-.58, -.95], [.58, -.95], [-.58, .95], [.58, .95]].map(([x, z]) => <B key={x + '' + z} p={[x, .05, z]} s={[.07, .1, .07]} c="#8a5f33" />)}
  <B p={[0, .38, .02]} s={[1.12, .22, 1.84]} c="#f4f0e6" ro={.95} r={.06} />
  <B p={[0, .5, .35]} s={[1.14, .1, 1.22]} c={blanket} ro={1} r={.05} />
  <B p={[0, .52, -.66]} s={[.72, .12, .38]} c="#fbfaf6" ro={1} r={.06} rot={[-.05, 0, 0]} />
  <Sp p={[.35, .6, -.25]} r={.1} c={toy} /><Sp p={[.35, .72, -.25]} r={.065} c={toy} /><Sp p={[.3, .78, -.25]} r={.025} c={toy} /><Sp p={[.4, .78, -.25]} r={.025} c={toy} /></>;
const Frame = ({ p, ry = 0, w = .4, h = .5 }: { p: V3; ry?: number; w?: number; h?: number }) => <group position={p} rotation-y={ry}>
  <B p={[0, 0, 0]} s={[w + .06, h + .06, .03]} c="#2a1b10" ro={.5} r={.01} /><B p={[0, 0, .018]} s={[w, h, .01]} c="#e8dcc2" ro={1} r={.002} />
  {([[-.2, '#3d5a80', 1], [.0, '#b43c35', 1], [.22, '#e07aa1', .65], [.34, '#d18a22', .5]] as [number, string, number][]).map(([x, c, k]) => <group key={x} position={[x * w, -h * .08, .028]}>
    <Sp p={[0, h * .2 * k, 0]} r={w * .07 * k} c="#5e3a22" sc={[1, 1.1, .3]} /><B p={[0, h * .02 * k, 0]} s={[w * .15 * k, h * .3 * k, .01]} c={c} ro={1} r={.005} /></group>)}
</group>;

// Closed east wall of the flat, used until a family is started (then the Wing replaces it, with its doorway).
function EastWall() {
  return <><B p={[6.2, .65, 0]} s={[.2, 1.3, 9.4]} c="#ddd2bf" ro={.95} r={.01} /><B p={[6.2, 1.32, 0]} s={[.26, .04, 9.46]} c="#f4f0e6" ro={.5} r={.01} /></>;
}

// The south wing extension: stone floor, half-height side walls (cutaway like the rest of the house), a skirting edge along the front and zone rugs.
function SouthWing({ ui }: { ui: UI }) {
  const own = (id: string) => ui.home.includes(id);
  return <>
    <mesh rotation-x={-Math.PI / 2} position={[0, .012, 6.9]} receiveShadow onClick={e => { if (e.delta > 4) return; e.stopPropagation(); walk(e.point.x, e.point.z); }}>
      <planeGeometry args={[12.4, 4.7]} /><meshStandardMaterial color="#d9d1c0" roughness={.35} metalness={.05} /></mesh>
    {Array.from({ length: 5 }, (_, i) => <B key={i} p={[-5 + i * 2.5, .016, 6.9]} s={[.03, .004, 4.7]} c="#b9b09c" ro={.6} r={.002} />)}
    <B p={[-6.2, .65, 6.95]} s={[.2, 1.3, 4.8]} c="#ddd2bf" ro={.95} r={.01} /><B p={[-6.2, 1.32, 6.95]} s={[.26, .04, 4.86]} c="#f4f0e6" ro={.5} r={.01} />
    <B p={[6.2, .65, 6.95]} s={[.2, 1.3, 4.8]} c="#ddd2bf" ro={.95} r={.01} /><B p={[6.2, 1.32, 6.95]} s={[.26, .04, 4.86]} c="#f4f0e6" ro={.5} r={.01} />
    <B p={[0, .06, 9.3]} s={[12.6, .12, .12]} c="#ddd2bf" ro={.8} r={.01} />
    <Win p={[-6.09, 1.55, 6.9]} ry={Math.PI / 2} w={1.4} h={1.1} />
    {own('gym_room') && <><Rug x={-4.1} z={7.0} w={3.8} d={3.6} c1="#1e2226" c2="#2a3036" y={.02} /><B p={[-5.95, 1.6, 7.0]} s={[.05, 1.2, 2.4]} c="#9bb0c4" op={.55} ro={.1} /></>}
    {own('office_room') && <Rug x={4.2} z={6.6} w={3.4} d={3.4} c1="#2a3a52" c2="#3f5a80" y={.02} />}
  </>;
}

// The kids' wing east of the flat: walls (half-height cutaway, like the rest of the house), window, play rug, wall decor.
function Wing() {
  return <>
    <B p={[8.9, 1.3, -4.7]} s={[5.2, 2.6, .2]} c="#dce6f0" ro={.95} r={.01} />
    <B p={[8.9, .07, -4.58]} s={[5, .14, .04]} c="#f4f0e6" ro={.5} r={.01} /><B p={[8.9, 2.57, -4.58]} s={[5, .06, .05]} c="#f4f0e6" ro={.5} r={.01} />
    <B p={[11.4, .5, 0]} s={[.2, 1, 9.4]} c="#d3dde8" ro={.95} r={.01} /><B p={[11.4, 1.02, 0]} s={[.26, .04, 9.46]} c="#f4f0e6" ro={.5} r={.01} />
    <B p={[6.2, .65, -1.8]} s={[.2, 1.3, 5.6]} c="#ddd2bf" ro={.95} r={.01} /><B p={[6.2, .65, 3.6]} s={[.2, 1.3, 2]} c="#ddd2bf" ro={.95} r={.01} />
    <B p={[6.2, 1.32, -1.8]} s={[.26, .04, 5.66]} c="#f4f0e6" ro={.5} r={.01} /><B p={[6.2, 1.32, 3.6]} s={[.26, .04, 2.06]} c="#f4f0e6" ro={.5} r={.01} />
    <Win p={[8.9, 1.6, -4.59]} w={1.4} h={1.2} />
    <Rug x={8.9} z={1.5} w={3.6} d={2.4} c1="#2f6bb0" c2="#6fb4e8" />
    <group position={[7.5, 2.0, -4.57]}>{['#d9452b', '#f0b53a', '#3fa84b'].map((c, i) => <B key={c} p={[i * .3 - .3, 0, 0]} s={[.24, .24, .03]} c={c} ro={.6} r={.01} />)}</group>
    <group position={[10.2, 1.9, -4.57]}><B p={[0, 0, 0]} s={[.8, .95, .03]} c="#2f6bb0" ro={.7} r={.01} /><Sp p={[0, .05, .03]} r={.22} c="#f6f4ee" sc={[1, 1, .15]} /><Sp p={[0, .05, .045]} r={.08} c="#222" sc={[1, 1, .15]} /></group>
  </>;
}

// Spouse + kids in the 3D scene. Position/pose come from the engine (module state), rendered every frame.
function Member({ m, look, ui, onPick }: { m: Mem; look: Look; ui: UI; onPick: (id: string) => void }) {
  const g = useRef<THREE.Group>(null!), inner = useRef<THREE.Group>(null!), [hov, setHov] = useState(false);
  useFrame(() => {
    const lie = m.pose === 'sleep' ? m.at?.lie : undefined;
    g.current.visible = !m.away;
    if (lie) { g.current.position.set(lie.x, lie.y, lie.z); g.current.rotation.y = 0; inner.current.rotation.x = -Math.PI / 2; }
    else { g.current.position.set(m.pos[0], m.pose === 'sit' ? .5 * (1 - m.h) : 0, m.pos[1]); g.current.rotation.y = m.rot; inner.current.rotation.x = 0; }
  });
  const f = ui.fam.find(x => x.id === m.id);
  return <group ref={g} onClick={e => { if (e.delta > 4) return; e.stopPropagation(); onPick(m.id); }}
    onPointerOver={e => { e.stopPropagation(); document.body.style.cursor = 'pointer'; setHov(true); }} onPointerOut={() => { document.body.style.cursor = 'auto'; setHov(false); }}>
    <group ref={inner}><Human look={look} getState={() => m.pose !== 'stand' ? m.pose : m.cur ? 'walk' : 'idle'} getAnim={() => (S.speed ? m.anim : undefined)} getSpeed={() => S.speed} /></group>
    {f && !f.away && <Html position={[0, 1.75 * m.h + .55, 0]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}><div className="bubble sm">{f.e}</div></Html>}
    {hov && !f?.away && <Html position={[0, 1.75 * m.h + .95, 0]} center zIndexRange={[15, 5]} style={{ pointerEvents: 'none' }}><div className="tag">{m.name}</div></Html>}
  </group>;
}
function Family({ looks, ui, onPick }: { looks: Look[]; ui: UI; onPick: (id: string) => void }) {
  return <>{F.mem.map((m, i) => <Member key={m.id} m={m} look={looks[i]} ui={ui} onPick={onPick} />)}</>;
}

function Lights() {
  const sun = useRef<THREE.DirectionalLight>(null!), amb = useRef<THREE.HemisphereLight>(null!), lamp = useRef<THREE.PointLight>(null!), lamp2 = useRef<THREE.PointLight>(null!), lamp3 = useRef<THREE.PointLight>(null!);
  const day = new THREE.Color('#bfdcf2'), night = new THREE.Color('#0b1124');
  useFrame(({ scene }) => {
    const h = (S.min / 60) % 24, s = Math.max(0, Math.sin((h - 6) / 12 * Math.PI));
    sun.current.intensity = .15 + 2.4 * s; amb.current.intensity = .25 + 1 * s;
    sun.current.color.set(h < 8 || h > 17 ? '#ffb27a' : '#fff4e0');
    lamp.current.intensity = S.power ? (1 - s) * 70 : 0; lamp2.current.intensity = S.power && wingOn() ? (1 - s) * 55 : 0; lamp3.current.intensity = S.power && southOn() ? (1 - s) * 60 : 0;
    (scene.background as THREE.Color).copy(night).lerp(day, s);
  });
  return <><color attach="background" args={['#bfdcf2']} /><hemisphereLight ref={amb} args={['#cfe6ff', '#6b5a48', 1]} />
    <directionalLight ref={sun} position={[7, 12, 8]} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={11} shadow-camera-bottom={-11} shadow-camera-far={45} />
    <pointLight ref={lamp} position={[0, 3.2, 0]} color="#ffd9a0" /><pointLight ref={lamp2} position={[8.9, 3.2, 0]} color="#ffe3b8" /><pointLight ref={lamp3} position={[0, 3.2, 6.9]} color="#ffe0b0" /></>;
}

function OwnedFurniture({ item, editing, onSelect }: { item: typeof HOME_OWNED[number]; editing: boolean; onSelect: (id:string)=>void }) {
  const m=movedOwned(item), w=item.fp?.[0]||.8, d=item.fp?.[1]||.6;
  return <group position={[m.x,0,m.z]} rotation-y={m.r} onPointerDown={editing?(e:any)=>EDIT.down(item.id,e):undefined} onClick={e=>{if(e.delta>4)return;e.stopPropagation();if(editing)onSelect(item.id);}}>
    <B p={[0,.16,0]} s={[w,.28,d]} c={item.cat==='tech'?'#252a32':item.cat==='decor'?'#496d42':'#7b5a3b'} r={.05}/>
    <Html position={[0,.45,0]} center zIndexRange={[12,5]} style={{pointerEvents:'none'}}><div style={{fontSize:Math.min(34,18+Math.max(w,d)*4)}}>{item.e}</div></Html>
  </group>;
}

function World({ ui, sel, setSel, look, editingHome, setHomeSel, homeSel, onLayout }: { ui: UI; sel: Obj | null; setSel: (o: Obj | null) => void; look: Look; editingHome: boolean; setHomeSel: (id: string | null) => void; homeSel: string | null; onLayout: () => void }) {
  const { camera, gl } = useThree();
  const drag = useRef<{ id: string; sx: number; sz: number; tx: number; tz: number; r: number } | null>(null), ctl = useRef<any>(null), lay = useRef(onLayout), plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  lay.current = onLayout;
  EDIT.on = editingHome;
  EDIT.pick = id => { setHomeSel(id); setSel(null); };
  EDIT.down = (id, e) => { e.stopPropagation(); const h = e.ray.intersectPlane(plane, new THREE.Vector3()); if (!h) return; const t = homeT(id); drag.current = { id, sx: h.x, sz: h.z, tx: t.x, tz: t.z, r: t.r }; if (ctl.current) ctl.current.enabled = false; setHomeSel(id); setSel(null); };
  useEffect(() => {
    const el = gl.domElement, rc = new THREE.Raycaster(), v = new THREE.Vector2(), hit = new THREE.Vector3();
    const move = (ev: PointerEvent) => { const d = drag.current; if (!d) return; const r = el.getBoundingClientRect(); v.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); rc.setFromCamera(v, camera); if (!rc.ray.intersectPlane(plane, hit)) return; const cl = (n: number) => Math.max(-12, Math.min(12, Math.round(n * 20) / 20)); HOME_LAYOUT[d.id] = { x: cl(d.tx + hit.x - d.sx), z: cl(d.tz + hit.z - d.sz), r: d.r }; lay.current(); };
    const up = () => { if (!drag.current) return; drag.current = null; if (ctl.current) ctl.current.enabled = true; lay.current(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  }, [camera, gl, plane]);
  const [hov, setHov] = useState<string | null>(null), floorTex = useMemo(() => woodTex(8.8, 4.6), []), flooks = useMemo(() => famLooks(look), [look.gender, look.skin]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame((_, dt) => tick(Math.min(dt, .1)));
  return <>
    <Lights />
    <mesh rotation-x={-Math.PI / 2} position={[0, -.02, 0]} receiveShadow><planeGeometry args={[80, 80]} /><meshStandardMaterial color="#4f7a4a" /></mesh>
    <mesh rotation-x={-Math.PI / 2} position={[ui.wing ? 2.6 : 0, .01, 0]} receiveShadow onClick={e => { if (e.delta > 4) return; e.stopPropagation(); setSel(null); if (editingHome) { setHomeSel(null); return; } walk(e.point.x, e.point.z); }}>
      <planeGeometry args={[ui.wing ? 17.6 : 12.4, 9.2]} /><meshStandardMaterial map={floorTex} roughness={.7} /></mesh>
    <Room />
    {ui.south && <SouthWing ui={ui} />}
    {ui.wing ? <Wing /> : <EastWall />}
    <group position={[15, 0, -2]}><B p={[0, .9, 0]} s={[.3, 1.8, .3]} c="#5a3a22" /><mesh position={[0, 2.4, 0]} castShadow><sphereGeometry args={[1.3, 16, 12]} /><meshStandardMaterial color="#2f6b3a" /></mesh></group>
    {OBJ.filter(o => !ui.homeSold.includes(o.id) && (!GATE[o.id] || ui.home.includes(GATE[o.id])) && (ui.famOn || o.acts.some(a => !a.all))).map(raw => { const o = movedObj(raw); return <group key={o.id} position={[o.p[0], 0, o.p[1]]} rotation-y={o.rot}
      onPointerDown={editingHome && EDITABLE_HOME_IDS.has(o.id) ? (e: any) => EDIT.down(o.id, e) : undefined}
      onClick={e => { if (e.delta > 4) return; e.stopPropagation(); if (editingHome && EDITABLE_HOME_IDS.has(o.id)) { setHomeSel(o.id); setSel(null); return; } setSel(ui.famOn ? o : { ...o, acts: o.acts.filter(a => !a.all) }); }}
      onPointerOver={e => { e.stopPropagation(); document.body.style.cursor = 'pointer'; setHov(o.id); }} onPointerOut={() => { document.body.style.cursor = 'auto'; setHov(h => (h === o.id ? null : h)); }}>{VIS[o.id](ui)}</group>; })}
    {DECOR.filter(d => !ui.homeSold.includes(d.id) && (ui.wing || !WING_IDS.has(d.id))).map(raw => { const d = movedDecor(raw); return <group key={d.id} position={[d.p[0], 0, d.p[1]]} rotation-y={d.rot} onPointerDown={editingHome && EDITABLE_HOME_IDS.has(d.id) ? (e: any) => EDIT.down(d.id, e) : undefined} onClick={e => { if (e.delta > 4) return; e.stopPropagation(); if (editingHome && EDITABLE_HOME_IDS.has(d.id)) setHomeSel(d.id); }}><group>{VIS[d.vis](ui)}</group></group>; })}
    {ui.homeOwned.map(i => <OwnedFurniture key={i.id} item={i} editing={editingHome} onSelect={setHomeSel} />)}
    {editingHome && homeSel && (() => { const q = homePos(homeSel); return q ? <mesh rotation-x={-Math.PI / 2} position={[q[0], .035, q[1]]}><ringGeometry args={[.62, .76, 40]} /><meshBasicMaterial color="#f0b94a" transparent opacity={.95} depthTest={false} /></mesh> : null; })()}
    {hov && hov !== sel?.id && (() => { const o = find(hov); return <Html position={[o.p[0], 2.3, o.p[1]]} center zIndexRange={[15, 5]} style={{ pointerEvents: 'none' }}><div className="tag">{o.name}</div></Html>; })()}
    <Suspense fallback={null}><Avatar look={look} bubble={ui.cur ? ui.cur.e : moodFace(ui.mood)} /><Family looks={flooks} ui={ui} onPick={id => setSel(famObj(id))} /></Suspense>
    {sel && <Html position={[sel.p[0], 2.6, sel.p[1]]} center zIndexRange={[20, 10]}><div className="pie"><b>{sel.name}</b>
      {sel.acts.map(a => <button key={a.k} disabled={(!!a.pow && !ui.power) || (a.cost || 0) > ui.cash || (USES[a.k]?.meals || 0) > ui.meals || (a.all === 'dinner' && ui.fam.every(f => f.away))} onClick={() => { enq(sel, a); setSel(null); }}>{a.e} {a.label}<small>{a.cost ? `-${naira(a.cost)}` : a.pay ? `+${naira(a.pay)}` : (USES[a.k]?.meals || 0) > ui.meals ? 'no groceries 🛒' : USES[a.k]?.supplies && ui.supplies < 1 ? `${a.dur} min · no toiletries` : `${a.dur} min`}</small></button>)}</div></Html>}
    <OrbitControls ref={ctl} enablePan={false} target={[ui.wing ? 2.6 : 0, 0, ui.south ? 2.2 : 0]} minDistance={7} maxDistance={26} minPolarAngle={.5} maxPolarAngle={1.25} minAzimuthAngle={-.6} maxAzimuthAngle={.9} />
  </>;
}


export default function Sim() {
  const [famModal, setFamModal] = useState(false), [homeEdit, setHomeEdit] = useState(false), [homeSel, setHomeSel] = useState<string | null>(null), [homeSaving, setHomeSaving] = useState(false), [homeMin, setHomeMin] = useState(false), [wardrobe, setWardrobe] = useState(false), [homeUp, setHomeUp] = useState(false), [famOpen, setFamOpen] = useState(false), [menu, setMenu] = useState(false), [ui, setUi] = useState<UI>(snap), [sel, setSel] = useState<Obj | null>(null), [look, setLook] = useState<Look | null>(null), [ready, setReady] = useState(false), [editing, setEditing] = useState(false), [user, setUser] = useState<AccountUser | null>(null), lookRef = useRef<Look | null>(null), [outside, setOutside] = useState(false), [profile, setProfile] = useState<Profile | null>(null), [nearB, setNearB] = useState<{ name: string; type: string; id: string } | null>(null), [inside, setInside] = useState<string | null>(null), [hud, setHud] = useState(false), [cityTab, setCityTab] = useState<'map' | 'jobs' | 'businesses' | null>(null), [homeItems, setHomeItems] = useState<typeof HOME_OWNED[number][]>([]), [homePlaceable, setHomePlaceable] = useState<{itemKey:string;name:string;e:string;cat:string;cost:number;quantity:number;fp?:[number,number]}[]>([]);
  useEffect(() => { if (!homeEdit) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { setHomeEdit(false); setHomeSel(null); } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [homeEdit]);
  lookRef.current = look;
  async function enter(u: AccountUser) {
    const sr = await fetch('/api/save'), r = await sr.json().catch(() => null);
    if (!sr.ok || !r) throw new Error(r?.error || `Could not load your save (${sr.status}). If you just updated the game, run the database migration (prisma/migrations/0013_auto_work).`);
    if (r.save) { Object.assign(S, { needs: r.save.state.needs, min: worldMinute(), cash: r.save.cash }); F.load(r.save.state.bonds, false); loadPantry(); try { const h = await fetch('/api/home', { cache: 'no-store' }); if (h.ok) applyHome((await h.json()).owned || []); } catch { /* no upgrades yet */ } try { const l = await fetch('/api/home/layout', { cache: 'no-store' }); if (l.ok) { const ld=await l.json(); resetHomeLayout(); Object.assign(HOME_LAYOUT, ld.layout || {}); HOME_SOLD.clear(); (ld.soldStatic||[]).forEach((id:string)=>HOME_SOLD.add(id)); blKey = '\0'; } } catch { /* default layout */ } try { const f=await fetch('/api/home/furniture',{cache:'no-store'}); if(f.ok){ const d=await f.json(); HOME_OWNED.splice(0,HOME_OWNED.length,...(d.items||[])); HOME_SOLD.clear(); (d.soldStatic||[]).forEach((id:string)=>HOME_SOLD.add(id)); setHomeItems([...HOME_OWNED]); setHomePlaceable(d.placeable||[]); } } catch { /* furniture unavailable */ } setLook({ ...r.save.look, name: u.username }); setProfile(r.save.profile ?? DEFAULT_PROFILE); } else { setLook(null); setProfile(null); setEditing(true); }
    setUser(u);
  }
  async function logout() {
    setOutside(false); await fetch('/api/auth/logout', { method: 'POST' }); Object.assign(S, NEW()); F.reset(); setLook(null); setEditing(false); setUser(null); }

  /* ───────── free will: go to work on your own, and keep working while the browser is closed ─────────
   * Online: when Free will is ON and the player has been idle, the character leaves home for their workplace (the business of their last shift),
   * walks there, goes in and starts shifts (see Interior.tsx), and heads home when the building closes or their needs run low.
   * Offline: the server pays the shifts worked while you were away (lib/autowork.ts) on the first heartbeat after you come back. */
  const live = useRef<any>({});
  live.current = { outside, inside, nearB, user, look, profile, busy: homeEdit || editing || wardrobe || homeUp || famModal || menu };
  useEffect(() => { AUTO.free = ui.free; }, [ui.free]);
  useEffect(() => {
    const f = () => { AUTO.lastInput = Date.now(); }, evs = ['keydown', 'pointerdown', 'touchstart', 'wheel'];
    evs.forEach(e => window.addEventListener(e, f, { passive: true })); return () => evs.forEach(e => window.removeEventListener(e, f));
  }, []);
  useEffect(() => { // heartbeat (also what the server uses to know how long you were away)
    if (!user) return; let dead = false, first = true;
    const beat = async () => { try {
      if (document.hidden) { fetch('/api/autowork?hidden=1', { cache: 'no-store' }).catch(() => {}); return; } // screen left: the character carries on working on the server
      const r = await fetch('/api/autowork', { cache: 'no-store' }); if (!r.ok || dead) return; const d = await r.json();
      if (first) { first = false; S.free = !!d.freeWill; AUTO.free = S.free; AUTO.blocked = false; }
      AUTO.work = d.work || null;
      if (d.away) { const a = d.away; S.cash = d.cash; for (let i = 0; i < Math.min(a.shifts, 4); i++) AUTO.drain?.(); const m = `💼 While you were away you worked ${a.shifts} shift${a.shifts > 1 ? 's' : ''} at ${a.where}: +₦${a.earned.toLocaleString()}`; say(m); GAME.notice = m; }
    } catch { /* offline */ } };
    const vis = () => { if (!document.hidden) beat(); }; // back on the screen: collect what the character earned right away
    document.addEventListener('visibilitychange', vis);
    beat(); const i = setInterval(beat, 30000); return () => { dead = true; clearInterval(i); document.removeEventListener('visibilitychange', vis); };
  }, [user]);
  useEffect(() => {
    let lastEnter = 0, tries = 0;
    const iv = setInterval(() => {
      const L = live.current, w = AUTO.work;
      if (!S.free || !w || AUTO.blocked || !L.user || !L.look || !L.profile || L.busy || GAME.jailed || GAME.ride) return;
      const biz = CITY.businesses.find(b => b.id === w.bizId); if (!biz) return;
      if (L.inside) { tries = 0; return; } // the building (Interior.tsx) drives the shifts
      const open = businessStatus(biz.type, worldMinute()).open;
      if (!L.outside) { // at home: go to work once the needs are tended and the player is not busy
        if (S.cur || S.q.length || idleFor() < 8000) return;
        if (open && AUTO.minNeed() > 25) { say(`💼 Heading to work at ${biz.name}`); setSel(null); setOutside(true); tries = 0; }
        return;
      }
      if (idleFor() < 20000 || GAME.nav) return; // in the city: only act when the player has let go of the controls
      if (!open || AUTO.minNeed() <= 25) { setOutside(false); return; } // closed, or hungry / tired: go home
      if (L.nearB?.id === w.bizId) {
        if (Date.now() - lastEnter < 6000) return; lastEnter = Date.now();
        if (++tries > 3) { AUTO.blocked = true; GAME.notice = `⛔ Could not get into ${biz.name}: auto-work paused.`; return; }
        window.dispatchEvent(new CustomEvent('arl-enter', { detail: w.bizId })); return;
      }
      const build = CITY.buildings.find(x => x.business?.id === biz.id), pl = GAME.player; let tx = biz.x, tz = biz.z;
      if (build) { const dx = pl.x - biz.x, dz = pl.z - biz.z; if (Math.abs(dx) >= Math.abs(dz)) tx = biz.x + (dx >= 0 ? build.w / 2 + 5.2 : -build.w / 2 - 5.2); else tz = biz.z + (dz >= 0 ? build.d / 2 + 5.2 : -build.d / 2 - 5.2); }
      GAME.nav = { x: tx, z: tz, name: biz.name };
    }, 2000);
    return () => clearInterval(iv);
  }, []);
  useEffect(() => {
    H.door = () => { setSel(null); setOutside(true); };
    H.outfit = () => setWardrobe(true);
    return () => { H.door = undefined; H.outfit = undefined; };
  }, []);
  useEffect(() => {
    Object.assign(S, NEW()); F.reset();
    (async () => { try { let me: any = null; for (let i = 0; i < 4; i++) { const r = await fetch('/api/auth/me'); me = await r.json().catch(() => null); if (r.status !== 503) break; await new Promise(x => setTimeout(x, 800)); } if (me?.user) await enter(me.user); } catch { /* offline */ } setReady(true); })();
    const a = setInterval(() => { S.min = worldMinute(); setUi(snap()); }, 200), b = setInterval(() => { if (lookRef.current) saveNow(lookRef.current); }, 5000);
    return () => { clearInterval(a); clearInterval(b); };
  }, []);
  useEffect(() => { setMusicMood(outside && !inside ? 'city' : 'chill'); }, [outside, inside]); // lively amapiano-style loop on the streets, calm lo-fi indoors and at home
  useEffect(() => { if (ui.toast) sfx('pop'); }, [ui.toast]);
  useEffect(() => { const f = (e: Event) => { const d = (e as CustomEvent).detail; if (d && typeof d.cash === 'number') S.cash = d.cash; }; window.addEventListener('arl-mission-paid', f); return () => window.removeEventListener('arl-mission-paid', f); }, []);
  useEffect(() => { const f = (e: Event) => { const d = (e as CustomEvent).detail; if (d && typeof d.meals === 'number') { S.meals = d.meals; S.supplies = d.supplies; } }; window.addEventListener('arl-pantry', f); return () => window.removeEventListener('arl-pantry', f); }, []);
  const h = Math.floor(ui.min / 60) % 24, m = Math.floor(ui.min % 60), hr = (ui.min / 60) % 24;
  return <div className={'sim' + (outside ? ' outside' : '')}>
    {!ready && <Loader label="Checking your session" />}
    {ready && !user && <AuthScreen onAuth={enter} />}
    {user && look && outside && !inside && <City tab={cityTab} onTab={setCityTab} look={look} getMinute={worldMinute} onSocial={(a?: number) => { S.needs.social = cl(S.needs.social + (a ?? 0.06)); }} onNear={b => { if (b) S.needs.social = cl(S.needs.social + 0.02); setNearB(b ? { name: b.name, type: b.type, id: b.id } : null); }} />}
    {user && look && profile && outside && !inside && <GameLayer open={hud} onToggle={() => setHud(h => !h)} onCityTab={setCityTab} cityTab={cityTab} onEnter={setInside} onDenied={() => setInside(null)} username={user.username} getMinute={worldMinute} role={profile.profession === 'police' ? 'police' : 'player'} near={nearB} onCash={n => { S.cash = n; }} />}
    {user && look && profile && outside && inside && <Interior key={inside} bizId={inside} look={look} profile={profile} getMinute={worldMinute} onCash={n => { S.cash = n; }} onFx={fx => { for (const k of Object.keys(fx)) if (k in S.needs) S.needs[k as N] = cl(S.needs[k as N] + fx[k]); }} onExit={() => { const ex = buildingExitPoint(inside); if (ex) GAME.tp = ex; fetch('/api/exit', { method: 'POST' }).catch(() => {}); setInside(null); }} />}
    {user && look && <AssetLoader />}
    {user && look && !outside && <Canvas shadows dpr={[1, 1.5]} camera={{ position: [3, 13, 16], fov: 42 }}><World ui={ui} sel={sel} setSel={setSel} look={look} editingHome={homeEdit} setHomeSel={setHomeSel} homeSel={homeSel} onLayout={() => { blKey = '\0'; setUi(snap()); }} /></Canvas>}
    {wardrobe && user && look && profile && <Wardrobe look={look} profile={profile} onClose={() => setWardrobe(false)} onSave={async (l, pf) => { const n = { ...l, name: user.username }; const r = await fetch('/api/profile', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ look: n, profile: pf }) }), d = await r.json().catch(() => ({})); if (!r.ok) { say(d.error || 'Could not save.'); return; } if (d.profile) setProfile(d.profile); setLook(n); saveNow(n); setWardrobe(false); say('👕 Looking good!'); }} />}
    {homeUp && user && look && <HomeUpgrades onClose={() => setHomeUp(false)} onChange={(ids, cash) => { applyHome(ids); S.cash = cash; }} />}
    {ready && user && (editing || !look) && <Creator initial={look || { ...DEFAULT_LOOK, name: user.username }} initialProfile={look ? profile : null} onDone={async (l, pf) => { const n = { ...l, name: user.username }; const r = await fetch('/api/profile', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ look: n, profile: pf }) }), d = await r.json().catch(() => ({})); if (!r.ok) { say(d.error || 'Could not save.'); return; } if (typeof d.cash === 'number') S.cash = d.cash; setProfile(d.profile); setLook(n); saveNow(n); setEditing(false); }} />}
    <div className={'top' + (menu ? ' open' : '')}><div className="pill">{worldCalendar(ui.min).weekday} · {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')} {hr > 6 && hr < 18 ? '☀️' : '🌙'}</div>
      <div className="pill gold">{naira(ui.cash)}</div>
      {user && look && <button className="pill" onClick={() => { setSel(null); setOutside(o => !o); setMenu(false); }}>{outside ? '🏠' : '🏙️'}<em> {outside ? 'Go home' : 'Neighborhood'}</em></button>}
      <button className="pill menuBtn" aria-label="Menu" onClick={() => setMenu(v => !v)}>{menu ? '✕' : '☰'}</button>
      <div className="topMore"><div className="pill">{worldCalendar(ui.min).season.e} {worldCalendar(ui.min).season.label} · {weatherAt().e} {weatherAt().label}</div>
        <div className="pill">{ui.power ? '💡 Power on' : '🕯️ NEPA off'}</div>
        {user && <Account user={user} onUser={setUser} onLogout={logout} />}
        {user && look && <button className="pill" onClick={() => { setHomeUp(true); setMenu(false); }}>🏗️ Home upgrades</button>} {user && look && !outside && <button className={'pill ' + (homeEdit ? 'on' : '')} onClick={() => { setHomeEdit(v => !v); setHomeSel(null); setMenu(false); }}>🛋️ {homeEdit ? 'Finish decorating' : 'Edit home'}</button>}
        <button className="pill" onClick={() => { setEditing(true); setMenu(false); }}>✏️ Character</button>
        <button className="pill" onClick={() => { openSettings(); setMenu(false); }}>⚙️ Settings</button>
        <button className={'pill ' + (ui.free ? 'on' : '')} onClick={() => { S.free = !S.free; AUTO.free = S.free; fetch('/api/autowork', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ freeWill: S.free }) }).catch(() => {}); }}>🧠 Free will {ui.free ? 'ON' : 'OFF'}</button>
      </div></div>
    <div className="needs"><div className="mood">{moodFace(ui.mood)} <b>{look?.name || 'You'}</b><span>Mood {Math.round(ui.mood)}%</span></div>
      {NEEDS.map(([k, l, e]) => <div key={k} className={'nrow' + (ui.needs[k] < 25 ? ' low' : '')}><span>{e}<em> {l}</em></span><div className="bar"><i style={{ width: ui.needs[k] + '%', background: `hsl(${ui.needs[k] * 1.25},70%,48%)` }} /></div></div>)}</div>
    
    <div className="queue">{ui.cur && <div className="cur"><span>{ui.cur.e} {ui.cur.label}</span><div className="bar"><i style={{ width: ui.prog * 100 + '%', background: '#f0b94a' }} /></div></div>}{ui.q.map((e, i) => <span key={i} className="chip">{e}</span>)}</div>
    {ui.toast && <div key={ui.toast} className="toast">{ui.toast}</div>}
    {user && look && !outside && <div className="emotes">{EMOTES.map(a => <button key={a.k} title={a.label} onClick={() => emote(a)}>{a.e}</button>)}</div>}
    {!outside && <div className="hint">Tap the floor to walk · Tap objects or family for actions · Drag to rotate · Scroll to zoom</div>}
    {homeEdit && !outside && user && look && <div className="homeEditor">
      <div className="homeHead"><b>🏠 Home design</b><div className="homeHeadBtns"><button onClick={() => setHomeMin(v => !v)} aria-label="Minimise">{homeMin ? '▴' : '▾'}</button><button onClick={() => { resetHomeLayout(); blKey = '\0'; setHomeSel(null); setUi(snap()); }}>Reset</button><button disabled={homeSaving} className="save" onClick={async () => { setHomeSaving(true); const r = await fetch('/api/home/layout', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ layout: HOME_LAYOUT }) }); setHomeSaving(false); say(r.ok ? '🏠 Home layout saved.' : 'Could not save home layout.'); }}>{homeSaving ? 'Saving…' : 'Save layout'}</button><button className="homeDone" onClick={() => { setHomeEdit(false); setHomeSel(null); setHomeMin(false); }}>✓ Done</button></div></div>
      {!homeMin && <>{homeSel ? <><strong>{homeName(homeSel)}</strong><div className="homeBtns"><button onClick={() => { const t = HOME_LAYOUT[homeSel] || { x: 0, z: 0, r: 0 }; HOME_LAYOUT[homeSel] = { ...t, x: t.x, z: t.z - .25 }; blKey = '\0'; setUi(snap()); }}>↑</button><button onClick={() => { const t = HOME_LAYOUT[homeSel] || { x: 0, z: 0, r: 0 }; HOME_LAYOUT[homeSel] = { ...t, x: t.x - .25, z: t.z }; blKey = '\0'; setUi(snap()); }}>←</button><button onClick={() => { const t = HOME_LAYOUT[homeSel] || { x: 0, z: 0, r: 0 }; HOME_LAYOUT[homeSel] = { ...t, x: t.x + .25, z: t.z }; blKey = '\0'; setUi(snap()); }}>→</button><button onClick={() => { const t = HOME_LAYOUT[homeSel] || { x: 0, z: 0, r: 0 }; HOME_LAYOUT[homeSel] = { ...t, x: t.x, z: t.z + .25 }; blKey = '\0'; setUi(snap()); }}>↓</button><button onClick={() => { const t = HOME_LAYOUT[homeSel] || { x: 0, z: 0, r: 0 }; HOME_LAYOUT[homeSel] = { ...t, r: t.r - Math.PI / 12 }; blKey = '\0'; setUi(snap()); }}>↺</button><button onClick={() => { const t = HOME_LAYOUT[homeSel] || { x: 0, z: 0, r: 0 }; HOME_LAYOUT[homeSel] = { ...t, r: t.r + Math.PI / 12 }; blKey = '\0'; setUi(snap()); }}>↻</button></div><div className="homeSelectedMeta">{(() => { const owned=HOME_OWNED.find(i=>i.id===homeSel); const name=homeName(homeSel); const price=owned?Math.round(owned.cost*.62*Math.max(.2,owned.condition/100)):({bed:260000,wardrobe:190000,fridge:780000,dining:220000,shower:90000,toilet:80000,tv:650000,desk:90000,mat:25000,radio:38000,shelf:85000,plant:5500,gen:190000,toybox:35000,kbedA:120000,kbedB:120000,nstand:38000,kwar:190000,gbench:140000,gbag:90000,cinema:950000,odesk:480000,oshelf:380000} as Record<string,number>)[homeSel]||0; return <span>Estimated resale: <b>{naira(price)}</b></span>; })()}{!homeSel.includes('.') && <button className="sellHome" onClick={async()=>{ if(!homeSel)return; const owned=HOME_OWNED.some(i=>i.id===homeSel); if(!confirm('Sell this item from your house?'))return; const r=await fetch('/api/home/furniture',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'sell',kind:owned?'owned':'static',id:homeSel})}); const d=await r.json().catch(()=>({})); if(r.ok){ HOME_OWNED.splice(0,HOME_OWNED.length,...HOME_OWNED.filter(i=>i.id!==homeSel)); blKey='\0'; HOME_SOLD.add(homeSel); delete HOME_LAYOUT[homeSel]; setHomeItems([...HOME_OWNED]); setHomeSel(null); setUi(snap()); say(`Sold for ${naira(d.gained||0)}.`); } else say(d.error||'Could not sell item.'); }}>💰 Sell item</button>}</div></> : <span>Drag an item to move it, or tap it to nudge/rotate.</span>}
      {homePlaceable.length>0 && <div className="homeInventory"><b>🛒 Your furniture inventory</b><div className="homeInventoryList">{homePlaceable.slice(0,12).map(i=><button key={i.itemKey} onClick={async()=>{const r=await fetch('/api/home/furniture',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'place',itemKey:i.itemKey})});const d=await r.json().catch(()=>({}));if(r.ok){HOME_OWNED.splice(0,HOME_OWNED.length,...(d.items||[]));setHomeItems([...HOME_OWNED]);const f=await fetch('/api/home/furniture',{cache:'no-store'});if(f.ok){const x=await f.json();setHomePlaceable(x.placeable||[]);}setUi(snap());say(`${i.name} placed in your home.`);}else say(d.error||'Could not place item.');}}>{i.e} {i.name} <small>×{i.quantity}</small></button>)}</div></div>}</>}
    </div>}
    <RuntimeStyle css={CSS} />
  </div>;
}

const CSS = `.au{position:fixed;inset:0;z-index:60;display:grid;place-items:center;background:radial-gradient(circle at 40% 20%,#1c4a39,#07100d)}.card,.box{width:min(380px,92vw);background:#0c1713f5;border:1px solid #ffffff2a;border-radius:18px;padding:24px;display:flex;flex-direction:column;gap:10px}.card h1{margin:0;font-size:22px}.logo{width:44px;height:44px;border-radius:13px;background:linear-gradient(135deg,#d99a42,#6f4721);display:grid;place-items:center;font-weight:900}.muted{color:#9fb5aa;font-size:12px;margin:0}.card label{font-size:11px;color:#9fb5aa;display:flex;flex-direction:column;gap:6px}.card input,.box input,.vb input{background:#0a1511;border:1px solid #2a4337;border-radius:9px;padding:10px;color:#fff;font-size:14px}.tabs{display:flex;gap:6px}.tabs button,.row button{flex:1;background:#14261f;border:1px solid #2a4337;color:#cfe;border-radius:9px;padding:9px;cursor:pointer}.tabs .on{background:#1d7654}.pri{background:#d99a42;color:#1a1208;border:0;border-radius:11px;padding:12px;font-weight:800;cursor:pointer}.pri:disabled{opacity:.4}.bad{color:#ff8b8b;font-size:12px;margin:0}.vb{display:flex;flex-direction:column;gap:8px}.vb p,.box p{font-size:12px;margin:0}.row{display:flex;gap:6px}.modal{position:fixed;inset:0;z-index:55;background:#0008;display:grid;place-items:center}.box h3{margin:0}.box{color:#fff}
`+`.homeEditor{position:absolute;z-index:35;left:50%;top:54px;transform:translateX(-50%);width:min(360px,calc(100vw - 16px));background:#10201ad9;border:1px solid #f0b94a66;border-radius:12px;padding:6px 8px;color:#fff;backdrop-filter:blur(8px);display:flex;flex-direction:column;gap:5px;font-size:11px}.homeEditor>div:first-child{display:flex;flex-direction:column;gap:2px}.homeEditor span{font-size:10px;color:#9fb5aa}.homeEditor>.homeHead{flex-direction:row;justify-content:space-between;align-items:center;gap:6px}.homeHead>b{font-size:12px;white-space:nowrap}.homeHead>div:first-child{display:flex;flex-direction:column;gap:2px}.homeHeadBtns{display:flex;gap:4px;flex:none}.homeHeadBtns button{border:1px solid #ffffff2a;background:#ffffff14;color:#fff;border-radius:8px;padding:4px 8px;font-weight:800;font-size:11px;cursor:pointer}.homeHeadBtns .save{background:#1d7654;border-color:#1d7654}.homeHeadBtns .homeDone{background:#d99a42;border-color:#d99a42;color:#171108}.homeSelectedMeta{display:flex;align-items:center;gap:7px;flex-wrap:wrap;font-size:10px;color:#b9c9c0}.homeSelectedMeta>span{flex:1}.sellHome{background:#8e3434!important;border-color:#b95050!important;color:#fff!important}.homeInventory{border-top:1px solid #ffffff14;padding-top:4px;font-size:10px}.homeInventoryList{display:flex;gap:4px;overflow-x:auto;padding-top:3px}.homeInventoryList button{white-space:nowrap;background:#172b23;border:1px solid #2b493b;color:#fff;border-radius:8px;padding:4px 6px;font-size:9px}.homeInventoryList small{color:#9fb5aa}.homeBtns{display:grid;grid-template-columns:repeat(6,1fr);gap:4px}.homeBtns button{background:#1b3329;border:1px solid #2f5143;color:#fff;border-radius:8px;padding:5px;font-weight:800;font-size:12px}.homeEditorActions{display:flex;gap:6px}.homeEditorActions button{flex:1}.homeEditorActions .save{background:#d99a42;color:#17110a;border-color:#d99a42}.sim{position:fixed;inset:0;font-family:Inter,system-ui,sans-serif;color:#fff;user-select:none}.sim canvas{display:block}
.top{position:absolute;z-index:30;top:10px;left:10px;right:10px;display:flex;gap:8px;flex-wrap:wrap;pointer-events:none}.top>*{pointer-events:auto}
.pill{background:#10201ad9;border:1px solid #ffffff2a;border-radius:999px;padding:7px 12px;font-size:12px;color:#fff;backdrop-filter:blur(8px);cursor:default}button.pill{cursor:pointer}
.pill button{background:none;border:0;color:#9fb;font-size:11px;padding:0 6px;cursor:pointer}.pill button.on{color:#f0b94a;font-weight:800}.pill.on{background:#1d7654}.gold{color:#f3c56f;font-weight:800}
.needs{position:absolute;z-index:5;left:10px;bottom:10px;width:220px;background:#10201ae6;border:1px solid #ffffff2a;border-radius:16px;padding:12px;backdrop-filter:blur(8px)}
.mood{display:flex;align-items:center;gap:8px;font-size:22px;margin-bottom:8px}.mood b{font-size:14px}.mood span{margin-left:auto;font-size:11px;color:#9fb5aa}
.nrow{display:flex;align-items:center;gap:8px;font-size:11px;margin:5px 0}.nrow>span{width:86px}.bar{flex:1;height:8px;background:#ffffff1f;border-radius:9px;overflow:hidden}.bar i{display:block;height:100%;border-radius:9px;transition:width .2s}
.queue{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);display:flex;gap:6px;align-items:center}.cur{background:#10201af0;border:1px solid #f0b94a88;border-radius:12px;padding:8px 12px;font-size:12px;min-width:170px}.cur .bar{margin-top:6px}
.chip{background:#10201ad9;border:1px solid #ffffff2a;border-radius:10px;padding:7px 9px;font-size:16px}
.toast{position:absolute;top:60px;left:50%;transform:translateX(-50%);background:#f0b94a;color:#1a1208;font-weight:700;font-size:13px;padding:9px 16px;border-radius:12px}
.emotes{position:absolute;right:12px;top:64px;display:flex;flex-direction:column;gap:7px}.emotes button{width:42px;height:42px;border-radius:50%;border:1px solid #ffffff33;background:#10201ae6;font-size:20px;cursor:pointer;backdrop-filter:blur(8px);transition:transform .15s,background .2s}.emotes button:hover{transform:scale(1.12);background:#1d7654}.emotes button:active{transform:scale(.94)}
.tag{background:#10201af0;border:1px solid #ffffff33;border-radius:8px;padding:4px 9px;font-size:11px;color:#fff;white-space:nowrap;animation:popIn .15s both}
.hint{position:absolute;right:12px;bottom:12px;font-size:10px;color:#ffffffaa;text-shadow:0 1px 3px #000;max-width:200px;text-align:right}
.bubble{background:#fff;color:#000;border-radius:14px;padding:3px 9px;font-size:20px;box-shadow:0 2px 8px #0005}
.pie{background:#10201af5;border:1px solid #ffffff33;border-radius:14px;padding:8px;display:flex;flex-direction:column;gap:5px;min-width:170px}.pie b{font-size:11px;color:#f0b94a;text-transform:uppercase;letter-spacing:.1em;padding:0 4px}
.pie button{display:flex;justify-content:space-between;gap:12px;background:#1b3329;border:1px solid #2f5143;color:#fff;border-radius:9px;padding:8px 10px;font-size:12px;cursor:pointer;text-align:left}.pie button:hover:not(:disabled){background:#27503f}.pie button:disabled{opacity:.4;cursor:not-allowed}.pie small{color:#9fb5aa}
@media(max-width:620px){.needs{width:170px;padding:8px}.hint{display:none}.nrow>span{width:70px}}
.famBtn{position:absolute;z-index:6;left:calc(10px + env(safe-area-inset-left,0px));top:calc(58px + env(safe-area-inset-top,0px));background:#10201ae6;color:#f0b94a;border:1px solid #ffffff2a;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;backdrop-filter:blur(8px)}
.fam{position:absolute;z-index:6;left:calc(10px + env(safe-area-inset-left,0px));top:calc(94px + env(safe-area-inset-top,0px));width:190px;max-height:calc(100vh - 220px);overflow:auto;background:#10201ae6;border:1px solid #ffffff2a;border-radius:14px;padding:9px 11px;backdrop-filter:blur(8px);font-size:11px}.fam>b{display:block;font-size:11px;color:#f0b94a;margin-bottom:4px}.frow{display:grid;grid-template-columns:22px 1fr;align-items:center;margin:6px 0}.frow em{font-style:normal;font-weight:700}.frow small{grid-column:2;color:#9fb5aa;font-size:10px}.frow .bar{grid-column:1/-1;height:5px;margin-top:3px}.bubble.sm{font-size:15px;padding:2px 7px}`;