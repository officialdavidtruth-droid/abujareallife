import { prisma } from './prisma';
import { CITY } from './cityData';
import { worldCalendar, weatherAt } from './worldClock';

export const DISTRICT_PROFILES: Record<string,{mood:string;wealth:number;traffic:number;night:number;tags:string[]}> = {
  'Central Area':{mood:'Government & corporate',wealth:85,traffic:90,night:35,tags:['government','corporate','formal']},
  Wuse:{mood:'Commercial & busy',wealth:62,traffic:95,night:72,tags:['market','shopping','food']},
  Garki:{mood:'Offices & services',wealth:68,traffic:86,night:55,tags:['office','government','services']},
  Maitama:{mood:'Luxury & elite',wealth:96,traffic:70,night:58,tags:['luxury','mansion','fine-dining']},
  Jabi:{mood:'Entertainment & nightlife',wealth:78,traffic:82,night:98,tags:['nightlife','lake','restaurants']},
  Gwarinpa:{mood:'Residential & family',wealth:58,traffic:78,night:62,tags:['family','housing','retail']},
  Asokoro:{mood:'Diplomatic & elite',wealth:94,traffic:65,night:50,tags:['diplomatic','luxury','security']},
  Utako:{mood:'Transport & mixed-use',wealth:55,traffic:88,night:62,tags:['transport','hotels','logistics']},
  Kubwa:{mood:'Dense residential',wealth:42,traffic:80,night:68,tags:['market','family','commute']},
  Lugbe:{mood:'Airport corridor',wealth:48,traffic:91,night:64,tags:['airport','logistics','retail']},
  'Airport Corridor':{mood:'Travel & logistics',wealth:70,traffic:96,night:60,tags:['airport','hotel','transport']},
};
export const districtProfile=(d:string)=>DISTRICT_PROFILES[d]||{mood:'Abuja district',wealth:50,traffic:65,night:50,tags:['local']};

export const NPC_ARCHETYPES=[
  {id:'office',label:'Office Worker',home:'Gwarinpa',work:'Central Area'},
  {id:'trader',label:'Trader',home:'Kubwa',work:'Wuse'},
  {id:'student',label:'Student',home:'Gwarinpa',work:'Wuse'},
  {id:'executive',label:'Executive',home:'Maitama',work:'Central Area'},
  {id:'hospital',label:'Health Worker',home:'Garki',work:'Garki'},
  {id:'driver',label:'Driver',home:'Utako',work:'Airport Corridor'},
  {id:'hospitality',label:'Hospitality Worker',home:'Jabi',work:'Jabi'},
  {id:'security',label:'Security Officer',home:'Asokoro',work:'Maitama'},
];

export function npcState(i:number, minute:number){
  const h=Math.floor(((minute%1440)+1440)%1440/60);
  const a=NPC_ARCHETYPES[i%NPC_ARCHETYPES.length];
  const night=h<6||h>=22, commute=h>=7&&h<10||h>=16&&h<19;
  const district=night?a.home:commute?(h<10?a.work:a.home):a.work;
  const activity=night?'home':commute?'commute':h>=19?'social':'work';
  return {id:`npc-${i}`,name:`${a.label} ${i+1}`,archetype:a.id,district,activity,home:a.home,work:a.work};
}

const EVENT_POOL=[
 {kind:'concert',title:'Jabi Live Night',description:'Music, food and nightlife crowds fill Jabi.',district:'Jabi',intensity:3},
 {kind:'market',title:'Wuse Market Rush',description:'Extra shoppers flood Wuse businesses.',district:'Wuse',intensity:2},
 {kind:'traffic',title:'Peak Traffic',description:'Commuters are causing heavy traffic.',district:'Central Area',intensity:3},
 {kind:'football',title:'Matchday Crowd',description:'Restaurants and viewing centres are packed.',district:'Garki',intensity:2},
 {kind:'government',title:'Government Security Detail',description:'Security is heightened around government areas.',district:'Asokoro',intensity:2},
 {kind:'airport',title:'Airport Travel Surge',description:'Passenger demand rises around the airport corridor.',district:'Airport Corridor',intensity:2},
 {kind:'fire',title:'Building Fire',description:'Emergency crews are responding to a fire.',district:'Wuse',intensity:3},
 {kind:'accident',title:'Road Accident',description:'Traffic is slowing while emergency services respond.',district:'Garki',intensity:2},
];
export async function activeCityEvents(){
  const now=new Date();
  await prisma.cityEvent.updateMany({where:{active:true,endsAt:{lte:now}},data:{active:false}});
  let active=await prisma.cityEvent.findMany({where:{active:true,startsAt:{lte:now},endsAt:{gt:now}},orderBy:{startsAt:'desc'},take:8});
  if(!active.length){
    const cal=worldCalendar(); const key=`auto-${cal.day}-${Math.floor(cal.hh/4)}`; const seed=(cal.day*13+cal.hh*7)%EVENT_POOL.length; const e=EVENT_POOL[seed];
    const start=new Date(now.getTime()-30*60_000), end=new Date(now.getTime()+90*60_000);
    const row=await prisma.cityEvent.upsert({where:{key},update:{active:true,endsAt:end},create:{key,title:e.title,description:e.description,district:e.district,kind:e.kind,intensity:e.intensity,startsAt:start,endsAt:end,active:true}}); active=[row];
  }
  return active;
}

export async function citySnapshot(userId?:string){
  const now=Date.now(), minute=worldCalendar().hh*60+worldCalendar().mm, weather=weatherAt(now), events=await activeCityEvents();
  const districtCounts=Object.fromEntries(Object.keys(DISTRICT_PROFILES).map(d=>[d,0]));
  for(let i=0;i<96;i++){const n=npcState(i,minute); districtCounts[n.district]=(districtCounts[n.district]||0)+1;}
  const user= userId ? await prisma.character.findUnique({where:{userId},select:{district:true}}) : null;
  const here=user?.district||'Wuse'; const profile=districtProfile(here);
  const rain=weather.rain>0.5, night=worldCalendar().hh>=19||worldCalendar().hh<6;
  return {clock:worldCalendar(),weather,events,districts:Object.entries(DISTRICT_PROFILES).map(([name,p])=>({name,...p,npcs:districtCounts[name]||0,playerDistrict:name===here,traffic:Math.min(100,Math.round(p.traffic*(rain?1.15:1)*(night?.72:1))),demand:Math.min(100,Math.round((night?p.night:p.wealth)*((rain?.9:1))))})),npcSample:Array.from({length:18},(_,i)=>npcState(i,worldCalendar().hh*60+worldCalendar().mm)),npcCount:96,playerDistrict:here};
}
