'use client';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls, RoundedBox, Text } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';
import Human from './Human';
import type { Look } from '../lib/characterModels';

type District = { name:string; x:number; z:number; color:string; jobs:string[] };
type Job = { title:string; business:string; district:string; pay:number; icon:string };

const districts: District[] = [
 {name:'Central Area',x:0,z:0,color:'#d99a42',jobs:['Banker','Lawyer','Civil Servant','Accountant']},
 {name:'Wuse',x:-65,z:-15,color:'#e6b45f',jobs:['Shop Manager','Cashier','Trader','Chef']},
 {name:'Garki',x:-35,z:55,color:'#6ca98b',jobs:['Doctor','Nurse','Hotel Staff','Receptionist']},
 {name:'Maitama',x:55,z:-48,color:'#8aa9c8',jobs:['Driver','Security','Estate Agent','Personal Assistant']},
 {name:'Jabi',x:62,z:28,color:'#5c9bb1',jobs:['Restaurant Manager','Bartender','Fitness Coach','DJ']},
 {name:'Gwarinpa',x:-68,z:68,color:'#76955f',jobs:['Mechanic','Teacher','Electrician','Delivery Rider']},
 {name:'Asokoro',x:55,z:65,color:'#9b7694',jobs:['Diplomat','Consultant','Chef','Security']},
 {name:'Utako',x:-12,z:-67,color:'#9b8b63',jobs:['Logistics Officer','Driver','Sales Rep','Warehouse Clerk']},
 {name:'Kubwa',x:-95,z:105,color:'#718a69',jobs:['Builder','Technician','Shop Owner','Driver']},
 {name:'Lugbe',x:95,z:108,color:'#7f725e',jobs:['Airport Staff','Pilot','Ground Crew','Courier']},
];
const jobs: Job[] = [
 ['Banker','Zenith Bank', 'Central Area',12000,'🏦'],['Cashier','Wuse Market','Wuse',6500,'🛒'],['Doctor','Abuja Medical Centre','Garki',18000,'🩺'],['Hotel Receptionist','Lusso Hotel','Garki',9000,'🏨'],['Restaurant Chef','Jabi Waterfront','Jabi',11000,'👨‍🍳'],['Driver','Abuja Transport Co.','Maitama',10000,'🚗'],['Mechanic','Gwarinpa Auto Works','Gwarinpa',9500,'🔧'],['Teacher','City College','Gwarinpa',10500,'📚'],['Estate Agent','Maitama Estates','Maitama',14000,'🏠'],['Delivery Rider','Swift Dispatch','Gwarinpa',8500,'🛵'],['Airport Ground Crew','Nnamdi Azikiwe Airport','Lugbe',15000,'✈️'],['Logistics Officer','Utako Logistics Hub','Utako',12000,'📦'],['Security Officer','Asokoro Residences','Asokoro',8000,'🛡️'],['Fitness Coach','Jabi Fitness','Jabi',10000,'🏋️'],['Software Developer','Tech Hub Abuja','Central Area',22000,'💻'],['Lawyer','Abuja Legal Chambers','Central Area',20000,'⚖️']
].map(([title,business,district,pay,icon])=>({title,business,district,pay,icon} as Job));

const roads = [
 ...Array.from({length:9},(_,i)=>({x:-100+i*25,z:0,w:3,d:220})),
 ...Array.from({length:9},(_,i)=>({x:0,z:-100+i*25,w:220,d:3})),
 {x:0,z:0,w:7,d:220},{x:0,z:0,w:220,d:7},{x:-55,z:55,w:5,d:130},{x:55,z:55,w:5,d:130}
];
const cityBounds=125;
function seeded(n:number){const x=Math.sin(n*999.91)*43758.5453;return x-Math.floor(x)}

