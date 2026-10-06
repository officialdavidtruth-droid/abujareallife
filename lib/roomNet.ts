import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { sanitizeLook, type Look } from './characterModels';

/* Shared building rooms: one realtime channel per building (room:<id>). Everyone inside the same building sees each other,
   can chat, and police can arrest wanted players who are in the room. Mutable state is read every frame by the 3D scene. */
export type RoomPeer = { look: Look; mv: number; w: number; init: boolean; x: number; z: number; r: number; tx: number; tz: number; tr: number };
/* w = 0 when idle, else ±(post index + 1): positive plays the work animation, negative just occupies the post. */
export const ROOM = { me: { x: 0, z: 0, r: 0, mv: 0, w: 0 }, peers: {} as Record<string, RoomPeer> };
export const ROOM_MAX = 30;
const num = (v: unknown, lim: number, d = 0) => (typeof v === 'number' && isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : d);
const lookKey = (l: Look) => [l.gender, l.hair, l.hairColor, l.skin, l.outfit, l.pants, l.height, l.outfitModel].join('|');
export type RoomMsg = { id: number; u: string; t: string };

export function useRoomNet(roomId: string, look: Look) {
  const [roster, setRoster] = useState<string[]>([]), [ver, setVer] = useState(0), [log, setLog] = useState<RoomMsg[]>([]), [bub, setBub] = useState<Record<string, string>>({});
  const ch = useRef<RealtimeChannel | null>(null), seq = useRef(0), lastIn = useRef<Record<string, number>>({}), lastSend = useRef(0), lastPos = useRef(0), lookRef = useRef(look);
  lookRef.current = look; const name = look.name;
  const say = useCallback((u: string, t: string) => {
    setLog(l => [...l.slice(-30), { id: ++seq.current, u, t }]); setBub(b => ({ ...b, [u]: t }));
    setTimeout(() => setBub(b => { if (b[u] !== t) return b; const n = { ...b }; delete n[u]; return n; }), 6000);
  }, []);
  useEffect(() => {
    const sb = supabase; if (!sb) return; let dead = false;
    const c = sb.channel(`room:${roomId}`, { config: { presence: { key: name }, broadcast: { self: false } } });
    ch.current = c; ROOM.peers = {};
    c.on('presence', { event: 'sync' }, () => {
      if (dead) return; const st = c.presenceState() as Record<string, { look?: Partial<Look> }[]>, names = Object.keys(st); let changed = false;
      if (names.length > ROOM_MAX && names.indexOf(name) >= ROOM_MAX) return; // room full: you still see the room but are not announced
      names.forEach(k => { if (k === name) return; const l = sanitizeLook(st[k]?.[0]?.look, k.slice(0, 24)), p = ROOM.peers[k];
        if (!p) { ROOM.peers[k] = { look: l, mv: 0, w: 0, init: false, x: 0, z: 0, r: 0, tx: 0, tz: 0, tr: 0 }; changed = true; } else if (lookKey(p.look) !== lookKey(l)) { p.look = l; changed = true; } });
      Object.keys(ROOM.peers).forEach(k => { if (!names.includes(k)) { delete ROOM.peers[k]; changed = true; } });
      setRoster(names.filter(k => k !== name)); if (changed) setVer(v => v + 1);
    }).on('broadcast', { event: 'pos' }, ({ payload }) => {
      const p = ROOM.peers[String(payload?.u)]; if (!p) return;
      p.tx = num(payload.x, 40); p.tz = num(payload.z, 40); p.tr = num(payload.r, 7); p.mv = payload.m ? 1 : 0; p.w = Math.round(num(payload.w, 99));
      if (!p.init) { p.init = true; p.x = p.tx; p.z = p.tz; p.r = p.tr; }
    }).on('broadcast', { event: 'chat' }, ({ payload }) => {
      const u = String(payload?.u), t = String(payload?.t || '').trim().slice(0, 120), now = Date.now();
      if (!t || !ROOM.peers[u] || now - (lastIn.current[u] || 0) < 900) return; lastIn.current[u] = now; say(u, t);
    }).subscribe(async s => { if (s === 'SUBSCRIBED' && !dead) await c.track({ look: lookRef.current }); });
    const beat = setInterval(() => { // 5 position updates/second, only when someone else is here
      const now = Date.now(); if (!Object.keys(ROOM.peers).length || now - lastPos.current < 190) return; lastPos.current = now;
      c.send({ type: 'broadcast', event: 'pos', payload: { u: name, x: Math.round(ROOM.me.x * 100) / 100, z: Math.round(ROOM.me.z * 100) / 100, r: Math.round(ROOM.me.r * 100) / 100, m: ROOM.me.mv, w: ROOM.me.w } });
    }, 200);
    return () => { dead = true; clearInterval(beat); sb.removeChannel(c); ch.current = null; ROOM.peers = {}; setRoster([]); };
  }, [roomId, name, say]);
  const send = useCallback((t: string) => {
    const s = t.trim().slice(0, 120), now = Date.now(); if (!s || now - lastSend.current < 1200) return false; lastSend.current = now;
    say(name, s); ch.current?.send({ type: 'broadcast', event: 'chat', payload: { u: name, t: s } }); return true;
  }, [name, say]);
  return { roster, ver, log, bub, send, enabled: !!supabase };
}
