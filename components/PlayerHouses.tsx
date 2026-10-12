'use client';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { HOUSES, HOUSE_D, HOUSE_W, FRONT, PAD_START, PAD_W, floorsFor, loadHouses, type HouseInfo } from '../lib/houses';
import { DESIGNS, DOORS, ROOFS, TRIMS, WALLS, type Style } from '../lib/houseStyle';
import { GAME, NIGHT } from './cityShared';
import { NO_SEC, hasGuards, secLine, type GuardId } from '../lib/security';
import { BL, SOLIDS } from './CityCollision';

/* Every player's house, standing on the street (see lib/houses.ts for where, lib/houseStyle.ts for the looks: 4 designs, colours and 6 extras).
   Drawn as a handful of instanced meshes (one per kind of part: boxes, hip roofs, gables, columns, spheres, windows, glass, glow), so ~100 houses cost ~10 draw calls on a phone.
   Only the nearest few get a name sign (real text), and your own house gets a gold beacon you can see from far away. */
type Item = { m: THREE.Matrix4; c?: THREE.Color };
const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _p = new THREE.Vector3(), _s = new THREE.Vector3();
/** One part placed in a house's own frame (local +z = the front, facing the road; ly = the part's centre height, or its base for gables). */
function mk(h: HouseInfo, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, col?: string): Item {
  const c = Math.cos(h.rot), s = Math.sin(h.rot);
  _q.setFromAxisAngle(_up, h.rot); _p.set(h.x + lx * c + lz * s, ly, h.z - lx * s + lz * c); _s.set(sx, sy, sz);
  return { m: new THREE.Matrix4().compose(_p, _q, _s), c: col ? new THREE.Color(col) : undefined };
}

type Buckets = { S: Item[]; R: Item[]; P: Item[]; C: Item[]; B: Item[]; LG: Item[]; GW: Item[]; W: Item[]; GL: Item[] };
const STONE = '#d9d4c8', PAD = '#a8a59d', DRIVE = '#7b7974', IRON = '#1c1c20', GREEN = '#2f6b3a';

