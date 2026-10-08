import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { defaultOutfitModel, outfitOk, type Look } from './characterModels';

// A procedural, fully-animated human. Y up, faces +Z, ~1.75 m tall. No model files, so skin/hair/clothes are exact.
export type HumanState = 'idle' | 'walk' | 'sit' | 'sleep';
type J = Record<string, number>;
const KEYS = ['hipY', 'sX', 'sY', 'sZ', 'hX', 'hY', 'hZ', 'laX', 'laZ', 'raX', 'raZ', 'leX', 'reX', 'llX', 'llZ', 'rlX', 'rlZ', 'lkX', 'rkX'];
export type Rig = {
  root: THREE.Group; hips: THREE.Group; spine: THREE.Group; head: THREE.Group; chest: THREE.Mesh; eyes: THREE.Group;
  la: THREE.Group; ra: THREE.Group; le: THREE.Group; re: THREE.Group; ll: THREE.Group; rl: THREE.Group; lk: THREE.Group; rk: THREE.Group; lf: THREE.Group; rf: THREE.Group;
  cur: J; ph: number; clip: THREE.AnimationClip | null;
  sk: THREE.Group[]; skAmt: number; // skirt halves (index 0 follows the left leg, 1 the right) and how much they swing
};

const std = (c: string, r = .62) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0 });
const shade = (c: string, f: number) => '#' + new THREE.Color(c).multiplyScalar(f).getHexString();
function add<T extends THREE.Object3D>(p: THREE.Object3D, o: T, x = 0, y = 0, z = 0): T { o.position.set(x, y, z); p.add(o); return o; }
function mesh(g: THREE.BufferGeometry, m: THREE.Material) { const o = new THREE.Mesh(g, m); o.castShadow = true; return o; }
const cap = (r: number, l: number) => new THREE.CapsuleGeometry(r, l, 6, 14);
// Tapered torso: wide top (shoulders) to narrow bottom (waist), elliptical cross-section. Scaled in the geometry so the breathing animation (mesh scale) still works.
const torso = (rTop: number, rBot: number, h: number, zs: number) => { const g = new THREE.CylinderGeometry(rTop, rBot, h, 32, 1); g.scale(1, 1, zs); return g; };

type Slv = 'none' | 'cap' | 'short' | 'long' | 'bell' | 'wide';
type LegK = 'long' | 'bag' | 'wide' | 'shorts' | 'skirt' | 'gown';
type ShoeK = 'sneaker' | 'dress' | 'heel' | 'sandal' | 'boot';
type Spec = { slv: Slv; leg: LegK; shoe: ShoeK; shoeC: string };
// What each outfit model is made of. Men and women get different garments, not just different colours.
function specOf(M: string, f: boolean, look: Look): Spec {
  const W = '#f3f3f3', K = '#111111';
  switch (M) {
    case 'polo': return { slv: 'short', leg: 'long', shoe: 'sneaker', shoeC: W };
    case 'hoodie': return { slv: 'long', leg: 'bag', shoe: 'sneaker', shoeC: W };
    case 'bomber': return { slv: 'long', leg: 'long', shoe: 'sneaker', shoeC: W };
    case 'suit': return { slv: 'long', leg: 'long', shoe: 'dress', shoeC: '#14100e' };
    case 'agbada': return { slv: 'wide', leg: 'long', shoe: 'sandal', shoeC: '#6b4a2f' };
    case 'kaftan': return { slv: 'long', leg: 'long', shoe: 'dress', shoeC: '#3b2616' };
    case 'jersey': return { slv: 'short', leg: 'shorts', shoe: 'sneaker', shoeC: W };
    case 'designer': return f ? { slv: 'none', leg: 'wide', shoe: 'heel', shoeC: K } : { slv: 'long', leg: 'long', shoe: 'sneaker', shoeC: '#f1f1f1' };
    case 'uniform': return { slv: 'short', leg: 'long', shoe: 'boot', shoeC: '#0b0b0b' };
    case 'crop': return { slv: 'cap', leg: 'long', shoe: 'sneaker', shoeC: W };
    case 'dress': return { slv: 'cap', leg: 'skirt', shoe: 'heel', shoeC: look.pants };
    case 'gown': return { slv: 'none', leg: 'gown', shoe: 'heel', shoeC: look.pants };
    case 'ankara': return { slv: 'bell', leg: 'skirt', shoe: 'sandal', shoeC: '#6b4a2f' };
    case 'blazer': return { slv: 'long', leg: 'wide', shoe: 'heel', shoeC: K };
    case 'active': return { slv: 'long', leg: 'long', shoe: 'sneaker', shoeC: W };
    default: return { slv: 'short', leg: 'long', shoe: 'sneaker', shoeC: W };
  }
}
const clm = (c: string, r = .75) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0, side: THREE.DoubleSide });
const metal = (c: string, r = .3) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: .85 });
const GOLD = '#d9a22b';
const lum = (c: string) => { const k = new THREE.Color(c); return .299 * k.r + .587 * k.g + .114 * k.b; };