function Building({x,z,w,d,h,color,label,business=false}:{x:number;z:number;w:number;d:number;h:number;color:string;label?:string;business?:boolean}){
 return <group position={[x,h/2,z]}>
  <RoundedBox args={[w,h,d]} radius={Math.min(.7,Math.min(w,d)*.12)} smoothness={2} castShadow receiveShadow><meshStandardMaterial color={color} roughness={.8}/></RoundedBox>
  {Array.from({length:Math.max(1,Math.floor(w/4))}).map((_,i)=><mesh key={i} position={[-w/2+2+i*4,h*.58,d/2+.012]}><boxGeometry args={[1.7,.9,.03]}/><meshStandardMaterial color={business?'#d9b36a':'#8fb4c8'} emissive={business?'#3b2a10':'#13252f'} emissiveIntensity={.25}/></mesh>)}
  {label&&<Text position={[0,h*.55,d/2+.05]} fontSize={Math.min(1.5,w/7)} color="#fff" anchorX="center" anchorY="middle" maxWidth={w*.9}>{label}</Text>}
 </group>
}
function Road({x,z,w,d}:{x:number;z:number;w:number;d:number}){return <mesh position={[x,.015,z]} rotation={[-Math.PI/2,0,0]} receiveShadow><planeGeometry args={[w,d]}/><meshStandardMaterial color="#252b31"/></mesh>}
function Markings({x,z,w,d}:{x:number;z:number;w:number;d:number}){return <mesh position={[x,.025,z]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[w,d]}/><meshBasicMaterial color="#d7c76a"/></mesh>}
function Tree({x,z,s=1}:{x:number;z:number;s?:number}){return <group position={[x,0,z]} scale={s}><mesh position={[0,.9,0]} castShadow><cylinderGeometry args={[.18,.25,1.8,8]}/><meshStandardMaterial color="#543522"/></mesh><mesh position={[0,2.35,0]} castShadow><sphereGeometry args={[1.25,12,8]}/><meshStandardMaterial color="#2e713e"/></mesh></group>}
function Car({x,z,rot,color}:{x:number;z:number;rot:number;color:string}){return <group position={[x,.25,z]} rotation-y={rot}><RoundedBox args={[2.5,.55,1.25]} radius={.18} smoothness={2}><meshStandardMaterial color={color} metalness={.25}/></RoundedBox><mesh position={[.15,.52,0]}><boxGeometry args={[1.25,.55,1.02]}/><meshStandardMaterial color="#8fb5c8"/></mesh>{[-.8,.8].flatMap(a=>[-.48,.48].map(b=><mesh key={a+''+b} position={[a,-.05,b]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.25,.25,.18,12]}/><meshStandardMaterial color="#111"/></mesh>))}</group>}
function Bike({x,z,rot}:{x:number;z:number;rot:number}){return <group position={[x,.35,z]} rotation-y={rot}><mesh rotation-z={Math.PI/2}><torusGeometry args={[.42,.045,8,16]}/><meshStandardMaterial color="#17191c"/></mesh><mesh position={[0,.05,0]} rotation-y={Math.PI/2}><boxGeometry args={[.9,.04,.04]}/><meshStandardMaterial color="#d99a42"/></mesh><mesh position={[0,.42,0]}><boxGeometry args={[.04,.55,.04]}/><meshStandardMaterial color="#d99a42"/></mesh></group>}
function Airport(){return <group position={[62,0,105]}><mesh rotation-x={-Math.PI/2} position={[0,.02,0]}><planeGeometry args={[45,100]}/><meshStandardMaterial color="#34383d"/></mesh><mesh position={[0,.04,0]}><boxGeometry args={[30,.1,70]}/><meshStandardMaterial color="#30353b"/></mesh><mesh position={[0,3,18]}><boxGeometry args={[20,6,15]}/><meshStandardMaterial color="#a9b2b7"/></mesh><mesh position={[0,7,25]}><boxGeometry args={[4,14,4]}/><meshStandardMaterial color="#d2d8d9"/></mesh><Text position={[0,9,23]} fontSize={1.8} color="#fff" anchorX="center">Nnamdi Azikiwe Airport</Text></group>}
function Rail(){return <group><mesh position={[0,.5,82]}><boxGeometry args={[220,.5,1.2]}/><meshStandardMaterial color="#555"/></mesh>{Array.from({length:30}).map((_,i)=><mesh key={i} position={[-105+i*7,.8,82]}><boxGeometry args={[.35,1.4,3]}/><meshStandardMaterial color="#777"/></mesh>)}{[-70,0,70].map((x,i)=><group key={i} position={[x,1.8,82]}><mesh><boxGeometry args={[8,3,4]}/><meshStandardMaterial color="#2c596d"/></mesh><Text position={[0,2,2.1]} fontSize={.7} color="#fff" anchorX="center">{['Wuse Rail','Central Rail','Jabi Rail'][i]}</Text></group>)}</group>}
function DistrictLabels(){return <>{districts.map(d=><Html key={d.name} position={[d.x,4,d.z]} center><div className="cityLabel">{d.name}</div></Html>)}</>}
function CityScene({look,onNear,joystick}:{look:Look;onNear:(dt:number)=>void;joystick:MutableRefObject<{x:number;y:number}>}){
 const pos=useRef({x:0,z:10}); const target=useRef({x:0,z:10}); const keys=useRef<Record<string,boolean>>({}); const [moving,setMoving]=useState(false);
 useFrame((_,dt)=>{let dx=0,dz=0;const k=keys.current;if(k.w||k.arrowup)dz-=1;if(k.s||k.arrowdown)dz+=1;if(k.a||k.arrowleft)dx-=1;if(k.d||k.arrowright)dx+=1;dx+=joystick.current.x;dz+=joystick.current.y;const len=Math.hypot(dx,dz);if(len>.05){dx/=len;dz/=len;target.current.x=THREE.MathUtils.clamp(target.current.x+dx*dt*10,-cityBounds,cityBounds);target.current.z=THREE.MathUtils.clamp(target.current.z+dz*dt*10,-cityBounds,cityBounds);setMoving(true)}else setMoving(false);pos.current.x+=(target.current.x-pos.current.x)*Math.min(1,dt*9);pos.current.z+=(target.current.z-pos.current.z)*Math.min(1,dt*9);onNear(dt)});
 useEffect(()=>{const down=(e:KeyboardEvent)=>{keys.current[e.key.toLowerCase()]=true};const up=(e:KeyboardEvent)=>{keys.current[e.key.toLowerCase()]=false};window.addEventListener('keydown',down);window.addEventListener('keyup',up);return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up)}},[]);
 const buildings=useMemo(()=>{const a:any[]=[];let id=0;for(let gx=-5;gx<5;gx++)for(let gz=-5;gz<5;gz++){const bx=gx*25+12,bz=gz*25+12;for(let l=0;l<3;l++){const x=bx+(seeded(id++)-.5)*15,z=bz+(seeded(id++)-.5)*15;const h=5+seeded(id++)*18;const w=5+seeded(id++)*6,d=5+seeded(id++)*6;a.push({x,z,w,d,h,color:['#6c7780','#88725d','#566d78','#8c6c72','#66755f'][id%5]})}}return a},[]);
 const cars=useMemo(()=>Array.from({length:55},(_,i)=>({x:-105+seeded(i+400)*210,z:-105+seeded(i+500)*210,rot:seeded(i+600)>0.5?0:Math.PI/2,color:['#b43c35','#2e5268','#d2a83e','#ece7dc','#202428'][i%5]})),[]);
 const bikes=useMemo(()=>Array.from({length:18},(_,i)=>({x:-100+seeded(i+700)*200,z:-100+seeded(i+800)*200,rot:seeded(i+900)*6.28})),[]);
 return <>
  <color attach="background" args={['#9dc6e0']}/><fog attach="fog" args={['#9dc6e0',110,250]}/><hemisphereLight args={['#dcefff','#40583e',1.8]}/><directionalLight position={[40,80,30]} intensity={3} castShadow shadow-mapSize={[1024,1024]}/>
  <mesh rotation-x={-Math.PI/2} receiveShadow><planeGeometry args={[260,260]}/><meshStandardMaterial color="#405c43"/></mesh>
  {roads.map((r,i)=><Road key={i}{...r}/>)}
  {roads.slice(0,18).map((r,i)=><Markings key={'m'+i} x={r.x} z={r.z} w={r.w*.65} d={r.d*.65}/>)}
  {buildings.map((b,i)=><Building key={i}{...b}/>)}
  {districts.map((d,i)=><Building key={'d'+i} x={d.x} z={d.z} w={12} d={10} h={i<3?16:8} color={d.color} label={d.name.toUpperCase()} business/>) }
  {Array.from({length:65}).map((_,i)=><Tree key={i} x={-115+seeded(i+1000)*230} z={-115+seeded(i+1100)*230} s={.7+seeded(i+1200)*.6}/>) }
  {cars.map((c,i)=><Car key={i}{...c}/>)}{bikes.map((b,i)=><Bike key={i}{...b}/>)}<Rail/><Airport/><DistrictLabels/>
  <group position={[pos.current.x,0,pos.current.z]}><Human look={look} getState={()=>moving?'walk':'idle'}/><Html position={[0,2.6,0]} center><div className="cityPlayerTag">YOU</div></Html></group>
 </>
}