export function layout(list: HouseInfo[]): Buckets {
  const K: Buckets = { S: [], R: [], P: [], C: [], B: [], LG: [], GW: [], W: [], GL: [] };
  const hx = HOUSE_W / 2, fz = HOUSE_D / 2, SQ = Math.SQRT2;
  for (const h of list) {
    const st = h.style, des = DESIGNS[st.d]?.key ?? 'classic', ex = (b: number) => (st.x & b) !== 0, F = h.floors;
    const wall = WALLS[st.w] ?? WALLS[0], roof = ROOFS[st.r] ?? ROOFS[0], trim = TRIMS[st.t] ?? TRIMS[0], door = DOORS[st.k] ?? DOORS[0];
    const S = (x: number, y: number, z: number, w: number, hh: number, d: number, c: string) => K.S.push(mk(h, x, y, z, w, hh, d, c));
    const hip = (y: number, a: number, b: number, rh: number, c: string) => K.R.push(mk(h, 0, y + rh / 2, 0, a * SQ, rh, b * SQ, c));
    const gable = (x: number, y: number, z: number, w: number, hh: number, d: number, c: string) => K.P.push(mk(h, x, y, z, w, hh, d, c));
    const col = (x: number, z: number, hh: number, r: number, c: string) => K.C.push(mk(h, x, hh / 2, z, r * 2, hh, r * 2, c));
    const win = (x: number, y: number, z: number, w: number, hh: number) => K.W.push(mk(h, x, y, z, w, hh, .06));
    const sideWin = (x: number, y: number, hh: number, d: number) => K.W.push(mk(h, x, y, 0, .06, hh, d));   // a window in a side wall (thin in x, long in z)
    const H = des === 'classic' ? (F === 2 ? 5.8 : 3) : des === 'modern' ? 5.8 : des === 'villa' ? 3.4 : 6.4;
    const pad = des === 'mansion' ? 4.4 : 2.2, padD = des === 'mansion' ? 2 : 1.5;

    /* ground: porch pad + driveway */
    S(0, des === 'mansion' ? .04 : .03, fz + padD / 2, pad, des === 'mansion' ? .08 : .06, padD, des === 'mansion' ? STONE : PAD);
    {
      const wide = h.pad > 4, ps = wide ? PAD_START : 0;
      S(h.lat, .035, fz + (ps + FRONT) / 2, h.pad, .05, FRONT - ps, DRIVE);                  // the parking pad (wide = two bays)
      if (wide) {
        S(0, .03, fz + (1.5 + ps) / 2, 1.6, .05, ps - 1.5 + .1, PAD);                         // path from the porch to the pad
        const zc = fz + (ps + FRONT) / 2, dd = FRONT - ps - .5;
        for (const bx of [-h.pad / 2 + .12, 0, h.pad / 2 - .12]) S(h.lat + bx, .062, zc, .1, .012, dd, '#e8e8e0');   // bay lines
        S(h.lat, .062, fz + ps + .3, h.pad - .2, .012, .1, '#e8e8e0');
      }
    }

    /* body */
    let frontZ = fz + .02;   // the z of the front face windows sit on
    if (des === 'modern') {
      S(0, 1.5, 0, HOUSE_W, 3, HOUSE_D, wall);
      S(0, 4.45, .45, HOUSE_W + .5, 2.9, HOUSE_D + .9, roof);       // the upper floor floats out over the entrance
      S(0, H + .15, .45, HOUSE_W + 1, .3, HOUSE_D + 1.4, trim);      // flat roof slab
      S(-hx + .1, 1.5, fz + .05, 1.4, 3, .1, roof);                  // accent wall
      frontZ = fz + .95;
    } else {
      S(0, H / 2, 0, HOUSE_W, H, HOUSE_D, wall);
      if (des === 'classic') hip(H, hx * 1.2, fz * 1.2, F === 2 ? 2.1 : 1.7, roof);
      else if (des === 'villa') hip(H, hx * 1.38, fz * 1.38, 1.9, roof);
      else hip(H + .12, hx * 1.1, fz * 1.1, 1.5, roof);
    }
    if (des !== 'modern') S(0, .2, 0, HOUSE_W + .15, .4, HOUSE_D + .15, trim);   // plinth
    if (des === 'mansion' || des === 'villa') S(0, H - .12, 0, HOUSE_W + .5, .24, HOUSE_D + .5, trim);   // cornice
    if (des === 'mansion') {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) S(sx * hx, H / 2, sz * fz, .42, H, .42, trim);   // corner pilasters
      S(0, 2.95, 0, HOUSE_W + .25, .16, HOUSE_D + .25, trim);                                              // string course
      for (const sx of [-1, 1]) S(sx * 1.8, H + 1.35, -1.8, .6, 1.5, .6, '#9a8b7a');                       // chimneys
    }

    /* front door */
    const dw = des === 'mansion' ? 1.6 : des === 'modern' ? 1.2 : 1.1, dh = des === 'mansion' ? 2.4 : des === 'modern' ? 2.6 : 2.1;
    S(0, dh / 2, fz + .04, dw, dh, .1, door);
    S(0, dh / 2 + .12, fz + .02, dw + .4, dh + .25, .08, trim);                                              // door frame
    if (des === 'mansion') S(0, dh / 2, fz + .1, .04, dh, .04, trim);                                        // double-door line

    /* windows */
    for (let f = 0; f < F; f++) {
      const y = f * 2.9 + 1.7;
      if (des === 'modern') {
        if (f === 0) { for (const x of [-1.75, 1.75]) win(x, 1.5, fz + .02, 1.9, 2.1); }
        else win(0, 4.5, frontZ, 5.4, 1.5);
        for (const sd of [-1, 1]) sideWin(sd * (hx + .03 + (f ? .25 : 0)), y, 1.3, 3.2);
        continue;
      }
      const xs = des === 'mansion' ? (f === 0 ? [-2.1, 2.1] : [-2.1, 0, 2.1]) : f === 0 ? [-1.9, 1.9] : [-1.9, 0, 1.9];
      for (const x of xs) {
        win(x, y, fz + .02, des === 'mansion' ? 1 : 1.1, 1.2);
        S(x, y - .72, fz + .06, 1.4, .1, .16, trim);                                                         // sill
        if (des === 'mansion') S(x, y, fz + .005, 1.35, 1.55, .05, trim);                                    // frame
        if (des === 'villa') for (const sd of [-1, 1]) S(x + sd * .78, y, fz + .05, .25, 1.25, .08, trim);   // shutters
      }
      for (const sd of [-1, 1]) sideWin(sd * (hx + .02), y, 1.2, 1.1);
    }

    /* the villa's own gabled porch */
    if (des === 'villa') {
      gable(0, 2.95, fz + .95, 3.4, 1.05, 1.9, roof);
      for (const sd of [-1, 1]) col(sd * 1.45, fz + 1.7, 2.95, .1, trim);
      if (ex(2)) for (const sd of [-1, 1]) col(sd * 2.7, fz + .95, 3.2, .26, trim);                          // grand columns flank the porch
    } else if (ex(2)) {
      /* grand columns + pediment: tall (to the roof) on a mansion, porch height otherwise */
      const top = des === 'mansion' ? 5.9 : F === 2 ? 3.1 : 2.9, r = des === 'mansion' ? .3 : .22, cz = fz + 1.45;
      for (const sd of [-1, 1]) col(sd * 1.5, cz, top, r, trim);
      S(0, top + .12, fz + .9, 4.0, .25, 1.9, trim);                                                          // entablature
      gable(0, top + .24, fz + 1.7, 4.2, des === 'mansion' ? 1.2 : .9, .4, trim);                             // pediment
    }

    /* balcony above the entrance (two-storey houses), a flat canopy on one-storey ones */
    if (ex(4)) {
      if (F === 2) {
        S(0, 3.05, fz + .8, 3.9, .18, 1.9, trim);
        K.GL.push(mk(h, 0, 3.65, fz + 1.74, 3.9, .95, .04)); for (const sd of [-1, 1]) K.GL.push(mk(h, sd * 1.93, 3.65, fz + .8, .04, .95, 1.9));
        S(0, 4.15, fz + 1.74, 3.96, .07, .07, trim); for (const sd of [-1, 1]) S(sd * 1.93, 4.15, fz + .8, .07, .07, 1.9, trim);
      } else S(0, 2.95, fz + .8, 3.6, .14, 1.7, trim);
    }

    /* mansion lamp posts at the steps */
    if (des === 'mansion') for (const sd of [-1, 1]) { col(sd * 2.45, fz + 2.1, 1.4, .05, IRON); K.LG.push(mk(h, sd * 2.45, 1.5, fz + 2.1, .34, .34, .34)); }

    /* garden: hedges + flower beds along the front */
    if (ex(16)) {
      const hz = fz + (des === 'mansion' ? 2.5 : .5);
      for (const sd of [-1, 1]) { S(sd * (des === 'mansion' ? 3.1 : 1.85), .32, hz, 1.5, .64, .6, GREEN); for (const k of [-1, 1]) S(sd * (des === 'mansion' ? 3.1 : 1.85) + k * .4, .7, hz, .25, .14, .3, k > 0 ? '#e0568a' : '#ffd23f'); }
    }
    /* palms: one each side of the front yard, never on the driveway */
    if (ex(8)) for (const px of [-3.3, 3.3]) if (Math.abs(px - h.lat) > h.pad / 2 + .7) {
      col(px, fz + 2.8, 3.4, .13, '#7a5a3a');
      K.B.push(mk(h, px, 3.6, fz + 2.8, 2.4, .7, 2.4, '#2f8a45')); K.B.push(mk(h, px + .2, 3.95, fz + 2.9, 1.5, .5, 1.5, '#3aa655'));
    }
    /* gate and boundary wall: the driveway stays open (the gate leaves are swung back) so cars still get in */
    if (ex(1) && h.row === 0) {   // (the rows behind have only a lane in front, no room for a gate wall)
      const wz = fz + FRONT - .5, gh = h.pad / 2 + .35, lo = h.lat - gh, hi = h.lat + gh;
      if (lo > -3.9 + .3) { S((-3.9 + lo) / 2, .45, wz, lo + 3.9, .9, .22, wall); S((-3.9 + lo) / 2, .93, wz, lo + 3.9, .08, .3, trim); }
      if (hi < 3.9 - .3) { S((hi + 3.9) / 2, .45, wz, 3.9 - hi, .9, .22, wall); S((hi + 3.9) / 2, .93, wz, 3.9 - hi, .08, .3, trim); }
      for (const sd of [-1, 1]) {
        S(h.lat + sd * (h.pad / 2 + .25), .8, wz, .5, 1.6, .5, wall); S(h.lat + sd * (h.pad / 2 + .25), 1.63, wz, .62, .1, .62, trim); K.LG.push(mk(h, h.lat + sd * (h.pad / 2 + .25), 1.85, wz, .3, .3, .3));
        S(h.lat + sd * (h.pad / 2 - .15), .62, wz - .8, .05, 1.1, 1.4, IRON);                                              // open gate leaf
        S(sd * 3.9, .42, fz + (wz - fz) / 2, .16, .84, wz - fz, wall);                                          // side walls
      }
    }
    /* night glow strips under the roof */
    if (ex(32)) {
      const gy = H - (des === 'modern' ? .3 : .34), gz = des === 'modern' ? fz + .96 : fz + .26, gw = des === 'modern' ? HOUSE_W + .5 : HOUSE_W + .3;
      K.GW.push(mk(h, 0, gy, gz, gw, .07, .07));
      for (const sd of [-1, 1]) K.GW.push(mk(h, sd * (gw / 2 + .02), gy, des === 'modern' ? .45 : 0, .07, .07, HOUSE_D + (des === 'modern' ? .8 : .3)));
    }
  }
  return K;
}

