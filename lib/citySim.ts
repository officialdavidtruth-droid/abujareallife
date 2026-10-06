export type TrafficCar={x:number;z:number;axis:'x'|'z';speed:number;rot:number;color:string};
export function makeTraffic(n=34):TrafficCar[]{const colors=['#c0392b','#f1c40f','#2980b9','#ecf0f1','#222','#27ae60'];return Array.from({length:n},(_,i)=>({x:(i*17)%100-50,z:(i*29)%100-50,axis:i%2?'z':'x',speed:.8+(i%5)*.18,rot:i%2?Math.PI/2:0,color:colors[i%colors.length]}));}
export function tickTraffic(cars:TrafficCar[],dt:number){for(const c of cars){if(c.axis==='x')c.x+=c.speed*dt*3;else c.z+=c.speed*dt*3;if(c.x>60)c.x=-60;if(c.x<-60)c.x=60;if(c.z>60)c.z=-60;if(c.z<-60)c.z=60;}}
