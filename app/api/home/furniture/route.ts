import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { currentUser, err, serverError } from '../../../../lib/auth';
import { itemById } from '../../../../lib/catalog';
import { resolveHome, resolveView } from '../../../../lib/housemates';
import { HomeBusy, HomeStop, editHome, readHome } from '../../../../lib/homeStore';
import { ensureFurniture, listFurniture, toPiece, toRow } from '../../../../lib/homeFurniture';

export const dynamic = 'force-dynamic';
type T = { x:number; z:number; r:number };
type H = { by?:string; id:string; itemKey:string; name:string; e:string; cat:string; cost:number; condition:number; x:number; z:number; r:number; fp?:[number,number] };
type M = { layout?:Record<string,T>; soldStatic?:string[]; owned?:H[] };
const STATIC: Record<string,number> = { bed:260000, wardrobe:190000, fridge:780000, dining:220000, shower:90000, toilet:80000, tv:650000, desk:90000, mat:25000, radio:38000, shelf:85000, plant:5500, gen:190000, toybox:35000, kbedA:120000, kbedB:120000, nstand:38000, kwar:190000, gbench:140000, gbag:90000, cinema:950000, odesk:480000, oshelf:380000 };
const resale = (c:number, cond=100) => Math.max(0, Math.round(c * .62 * Math.max(.2, Math.min(1, cond / 100))));
const meta = (m:unknown):M => m && typeof m === 'object' && !Array.isArray(m) ? m as M : {};
const rid = () => Math.random().toString(36).slice(2,10) + Date.now().toString(36);
async function getMeta(userId:string) { return meta((await readHome(userId)).meta); }

export async function GET(req: Request) {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.',401);
    const hm = await resolveView(u.id, u.username, new URL(req.url).searchParams.get('visit')); if (!hm) return err('You are not welcome there.',403);
    const m = meta(await ensureFurniture(hm.id)), items = await listFurniture(hm.id);   // the furniture belongs to the house; what you can place comes from YOUR inventory
    const rows = await prisma.inventoryItem.findMany({ where:{userId:u.id,quantity:{gt:0}} });
    const placeable = rows.map(r => { const i=itemById(r.itemKey); return i && !i.use && !['food','grocery','toiletry'].includes(i.cat) ? {itemKey:i.id,name:i.name,e:i.e,cat:i.cat,sub:i.sub,kind:i.kind,cost:i.cost,quantity:r.quantity,fp:i.fp} : null; }).filter(Boolean);
    return NextResponse.json({items,placeable,soldStatic:m.soldStatic||[]});
  } catch(e) { return serverError(e); }
}

