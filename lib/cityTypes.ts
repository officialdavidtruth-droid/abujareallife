export type District = 'Central Area'|'Wuse'|'Garki'|'Maitama'|'Jabi'|'Gwarinpa'|'Asokoro'|'Utako'|'Kubwa'|'Lugbe'|'Airport Corridor';
export type BusinessType = 'Bank'|'Restaurant'|'Hotel'|'Hospital'|'Supermarket'|'Salon'|'Barber'|'Gym'|'Mechanic'|'Car Dealer'|'School'|'Office'|'Nightclub'|'Market'|'Petrol Station'|'Pharmacy'|'Cinema'|'Tech Company'|'Estate Agency'|'Logistics'|'Government'|'Airport'|'Rail Station'|'Police Station'|'Jail'|'Gun Shop';
export type Job = { id:string; title:string; business:string; district:District; pay:number; shift:string; type:string };
export type Business = { id:string; name:string; type:BusinessType; district:District; x:number; z:number; jobs:Job[] };
export type Road = { id:string; name:string; x:number; z:number; w:number; d:number; major:boolean };
export type CityBuilding = { id:string; x:number; z:number; w:number; d:number; h:number; color:string; business?:Business };
export type CityData = { roads:Road[]; buildings:CityBuilding[]; businesses:Business[]; districts:{name:District;x:number;z:number}[]; rail:{x:number;z:number}[]; airport:{x:number;z:number} };
