import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Look } from './characterModels';

// A procedural, fully-animated human. Y up, faces +Z, ~1.75 m tall. No model files, so skin/hair/clothes are exact.
export type HumanState = 'idle' | 'walk' | 'sit' | 'sleep';
type J = Record<string, number>;
const KEYS = ['hipY', 'sX', 'sY', 'sZ', 'hX', 'hY', 'hZ', 'laX', 'laZ', 'raX', 'raZ', 'leX', 'reX', 'llX', 'llZ', 'rlX', 'rlZ', 'lkX', 'rkX'];
export type Rig = {
  root: THREE.Group; hips: THREE.Group; spine: THREE.Group; head: THREE.Group; chest: THREE.Mesh; eyes: THREE.Group;
  la: THREE.Group; ra: THREE.Group; le: THREE.Group; re: THREE.Group; ll: THREE.Group; rl: THREE.Group; lk: THREE.Group; rk: THREE.Group; lf: THREE.Group; rf: THREE.Group;
  cur: J; ph: number; clip: THREE.AnimationClip | null;
};

const std = (c: string, r = .62) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0 });
const shade = (c: string, f: number) => '#' + new THREE.Color(c).multiplyScalar(f).getHexString();
function add<T extends THREE.Object3D>(p: THREE.Object3D, o: T, x = 0, y = 0, z = 0): T { o.position.set(x, y, z); p.add(o); return o; }
function mesh(g: THREE.BufferGeometry, m: THREE.Material) { const o = new THREE.Mesh(g, m); o.castShadow = true; return o; }
const cap = (r: number, l: number) => new THREE.CapsuleGeometry(r, l, 6, 14);
// Tapered torso: wide top (shoulders) to narrow bottom (waist), elliptical cross-section. Scaled in the geometry so the breathing animation (mesh scale) still works.
const torso = (rTop: number, rBot: number, h: number, zs: number) => { const g = new THREE.CylinderGeometry(rTop, rBot, h, 32, 1); g.scale(1, 1, zs); return g; };