function Inst({ items, geo, color = '#ffffff', shadow = false, children }: { items: Item[]; geo: React.ReactNode; color?: string; shadow?: boolean; children?: React.ReactNode }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  useLayoutEffect(() => {
    const im = ref.current; if (!im) return;
    items.forEach((it, i) => { im.setMatrixAt(i, it.m); if (it.c) im.setColorAt(i, it.c); });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }, [items]);
  if (!items.length) return null;
  return <instancedMesh ref={ref} args={[undefined, undefined, items.length]} frustumCulled={false} castShadow={shadow} receiveShadow>
    {geo}{children ?? <meshStandardMaterial color={color} roughness={.9} />}
  </instancedMesh>;
}

/** All the parts of the given houses. Used by the city (every house) and by the customiser preview (one house). */
export function HouseMeshes({ list, ver = 0, forceNight }: { list: HouseInfo[]; ver?: number; forceNight?: number }) {
  const L = useMemo(() => layout(list), [list, ver]);   // eslint-disable-line react-hooks/exhaustive-deps
  const hipGeo = useMemo(() => { const g = new THREE.ConeGeometry(1, 1, 4, 1); g.rotateY(Math.PI / 4); return g; }, []);
  const prismGeo = useMemo(() => { const sh = new THREE.Shape(); sh.moveTo(-.5, 0); sh.lineTo(.5, 0); sh.lineTo(0, 1); sh.closePath(); const g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false }); g.translate(0, 0, -.5); return g; }, []);
  const win = useRef<THREE.MeshStandardMaterial>(null!), glow = useRef<THREE.MeshStandardMaterial>(null!), lamp = useRef<THREE.MeshStandardMaterial>(null!);
  useFrame(() => {
    const n = forceNight ?? NIGHT.n;
    if (win.current) win.current.emissiveIntensity = .04 + n * 1.7;
    if (glow.current) glow.current.emissiveIntensity = .25 + n * 2.4;
    if (lamp.current) lamp.current.emissiveIntensity = .1 + n * 2.2;
  });
  const box = <boxGeometry args={[1, 1, 1]} />, ball = <sphereGeometry args={[.5, 10, 8]} />;
  return <>
    <Inst key={'s' + ver + list.length} items={L.S} geo={box} shadow />
    <Inst key={'r' + ver + list.length} items={L.R} geo={<primitive object={hipGeo} attach="geometry" />} shadow />
    <Inst key={'p' + ver + list.length} items={L.P} geo={<primitive object={prismGeo} attach="geometry" />} shadow />
    <Inst key={'c' + ver + list.length} items={L.C} geo={<cylinderGeometry args={[.5, .5, 1, 12]} />} shadow />
    <Inst key={'b' + ver + list.length} items={L.B} geo={ball} />
    <Inst key={'l' + ver + list.length} items={L.LG} geo={ball}><meshStandardMaterial ref={lamp} color="#fff6d8" emissive="#ffd98a" emissiveIntensity={.1} roughness={.4} /></Inst>
    <Inst key={'g' + ver + list.length} items={L.GW} geo={box}><meshStandardMaterial ref={glow} color="#fff3c4" emissive="#ffd98a" emissiveIntensity={.25} roughness={.4} /></Inst>
    <Inst key={'w' + ver + list.length} items={L.W} geo={box}><meshStandardMaterial ref={win} color="#27384a" emissive="#ffcf6b" emissiveIntensity={.04} roughness={.3} metalness={.2} /></Inst>
    <Inst key={'q' + ver + list.length} items={L.GL} geo={box}><meshStandardMaterial color="#9fd3e6" transparent opacity={.35} roughness={.1} metalness={.3} depthWrite={false} /></Inst>
  </>;
}