export async function POST(req:Request) {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.',401);
    const b = await req.json().catch(() => ({}));
    const action = String(b.action || '');
    const hm = await resolveHome(u.id, u.username);
    const mayTouch = (it:H) => (it.by || hm.id) === u.id;   // you can store or sell what you put there (pieces from before housemates belong to the owner)
    /* Placed pieces are rows in HomeFurniture (lib/homeFurniture.ts): placing is an INSERT, storing and selling are a DELETE that only ONE request can win,
       and refunds and payouts happen only for the winner, so double clicks and housemates acting at once cannot duplicate or double-pay.
       Fixtures sold and the layout stay in the house blob and are written through editHome (lib/homeStore.ts). */
    try {
      await ensureFurniture(hm.id);   // houses saved before the table existed are copied over the first time
      if (action === 'place') {
        const key = String(b.itemKey || '');
        const i = itemById(key);
        if (!i || i.use || ['food','grocery','toiletry'].includes(i.cat)) return err('That item cannot be placed in the house.',400);
        const dec = await prisma.inventoryItem.updateMany({ where:{userId:u.id,itemKey:key,quantity:{gte:1}}, data:{quantity:{decrement:1}} });
        if (!dec.count) return err("You don't own that item.",409);
        const px = Number(b.x), pz = Number(b.z), cl = (v:number, lim:number) => Number.isFinite(v) ? Math.max(-lim, Math.min(lim, Math.round(v*100)/100)) : 0;
        const piece:H = {by:u.id,id:rid(),itemKey:key,name:i.name,e:i.e,cat:i.cat,cost:i.cost,condition:100,x:cl(px,16),z:cl(pz,12),r:0,fp:i.fp};
        try { await prisma.homeFurniture.create({ data: toRow(hm.id, piece) }); }
        catch (e) { await prisma.inventoryItem.updateMany({ where:{userId:u.id,itemKey:key}, data:{quantity:{increment:1}} }).catch(() => null); throw e; }   // it never made it into the house: give it back
        return NextResponse.json({ok:true,items:await listFurniture(hm.id)});
      }

      if (action === 'store' || (action === 'sell' && String(b.kind || '') === 'owned')) {
        const id = String(b.id || ''), row = await prisma.homeFurniture.findFirst({ where:{id,homeId:hm.id} });
        if (!row) return err('Furniture not found.',404);
        const it = toPiece(row);
        if (action === 'store') { if (!mayTouch(it) && hm.id !== u.id) return err('That belongs to a housemate. Ask them to move it.',403); }
        else if (!mayTouch(it)) return err("That isn't yours to sell.",403);
        const del = await prisma.homeFurniture.deleteMany({ where:{id,homeId:hm.id} });   // only one request can win this
        if (!del.count) return err('Furniture not found.',404);
        await editHome(hm.id, m => { const layout = {...(meta(m).layout||{})}; delete layout[id]; return { ...m, layout }; }).catch(() => null);   // tidy its saved position
        if (action === 'store') {
          const back = it.by || hm.id;   // it goes back to whoever bought it
          await prisma.inventoryItem.upsert({ where:{userId_itemKey:{userId:back,itemKey:it.itemKey}}, update:{quantity:{increment:1}}, create:{userId:back,itemKey:it.itemKey,name:it.name,quantity:1} });
          return NextResponse.json({ok:true,items:await listFurniture(hm.id)});
        }
        const gain = resale(it.cost,it.condition);
        await prisma.$transaction([
          prisma.save.update({where:{userId:u.id},data:{cash:{increment:gain}}}),
          prisma.transaction.create({data:{userId:u.id,type:'EARN',amount:gain,description:`home:sell:${it.name}`.slice(0,120)}}),
        ]);
        return NextResponse.json({ok:true,gained:gain,label:it.name});
      }

      if (action === 'sell' && String(b.kind || '') === 'static') {
        const id = String(b.id || ''); let gain = 0;
        if (hm.shared) return err(`Only ${hm.username} can sell the fixtures of this house.`,403);
        const value = STATIC[id] || 0; if (value <= 0) return err('This fixture cannot be sold.',400);
        await editHome(hm.id, m => {
          const mm = meta(m), sold = new Set(mm.soldStatic||[]); if (sold.has(id)) throw new HomeStop('Item already sold.',409);
          sold.add(id); gain = resale(value);
          const layout = {...(mm.layout||{})}; delete layout[id];
          return { ...m, soldStatic:[...sold], layout };
        });
        await prisma.$transaction([
          prisma.save.update({where:{userId:u.id},data:{cash:{increment:gain}}}),
          prisma.transaction.create({data:{userId:u.id,type:'EARN',amount:gain,description:`home:sell:${id}`.slice(0,120)}}),
        ]);
        return NextResponse.json({ok:true,gained:gain,label:id});
      }
      if (action === 'sell') return err('Unknown furniture.');
      return err('Unknown action.');
    } catch (e) {
      if (e instanceof HomeStop) return err(e.msg, e.code);
      if (e instanceof HomeBusy) return err(e.message, 503);
      throw e;
    }
  } catch(e) { return serverError(e); }
}