export function buildHuman(look: Look): Rig {
  const f = look.gender === 'f';
  const skin = std(look.skin, .55), hairM = std(look.hairColor, .8), shirt = std(look.outfit, .75), pants = std(look.pants, .8), shoe = std('#f3f3f3', .5), sole = std('#2a2a2a', .9);
  const dark = std('#1b1210', .5), white = std('#f4f4f4', .3), lip = std(shade(look.skin, .55), .5), brow = std(shade(look.hairColor, 1), .8);

  const root = new THREE.Group();
  root.scale.setScalar(look.height * (f ? .955 : 1));
  const hips = add(root, new THREE.Group(), 0, .88, 0);
  // pelvis (trousers): women get wider, rounder hips; men a narrower, straighter pelvis
  const hw = f ? .1 : .092;
  add(hips, mesh(new RoundedBoxGeometry(f ? .37 : .31, .2, f ? .235 : .21, 4, .08), pants), 0, .03, 0);
  if (f) for (const s of [-1, 1]) add(hips, mesh(new THREE.SphereGeometry(.105, 20, 16), pants), s * .1, .0, -.006).scale.set(1.08, 1, 1.1); // hip / glute curve
  // spine + chest (shirt): men = broad V-shaped chest, women = narrower shoulders, small waist, bust
  const spine = add(hips, new THREE.Group(), 0, .08, 0);
  const chest = add(spine, mesh(f ? torso(.165, .118, .5, .66) : torso(.225, .17, .5, .52), shirt), 0, .23, 0);
  add(spine, mesh(new THREE.CylinderGeometry(f ? .118 : .17, f ? .13 : .17, .12, 24), shirt), 0, .06, 0).scale.set(1, 1, f ? .78 : .72);
  if (f) for (const s of [-1, 1]) add(spine, mesh(new THREE.SphereGeometry(.058, 20, 16), shirt), s * .072, .31, .086).scale.set(1, 1, .86); // bust
  // neck + head
  const neck = add(spine, mesh(new THREE.CylinderGeometry(f ? .047 : .062, f ? .054 : .07, .1, 14), skin), 0, .5, 0);
  void neck;
  const head = add(spine, new THREE.Group(), 0, .55, 0); head.scale.setScalar(f ? 1.08 : 1.14);
  const skull = add(head, mesh(new THREE.SphereGeometry(.108, 36, 28), skin), 0, .1, 0); skull.scale.set(.96, 1.1, 1.03);
  add(head, mesh(new THREE.SphereGeometry(.07, 24, 18), skin), 0, .045, .035).scale.set(f ? 1.0 : 1.2, .85, 1.05); // jaw (softer on women, squarer on men)
  for (const s of [-1, 1]) add(head, mesh(new THREE.SphereGeometry(.02, 12, 10), skin), s * .104, .095, 0).scale.set(.6, 1, .8); // ears
  // face
  const eyes = add(head, new THREE.Group(), 0, .115, .092);
  for (const s of [-1, 1]) {
    const e = add(eyes, new THREE.Group(), s * .038, 0, 0);
    add(e, mesh(new THREE.SphereGeometry(.0185, 16, 12), white), 0, 0, 0).scale.set(1, .9, .55);
    add(e, mesh(new THREE.SphereGeometry(.0105, 12, 10), dark), 0, 0, .006).scale.set(1, 1, .6);
    if (f) { const lash = add(e, mesh(new THREE.BoxGeometry(.036, .005, .008), dark), 0, .017, .008); lash.rotation.z = -s * .1; } // lashes
    const b = add(head, mesh(new THREE.BoxGeometry(f ? .036 : .045, f ? .005 : .009, .01), brow), s * .038, .15, .1); b.rotation.z = -s * .12;
  }
  add(head, mesh(new THREE.SphereGeometry(.017, 12, 10), skin), 0, .082, .108).scale.set(1, .9, 1.1); // nose
  const smile = add(head, mesh(new THREE.TorusGeometry(.02, .0042, 8, 18, Math.PI), f ? lip : lip), 0, .066, .103); smile.rotation.z = Math.PI; smile.scale.set(1.2, .9, 1);
  // hair
  const cp = (r: number, t: number, ry = 1.1) => { const m = mesh(new THREE.SphereGeometry(r, 32, 22, 0, Math.PI * 2, 0, Math.PI * t), hairM); m.scale.set(1, ry, 1); return m; };
  const hairG = add(head, new THREE.Group(), 0, .1, -.004);
  if (look.hair === 'short') { const m = add(hairG, cp(.12, .62), 0, .008, -.008); m.rotation.x = -.42; }
  if (look.hair === 'afro') { const m = add(hairG, cp(.175, .6, 1.02), 0, .035, -.03); m.rotation.x = -.52; }
  if (look.hair === 'bun') { const m = add(hairG, cp(.12, .62), 0, .008, -.008); m.rotation.x = -.42; add(hairG, mesh(new THREE.SphereGeometry(.052, 18, 14), hairM), 0, .13, -.06); }
  if (look.hair === 'braids') {
    const m = add(hairG, cp(.122, .64), 0, .008, -.01); m.rotation.x = -.5;
    for (let i = 0; i < 9; i++) { const a = -2.6 + i * (5.2 / 8) - Math.PI / 2 + Math.PI; const bx = Math.sin(a) * .1, bz = Math.cos(a) * .1 - .01; const br = add(hairG, mesh(cap(.012, .2), hairM), bx, -.13, bz); br.rotation.x = .08; }
  }
  // legs (thigh pivot at hip joint)
  const mkLeg = (s: number) => {
    const up = add(hips, new THREE.Group(), s * hw, -.02, 0);
    add(up, mesh(cap(f ? .077 : .083, .33), pants), 0, -.215, 0);
    const kn = add(up, new THREE.Group(), 0, -.43, 0);
    add(kn, mesh(new THREE.SphereGeometry(f ? .06 : .068, 14, 10), pants)); add(kn, mesh(cap(f ? .052 : .062, .31), pants), 0, -.2, 0);
    const ft = add(kn, new THREE.Group(), 0, -.41, 0);
    add(ft, mesh(new RoundedBoxGeometry(f ? .088 : .105, .075, f ? .25 : .275, 3, .03), shoe), 0, -.005, .05);
    add(ft, mesh(new RoundedBoxGeometry(f ? .092 : .109, .022, f ? .255 : .28, 2, .01), sole), 0, -.04, .05);
    return { up, kn, ft };
  };
  const L = mkLeg(1), R = mkLeg(-1);
  // arms (shoulder pivot at top of chest)
  const sx = f ? .19 : .285;
  const mkArm = (s: number) => {
    const sh = add(spine, new THREE.Group(), s * sx, .44, 0);
    add(sh, mesh(new THREE.SphereGeometry(f ? .048 : .07, 16, 12), shirt), 0, 0, 0);
    add(sh, mesh(cap(f ? .038 : .056, .18), skin), 0, -.15, 0);
    add(sh, mesh(new THREE.CylinderGeometry(f ? .045 : .066, f ? .05 : .072, .14, 18), shirt), 0, -.1, 0); // short sleeve
    const el = add(sh, new THREE.Group(), 0, -.29, 0);
    add(el, mesh(new THREE.SphereGeometry(f ? .037 : .05, 12, 10), skin));
    add(el, mesh(cap(f ? .034 : .048, .21), skin), 0, -.155, 0);
    const hand = add(el, mesh(new THREE.SphereGeometry(.05, 14, 12), skin), 0, -.32, .005); hand.scale.set(f ? .72 : .92, f ? 1.05 : 1.2, f ? .55 : .65);
    const th = add(el, mesh(new THREE.SphereGeometry(.016, 8, 8), skin), s * -.035, -.3, .03); void th;
    return { sh, el };
  };
  const A = mkArm(1), B = mkArm(-1);
  root.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).receiveShadow = false; });
  const cur = Object.fromEntries(KEYS.map(k => [k, 0])) as J;
  return { root, hips, spine, head, chest, eyes, la: A.sh, ra: B.sh, le: A.el, re: B.el, ll: L.up, rl: R.up, lk: L.kn, rk: R.kn, lf: L.ft, rf: R.ft, cur, ph: 0, clip: null };
}

