import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { currentUser, err, serverError } from '../../../../lib/auth';
import { itemById } from '../../../../lib/catalog';

export const dynamic = 'force-dynamic';
type T = { x:number; z:number; r:number };
type H = { id:string; itemKey:string; name:string; e:string; cat:string; cost:number; condition:number; x:number; z:number; r:number; fp?:[number,number] };
type M = { layout?:Record<string,T>; soldStatic?:string[]; owned?:H[] };
const KEY = 'home_layout';
const STATIC: Record<string,number> = { bed:260000, wardrobe:190000, fridge:780000, dining:220000, shower:90000, toilet:80000, tv:650000, desk:90000, mat:25000, radio:38000, shelf:85000, plant:5500, gen:190000, toybox:35000, kbedA:120000, kbedB:120000, nstand:38000, kwar:190000, gbench:140000, gbag:90000, cinema:950000, odesk:480000, oshelf:380000 };
const resale = (c:number, cond=100) => Math.max(0, Math.round(c * .62 * Math.max(.2, Math.min(1, cond / 100))));
const meta = (m:unknown):M => m && typeof m === 'object' && !Array.isArray(m) ? m as M : {};
const rid = () => Math.random().toString(36).slice(2,10) + Date.now().toString(36);
async function getMeta(userId:string) { const r = await prisma.inventoryItem.findUnique({ where:{userId_itemKey:{userId,itemKey:KEY}}, select:{metadata:true} }); return meta(r?.metadata); }
async function putMeta(userId:string, m:M) { await prisma.inventoryItem.upsert({ where:{userId_itemKey:{userId,itemKey:KEY}}, create:{userId,itemKey:KEY,name:'Home layout',quantity:1,metadata:m}, update:{metadata:m} }); }

export async function GET() {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.',401);
    const m = await getMeta(u.id);
    const rows = await prisma.inventoryItem.findMany({ where:{userId:u.id,quantity:{gt:0}} });
    const placeable = rows.map(r => { const i=itemById(r.itemKey); return i && !i.use && !['food','grocery','toiletry'].includes(i.cat) ? {itemKey:i.id,name:i.name,e:i.e,cat:i.cat,cost:i.cost,quantity:r.quantity,fp:i.fp} : null; }).filter(Boolean);
    return NextResponse.json({items:m.owned||[],placeable,soldStatic:m.soldStatic||[]});
  } catch(e) { return serverError(e); }
}

export async function POST(req:Request) {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.',401);
    const b = await req.json().catch(() => ({}));
    const action = String(b.action || '');
    const m = await getMeta(u.id);

    if (action === 'place') {
      const key = String(b.itemKey || '');
      const i = itemById(key);
      if (!i || i.use || ['food','grocery','toiletry'].includes(i.cat)) return err('That item cannot be placed in the house.',400);
      const dec = await prisma.inventoryItem.updateMany({ where:{userId:u.id,itemKey:key,quantity:{gte:1}}, data:{quantity:{decrement:1}} });
      if (!dec.count) return err("You don't own that item.",409);
      const items = [...(m.owned||[]), {id:rid(),itemKey:key,name:i.name,e:i.e,cat:i.cat,cost:i.cost,condition:100,x:0,z:0,r:0,fp:i.fp}];
      await putMeta(u.id,{...m,owned:items});
      return NextResponse.json({ok:true,items});
    }

    if (action === 'sell') {
      const kind = String(b.kind || ''), id = String(b.id || '');
      let gain = 0, label = '';
      if (kind === 'owned') {
        const items = [...(m.owned||[])], idx = items.findIndex(x => x.id === id);
        if (idx < 0) return err('Furniture not found.',404);
        const it = items[idx]; gain = resale(it.cost,it.condition); label = it.name; items.splice(idx,1);
        await putMeta(u.id,{...m,owned:items});
      } else if (kind === 'static') {
        const sold = new Set(m.soldStatic||[]); if (sold.has(id)) return err('Item already sold.',409);
        const value = STATIC[id] || 0; if (value <= 0) return err('This fixture cannot be sold.',400);
        sold.add(id); gain = resale(value); label = id;
        const layout = {...(m.layout||{})}; delete layout[id];
        await putMeta(u.id,{...m,soldStatic:[...sold],layout});
      } else return err('Unknown furniture.');
      await prisma.$transaction([
        prisma.save.update({where:{userId:u.id},data:{cash:{increment:gain}}}),
        prisma.transaction.create({data:{userId:u.id,type:'EARN',amount:gain,description:`home:sell:${label}`.slice(0,120)}}),
      ]);
      return NextResponse.json({ok:true,gained:gain,label});
    }
    return err('Unknown action.');
  } catch(e) { return serverError(e); }
}