/** A free-standing house at the origin (front towards +z) for the customiser's preview. */
export function previewHouse(style: Style, u: string, nepo: boolean): HouseInfo {
  return { slot: -1, row: 0, x: 0, z: 0, rot: 0, nx: 0, nz: 1, lat: 0, pad: PAD_W, bay: -PAD_W / 4, door: { x: 0, z: HOUSE_D / 2 }, exit: { x: 0, z: HOUSE_D / 2 + .8, r: 0 }, car: { x: -PAD_W / 4, z: HOUSE_D / 2 + FRONT - 2.3, r: 0 }, solid: { x0: -HOUSE_W / 2, x1: HOUSE_W / 2, z0: -HOUSE_D / 2, z1: HOUSE_D / 2 },
    u, mine: true, nepo, style, wall: WALLS[style.w] ?? WALLS[0], roof: ROOFS[style.r] ?? ROOFS[0], floors: floorsFor(style, u), sec: NO_SEC };
}

function Beacon({ h }: { h: HouseInfo }) {
  const col = useRef<THREE.Mesh>(null!), ring = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    (col.current.material as THREE.MeshBasicMaterial).opacity = .13 + Math.sin(t * 2) * .05;
    ring.current.scale.setScalar(1 + Math.sin(t * 3) * .12);
  });
  return <group>
    <mesh ref={col} position={[h.x, 30, h.z]}><cylinderGeometry args={[.5, .5, 60, 12, 1, true]} /><meshBasicMaterial color="#ffd23f" transparent opacity={.15} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} /></mesh>
    <mesh ref={ring} position={[h.exit.x, .1, h.exit.z]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.9, 1.15, 28]} /><meshBasicMaterial color="#ffd23f" transparent opacity={.85} depthWrite={false} toneMapped={false} /></mesh>
  </group>;
}