const sin = Math.sin, cos = Math.cos, mx = Math.max;
// Target joint angles. Forward-positive for arms/legs/elbows/spine/head, knee bend positive = shin goes backward.
function target(state: HumanState, anim: string | undefined, t: number, ph: number): J {
  const j: J = {}; const br = sin(t * 1.9);
  // base standing
  j.laZ = .09; j.raZ = .09; j.leX = .14; j.reX = .14; j.sX = .015 * br; j.hY = .14 * sin(t * .35);
  if (state === 'walk') {
    const a = .62, s = sin(ph), c = cos(ph);
    j.llX = a * s; j.rlX = -a * s; j.lkX = .12 + .95 * mx(0, c); j.rkX = .12 + .95 * mx(0, -c);
    j.laX = -.5 * s; j.raX = .5 * s; j.leX = .3 + .35 * mx(0, -s); j.reX = .3 + .35 * mx(0, s);
    j.hipY = -.035 * Math.abs(s); j.sY = .14 * s; j.sX = .06; j.hY = -.1 * s; j.laZ = .07; j.raZ = .07;
  }
  if (state === 'sit') {
    j.hipY = -.4; j.llX = 1.5; j.rlX = 1.5; j.lkX = 1.5; j.rkX = 1.5; j.llZ = .06; j.rlZ = -.06; j.sX = -.05; j.laX = .35; j.raX = .35; j.leX = 1.0; j.reX = 1.0; j.laZ = .12; j.raZ = .12;
  }
  if (state === 'sleep') { j.laZ = .12; j.raZ = .12; j.leX = .1; j.reX = .1; j.llZ = .05; j.rlZ = -.05; j.sX = 0; j.hY = 0; j.hX = -.08; }
  const k = anim;
  if (k === 'tv' || k === 'game') { j.sX = -.22; j.hX = k === 'game' ? .12 : -.05; j.laX = .35; j.raX = .35; j.leX = .85; j.reX = .85; if (k === 'game') { j.laX = .75; j.raX = .75; j.laZ = .03; j.raZ = .03; j.leX = .8 + .08 * sin(t * 14); j.reX = .8 + .08 * sin(t * 11); j.sX = .05; j.sY = .05 * sin(t * 2); } else { j.sZ = .02 * sin(t * 1.3); j.hY = .12 * sin(t * .6); j.sX -= .03 * mx(0, sin(t * 3.1)); } }
  if (k === 'chill') { j.sX = -.28; j.hX = -.1; j.laX = .5; j.raX = .5; j.leX = .6; j.reX = .6; j.laZ = .35; j.raZ = .35; }
  if (k === 'work') { j.sX = .1; j.hX = .2; j.laX = .55; j.raX = .55; j.laZ = .05; j.raZ = .05; j.leX = 1.0 + .1 * sin(t * 15); j.reX = 1.0 + .1 * sin(t * 15 + 2); j.hY = .08 * sin(t * .8); }
  if (k === 'browse') { j.sX = .05; j.hX = .25; j.raX = .6; j.leX = 1.0; j.reX = 1.5; j.laX = .4; j.laZ = .15; j.hY = .1 * sin(t * .5); j.raZ = -.1; }
  if (k === 'wc') { j.sX = .22; j.hX = .15; j.laX = .55; j.raX = .55; j.leX = .5; j.reX = .5; }
  if (k === 'eatsit' || k === 'eat') { const b = .5 + .5 * sin(t * 3.2); j.raX = .6 + .3 * b; j.reX = 1.45 + .55 * b; j.raZ = -.04; j.hX = .08 + .05 * b; j.laX = k === 'eatsit' ? .5 : .1; j.leX = k === 'eatsit' ? .9 : .2; if (k === 'eatsit') j.sX = .08; }
  if (k === 'cook') { j.sX = .14; j.hX = .25; j.raX = .5 + .12 * sin(t * 5); j.raZ = -.05; j.reX = 1.0 + .2 * sin(t * 5 + 1); j.laX = .45; j.leX = 1.0; j.sY = .1 * sin(t * 2.5); }
  if (k === 'wash') { j.laX = 2.7; j.raX = 2.7; j.leX = 1.7; j.reX = 1.7; j.laZ = .35; j.raZ = .35; j.hX = -.15; j.sZ = .05 * sin(t * 6); j.hZ = .12 * sin(t * 6); j.leX += .25 * sin(t * 9); j.reX += .25 * sin(t * 9 + 1.5); }
  if (k === 'phone') { j.raX = .55; j.raZ = -.12; j.reX = 2.3; j.laX = .1; j.hZ = -.16; j.hY = .1; j.sY = .05 * sin(t * 1.5); j.hX = .02 + .05 * mx(0, sin(t * 4)); j.laZ = .2; j.leX = .6; }
  if (k === 'chat') { j.laX = .45; j.raX = .45; j.leX = 1.3; j.reX = 1.3; j.hX = .35; j.laZ = .1; j.raZ = .1; j.leX += .08 * sin(t * 12); j.reX += .08 * sin(t * 12 + 2); j.sX = .06; }
  if (k === 'dance') { const s = sin(t * 6.5), c = cos(t * 6.5); j.hipY = -.06 + .05 * Math.abs(s); j.llX = .25 * s; j.rlX = -.25 * s; j.lkX = .45 + .3 * s; j.rkX = .45 - .3 * s; j.laX = 1.8 + .9 * s; j.raX = 1.8 - .9 * s; j.laZ = .5 + .3 * c; j.raZ = .5 - .3 * c; j.leX = .9; j.reX = .9; j.sY = .35 * s; j.sZ = .12 * c; j.hZ = .12 * s; j.hY = -.2 * s; j.llZ = .12; j.rlZ = -.12; }
  if (k === 'wave') { j.raZ = 2.6; j.raX = 0; j.reX = .35 + .6 * sin(t * 9); j.hZ = -.08; j.hY = .2; j.laZ = .08; }
  if (k === 'cheer') { const b = Math.abs(sin(t * 6)); j.hipY = .02 + .05 * b; j.laZ = 2.6 + .15 * sin(t * 12); j.raZ = 2.6 + .15 * sin(t * 12 + 1); j.leX = .25; j.reX = .25; j.hX = -.2; j.lkX = .25 * (1 - b); j.rkX = .25 * (1 - b); }
  if (k === 'stretch') { const s = sin(t * 1.4); j.laX = 3.0; j.raX = 3.0; j.laZ = .15; j.raZ = .15; j.leX = .05; j.reX = .05; j.sZ = .22 * s; j.sX = -.12; j.hX = -.25; j.hipY = 0; }
  if (k === 'squat') { const s = .5 + .5 * sin(t * 3); j.hipY = -.4 * s; j.llX = 1.25 * s; j.rlX = 1.25 * s; j.lkX = 1.5 * s; j.rkX = 1.5 * s; j.sX = .45 * s; j.laX = .5 + 1.0 * s; j.raX = .5 + 1.0 * s; j.leX = .15; j.reX = .15; j.llZ = .1; j.rlZ = -.1; }
  if (k === 'yoga') { const s = sin(t * .8); j.laX = 3.0; j.raX = 3.0; j.laZ = .3; j.raZ = .3; j.leX = .1; j.reX = .1; j.hX = -.1; j.sX = -.06; j.hipY = -.01 * s; j.rlX = 1.2 + .1 * s; j.rkX = 1.9; j.llZ = .0; j.rlZ = -.45; j.lkX = .02; }
  if (k === 'read') { j.laX = .5; j.raX = .5; j.leX = 1.3; j.reX = 1.3; j.laZ = .04; j.raZ = .04; j.hX = .45; j.sX = .1; j.hY = .1 * sin(t * .6); j.sZ = .02 * sin(t * 1); }
  if (k === 'groom') { j.raX = 2.2 + .1 * sin(t * 4); j.reX = 1.5; j.raZ = -.15; j.hZ = .1 * sin(t * 1.2); j.hY = .22 * sin(t * 1.2); j.laX = .1; j.hX = -.03; }
  if (k === 'water') { j.raX = 1.1; j.reX = .6; j.raZ = -.2; j.sX = .22; j.hX = .25; j.laX = .2; j.sY = .25 * sin(t * 1.5); }
  if (k === 'fuel') { j.hipY = -.18; j.llX = .8; j.rlX = .8; j.lkX = 1.5; j.rkX = 1.5; j.sX = .55; j.laX = 1.0; j.raX = 1.0; j.leX = .5; j.reX = .5 + .25 * sin(t * 7); j.hX = .2; }
  if (k === 'door') { j.raX = .9; j.reX = .5; j.sY = .0; j.hY = .1 * sin(t * 1.4); }
  if (k === 'think') { j.raX = .8; j.reX = 2.3; j.laX = .6; j.leX = 1.8; j.laZ = -.1; j.hX = .12; j.hY = .2; j.hZ = .08; }
  if (k === 'wardrobe') { j.raX = 1.0; j.reX = .6; j.laX = 1.0; j.leX = .6; j.sY = .3 * sin(t * 3); j.hY = .3 * sin(t * 3); }
  if (k === 'music') { const s = sin(t * 5.5); j.llX = .12 * s; j.rlX = -.12 * s; j.lkX = .2 + .15 * mx(0, s); j.rkX = .2 + .15 * mx(0, -s); j.hipY = -.02 + .02 * Math.abs(s); j.sZ = .08 * s; j.hZ = -.14 * s; j.laX = .3; j.raX = .3; j.leX = .9; j.reX = .9 + .3 * s; }
  return j;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export function animateHuman(rig: Rig, state: HumanState, anim: string | undefined, t: number, dt: number, speed = 1) {
  rig.ph += dt * (state === 'walk' ? 8.5 + Math.min(speed, 3) * 1.1 : 0);
  const tg = target(state, anim, t, rig.ph), c = rig.cur, k = 1 - Math.exp(-dt * 14);
  for (const key of KEYS) c[key] = lerp(c[key], tg[key] ?? 0, k);
  rig.hips.position.y = .88 + c.hipY;
  rig.hips.rotation.set(0, 0, 0);
  rig.spine.rotation.set(c.sX, c.sY, c.sZ);
  rig.head.rotation.set(c.hX - c.sX * .6, c.hY - c.sY * .6, c.hZ - c.sZ * .6);
  rig.la.rotation.set(-c.laX, 0, c.laZ); rig.ra.rotation.set(-c.raX, 0, -c.raZ);
  rig.le.rotation.set(-c.leX, 0, 0); rig.re.rotation.set(-c.reX, 0, 0);
  rig.ll.rotation.set(-c.llX, 0, c.llZ); rig.rl.rotation.set(-c.rlX, 0, c.rlZ);
  rig.lk.rotation.set(c.lkX, 0, 0); rig.rk.rotation.set(c.rkX, 0, 0);
  rig.lf.rotation.set(-(-c.llX + c.lkX) * .8, 0, 0); rig.rf.rotation.set(-(-c.rlX + c.rkX) * .8, 0, 0);
  // breathing + blinking (eyes closed while asleep)
  rig.chest.scale.set(1 + .012 * sin(t * 1.9), 1 + .018 * sin(t * 1.9), 1 + .02 * sin(t * 1.9));
  const blink = state === 'sleep' || (t % 4.2) < .13; rig.eyes.scale.y = lerp(rig.eyes.scale.y, blink ? .08 : 1, 1 - Math.exp(-dt * 40));
}
