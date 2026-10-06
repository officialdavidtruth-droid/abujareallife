import type { CityBuilding, CityData } from './cityTypes';
export function buildingBox(b:CityBuilding){return {x1:b.x-b.w/2,x2:b.x+b.w/2,z1:b.z-b.d/2,z2:b.z+b.d/2};}
export function nearestBusiness(city:CityData,x:number,z:number){return city.businesses.reduce((best,b)=>!best||Math.hypot(b.x-x,b.z-z)<Math.hypot(best.x-x,b.z-z)?b:best,null as CityData['businesses'][number]|null);}
