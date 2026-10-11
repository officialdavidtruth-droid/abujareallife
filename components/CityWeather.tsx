'use client';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { CITY } from '../lib/cityData';
import { weatherAt } from '../lib/worldClock';
import { CELL, hs } from './cityShared';

export function JailCell() {
  const bars = Array.from({ length: 13 }, (_, i) => -3 + i * .5);
  return <group position={[CELL.x, 0, CELL.z]}>
    <mesh rotation-x={-Math.PI / 2} position={[0, .02, 0]}><planeGeometry args={[6, 6]} /><meshStandardMaterial color="#4a4a4a" /></mesh>
    {[-3, 3].map(o => bars.map(b => <group key={o + '_' + b}><mesh position={[b, CELL.h / 2, o]}><cylinderGeometry args={[.04, .04, CELL.h, 6]} /><meshStandardMaterial color="#222" /></mesh><mesh position={[o, CELL.h / 2, b]}><cylinderGeometry args={[.04, .04, CELL.h, 6]} /><meshStandardMaterial color="#222" /></mesh></group>))}
    <mesh position={[0, CELL.h, 0]}><boxGeometry args={[6.2, .12, 6.2]} /><meshStandardMaterial color="#333" /></mesh>
    <mesh position={[-2, .35, -2]}><boxGeometry args={[1.8, .5, .8]} /><meshStandardMaterial color="#6b5a48" /></mesh>
    <Text position={[0, CELL.h + .6, 3]} fontSize={.4} color="#fff" anchorX="center">JAIL CELL</Text>
  </group>;
}

export const CAR_R = 1, CAR_OFFS = [-1.35, 0, 1.35];

export function WeatherEffects(){
 const puddles=useMemo(()=>Array.from({length:36},(_,i)=>({x:(hs('px'+i)*2-1)*125,z:(hs('pz'+i)*2-1)*125,s:.7+hs('ps'+i)*1.8})),[]);
 const umb=useRef<THREE.Group>(null!);
 useFrame(()=>{const w=weatherAt(); if(umb.current) umb.current.visible=w.rain>.45;});
 return <><group>{puddles.map((p,i)=><mesh key={i} position={[p.x,.036,p.z]} rotation-x={-Math.PI/2} scale={[p.s,p.s,1]}><circleGeometry args={[1,20]}/><meshBasicMaterial color="#5b7180" transparent opacity={.18} depthWrite={false}/></mesh>)}</group><group ref={umb}>{Array.from({length:12},(_,i)=><group key={i} position={[(hs('ux'+i)*2-1)*45,1.6,(hs('uz'+i)*2-1)*45]}><mesh rotation-x={-Math.PI/2}><cylinderGeometry args={[.45,.45,.03,16]}/><meshStandardMaterial color={['#d99a42','#2c5aa0','#c0392b','#1e9e55'][i%4]} /></mesh><mesh position={[0,-.45,0]}><cylinderGeometry args={[.025,.025,.9,6]}/><meshStandardMaterial color="#222"/></mesh></group>)}</group></>;
}

export function WorldEventVisuals(){
 const [events,setEvents]=useState<any[]>([]); useEffect(()=>{let dead=false;const load=()=>fetch('/api/city-life').then(r=>r.ok?r.json():null).then(d=>{if(!dead)setEvents(d?.events||[])}).catch(()=>{});load();const i=setInterval(load,12000);return()=>{dead=true;clearInterval(i)}},[]);
 return <>{events.map(e=>{const d=CITY.districts.find(x=>x.name===e.district)||CITY.districts[0];return <group key={e.id} position={[d.x,0,d.z]}>{e.kind==='fire'&&<pointLight color="#ff6a22" intensity={5} distance={22}/>}{e.kind==='fire'&&<mesh position={[0,2.3,0]}><sphereGeometry args={[1.2,10,10]}/><meshBasicMaterial color="#ff4b20" transparent opacity={.45}/></mesh>}{e.kind==='accident'&&<group rotation-y={.4}><mesh position={[0,.5,0]}><boxGeometry args={[3.2,.7,1.7]}/><meshStandardMaterial color="#7b2d2d"/></mesh><mesh position={[0,1.3,0]}><boxGeometry args={[2,.15,1.1]}/><meshStandardMaterial color="#ffb000" emissive="#ff5a00" emissiveIntensity={2}/></mesh></group>}{(e.kind==='celebration'||e.kind==='concert')&&Array.from({length:8},(_,i)=><mesh key={i} position={[(hs(e.id+i)*2-1)*5,.5,(hs(e.id+'z'+i)*2-1)*5]}><sphereGeometry args={[.18,8,8]}/><meshStandardMaterial color="#d99a42"/></mesh>)}</group>})}</>;
}

export function Rain() {
  const N = 520, g = useRef<THREE.Group>(null!), ls = useRef<THREE.LineSegments>(null!), seed = useMemo(() => Float32Array.from({ length: N * 3 }, (_, i) => (i % 3 === 1 ? Math.random() * 22 : (Math.random() - .5) * 38)), []), pos = useMemo(() => new Float32Array(N * 6), []);
  useFrame((st, dtRaw) => {
    const W = weatherAt(), dt = Math.min(dtRaw, .05); if (!ls.current) return;
    ls.current.visible = W.rain > .03; if (!ls.current.visible) return;
    g.current.position.copy(st.camera.position);
    const n = Math.floor(N * Math.min(1, W.rain * 1.15)), wind = 2 + W.storm * 5; (ls.current.material as THREE.LineBasicMaterial).opacity = .18 + W.rain * .32;
    for (let i = 0; i < n; i++) { let y = seed[i * 3 + 1] - (26 + W.storm * 10) * dt; if (y < -6) y += 28; seed[i * 3 + 1] = y; const x = seed[i * 3], z = seed[i * 3 + 2], o = i * 6; pos[o] = x; pos[o + 1] = y; pos[o + 2] = z; pos[o + 3] = x + wind * .035; pos[o + 4] = y - .9; pos[o + 5] = z; }
    const geo = ls.current.geometry; geo.setDrawRange(0, n * 2); (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  });
  return <group ref={g}><lineSegments ref={ls} frustumCulled={false} visible={false}><bufferGeometry><bufferAttribute attach="attributes-position" args={[pos, 3]} /></bufferGeometry><lineBasicMaterial color="#c4d4e2" transparent opacity={.4} depthWrite={false} fog={false} /></lineSegments></group>;
}