/** Name signs for the houses near you (real 3D text is heavy, so only the closest few). */
function Signs() {
  const [ids, setIds] = useState<number[]>([]), t = useRef(0);
  useFrame((_, dt) => {
    t.current += dt; if (t.current < .4) return; t.current = 0;
    const p = GAME.player;
    const near = HOUSES.list.map(h => ({ h, d: Math.hypot(h.x - p.x, h.z - p.z) })).filter(e => e.d < 50 || (e.h.mine && e.d < 130)).sort((a, b) => a.d - b.d).slice(0, 7).map(e => e.h.slot);
    setIds(prev => (prev.length === near.length && prev.every((v, i) => v === near[i]) ? prev : near));
  });
  return <>{ids.map(id => {
    const h = HOUSES.list.find(x => x.slot === id); if (!h) return null;
    return <group key={id} position={[h.x, 0, h.z]} rotation-y={h.rot}>
      <Text position={[0, h.style.d === 3 ? 3.5 : 2.7, HOUSE_D / 2 + (h.style.d === 1 ? 1 : .06)]} fontSize={h.mine ? .34 : .3} maxWidth={HOUSE_W - .4} color={h.mine ? '#ffe28a' : h.nepo ? '#ffd9a0' : '#ffffff'} outlineWidth={.035} outlineColor="#000000" anchorX="center" anchorY="middle" textAlign="center">{h.mine ? (HOUSES.shared ? `${h.u}'s house · YOUR HOME` : `${h.u} · YOUR HOUSE`) : `${h.u}'s house${HOUSES.open.has(h.slot) ? ' · 🔓 open' : ''}`}</Text>
      {hasGuards(h.sec) && <Text position={[0, (h.style.d === 3 ? 3.5 : 2.7) - .42, HOUSE_D / 2 + (h.style.d === 1 ? 1 : .06)]} fontSize={.27} color="#ffd9a0" outlineWidth={.035} outlineColor="#000000" anchorX="center" anchorY="middle">{secLine(h.sec)}</Text>}
    </group>;
  })}</>;
}

