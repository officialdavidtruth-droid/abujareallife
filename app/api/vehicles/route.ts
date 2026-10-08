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
  if (action !== 'buy') {
    const vehicle = await prisma.vehicle.findFirst({ where: { userId: u.id, id: String(body.vehicleId || '') } });
    if (!vehicle) return err('Vehicle not found.', 404);
    const costs: Record<string,number> = { register: 250000, insure: 180000, repair: Math.max(50000, Math.round((100-vehicle.condition)*vehicle.price*.012)), refuel: Math.max(15000, Math.round((100-vehicle.fuel)*1200)) };
    const cost = costs[action]; if (!cost) return err('Unknown vehicle action.',400); if (save.cash < cost) return err(`You need ₦${cost.toLocaleString()}.`,402);
    const data:any = action==='register'?{registered:true}:action==='insure'?{insured:true}:action==='repair'?{condition:100}:action==='refuel'?{fuel:100}:{};
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
