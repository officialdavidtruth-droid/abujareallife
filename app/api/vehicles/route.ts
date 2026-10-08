import { NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { currentUser, err } from '../../../lib/auth';
import { VEHICLE_CATALOG, vehicleById } from '../../../lib/vehicles';

export const dynamic = 'force-dynamic';

export async function GET() {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const rows = await prisma.vehicle.findMany({ where: { userId: u.id }, orderBy: { purchasedAt: 'desc' } });
  return NextResponse.json({ vehicles: rows, catalog: VEHICLE_CATALOG, active: rows[0]?.name || null });
}

export async function POST(req: Request) {
  const u = await currentUser(); if (!u) return err('Not signed in.', 401);
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || 'buy');
  const save = await prisma.save.findUnique({ where: { userId: u.id } });
  if (!save) return err('Create your character first.', 409);
  if (action === 'drive') { // server-side wear: call with the km driven; burns fuel, wears condition, adds mileage
    const v = await prisma.vehicle.findFirst({ where: { userId: u.id, id: String(body.vehicleId || '') } }); if (!v) return err('Vehicle not found.', 404);
    const km = Math.max(0, Math.min(50, Number(body.km) || 0));
    if (v.fuel <= 0) return err('Out of fuel. Refuel first.', 409);
    const row = await prisma.vehicle.update({ where: { id: v.id }, data: { fuel: Math.max(0, v.fuel - Math.ceil(km * 1.2)), condition: Math.max(0, v.condition - Math.floor(km / 6)), mileage: { increment: Math.round(km) }, parkedAt: null } });
    return NextResponse.json({ ok: true, vehicle: row });
  }
  if (action === 'park') {
    const v = await prisma.vehicle.findFirst({ where: { userId: u.id, id: String(body.vehicleId || '') } }); if (!v) return err('Vehicle not found.', 404);
    const row = await prisma.vehicle.update({ where: { id: v.id }, data: { parkedAt: String(body.at || 'Home').slice(0, 60) } });
    return NextResponse.json({ ok: true, vehicle: row });
  }
  if (action !== 'buy') {
    const vehicle = await prisma.vehicle.findFirst({ where: { userId: u.id, id: String(body.vehicleId || '') } });
    if (!vehicle) return err('Vehicle not found.', 404);
    const costs: Record<string,number> = { register: 250000, insure: 180000, repair: Math.max(50000, Math.round((100-vehicle.condition)*vehicle.price*.012)), refuel: Math.max(15000, Math.round((100-vehicle.fuel)*1200)), wash: 8000, paint: 35000, rims: 60000, tint: 25000, steal: 0 };
    const cost = costs[action]; if (!cost) return err('Unknown vehicle action.',400); if (save.cash < cost) return err(`You need ₦${cost.toLocaleString()}.`,402);
    const data:any = action==='register'?{registered:true}:action==='insure'?{insured:true}:action==='repair'?{condition:100}:action==='refuel'?{fuel:100}:action==='wash'?{condition:Math.min(100,vehicle.condition+3)}:action==='paint'?{paint:String(body.paint||'factory').slice(0,30)}:action==='rims'?{rims:String(body.rims||'factory').slice(0,30)}:action==='tint'?{tint:Math.max(0,Math.min(80,Number(body.tint)||0))}:action==='steal'?{stolen:true,registered:false,insured:false}:{};
    const row = await prisma.$transaction(async tx=>{await tx.save.update({where:{userId:u.id},data:{cash:{decrement:cost}}});await tx.transaction.create({data:{userId:u.id,type:'SPEND',amount:-cost,description:`vehicle-${action}:${vehicle.name}`}});return tx.vehicle.update({where:{id:vehicle.id},data});});
    return NextResponse.json({ok:true,vehicle:row,cash:save.cash-cost});
  }
  const id = String(body.id || '');
  const spec = VEHICLE_CATALOG.find(v => v.id === id);
  if (!spec) return err('Vehicle not found.', 404);
  if (save.cash < spec.price) return err("You can't afford this vehicle.", 402);
  const v = await prisma.$transaction(async tx => {
    await tx.save.update({ where: { userId: u.id }, data: { cash: { decrement: spec.price }, hasCar: true } });
    const row = await tx.vehicle.create({ data: { userId: u.id, name: `${spec.brand} ${spec.model}`, type: spec.type, price: spec.price } });
    await tx.transaction.create({ data: { userId: u.id, type: 'SPEND', amount: -spec.price, description: `vehicle:${spec.brand} ${spec.model}` } });
    return row;
  });
  return NextResponse.json({ ok: true, vehicle: v, cash: save.cash - spec.price });
}
