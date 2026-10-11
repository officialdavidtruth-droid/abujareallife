'use client';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { HOUSES, HOUSE_D, HOUSE_W, FRONT, loadHouses, type HouseInfo } from '../lib/houses';
import { GAME, NIGHT } from './cityShared';
import { BL, SOLIDS } from './CityCollision';

/* Every player's house, standing on the street (see lib/houses.ts for where). Drawn as a handful of instanced meshes (house body, roof, door, porch, driveway, windows),
   so ~100 houses cost 6 draw calls on a phone. Only the nearest few get a name sign (real text), and your own house gets a gold beacon you can see from far away. */
type Item = { m: THREE.Matrix4; c?: THREE.Color };
const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _p = new THREE.Vector3(), _s = new THREE.Vector3();
/** One box placed in a house's own frame (local +z = the front, facing the road). */
function mk(h: HouseInfo, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, col?: string): Item {
  const c = Math.cos(h.rot), s = Math.sin(h.rot);
  _q.setFromAxisAngle(_up, h.rot); _p.set(h.x + lx * c + lz * s, ly, h.z - lx * s + lz * c); _s.set(sx, sy, sz);
  return { m: new THREE.Matrix4().compose(_p, _q, _s), c: col ? new THREE.Color(col) : undefined };
}

function layout(list: HouseInfo[]) {
  const bodies: Item[] = [], roofs: Item[] = [], doors: Item[] = [], pads: Item[] = [], drives: Item[] = [], wins: Item[] = [];
  for (const h of list) {
    const H = h.floors === 2 ? 5.8 : 3, RH = h.floors === 2 ? 2.1 : 1.7, fz = HOUSE_D / 2;
    bodies.push(mk(h, 0, H / 2, 0, HOUSE_W, H, HOUSE_D, h.wall));
    roofs.push(mk(h, 0, H + RH / 2, 0, (HOUSE_W / 2) * 1.2 * Math.SQRT2, RH, (HOUSE_D / 2) * 1.2 * Math.SQRT2, h.roof));
    doors.push(mk(h, 0, 1.05, fz + .04, 1.1, 2.1, .1));
    pads.push(mk(h, 0, .03, fz + .75, 2.2, .06, 1.5));
    drives.push(mk(h, h.lat, .035, fz + FRONT / 2, 3.2, .05, FRONT));
    for (let f = 0; f < h.floors; f++) {
      const y = f * 2.9 + 1.7;
      for (const x of f === 0 ? [-1.9, 1.9] : [-1.9, 0, 1.9]) wins.push(mk(h, x, y, fz + .02, 1.1, 1.2, .06));
      for (const sd of [-1, 1]) wins.push(mk(h, sd * (HOUSE_W / 2 + .02), y, 0, .06, 1.2, 1.1));
    }
  }
  return { bodies, roofs, doors, pads, drives, wins };
}

function Inst({ items, geo, color = '#ffffff', shadow = false, children }: { items: Item[]; geo: React.ReactNode; color?: string; shadow?: boolean; children?: React.ReactNode }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  useLayoutEffect(() => {
    const im = ref.current; if (!im) return;
    items.forEach((it, i) => { im.setMatrixAt(i, it.m); if (it.c) im.setColorAt(i, it.c); });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }, [items]);
  return <instancedMesh ref={ref} args={[undefined, undefined, items.length]} frustumCulled={false} castShadow={shadow} receiveShadow>
    {geo}{children ?? <meshStandardMaterial color={color} roughness={.9} />}
  </instancedMesh>;
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
    <mesh ref={ring} position={[h.exit.x, .09, h.exit.z]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.9, 1.15, 28]} /><meshBasicMaterial color="#ffd23f" transparent opacity={.85} depthWrite={false} toneMapped={false} /></mesh>
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
      <Text position={[0, 2.7, HOUSE_D / 2 + .06]} fontSize={h.mine ? .34 : .3} maxWidth={HOUSE_W - .4} color={h.mine ? '#ffe28a' : '#ffffff'} outlineWidth={.035} outlineColor="#000000" anchorX="center" anchorY="middle" textAlign="center">{h.mine ? `${h.u} · YOUR HOUSE` : `${h.u}'s house`}</Text>
    </group>;
  })}</>;
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
  const L = useMemo(() => layout(list), [list]);
  const roofGeo = useMemo(() => { const g = new THREE.ConeGeometry(1, 1, 4, 1); g.rotateY(Math.PI / 4); return g; }, []);
  const win = useRef<THREE.MeshStandardMaterial>(null!);
  useFrame(() => { if (win.current) win.current.emissiveIntensity = .04 + NIGHT.n * 1.7; });

  useEffect(() => {   // houses are solid for walking, cars and the route planner
    const solids = list.map(h => ({ ...h.solid })), blks = list.map(h => ({ id: 'house-' + h.slot, x0: h.solid.x0 - .65, x1: h.solid.x1 + .65, z0: h.solid.z0 - .65, z1: h.solid.z1 + .65 }));
    SOLIDS.push(...solids); BL.push(...blks);
    return () => { for (const s of solids) { const i = SOLIDS.indexOf(s); if (i >= 0) SOLIDS.splice(i, 1); } for (const b of blks) { const i = BL.indexOf(b); if (i >= 0) BL.splice(i, 1); } };
  }, [list]);

  if (!list.length) return null;
  const box = <boxGeometry args={[1, 1, 1]} />;
  return <>
    <Inst key={'b' + ver} items={L.bodies} geo={box} shadow />
    <Inst key={'r' + ver} items={L.roofs} geo={<primitive object={roofGeo} attach="geometry" />} shadow />
    <Inst key={'d' + ver} items={L.doors} geo={box} color="#3b2a1e" />
    <Inst key={'p' + ver} items={L.pads} geo={box} color="#a8a59d" />
    <Inst key={'v' + ver} items={L.drives} geo={box} color="#7b7974" />
    <Inst key={'w' + ver} items={L.wins} geo={box}><meshStandardMaterial ref={win} color="#27384a" emissive="#ffcf6b" emissiveIntensity={.04} roughness={.3} metalness={.2} /></Inst>
    {HOUSES.mine && <Beacon h={HOUSES.mine} />}
    <Signs />
  </>;
}
