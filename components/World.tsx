'use client';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Html, OrbitControls, RoundedBox, Text } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

export type PlayerLook = { skin: string; shirt: string; pants: string; hair: string };
export type District = 'Wuse' | 'Garki' | 'Maitama' | 'Jabi' | 'Gwarinpa' | 'Asokoro';

const districtPositions: Record<District, [number, number, number]> = {
  Wuse: [-5, 0, -2], Garki: [-1.8, 0, 3], Maitama: [3.8, 0, -3], Jabi: [4.7, 0, 2], Gwarinpa: [-5, 0, 4.8], Asokoro: [1.8, 0, 5],
};

function Avatar({look, moving}:{look:PlayerLook; moving:boolean}) {
  const group = useRef<THREE.Group>(null);
  const phase = useRef(Math.random()*10);
  useFrame((s)=>{
    if (!group.current) return;
    const t = s.clock.elapsedTime;
    group.current.position.y = Math.abs(Math.sin(t*(moving?8:2)))*0.035;
    const swing = moving ? Math.sin(t*8)*0.5 : 0;
    group.current.children[2].rotation.x = swing;
    group.current.children[3].rotation.x = -swing;
    group.current.children[4].rotation.x = -swing;
    group.current.children[5].rotation.x = swing;
  });
  return <group ref={group}>
    <mesh position={[0,1.62,0]} castShadow><sphereGeometry args={[.31,24,18]}/><meshStandardMaterial color={look.skin}/></mesh>
    <mesh position={[0,1.18,0]} castShadow><capsuleGeometry args={[.3,.62,8,16]}/><meshStandardMaterial color={look.shirt}/></mesh>
    <mesh position={[-.13,.59,0]} castShadow><capsuleGeometry args={[.105,.62,6,10]}/><meshStandardMaterial color={look.pants}/></mesh>
    <mesh position={[.13,.59,0]} castShadow><capsuleGeometry args={[.105,.62,6,10]}/><meshStandardMaterial color={look.pants}/></mesh>
    <mesh position={[-.39,1.2,0]} rotation={[0,0,-.15]} castShadow><capsuleGeometry args={[.09,.55,6,10]}/><meshStandardMaterial color={look.skin}/></mesh>
    <mesh position={[.39,1.2,0]} rotation={[0,0,.15]} castShadow><capsuleGeometry args={[.09,.55,6,10]}/><meshStandardMaterial color={look.skin}/></mesh>
    <mesh position={[0,1.88,0]} castShadow><sphereGeometry args={[.34,.34,16]}/><meshStandardMaterial color={look.hair}/></mesh>
    <mesh position={[0,1.72,.28]}><sphereGeometry args={[.035,8,8]}/><meshBasicMaterial color="#111"/></mesh>
    <Html position={[0,2.25,0]} center><div className="worldTag">YOU</div></Html>
  </group>
}

function Npc({x,z,name,skin,shirt}:{x:number;z:number;name:string;skin:string;shirt:string}){
  const ref=useRef<THREE.Group>(null);
  const start=useMemo(()=>new THREE.Vector3(x,0,z),[x,z]);
  useFrame((s)=>{ if(!ref.current)return; ref.current.position.x=start.x+Math.sin(s.clock.elapsedTime*.35+x)*.8; ref.current.position.z=start.z+Math.cos(s.clock.elapsedTime*.28+z)*.6; });
  return <group ref={ref}>
    <mesh position={[0,1.45,0]} castShadow><sphereGeometry args={[.22,16,12]}/><meshStandardMaterial color={skin}/></mesh>
    <mesh position={[0,1.05,0]} castShadow><capsuleGeometry args={[.22,.42,6,12]}/><meshStandardMaterial color={shirt}/></mesh>
    <mesh position={[-.09,.62,0]}><boxGeometry args={[.09,.42,.1]}/><meshStandardMaterial color="#20232a"/></mesh>
    <mesh position={[.09,.62,0]}><boxGeometry args={[.09,.42,.1]}/><meshStandardMaterial color="#20232a"/></mesh>
    <Html position={[0,1.85,0]} center><div className="worldNpc">{name}</div></Html>
  </group>
}

function Building({x,z,w=1.8,h=1.7,d=1.5,color,label,accent='#d99a42'}:{x:number;z:number;w?:number;h?:number;d?:number;color:string;label:string;accent?:string}){
 return <group position={[x,h/2,z]}>
   <RoundedBox args={[w,h,d]} radius={.08} smoothness={2} castShadow receiveShadow><meshStandardMaterial color={color}/></RoundedBox>
   <mesh position={[0,h/2+.06,0]}><boxGeometry args={[w+.1,.1,d+.1]}/><meshStandardMaterial color={accent}/></mesh>
   <Text position={[0,h/2+.28,d/2+.02]} fontSize={.2} color="#f8fafc" anchorX="center" anchorY="middle">{label}</Text>
   <mesh position={[0,-h/2+.38,d/2+.015]}><boxGeometry args={[.34,.55,.04]}/><meshStandardMaterial color="#16202a"/></mesh>
 </group>
}

function Road({x,z,w,d}:{x:number;z:number;w:number;d:number}){
 return <mesh position={[x,.015,z]} rotation={[-Math.PI/2,0,0]} receiveShadow><planeGeometry args={[w,d]}/><meshStandardMaterial color="#252b32"/></mesh>
}
function Car({x,z,rot=0}:{x:number;z:number;rot?:number}){
 return <group position={[x,.18,z]} rotation={[0,rot,0]}>
   <RoundedBox args={[1.15,.28,.55]} radius={.08} smoothness={2}><meshStandardMaterial color="#b43c35"/></RoundedBox>
   <mesh position={[0,.2,0]}><boxGeometry args={[.58,.25,.48]}/><meshStandardMaterial color="#9fb8c7"/></mesh>
   {[[-.38,-.22],[.38,-.22],[-.38,.22],[.38,.22]].map(([a,b],i)=><mesh key={i} position={[a,.02,b]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.11,.11,.08,12]}/><meshStandardMaterial color="#111"/></mesh>)}
 </group>
}