export function buildHuman(look: Look): Rig {
  const f = look.gender === 'f';
  const M = outfitOk(look.outfitModel || '', f ? 'f' : 'm') ? (look.outfitModel as string) : defaultOutfitModel(f ? 'f' : 'm');
  const sp = specOf(M, f, look);
  const jump = M === 'designer' && f;                       // women's designer fit = tailored jumpsuit
  const topC = look.outfit;
  const botC = jump || M === 'dress' || M === 'gown' ? look.outfit : look.pants;
  const inner = M === 'blazer' ? (lum(topC) > .6 ? shade(topC, .72) : '#f4f4f4') : '#f5f5f5';
  const skin = std(look.skin, .55), hairM = std(look.hairColor, .8), shirt = std(topC, .75), pants = std(botC, .8);
  const shoe = std(sp.shoeC, sp.shoe === 'dress' || sp.shoe === 'heel' ? .25 : .5), sole = std(sp.shoe === 'sneaker' ? '#2a2a2a' : '#151515', .9);
  const dark = std('#1b1210', .5), white = std('#f4f4f4', .3), lip = std(shade(look.skin, .55), .5), brow = std(shade(look.hairColor, 1), .8);
  const gold = metal(GOLD), skirtM = clm(botC, .8), sk: THREE.Group[] = [];

  const root = new THREE.Group();
  root.scale.setScalar(look.height * (f ? .955 : 1));
  const hips = add(root, new THREE.Group(), 0, .88, 0);
  // pelvis (trousers / skirt base): women get wider, rounder hips; men a narrower, straighter pelvis
  const hw = f ? .1 : .092;
  add(hips, mesh(new RoundedBoxGeometry(f ? .37 : .31, .2, f ? .235 : .21, 4, .08), pants), 0, .03, 0);
  if (f) for (const s of [-1, 1]) add(hips, mesh(new THREE.SphereGeometry(.105, 20, 16), pants), s * .1, .0, -.006).scale.set(1.08, 1, 1.1); // hip / glute curve
  // spine + chest
  const zs = f ? .66 : .52;
  const rad = (y: number) => (f ? .118 + (.165 - .118) * ((y + .02) / .5) : .17 + (.225 - .17) * ((y + .02) / .5)); // torso radius at spine height y
  const spine = add(hips, new THREE.Group(), 0, .08, 0);
  const chestM = M === 'crop' ? skin : M === 'blazer' ? std(inner, .7) : M === 'suit' || (M === 'designer' && !f) ? std(inner, .6) : shirt;
  const chest = add(spine, mesh(f ? torso(.165, .118, .5, .66) : torso(.225, .17, .5, .52), chestM), 0, .23, 0);
  const waistPiece = add(spine, mesh(new THREE.CylinderGeometry(f ? .118 : .17, f ? .13 : .17, .12, 24), M === 'crop' ? skin : chestM), 0, .06, 0); waistPiece.scale.set(1, 1, f ? .78 : .72);
  if (f) for (const s of [-1, 1]) add(spine, mesh(new THREE.SphereGeometry(.058, 20, 16), M === 'crop' ? shirt : chestM), s * .072, .31, .086).scale.set(1, 1, .86); // bust
  // helpers for garment layers on the torso
  const shell = (y0: number, y1: number, g: number, mat: THREE.Material, gap = 0) => { const geo = new THREE.CylinderGeometry(rad(y1) + g, rad(y0) + g, y1 - y0, 32, 1, gap > 0, gap, Math.PI * 2 - 2 * gap); geo.scale(1, 1, zs); return add(spine, mesh(geo, mat), 0, (y0 + y1) / 2, 0); };
  const ring = (y: number, g: number, tube: number, mat: THREE.Material) => { const t = add(spine, mesh(new THREE.TorusGeometry(rad(y) + g, tube, 8, 36), mat), 0, y, 0); t.rotation.x = Math.PI / 2; t.scale.set(1, zs, 1); return t; };
  const bare = (h: number) => { const geo = new THREE.CylinderGeometry(rad(.48) + .004, rad(.48 - h) + .004, h, 32); geo.scale(1, 1, zs); add(spine, mesh(geo, skin), 0, .48 - h / 2, 0); }; // skin neckline
  const front = (y: number) => rad(y) * zs; // z of the torso surface at height y
  const skirt = (rt: number, rb: number, y0: number, y1: number, zsc: number, trim?: THREE.Material) => { // y in hips space; two halves that swing with the legs
    const h = y0 - y1;
    for (const i of [0, 1]) {
      const pv = add(hips, new THREE.Group(), 0, y0, 0);
      const g = new THREE.CylinderGeometry(rt, rb, h, 26, 1, true, i === 0 ? 0 : Math.PI, Math.PI); g.scale(1, 1, zsc);
      add(pv, mesh(g, skirtM), 0, -h / 2, 0);
      if (trim) { const t = new THREE.CylinderGeometry(rb + .004, rb + .004, .045, 26, 1, true, i === 0 ? 0 : Math.PI, Math.PI); t.scale(1, 1, zsc); add(pv, mesh(t, trim), 0, -h + .022, 0); }
      sk.push(pv);
    }
  };

  // ---- upper-body garments, per model ----
  const topShade = shade(topC, .78), topLight = shade(topC, 1.3);
  if (M === 'hoodie') {
    shell(-.02, .48, .022, shirt); ring(.0, .03, .022, std(topShade, .9));
    const hood = add(spine, mesh(new THREE.TorusGeometry(.085, .036, 10, 24), shirt), 0, .53, -.035); hood.rotation.x = Math.PI / 2 - .35;
    add(spine, mesh(new THREE.SphereGeometry(.075, 16, 12), shirt), 0, .5, -.09).scale.set(1.15, 1, .8);
    add(spine, mesh(new RoundedBoxGeometry(.2, .1, .02, 2, .008), std(topShade, .85)), 0, .1, front(.1) + .028);
    for (const s of [-1, 1]) add(spine, mesh(cap(.006, .1), std('#f2f2f2', .6)), s * .032, .39, front(.4) + .024);
  }
  if (M === 'bomber') {
    shell(-.02, .48, .02, shirt); ring(-.015, .03, .028, std(topShade, .9)); ring(.47, .0, .022, std(topShade, .9));
    add(spine, mesh(new THREE.BoxGeometry(.012, .46, .008), metal('#c9ced1')), 0, .22, front(.22) + .024);
    add(spine, mesh(new THREE.BoxGeometry(.05, .035, .006), std(GOLD, .5)), f ? .07 : .09, .34, front(.34) + .026);
    for (const s of [-1, 1]) add(spine, mesh(new THREE.BoxGeometry(.06, .06, .02), std(topShade, .9)), s * .15, .1, front(.1) * .9 + .01);
  }
  if (M === 'polo') {
    for (const s of [-1, 1]) { const c = add(spine, mesh(new THREE.BoxGeometry(.06, .018, .035), std(shade(topC, 1.15), .7)), s * .035, .485, front(.48) + .008); c.rotation.z = -s * .55; }
    add(spine, mesh(new THREE.BoxGeometry(.022, .16, .006), std(topShade, .8)), 0, .4, front(.4) + .003);
    for (let i = 0; i < 3; i++) add(spine, mesh(new THREE.SphereGeometry(.007, 8, 6), white), 0, .46 - i * .05, front(.4) + .008);
  }
  if (M === 'suit' || M === 'blazer') {
    const jm = clm(topC, .65), g = .012, gap = .3;
    shell(-.02, .48, g, jm, gap);
    const hem = new THREE.CylinderGeometry(rad(-.02) + g, rad(-.02) + g + .012, .17, 32, 1, true, gap, Math.PI * 2 - 2 * gap); hem.scale(1, 1, zs * 1.12); add(spine, mesh(hem, jm), 0, -.1, 0); // jacket skirt over the hips
    const lap = clm(shade(topC, 1.22), .6);
    for (const s of [-1, 1]) { const l = add(spine, mesh(new THREE.BoxGeometry(.05, .27, .012), lap), s * (f ? .06 : .082), .33, front(.33) + .012); l.rotation.z = s * .2; }
    if (M === 'suit') {
      add(spine, mesh(new THREE.BoxGeometry(.03, .27, .008), std('#8b1e2d', .6)), 0, .3, front(.3) + .002); add(spine, mesh(new THREE.BoxGeometry(.04, .04, .012), std('#8b1e2d', .6)), 0, .45, front(.45) + .004);
      add(spine, mesh(new THREE.BoxGeometry(.05, .026, .006), white), (f ? .05 : .07), .26, front(.26) + .014);
    }
    for (let i = 0; i < 2; i++) add(spine, mesh(new THREE.SphereGeometry(.0085, 8, 6), gold), f ? -.012 : -.016, .12 - i * .07, front(.1) + .016);
  }
  if (M === 'agbada') {
    const robe = clm(topC, .7); const rg = new THREE.CylinderGeometry(rad(.4) + .02, .43, .88, 36, 1, true); rg.scale(1, 1, .64);
    add(spine, mesh(rg, robe), 0, -.03, 0);
    const trim = new THREE.TorusGeometry(.43, .012, 6, 40); const tm = add(spine, mesh(trim, gold), 0, -.47, 0); tm.rotation.x = Math.PI / 2; tm.scale.set(1, .64, 1);
    add(spine, mesh(new THREE.BoxGeometry(.075, .8, .01), gold), 0, .02, .27 + .006);
    ring(.47, .02, .014, gold);
  }
  if (M === 'kaftan') {
    const kt = clm(topC, .7), kg = new THREE.CylinderGeometry(rad(.4) + .015, .215, .64, 32, 1, true); kg.scale(1, 1, .62);
    add(spine, mesh(kg, kt), 0, .07, 0);
    ring(.48, .0, .018, std(shade(topC, 1.2), .6));
    add(spine, mesh(new THREE.BoxGeometry(.04, .42, .008), gold), 0, .22, front(.22) + .026);
    for (let i = 0; i < 6; i++) add(spine, mesh(new THREE.SphereGeometry(.009, 8, 6), gold), 0, .42 - i * .075, front(.3) + .034);
    add(spine, mesh(new THREE.BoxGeometry(.14, .02, .008), gold), 0, .36, front(.36) + .028);
  }
  if (M === 'jersey') {
    for (const s of [-1, 1]) add(spine, mesh(new THREE.BoxGeometry(.03, .46, .1), std(shade(look.pants, .95), .8)), s * (rad(.2) - .01), .23, 0);
    add(spine, mesh(new THREE.TorusGeometry(.05, .01, 6, 14, Math.PI), std(look.pants, .7)), 0, .47, front(.47) + .004).rotation.z = Math.PI;
    add(spine, mesh(new THREE.CircleGeometry(.022, 14), gold), -.07, .33, front(.33) + .016);
    add(spine, mesh(new THREE.BoxGeometry(.11, .13, .006), std(look.pants, .8)), 0, .27, -front(.27) - .004);
  }
  if (M === 'uniform') {
    ring(.02, .014, .026, std('#0b0b0b', .5)); add(spine, mesh(new THREE.BoxGeometry(.045, .04, .008), metal('#c9ced1')), 0, .02, front(.02) + .03);
    add(spine, mesh(new THREE.CircleGeometry(.024, 5), gold), -.08, .34, front(.34) + .016);
    for (const s of [-1, 1]) add(spine, mesh(new THREE.BoxGeometry(.09, .012, .05), std('#0b0b0b', .6)), s * (f ? .16 : .2), .475, 0);
    add(spine, mesh(new THREE.BoxGeometry(.03, .26, .006), std('#0b0b0b', .6)), 0, .3, front(.3) + .004);
  }
  if (M === 'crop') {
    const cg = new THREE.CylinderGeometry(rad(.48) + .008, rad(.22) + .008, .26, 32); cg.scale(1, 1, zs); add(spine, mesh(cg, shirt), 0, .35, 0);
    const jw = new THREE.CylinderGeometry(.13, .14, .1, 28); add(spine, mesh(jw, pants), 0, .0, 0).scale.set(1, 1, .8); // high-waist jeans band
    add(spine, mesh(new THREE.BoxGeometry(.02, .02, .006), gold), 0, .035, .1 + .012);
  }
  if (M === 'dress') {
    bare(.07); ring(.07, .01, .01, std(look.pants, .5));
    skirt(.18, .27, .06, -.52, .74, std(shade(topC, .8), .8));
  }
  if (M === 'gown') {
    bare(.1); ring(.05, .008, .016, gold);
    skirt(.18, .46, .06, -.84, .86, gold);
    add(spine, mesh(new THREE.SphereGeometry(.03, 10, 8), gold), 0, .05, front(.05) + .014);
  }
  if (M === 'ankara') {
    bare(.05); ring(.46, .012, .012, gold);
    for (const s of [-1, 1]) add(spine, mesh(new THREE.BoxGeometry(.05, .05, .01), std(shade(topC, 1.15), .6)), s * .04, .47, front(.47) + .004);
    skirt(.18, .235, .06, -.68, .72, gold);
    add(hips, mesh(new THREE.SphereGeometry(.05, 12, 10), std(topC, .7)), .13, .02, .16).scale.set(1.3, 1.1, .7); add(hips, mesh(new THREE.SphereGeometry(.04, 12, 10), std(topC, .7)), .19, -.04, .13);
    const ip = add(spine, mesh(new THREE.BoxGeometry(.08, .62, .012), std(shade(topC, 1.12), .7)), .01, .2, front(.2) + .018); ip.rotation.z = .5; // ipele shoulder cloth
  }
  if (M === 'active') {
    for (const s of [-1, 1]) add(spine, mesh(new THREE.BoxGeometry(.012, .46, .1), std('#f4f4f4', .6)), s * (rad(.2) - .004), .23, 0);
    ring(.0, .006, .014, std(shade(look.pants, 1.1), .7));
  }
  if (M === 'designer') {
    if (f) { // jumpsuit: halter bodice + gold belt
      bare(.1); ring(.04, .008, .016, gold); add(spine, mesh(new THREE.BoxGeometry(.04, .03, .01), gold), 0, .04, front(.04) + .022);
    } else { // long open coat over a white tee
      const cm = clm(topC, .6), cg = new THREE.CylinderGeometry(rad(.4) + .02, .26, 1.0, 36, 1, true, .26, Math.PI * 2 - .52); cg.scale(1, 1, .6);
      add(spine, mesh(cg, cm), 0, -.12, 0);
      for (const s of [-1, 1]) { const l = add(spine, mesh(new THREE.BoxGeometry(.06, .3, .014), clm(shade(topC, 1.2), .6)), s * .09, .33, front(.33) + .02); l.rotation.z = s * .24; }
      add(spine, mesh(new THREE.TorusGeometry(.082, .018, 8, 20, Math.PI * 1.6), cm), 0, .52, -.01).rotation.set(Math.PI / 2 - .2, 0, -Math.PI * .8 + Math.PI / 2 + Math.PI * .1);
    }
    // chain + pendant (everyone in a designer fit)
    ring(.43, .006, .004, gold); add(spine, mesh(new THREE.SphereGeometry(.014, 10, 8), gold), 0, .33, front(.33) + .016);
  }
  // neck + head
  add(spine, mesh(new THREE.CylinderGeometry(f ? .047 : .062, f ? .054 : .07, .1, 14), skin), 0, .5, 0);
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
  const smile = add(head, mesh(new THREE.TorusGeometry(.02, .0042, 8, 18, Math.PI), lip), 0, .066, .103); smile.rotation.z = Math.PI; smile.scale.set(1.2, .9, 1);
  if (f) add(head, mesh(new THREE.SphereGeometry(.0165, 12, 8), std('#b3394a', .45)), 0, .062, .104).scale.set(1.5, .42, .5); // lipstick
  // ---- accessories on the head ----
  const hat = M === 'agbada' || M === 'uniform', gele = M === 'ankara';
  if (M === 'designer') { // sunglasses
    const gl = metal('#0a0a0a', .15);
    for (const s of [-1, 1]) add(head, mesh(new RoundedBoxGeometry(.052, .036, .012, 2, .008), gl), s * .038, .115, .106);
    add(head, mesh(new THREE.BoxGeometry(.02, .006, .008), gl), 0, .122, .108);
  }
  if (f && ['designer', 'gown', 'ankara', 'dress', 'blazer'].includes(M)) { // earrings
    const big = M === 'designer' || M === 'gown' || M === 'ankara';
    for (const s of [-1, 1]) { if (big) { const h = add(head, mesh(new THREE.TorusGeometry(.024, .0045, 8, 20), gold), s * .11, .07, 0); h.rotation.y = Math.PI / 2; } else add(head, mesh(new THREE.SphereGeometry(.009, 8, 6), gold), s * .109, .085, .004); }
  }
  // ---- hair ----
  const volumed = ['afro', 'puffs', 'locs', 'twists', 'knotless', 'braids', 'long', 'ponytail', 'bun', 'bob'];
  let hair = look.hair as string;
  if (gele) hair = 'bald'; else if (hat && volumed.includes(hair)) hair = 'short';
  const cp = (r: number, t: number, ry = 1.1, mat: THREE.Material = hairM) => { const m = mesh(new THREE.SphereGeometry(r, 32, 22, 0, Math.PI * 2, 0, Math.PI * t), mat); m.scale.set(1, ry, 1); return m; };
  const hairG = add(head, new THREE.Group(), 0, .1, -.004);
  const hg = (rx: number) => { const g = add(hairG, new THREE.Group(), 0, .008, -.008); g.rotation.x = rx; return g; }; // decoration group matching a cap's tilt
  const back = (n: number, r: number, y: number, len: number, rr: number, lo: number, hi: number, zoff = 0) => { for (let i = 0; i < n; i++) { const a = Math.PI * (lo + (hi - lo) * (n === 1 ? .5 : i / (n - 1))); const st = add(hairG, mesh(cap(rr, len), hairM), Math.sin(a) * r, y, Math.cos(a) * r + zoff); st.rotation.x = .06 - Math.cos(a) * .12; } };
  const lightHair = std(shade(look.hairColor, 1.55), .7), fadeSide = std(new THREE.Color(look.hairColor).lerp(new THREE.Color(look.skin), .62).getStyle(), .85);
  const dir = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const place = (g: THREE.Object3D, m: THREE.Mesh, r: number, th: number, ph: number, len: number) => { dir.set(Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph)); m.position.copy(dir).multiplyScalar(r + len * .35); m.position.y *= 1.1; m.quaternion.setFromUnitVectors(up, dir); g.add(m); };
  switch (hair) {
    case 'short': { add(hairG, cp(.12, .62), 0, .008, -.008).rotation.x = -.42; break; }
    case 'afro': { add(hairG, cp(.175, .6, 1.02), 0, .035, -.03).rotation.x = -.52; break; }
    case 'bun': { add(hairG, cp(.12, .62), 0, .008, -.008).rotation.x = -.42; add(hairG, mesh(new THREE.SphereGeometry(.052, 18, 14), hairM), 0, .13, -.06); break; }
    case 'braids': { add(hairG, cp(.122, .64), 0, .008, -.01).rotation.x = -.5; for (let i = 0; i < 9; i++) { const a = -2.6 + i * (5.2 / 8) - Math.PI / 2 + Math.PI; add(hairG, mesh(cap(.012, .2), hairM), Math.sin(a) * .1, -.13, Math.cos(a) * .1 - .01).rotation.x = .08; } break; }
    case 'fade': case 'fadebeard': {
      add(hairG, cp(.114, .52, 1.08, fadeSide), 0, .0, -.006).rotation.x = -.35;
      add(hairG, cp(.121, .36, 1.2), 0, .014, -.012).rotation.x = -.4;
      if (hair === 'fadebeard') {
        const bg = new THREE.SphereGeometry(.077, 28, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); const bm = add(head, mesh(bg, hairM), 0, .045, .035); bm.scale.set(1.2, .95, 1.06);
        add(head, mesh(new THREE.BoxGeometry(.05, .011, .012), hairM), 0, .079, .106);
        for (const s of [-1, 1]) add(head, mesh(cap(.011, .05), hairM), s * .097, .085, .012);
      }
      break; }
    case 'flattop': {
      add(hairG, cp(.114, .52, 1.08, fadeSide), 0, .0, -.006).rotation.x = -.3;
      add(hairG, mesh(new RoundedBoxGeometry(.205, .075, .19, 3, .02), hairM), 0, .105, -.01); break; }
    case 'waves': {
      const c = add(hairG, cp(.118, .6, 1.08), 0, .008, -.008); c.rotation.x = -.38;
      const g = hg(-.38); for (let i = 1; i <= 5; i++) { const th = i * .27, r = .118 * Math.sin(th); const t = add(g, mesh(new THREE.TorusGeometry(r, .0032, 6, 40), lightHair), 0, .118 * 1.08 * Math.cos(th) + .001, 0); t.rotation.x = Math.PI / 2; }
      break; }
    case 'twists': {
      add(hairG, cp(.114, .6, 1.08, std(shade(look.hairColor, .85), .85)), 0, .008, -.008).rotation.x = -.42;
      const g = hg(-.42); for (let i = 0; i < 34; i++) { const th = .12 + (i / 34) * 1.35, ph = i * 2.399; dir.set(Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph)); if (dir.z > .45 && th > .85) continue; place(g, mesh(cap(.0125, .045), hairM), .122, th, ph, .06); }
      break; }
    case 'locs': {
      add(hairG, cp(.123, .64, 1.08), 0, .008, -.01).rotation.x = -.45;
      back(11, .118, -.07, .24, .0145, .3, 1.7); back(8, .136, -.06, .2, .0145, .42, 1.58, -.012);
      for (let i = 0; i < 5; i++) { const x = -.06 + i * .03; add(hairG, mesh(cap(.0135, .07), hairM), x, .075, .105).rotation.x = .5; } // short front locs
      break; }
    case 'cornrows': {
      add(hairG, cp(.114, .62, 1.1, std(shade(look.hairColor, .9), .85)), 0, .008, -.008).rotation.x = -.42;
      const g = hg(-.42), rows = [-.085, -.052, -.018, .018, .052, .085];
      for (const x0 of rows) { const R = .122, rho = Math.sqrt(R * R - x0 * x0), pts: THREE.Vector3[] = []; for (let k = 0; k <= 12; k++) { const al = -1.5 + (k / 12) * 2.45; pts.push(new THREE.Vector3(x0, rho * Math.cos(al) * 1.1, rho * Math.sin(al))); } add(g, mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, .0055, 6, false), lightHair), 0, 0, 0); }
      break; }
    case 'bob': {
      add(hairG, cp(.124, .64), 0, .008, -.01).rotation.x = -.5;
      const bg = new THREE.CylinderGeometry(.131, .138, .15, 30, 1, true, Math.PI * .4, Math.PI * 1.2); add(hairG, mesh(bg, clm(look.hairColor, .8)), 0, -.045, -.004);
      for (const s of [-1, 1]) add(hairG, mesh(cap(.02, .1), hairM), s * .1, .0, .045).rotation.z = s * .1; // face-framing pieces
      break; }
    case 'long': {
      add(hairG, cp(.124, .64), 0, .008, -.01).rotation.x = -.5;
      const lg = new THREE.CylinderGeometry(.131, .11, .5, 30, 1, true, Math.PI * .48, Math.PI * 1.04); add(hairG, mesh(lg, clm(look.hairColor, .75)), 0, -.2, -.004);
      for (const s of [-1, 1]) add(hairG, mesh(cap(.02, .22), hairM), s * .108, -.06, .03).rotation.z = s * .05; // front pieces over the shoulders
      break; }
    case 'ponytail': {
      add(hairG, cp(.118, .62), 0, .008, -.008).rotation.x = -.6;
      add(hairG, mesh(new THREE.SphereGeometry(.024, 12, 10), std(look.pants, .5)), 0, .075, -.125);
      add(hairG, mesh(cap(.036, .24), hairM), 0, -.04, -.19).rotation.x = 3.58; add(hairG, mesh(new THREE.SphereGeometry(.03, 12, 10), hairM), 0, -.165, -.235);
      break; }
    case 'puffs': {
      add(hairG, cp(.116, .6), 0, .008, -.008).rotation.x = -.5;
      for (const s of [-1, 1]) { add(hairG, mesh(new THREE.SphereGeometry(.082, 20, 16), hairM), s * .095, .12, -.03); add(hairG, mesh(new THREE.SphereGeometry(.05, 14, 10), hairM), s * .12, .17, -.015); }
      break; }
    case 'knotless': {
      add(hairG, cp(.123, .64), 0, .008, -.01).rotation.x = -.5;
      back(12, .124, -.2, .38, .0135, .5, 1.5, -.02); back(10, .142, -.19, .34, .0135, .56, 1.44, -.04);
      for (const s of [-1, 1]) add(hairG, mesh(cap(.0125, .3), hairM), s * .112, -.14, .045).rotation.z = s * .03;
      break; }
    case 'pixie': {
      add(hairG, cp(.115, .62), 0, .008, -.008).rotation.x = -.38;
      const fr = add(hairG, mesh(new RoundedBoxGeometry(.13, .02, .06, 2, .008), hairM), -.02, .075, .095); fr.rotation.set(.5, 0, .22);
      break; }
    default: break; // bald
  }
  if (M === 'agbada') { // fila cap
    const fc = add(hairG, mesh(new THREE.CylinderGeometry(.112, .126, .1, 28), clm(topC, .7)), 0, .1, .0); fc.rotation.z = .16;
    const tm = add(hairG, mesh(new THREE.TorusGeometry(.125, .008, 6, 28), gold), 0, .055, .0); tm.rotation.x = Math.PI / 2; tm.rotation.y = .16;
  }
  if (M === 'uniform') { // peaked police cap
    const pc = add(hairG, mesh(new THREE.CylinderGeometry(.12, .13, .075, 28), std('#0b0b0b', .6)), 0, .1, 0);
    add(hairG, mesh(new THREE.CylinderGeometry(.131, .131, .02, 28), std(look.outfit, .6)), 0, .068, 0); void pc;
    add(hairG, mesh(new RoundedBoxGeometry(.2, .012, .09, 2, .005), std('#050505', .35)), 0, .062, .13);
    add(hairG, mesh(new THREE.CircleGeometry(.018, 5), gold), 0, .1, .131);
  }
  if (gele) { // headwrap
    const gc = std(shade(topC, 1.08), .6), gd = std(shade(topC, .75), .7);
    add(hairG, mesh(new THREE.SphereGeometry(.14, 24, 16), gc), 0, .075, -.005).scale.set(1.12, .78, 1.1);
    const f1 = add(hairG, mesh(new THREE.SphereGeometry(.1, 20, 14), gc), .05, .17, -.01); f1.scale.set(1.5, .55, 1.0); f1.rotation.z = .4;
    const f2 = add(hairG, mesh(new THREE.SphereGeometry(.09, 20, 14), gd), -.06, .21, .0); f2.scale.set(1.4, .5, .9); f2.rotation.z = -.5;
    const f3 = add(hairG, mesh(new THREE.SphereGeometry(.075, 16, 12), gc), .1, .22, -.03); f3.scale.set(1.2, .5, .8); f3.rotation.z = .9;
    const bd = add(hairG, mesh(new THREE.TorusGeometry(.128, .013, 8, 30), gd), 0, .035, -.004); bd.rotation.x = Math.PI / 2 - .12;
  }
  // legs (thigh pivot at hip joint)
  const legSkin = sp.leg === 'skirt' || sp.leg === 'shorts' || sp.leg === 'gown';
  const sockM = std(M === 'jersey' ? '#f4f4f4' : '#f4f4f4', .8), tR = f ? .077 : .083, kR = f ? .052 : .062;
  const mkLeg = (s: number) => {
    const up = add(hips, new THREE.Group(), s * hw, -.02, 0);
    if (sp.leg === 'long' || sp.leg === 'bag' || sp.leg === 'wide' || sp.leg === 'shorts') add(up, mesh(cap(tR + (sp.leg === 'wide' ? .012 : sp.leg === 'bag' ? .01 : 0), .33), pants), 0, -.215, 0);
    const kn = add(up, new THREE.Group(), 0, -.43, 0);
    if (sp.leg !== 'gown') {
      add(kn, mesh(new THREE.SphereGeometry(f ? .06 : .068, 14, 10), legSkin ? skin : pants));
      if (sp.leg === 'wide') add(kn, mesh(new THREE.CylinderGeometry(kR + .012, kR + .042, .4, 18), pants), 0, -.2, 0);
      else add(kn, mesh(cap(sp.leg === 'bag' ? kR + .012 : kR, .31), legSkin ? skin : pants), 0, -.2, 0);
      if (sp.leg === 'shorts') add(kn, mesh(new THREE.CylinderGeometry(kR + .004, kR + .002, .22, 14), sockM), 0, -.27, 0);
      if (sp.leg === 'bag') add(kn, mesh(new THREE.TorusGeometry(kR + .004, .011, 8, 16), std(shade(botC, .72), .9)), 0, -.355, 0).rotation.x = Math.PI / 2;
      if (sp.shoe === 'boot') add(kn, mesh(new THREE.CylinderGeometry(kR + .008, kR + .01, .17, 16), shoe), 0, -.32, 0);
    }
    const ft = add(kn, new THREE.Group(), 0, -.41, 0);
    if (sp.shoe === 'sneaker') {
      add(ft, mesh(new RoundedBoxGeometry(f ? .088 : .105, .075, f ? .25 : .275, 3, .03), shoe), 0, -.005, .05);
      add(ft, mesh(new RoundedBoxGeometry(f ? .092 : .109, .022, f ? .255 : .28, 2, .01), sole), 0, -.04, .05);
    } else if (sp.shoe === 'dress' || sp.shoe === 'boot') {
      add(ft, mesh(new RoundedBoxGeometry(f ? .088 : .1, .062, f ? .26 : .29, 3, .026), shoe), 0, -.006, .06);
      add(ft, mesh(new RoundedBoxGeometry(f ? .09 : .102, .016, f ? .262 : .292, 2, .007), sole), 0, -.04, .06);
    } else if (sp.shoe === 'heel') {
      add(ft, mesh(new RoundedBoxGeometry(.074, .05, .27, 3, .022), shoe), 0, -.01, .07).scale.set(1, 1, 1);
      add(ft, mesh(new THREE.BoxGeometry(.07, .01, .26), std('#b3394a', .5)), 0, -.038, .07);
      add(ft, mesh(new THREE.BoxGeometry(.06, .04, .012), shoe), 0, .02, -.03);
    } else { // sandal
      add(ft, mesh(new RoundedBoxGeometry(f ? .09 : .104, .02, f ? .26 : .285, 2, .008), shoe), 0, -.036, .05);
      for (const z of [.0, .09]) add(ft, mesh(new THREE.BoxGeometry(f ? .084 : .098, .018, .03), shoe), 0, -.012, z);
    }
    return { up, kn, ft };
  };
  const L = mkLeg(1), R = mkLeg(-1);
  // arms (shoulder pivot at top of chest)
  const sx = f ? .19 : .285;
  const sleeveM = M === 'bomber' || M === 'hoodie' ? shirt : M === 'suit' || M === 'blazer' ? clm(topC, .65) : M === 'agbada' ? clm(topC, .7) : M === 'designer' && !f ? clm(topC, .6) : shirt;
  const cuffM = M === 'suit' || M === 'blazer' || M === 'designer' ? std('#f5f5f5', .6) : M === 'bomber' || M === 'hoodie' ? std(topShade, .9) : null;
  const mkArm = (s: number) => {
    const sh = add(spine, new THREE.Group(), s * sx, .44, 0);
    const rA = f ? .045 : .066, rB = f ? .05 : .072;
    add(sh, mesh(new THREE.SphereGeometry(f ? .048 : .07, 16, 12), sp.slv === 'none' ? skin : shirt), 0, 0, 0);
    add(sh, mesh(cap(f ? .038 : .056, .18), skin), 0, -.15, 0);
    const el = add(sh, new THREE.Group(), 0, -.29, 0);
    if (sp.slv === 'short') add(sh, mesh(new THREE.CylinderGeometry(rA, rB, .14, 18), sleeveM), 0, -.1, 0);
    if (sp.slv === 'cap') add(sh, mesh(new THREE.CylinderGeometry(rA, rB, .075, 18), sleeveM), 0, -.06, 0);
    if (sp.slv === 'long' || sp.slv === 'bell') {
      add(sh, mesh(new THREE.CylinderGeometry(rA, rB, .3, 18), sleeveM), 0, -.15, 0);
      if (sp.slv === 'long') { add(el, mesh(new THREE.CylinderGeometry(f ? .046 : .062, f ? .04 : .054, .27, 18), sleeveM), 0, -.14, 0); if (cuffM) add(el, mesh(new THREE.CylinderGeometry(f ? .042 : .056, f ? .042 : .056, .022, 18), cuffM), 0, -.27, 0); }
      else add(el, mesh(new THREE.CylinderGeometry(.046, .125, .28, 22, 1, true), clm(topC, .65)), 0, -.15, 0);
    }
    if (sp.slv === 'wide') add(sh, mesh(new THREE.CylinderGeometry(rA + .012, .2, .5, 26, 1, true), sleeveM), 0, -.27, 0);
    add(el, mesh(new THREE.SphereGeometry(f ? .037 : .05, 12, 10), skin));
    add(el, mesh(cap(f ? .034 : .048, .21), skin), 0, -.155, 0);
    const hand = add(el, mesh(new THREE.SphereGeometry(.05, 14, 12), skin), 0, -.32, .005); hand.scale.set(f ? .72 : .92, f ? 1.05 : 1.2, f ? .55 : .65);
    add(el, mesh(new THREE.SphereGeometry(.016, 8, 8), skin), s * -.035, -.3, .03);
    if (M === 'designer' || (M === 'gown' && f) || M === 'ankara') add(el, mesh(new THREE.TorusGeometry(f ? .036 : .05, .005, 6, 18), gold), 0, -.27, 0).rotation.x = Math.PI / 2; // bracelet
    if (M === 'designer' && !f && s === 1) add(el, mesh(new THREE.CylinderGeometry(.052, .052, .03, 16), metal('#c9ced1')), 0, -.285, 0); // watch
    return { sh, el };
  };
  const A = mkArm(1), B = mkArm(-1);
  root.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).receiveShadow = false; });
  const cur = Object.fromEntries(KEYS.map(k => [k, 0])) as J;
  const skAmt = M === 'gown' ? .3 : M === 'ankara' ? .38 : .48;
  return { root, hips, spine, head, chest, eyes, la: A.sh, ra: B.sh, le: A.el, re: B.el, ll: L.up, rl: R.up, lk: L.kn, rk: R.kn, lf: L.ft, rf: R.ft, cur, ph: 0, clip: null, sk, skAmt };
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
  if (k === 'punch') { const s = sin(t * 21), a = mx(0, s), b = mx(0, -s); j.sX = .12; j.sY = .28 * s; j.hX = .05; j.raX = .5 + 1.0 * a; j.reX = 1.7 - 1.6 * a; j.raZ = -.05; j.laX = .5 + 1.0 * b; j.leX = 1.7 - 1.6 * b; j.laZ = .05; j.llX = .25; j.rlX = -.25; j.lkX = .3; j.rkX = .3; }
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
  if (rig.sk.length) for (let i = 0; i < rig.sk.length; i++) rig.sk[i].rotation.x = -(i % 2 === 0 ? c.llX : c.rlX) * rig.skAmt;
  rig.lf.rotation.set(-(-c.llX + c.lkX) * .8, 0, 0); rig.rf.rotation.set(-(-c.rlX + c.rkX) * .8, 0, 0);
  // breathing + blinking (eyes closed while asleep)
  rig.chest.scale.set(1 + .012 * sin(t * 1.9), 1 + .018 * sin(t * 1.9), 1 + .02 * sin(t * 1.9));
  const blink = state === 'sleep' || (t % 4.2) < .13; rig.eyes.scale.y = lerp(rig.eyes.scale.y, blink ? .08 : 1, 1 - Math.exp(-dt * 40));
}
