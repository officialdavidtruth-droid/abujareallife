'use client';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import Human from './Human';
import { NET } from '../lib/cityNet';
import { VEHICLE_CATALOG, vehicleById } from '../lib/vehicles';
import { BikeBody, BusBody, CarModel, TaxiBody, pkit } from './CityCars';
import { guestKey, guestsOf } from './cityPax';
import { hs, wrap } from './cityShared';
import { JACK } from './CityTraffic';


/* ───────────── other real players ───────────── */
export const rWalk = (n: string) => { const q = NET.peers[n]; return !!q && q.mv > 0 && Math.hypot(q.tx - q.x, q.tz - q.z) > .08; };

/* Crowd-friendly name tags: only the nearest few players get the full tag; the rest shrink to a small faded label, then disappear.
   Anyone with a chat bubble always keeps a full tag. */
export const TAGS: { at: number; rank: Record<string, number> } = { at: 0, rank: {} };

export const tagRanks = () => { const now = performance.now(); if (now - TAGS.at < 250) return; TAGS.at = now; const r: Record<string, number> = {}; Object.entries(NET.peers).map(([n, q]) => [n, Math.hypot(NET.me.x - q.x, NET.me.z - q.z)] as const).sort((a, b) => a[1] - b[1]).forEach(([n], i) => { r[n] = i; }); TAGS.rank = r; };

export function Remote({ name, bub, onPick }: { name: string; bub?: string; onPick: (n: string) => void }) {
  const drvObj = useRef<THREE.Object3D | null>(null), setDrv = useMemo(() => (g: THREE.Object3D | null) => { drvObj.current = g; }, []);
  const body = useRef<THREE.Group>(null!), car = useRef<THREE.Group>(null!), hum = useRef<THREE.Group>(null!), tag = useRef<HTMLDivElement | null>(null), nameEl = useRef<HTMLDivElement | null>(null);
  const rideG = useRef<THREE.Group>(null!), rkRef = useRef(0), gkRef = useRef(''), [rk, setRk] = useState(0), [gk, setGk] = useState('');   // which ride vehicle is drawn (taxi / bike / bus) and who sits in this player's vehicle: changes rarely, so React state is fine
  const kit = pkit(), remoteModel = VEHICLE_CATALOG[Math.floor(hs(name) * VEHICLE_CATALOG.length)].id, colour = useMemo(() => vehicleById(remoteModel).color, [remoteModel]);
  useFrame((_, dtRaw) => {
    const q = NET.peers[name]; if (!q || !body.current) return;
    const dt = Math.min(dtRaw, .1), k = 1 - Math.exp(-dt * 9);
    q.x += (q.tx - q.x) * k; q.z += (q.tz - q.z) * k; q.r += wrap(q.tr - q.r) * k;
    q.cx += (q.tcx - q.cx) * k; q.cz += (q.tcz - q.cz) * k; q.cr += wrap(q.tcr - q.cr) * k;
    const d = Math.hypot(NET.me.x - q.x, NET.me.z - q.z), near = d < 150;
    const rd = q.rd || 0; if (rd !== rkRef.current) { rkRef.current = rd; setRk(rd); }
    const gKey = guestKey(name); if (gKey !== gkRef.current) { gkRef.current = gKey; setGk(gKey); }
    if (rideG.current) { rideG.current.visible = near && rd > 0; rideG.current.position.set(q.x, 0, q.z); rideG.current.rotation.y = q.r; }   // riding a taxi: x, z, r are the vehicle's pose
    body.current.visible = near && !q.drv && !rd && !q.pa; body.current.rotation.order = 'YXZ'; body.current.position.set(q.x, q.ko ? .28 : 0, q.z); body.current.rotation.y = q.r; body.current.rotation.x = q.ko ? -Math.PI / 2 : 0;
    car.current.visible = near && (q.cp || q.drv) && !JACK.hides(name); car.current.position.set(q.cx, 0, q.cz); car.current.rotation.y = q.cr;
    if (drvObj.current) drvObj.current.visible = !!q.drv;   // somebody sits in a remote car only while that player is driving it (a parked car is empty)
    tagRanks();
    const rk = TAGS.rank[name] ?? 99, full = rk < 5 || !!bub;
    if (tag.current) {
      const show = full ? d < 60 : rk < 14 && d < 28, sc = full ? THREE.MathUtils.clamp(1.1 - d / 70, .62, 1) : .6, op = full ? THREE.MathUtils.clamp(1.25 - d / 60, .5, 1) : THREE.MathUtils.clamp(1 - d / 28, .35, .85);
      const key = `${show}|${full}|${Math.round(sc * 20)}|${Math.round(op * 20)}`;
      if (tag.current.dataset.k !== key) { tag.current.dataset.k = key; tag.current.style.display = show ? '' : 'none'; tag.current.style.transform = `scale(${sc.toFixed(2)})`; tag.current.style.opacity = String(op.toFixed(2)); nameEl.current?.classList.toggle('mini', !full); }
    }
  });
  const p = NET.peers[name]; if (!p) return null;
  void gk;
  const guests = guestsOf(name), carPax = guests.map(g => ({ look: g.look, seed: g.name, seat: g.seat })), taxiPax = [{ look: p.look, seed: name, seat: 1 }, ...guests.map(g => ({ look: g.look, seed: g.name, seat: 2 }))];
  return <>
    <group ref={body} onClick={e => { if (e.delta > 6) return; e.stopPropagation(); onPick(name); }}>
      <Human look={p.look} getState={() => (rWalk(name) ? 'walk' : 'idle')} getAnim={() => { const q = NET.peers[name]; if (!q || rWalk(name)) return undefined; return q.anim && Date.now() < q.animUntil ? q.anim : undefined; }} getSpeed={() => ((NET.peers[name]?.mv || 0) === 2 ? 2.4 : 1.1)} />
      <Html position={[0, 2.8, 0]} center zIndexRange={[5, 0]}><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, transformOrigin: '50% 100%' }} ref={el => { tag.current = el; }}>{bub && <div className="cwSay">{bub}</div>}<div ref={nameEl} className="cityNameTag cwTapTag" onClick={() => onPick(name)}>{name}</div></div></Html>
    </group>
    <group ref={car} visible={false}><CarModel kit={kit} color={colour} kind={0} model={remoteModel} driverRef={setDrv} look={p.look} pax={carPax} /></group>
    <group ref={rideG} visible={false}>{rk === 1 ? <TaxiBody kit={kit} pax={taxiPax} /> : rk === 2 ? <BikeBody scale={.95} rider riderLook={p.look} /> : rk === 3 ? <BusBody /> : null}</group>
  </>;
}

export function RemotePlayers({ roster, ver, bub, onPick }: { roster: string[]; ver: number; bub: Record<string, string>; onPick: (n: string) => void }) {
  void ver;
  return <>{roster.map(n => <Remote key={n} name={n} bub={bub[n]} onPick={onPick} />)}</>;
}
