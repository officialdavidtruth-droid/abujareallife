import { prisma } from './prisma';
import { CITY } from './cityData';
import { worldCalendar, weatherAt } from './worldClock';
import { wealthTier } from './profile';

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

type Ev={kind:string;title:string;description:string;district:string;intensity:number};
// Who counts as a "proper responder" for each event kind (paid 3x and earns more fame).
export const EVENT_RESPONDERS:Record<string,string[]>={
  fire:['firefighter'],accident:['doctor','police','mechanic'],traffic:['police'],airport:['driver'],
  robbery:['police'],ambulance:['doctor'],flood:['firefighter','police'],power:['mechanic'],construction:['mechanic'],
  checkpoint:['police'],breakdown:['mechanic','driver'],celebration:['artist'],concert:['artist'],
};
// Emergencies: one is seeded every 2 game hours, so the city always has something going wrong.
const EMERGENCIES:Ev[]=[
 {kind:'fire',title:'Building Fire',description:'Emergency crews are responding to a fire.',district:'Wuse',intensity:3},
 {kind:'accident',title:'Road Accident',description:'Traffic is slowing while emergency services respond.',district:'Garki',intensity:2},
 {kind:'robbery',title:'Robbery Reported',description:'A robbery is in progress. Police are needed.',district:'Wuse',intensity:3},
 {kind:'ambulance',title:'Ambulance Call',description:'A patient needs urgent medical help.',district:'Gwarinpa',intensity:2},
 {kind:'power',title:'Power Outage',description:'A blackout has hit the area. Engineers needed.',district:'Kubwa',intensity:2},
 {kind:'construction',title:'Road Construction',description:'Lanes are closed and traffic is diverted.',district:'Central Area',intensity:1},
 {kind:'checkpoint',title:'Police Checkpoint',description:'Officers are stopping vehicles for checks.',district:'Utako',intensity:1},
 {kind:'breakdown',title:'Broken-down Vehicle',description:'A vehicle is stuck blocking the road.',district:'Lugbe',intensity:1},
 {kind:'celebration',title:'Street Celebration',description:'A street party is blocking roads.',district:'Jabi',intensity:2},
];
const FLOOD:Ev={kind:'flood',title:'Flash Flooding',description:'Heavy storm flooding low-lying streets.',district:'Lugbe',intensity:3};
const STORM_POWER:Ev={kind:'power',title:'Storm Power Cut',description:'The thunderstorm knocked out the grid.',district:'Garki',intensity:2};

// Weekly rhythm: what the city does on each day / time, whether or not any player takes part.
function scheduled(cal:{day:number;weekday:string;hh:number}):Ev{
  const wd=cal.weekday,h=cal.hh;
  if((h>=7&&h<10)||(h>=16&&h<19))return {kind:'traffic',title:'Rush Hour',description:'Commuters are causing heavy traffic.',district:'Central Area',intensity:3};
  if(wd==='Fri'&&h>=18)return {kind:'concert',title:'Friday Night Jabi',description:'Nightlife bonus: Jabi is packed with clubbers.',district:'Jabi',intensity:3};
  if(wd==='Sat'&&h>=8&&h<18)return {kind:'market',title:'Wuse Market Rush',description:'Extra shoppers flood Wuse businesses.',district:'Wuse',intensity:3};
  if(wd==='Sun'&&h>=10&&h<20)return {kind:'family',title:'Family Day',description:'Families fill restaurants, parks and cinemas.',district:'Gwarinpa',intensity:2};
  if(wd==='Wed'&&h>=17)return {kind:'football',title:'Matchday Crowd',description:'Restaurants and viewing centres are packed.',district:'Garki',intensity:2};
  if((wd==='Tue'||wd==='Thu')&&h>=9&&h<16)return {kind:'government',title:'Government Security Detail',description:'Security is heightened around government areas.',district:'Asokoro',intensity:2};
  return {kind:'airport',title:'Airport Travel Surge',description:'Passenger demand rises around the airport corridor.',district:'Airport Corridor',intensity:2};
}
export async function activeCityEvents(){
  const now=new Date();
  await prisma.cityEvent.updateMany({where:{active:true,endsAt:{lte:now}},data:{active:false}});
  const cal=worldCalendar(), wx=weatherAt(Date.now());
  const wanted:{key:string;e:Ev;mins:number}[]=[
    {key:`auto-sch-${cal.day}-${Math.floor(cal.hh/3)}`,e:scheduled(cal),mins:90},
    {key:`auto-emg-${cal.day}-${Math.floor(cal.hh/2)}`,e:EMERGENCIES[(cal.day*13+Math.floor(cal.hh/2)*7)%EMERGENCIES.length],mins:60},
  ];
  if(wx.storm){wanted.push({key:`auto-flood-${cal.day}-${Math.floor(cal.hh/6)}`,e:FLOOD,mins:60});wanted.push({key:`auto-storm-${cal.day}-${Math.floor(cal.hh/6)}`,e:STORM_POWER,mins:60});}
  for(const w of wanted){
    const start=new Date(now.getTime()-10*60_000), end=new Date(now.getTime()+w.mins*60_000);
    await prisma.cityEvent.upsert({where:{key:w.key},update:{},create:{key:w.key,title:w.e.title,description:w.e.description,district:w.e.district,kind:w.e.kind,intensity:w.e.intensity,startsAt:start,endsAt:end,active:true}});
  }
  return prisma.cityEvent.findMany({where:{active:true,startsAt:{lte:now},endsAt:{gt:now}},orderBy:{startsAt:'desc'},take:8});
}

export async function citySnapshot(userId?:string){
  const now=Date.now(), minute=worldCalendar().hh*60+worldCalendar().mm, weather=weatherAt(now), events=await activeCityEvents();
  const districtCounts=Object.fromEntries(Object.keys(DISTRICT_PROFILES).map(d=>[d,0]));
  for(let i=0;i<96;i++){const n=npcState(i,minute); districtCounts[n.district]=(districtCounts[n.district]||0)+1;}
  const user= userId ? await prisma.character.findUnique({where:{userId},select:{district:true}}) : null;
  const sv= userId ? await prisma.save.findUnique({where:{userId},select:{cash:true}}) : null; const wealth=wealthTier(sv?.cash||0);
  const here=user?.district||'Wuse'; const profile=districtProfile(here);
  const rain=weather.rain>0.5, night=worldCalendar().hh>=19||worldCalendar().hh<6;
  return {clock:worldCalendar(),weather,events,districts:Object.entries(DISTRICT_PROFILES).map(([name,p])=>({name,...p,npcs:districtCounts[name]||0,playerDistrict:name===here,traffic:Math.min(100,Math.round(p.traffic*(rain?1.15:1)*(night?.72:1))),demand:Math.min(100,Math.round((night?p.night:p.wealth)*((rain?.9:1))))})),npcSample:Array.from({length:18},(_,i)=>npcState(i,worldCalendar().hh*60+worldCalendar().mm)),npcCount:96,playerDistrict:here,wealth,responders:EVENT_RESPONDERS};
}