function PlayerController({look,target,onMove}:{look:PlayerLook;target:[number,number,number];onMove:(moving:boolean)=>void}){
 const [moving,setMoving]=useState(false);
 const [pos,setPos]=useState<[number,number,number]>(target);
 const keys=useRef<Record<string,boolean>>({});
 const lastMoving=useRef(false);
 useEffect(()=>{setPos([target[0],0,target[2]]);},[target]);
 useEffect(()=>{
   const updateMoving=(next:boolean)=>{
     setMoving(prev=>{
       if(prev!==next) onMove(next);
       return next;
     });
   };
   const down=(e:KeyboardEvent)=>{
     if(['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
     const k=e.key.toLowerCase();
     if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k)){
       keys.current[k]=true;
       if(!lastMoving.current){ lastMoving.current=true; updateMoving(true); }
       e.preventDefault();
     }
   };
   const up=(e:KeyboardEvent)=>{
     keys.current[e.key.toLowerCase()]=false;
     const active=Object.values(keys.current).some(Boolean);
     if(!active && lastMoving.current){ lastMoving.current=false; updateMoving(false); }
   };
   window.addEventListener('keydown',down);
   window.addEventListener('keyup',up);
   return()=>{
     window.removeEventListener('keydown',down);
     window.removeEventListener('keyup',up);
   };
 },[onMove]);
 useFrame((_,delta)=>{
   const k=keys.current; let dx=0,dz=0;
   if(k.w||k.arrowup)dz-=1;
   if(k.s||k.arrowdown)dz+=1;
   if(k.a||k.arrowleft)dx-=1;
   if(k.d||k.arrowright)dx+=1;
   if(dx||dz){
     const len=Math.hypot(dx,dz)||1;
     dx/=len; dz/=len;
     setPos(v=>[
       THREE.MathUtils.clamp(v[0]+dx*delta*2.4,-10,10),
       0,
       THREE.MathUtils.clamp(v[2]+dz*delta*2.4,-10,10)
     ]);
   }
 });
 return <group position={pos}><Avatar look={look} moving={moving}/></group>;
}

function Scene({look,district,onMove}:{look:PlayerLook;district:District;onMove:(moving:boolean)=>void}){
 const target=districtPositions[district];
 return <Canvas shadows camera={{position:[9,9,11],fov:44}} onCreated={({camera})=>camera.lookAt(0,0,0)}>
   <color attach="background" args={['#101820']}/><fog attach="fog" args={['#101820',16,30]}/>
   <ambientLight intensity={1.8}/><directionalLight position={[7,12,4]} intensity={3.2} castShadow shadow-mapSize={[2048,2048]}/><Environment preset="city"/>
   <mesh rotation={[-Math.PI/2,0,0]} receiveShadow><planeGeometry args={[24,24]}/><meshStandardMaterial color="#36533d"/></mesh>
   <Road x={0} z={0} w={22} d={1.1}/><Road x={0} z={0} w={1.1} d={22}/><Road x={-4.2} z={3.8} w={1.0} d={10}/><Road x={4.2} z={-3.8} w={1.0} d={10}/>
   <Building x={-5} z={-2} w={2.2} h={2.2} d={1.7} color="#72513d" label="WUSE MARKET"/><Building x={-1.8} z={3} color="#5e6d76" label="GARKI BUSINESS"/><Building x={3.8} z={-3} w={2.3} h={2.5} color="#746447" label="MAITAMA VILLAS"/><Building x={4.7} z={2} w={2.2} h={1.7} color="#315a72" label="JABI LAKE"/><Building x={-5} z={4.8} w={2.3} h={1.8} color="#536044" label="GWARINPA"/><Building x={1.8} z={5} w={2.0} h={2.2} color="#5b4c58" label="ASOKORO"/>
   <Building x={-2.4} z={-3.2} w={1.5} h={1.3} d={1.3} color="#294d43" label="GYM"/><Building x={2.3} z={1.7} w={1.5} h={1.5} d={1.4} color="#70433d" label="CAFE"/><Building x={0} z={-5} w={1.7} h={1.5} d={1.5} color="#3f5368" label="HOSPITAL"/>
   <Car x={-1.5} z={-.75} rot={Math.PI/2}/><Car x={2.2} z={.75} rot={-Math.PI/2}/><Car x={5.5} z={-1.2}/>
   <Npc x={-3} z={-1} name="Ada" skin="#7d4b2d" shirt="#e0a21b"/><Npc x={2.8} z={3.2} name="Ibrahim" skin="#6d432c" shirt="#3c7b68"/><Npc x={-4} z={2.2} name="Chioma" skin="#8a5837" shirt="#9c4c5b"/>
   <PlayerController look={look} target={target} onMove={onMove}/>
   <OrbitControls enablePan={false} minDistance={5} maxDistance={16} maxPolarAngle={Math.PI/2.12}/>
 </Canvas>
}

export default function World({look,district,setDistrict,onMove}:{look:PlayerLook;district:District;setDistrict:(d:District)=>void;onMove:(moving:boolean)=>void}){
 return <div className="canvasWrap"><Scene look={look} district={district} onMove={onMove}/><div className="districtButtons">{(Object.keys(districtPositions) as District[]).map(d=><button key={d} onClick={()=>setDistrict(d)} className={district===d?'active':''}>{d}</button>)}</div></div>
}