export default function CityWorld({look,onNear}:{look:Look;onNear:(dt:number)=>void}){
 const [panel,setPanel]=useState<'map'|'jobs'|'businesses'|null>(null); const joystick=useRef({x:0,y:0});
 return <div className="cityWrap"><Canvas shadows dpr={[1,1.5]} camera={{position:[10,12,16],fov:45}}><CityScene look={look} onNear={onNear} joystick={joystick}/><OrbitControls enablePan={false} minDistance={7} maxDistance={38} maxPolarAngle={Math.PI/2.15} /></Canvas>
 <div className="cityTop"><b>ABUJA REAL LIFE</b><span>Open City · Abuja</span></div>
 <div className="cityTools"><button onClick={()=>setPanel('map')}>🗺️ Map</button><button onClick={()=>setPanel('jobs')}>💼 Jobs</button><button onClick={()=>setPanel('businesses')}>🏪 Businesses</button></div>
 <div className="cityJoystick" onPointerMove={e=>{if(e.buttons){const r=e.currentTarget.getBoundingClientRect();joystick.current={x:THREE.MathUtils.clamp((e.clientX-(r.left+r.width/2))/(r.width/2),-1,1),y:THREE.MathUtils.clamp((e.clientY-(r.top+r.height/2))/(r.height/2),-1,1)}}}} onPointerUp={()=>joystick.current={x:0,y:0}}><div/></div>
 <div className="cityActions"><button onPointerDown={()=>joystick.current.y=-1}>▲</button><button onPointerDown={()=>joystick.current.x=-1}>◀</button><button onPointerDown={()=>joystick.current.x=1}>▶</button><button onPointerDown={()=>joystick.current.y=1}>▼</button></div>
 {panel&&<div className="cityPanel"><button className="close" onClick={()=>setPanel(null)}>×</button>{panel==='map'?<><h2>Abuja City Map</h2><div className="mapGrid">{districts.map(d=><div key={d.name}><b>{d.name}</b><small>{d.jobs.join(' · ')}</small></div>)}</div><p>✈️ Airport · 🚆 Rail line · 🛣️ Major roads · 🏪 Commercial districts</p></>:panel==='jobs'?<><h2>Jobs Board</h2>{jobs.map(j=><div className="jobRow" key={j.title+j.business}><span>{j.icon}</span><div><b>{j.title}</b><small>{j.business} · {j.district}</small></div><strong>₦{j.pay.toLocaleString()}/shift</strong></div>)}</>:<><h2>Businesses</h2><div className="bizGrid">{['Banks','Hospitals','Hotels','Restaurants','Nightclubs','Supermarkets','Markets','Gyms','Salons','Barbers','Mechanics','Car Dealers','Schools','Universities','Law Firms','Tech Companies','Estate Agencies','Factories','Warehouses','Airlines','Travel Agencies','Cafés','Pharmacies','Clothing Stores','Furniture Stores','Petrol Stations','Delivery Companies','Government Offices','Cinemas','Shopping Malls'].map(x=><div key={x}>🏢 {x}</div>)}</div></>}</div>}
 </div>
}
