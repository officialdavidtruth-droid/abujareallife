import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { currentUser, err, serverError } from '../../../../lib/auth';
import { itemById } from '../../../../lib/catalog';
import { resolveHome, resolveView } from '../../../../lib/housemates';
import { HomeBusy, HomeStop, editHome, readHome } from '../../../../lib/homeStore';

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
    const m = await getMeta(hm.id);   // the furniture belongs to the house; what you can place comes from YOUR inventory
    const rows = await prisma.inventoryItem.findMany({ where:{userId:u.id,quantity:{gt:0}} });
    const placeable = rows.map(r => { const i=itemById(r.itemKey); return i && !i.use && !['food','grocery','toiletry'].includes(i.cat) ? {itemKey:i.id,name:i.name,e:i.e,cat:i.cat,sub:i.sub,kind:i.kind,cost:i.cost,quantity:r.quantity,fp:i.fp} : null; }).filter(Boolean);
    return NextResponse.json({items:m.owned||[],placeable,soldStatic:m.soldStatic||[]});
  } catch(e) { return serverError(e); }
}

export async function POST(req:Request) {
  try {
    const u = await currentUser(); if (!u) return err('Not signed in.',401);
    const b = await req.json().catch(() => ({}));
    const action = String(b.action || '');
    const hm = await resolveHome(u.id, u.username);
    const mayTouch = (it:H) => (it.by || hm.id) === u.id;   // you can store or sell what you put there (pieces from before housemates belong to the owner)
    /* Every change goes through editHome (lib/homeStore.ts): it re-reads the house and retries if a housemate saved at the same moment, so nothing is lost,
       and a piece that was already stored or sold by someone else is simply "not found" here (no double refunds). Money and inventory move only AFTER the change committed. */
    try {
      if (action === 'place') {
        const key = String(b.itemKey || '');
        const i = itemById(key);
        if (!i || i.use || ['food','grocery','toiletry'].includes(i.cat)) return err('That item cannot be placed in the house.',400);
        const dec = await prisma.inventoryItem.updateMany({ where:{userId:u.id,itemKey:key,quantity:{gte:1}}, data:{quantity:{decrement:1}} });
        if (!dec.count) return err("You don't own that item.",409);
        const px = Number(b.x), pz = Number(b.z), cl = (v:number, lim:number) => Number.isFinite(v) ? Math.max(-lim, Math.min(lim, Math.round(v*100)/100)) : 0;
        const piece:H = {by:u.id,id:rid(),itemKey:key,name:i.name,e:i.e,cat:i.cat,cost:i.cost,condition:100,x:cl(px,16),z:cl(pz,12),r:0,fp:i.fp};
        try {
          const next = await editHome(hm.id, m => ({ ...m, owned: [...meta(m).owned||[], piece] }));
          return NextResponse.json({ok:true,items:meta(next).owned||[]});
        } catch (e) { await prisma.inventoryItem.updateMany({ where:{userId:u.id,itemKey:key}, data:{quantity:{increment:1}} }).catch(() => null); throw e; }   // it never made it into the house: give it back
      }

      if (action === 'store') {   // put a placed piece back in your inventory (nothing is sold, it can be placed again)
        const id = String(b.id || ''); let gone:H|undefined;
        const next = await editHome(hm.id, m => {
          const mm = meta(m), items = [...(mm.owned||[])], idx = items.findIndex(x => x.id === id);
          if (idx < 0) throw new HomeStop('Furniture not found.',404);
          const it = items[idx];
          if (!mayTouch(it) && hm.id !== u.id) throw new HomeStop('That belongs to a housemate. Ask them to move it.',403);
          items.splice(idx,1); gone = it;
          const layout = {...(mm.layout||{})}; delete layout[id];
          return { ...m, owned: items, layout };
        });
        if (gone) { const back = gone.by || hm.id; await prisma.inventoryItem.upsert({ where:{userId_itemKey:{userId:back,itemKey:gone.itemKey}}, update:{quantity:{increment:1}}, create:{userId:back,itemKey:gone.itemKey,name:gone.name,quantity:1} }); }   // it goes back to whoever bought it
        return NextResponse.json({ok:true,items:meta(next).owned||[]});
      }

      if (action === 'sell') {
        const kind = String(b.kind || ''), id = String(b.id || '');
        let gain = 0, label = '';
        if (kind === 'owned') {
          await editHome(hm.id, m => {
            const mm = meta(m), items = [...(mm.owned||[])], idx = items.findIndex(x => x.id === id);
            if (idx < 0) throw new HomeStop('Furniture not found.',404);
            const it = items[idx];
            if (!mayTouch(it)) throw new HomeStop("That isn't yours to sell.",403);
            gain = resale(it.cost,it.condition); label = it.name; items.splice(idx,1);
            return { ...m, owned: items };
          });
        } else if (kind === 'static') {
          if (hm.shared) return err(`Only ${hm.username} can sell the fixtures of this house.`,403);
          const value = STATIC[id] || 0; if (value <= 0) return err('This fixture cannot be sold.',400);
          await editHome(hm.id, m => {
            const mm = meta(m), sold = new Set(mm.soldStatic||[]); if (sold.has(id)) throw new HomeStop('Item already sold.',409);
            sold.add(id); gain = resale(value); label = id;
            const layout = {...(mm.layout||{})}; delete layout[id];
            return { ...m, soldStatic:[...sold], layout };
          });
        } else return err('Unknown furniture.');
        await prisma.$transaction([
          prisma.save.update({where:{userId:u.id},data:{cash:{increment:gain}}}),
          prisma.transaction.create({data:{userId:u.id,type:'EARN',amount:gain,description:`home:sell:${label}`.slice(0,120)}}),
        ]);
        return NextResponse.json({ok:true,gained:gain,label});
      }
      return err('Unknown action.');
    } catch (e) {
      if (e instanceof HomeStop) return err(e.msg, e.code);
      if (e instanceof HomeBusy) return err(e.message, 503);
      throw e;
    }
  } catch(e) { return serverError(e); }
}