/* Guards and dogs on patrol (lib/security.ts). Only the nearest few watched houses get actors, so a phone stays smooth.
   Dogs circle the house, guards pace the front yard, an armed guard stands at the door. All motion is a pure function of time (no state per actor). */
const SKIN = '#c68642';
function Actor({ h, kind, i }: { h: HouseInfo; kind: GuardId; i: number }) {
  const g = useRef<THREE.Group>(null!), body = useRef<THREE.Group>(null!), ph = useMemo(() => i * 2.7 + (h.slot % 7) * .9, [i, h.slot]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime, o = g.current, b = body.current; if (!o || !b) return;
    if (kind === 'dog') {   // circles the whole house
      const rx = HOUSE_W / 2 + 1.5, rz = HOUSE_D / 2 + 1.5, a = t * 1.5 / 4.6 + ph, dx = -Math.sin(a) * rx, dz = Math.cos(a) * rz;
      o.position.set(Math.cos(a) * rx, 0, Math.sin(a) * rz); o.rotation.y = Math.atan2(dx, dz); b.position.y = Math.abs(Math.sin(t * 9 + ph)) * .035;
    } else if (kind === 'guard') {   // paces the front yard
      const amp = HOUSE_W / 2 + 1, a = t * .7 / amp + ph;
      o.position.set(amp * Math.sin(a), 0, HOUSE_D / 2 + 1.9); o.rotation.y = Math.cos(a) >= 0 ? Math.PI / 2 : -Math.PI / 2; b.position.y = Math.abs(Math.sin(t * 4 + ph)) * .02;
    } else { o.position.set(1.5, 0, HOUSE_D / 2 + 1.1); o.rotation.y = Math.sin(t * .35 + ph) * .7; b.position.y = 0; }   // armed: stands watch by the door, scanning the street
  });
  return <group position={[h.x, 0, h.z]} rotation-y={h.rot}><group ref={g}><group ref={body}>
    {kind === 'dog' ? <>
      <mesh position={[0, .34, 0]}><boxGeometry args={[.26, .24, .6]} /><meshStandardMaterial color="#2a1c14" roughness={.9} /></mesh>
      <mesh position={[0, .46, .36]}><boxGeometry args={[.19, .19, .24]} /><meshStandardMaterial color="#2a1c14" roughness={.9} /></mesh>
      <mesh position={[0, .43, .49]}><boxGeometry args={[.1, .08, .08]} /><meshStandardMaterial color="#b9732f" roughness={.9} /></mesh>
      <mesh position={[0, .13, .17]}><boxGeometry args={[.22, .26, .1]} /><meshStandardMaterial color="#b9732f" roughness={.9} /></mesh>
      <mesh position={[0, .13, -.2]}><boxGeometry args={[.22, .26, .1]} /><meshStandardMaterial color="#b9732f" roughness={.9} /></mesh>
      <mesh position={[0, .42, -.34]} rotation={[.6, 0, 0]}><boxGeometry args={[.06, .06, .2]} /><meshStandardMaterial color="#2a1c14" roughness={.9} /></mesh>
    </> : <>
      <mesh position={[0, .26, 0]}><boxGeometry args={[.32, .52, .2]} /><meshStandardMaterial color="#1b1b22" roughness={.8} /></mesh>
      <mesh position={[0, .8, 0]}><boxGeometry args={[.44, .56, .26]} /><meshStandardMaterial color={kind === 'armed' ? '#0f172a' : '#2a4d8f'} roughness={.8} /></mesh>
      <mesh position={[0, 1.2, 0]}><sphereGeometry args={[.14, 10, 8]} /><meshStandardMaterial color={SKIN} roughness={.8} /></mesh>
      <mesh position={[0, 1.31, .02]}><boxGeometry args={[.3, .08, .3]} /><meshStandardMaterial color={kind === 'armed' ? '#0b0b0f' : '#1f3a6e'} roughness={.8} /></mesh>
      <mesh position={[0, .9, .14]}><boxGeometry args={[.5, .06, .02]} /><meshStandardMaterial color="#ffd23f" emissive="#ffd23f" emissiveIntensity={.25} /></mesh>
      {kind === 'armed' && <mesh position={[.3, .62, .1]} rotation={[.4, 0, 0]}><boxGeometry args={[.05, .05, .42]} /><meshStandardMaterial color="#111" roughness={.6} /></mesh>}
    </>}
  </group></group></group>;
}
function Patrols() {
  const [rows, setRows] = useState<{ h: HouseInfo; kind: GuardId; i: number }[]>([]), t = useRef(0), key = useRef('');
  useFrame((_, dt) => {
    t.current += dt; if (t.current < .6) return; t.current = 0;
    const p = GAME.player, near = HOUSES.list.filter(h => hasGuards(h.sec)).map(h => ({ h, d: Math.hypot(h.x - p.x, h.z - p.z) })).filter(e => e.d < 70 || (e.h.mine && e.d < 110)).sort((a, b) => a.d - b.d).slice(0, 8);
    const out: { h: HouseInfo; kind: GuardId; i: number }[] = [];
    for (const { h } of near) for (const kind of ['dog', 'guard', 'armed'] as GuardId[]) for (let i = 0; i < h.sec[kind]; i++) out.push({ h, kind, i });
    const k = out.map(r => r.h.slot + r.kind + r.i).join('|'); if (k === key.current) return; key.current = k; setRows(out);
  });
  return <>{rows.map(r => <Actor key={r.h.slot + r.kind + r.i} h={r.h} kind={r.kind} i={r.i} />)}</>;
}

export default function PlayerHouses() {
  const [ver, setVer] = useState(HOUSES.ver);
  useEffect(() => {
    const f = () => setVer(HOUSES.ver);
    window.addEventListener('arl-houses', f);
    if (!HOUSES.ver) loadHouses(); else f();
    const i = setInterval(() => { if (!document.hidden) loadHouses(); }, 90_000);   // new players get their house without a reload
    return () => { window.removeEventListener('arl-houses', f); clearInterval(i); };
  }, []);

  const list = useMemo(() => HOUSES.list, [ver]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {   // houses are solid for walking, cars and the route planner
    const solids = list.map(h => ({ ...h.solid })), blks = list.map(h => ({ id: 'house-' + h.slot, x0: h.solid.x0 - .65, x1: h.solid.x1 + .65, z0: h.solid.z0 - .65, z1: h.solid.z1 + .65 }));
    SOLIDS.push(...solids); BL.push(...blks);
    return () => { for (const s of solids) { const i = SOLIDS.indexOf(s); if (i >= 0) SOLIDS.splice(i, 1); } for (const b of blks) { const i = BL.indexOf(b); if (i >= 0) BL.splice(i, 1); } };
  }, [list]);

  if (!list.length) return null;
  return <>
    <HouseMeshes list={list} ver={ver} />
    {HOUSES.mine && <Beacon h={HOUSES.mine} />}
    <Signs />
    <Patrols />
  </>;
}
