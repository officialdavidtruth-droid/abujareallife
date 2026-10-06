import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { sanitizeLook, type Look } from './characterModels';

/* Shared, mutable multiplayer state. The 3D scene writes NET.me every frame and reads NET.peers every frame
   (no React re-renders in the hot path). React state only changes when people join/leave or chat. */
export type NetMe = { x: number; z: number; r: number; mv: 0 | 1 | 2; drv: boolean; cp: boolean; cx: number; cz: number; cr: number };
export type NetPeer = {
  look: Look; init: boolean; mv: number; drv: boolean; cp: boolean;
  x: number; z: number; r: number; tx: number; tz: number; tr: number;
  cx: number; cz: number; cr: number; tcx: number; tcz: number; tcr: number;
};
export const NET = {
  me: { x: 0, z: 16, r: Math.PI, mv: 0, drv: false, cp: false, cx: 0, cz: 0, cr: 0 } as NetMe,
  peers: {} as Record<string, NetPeer>,
};

export const MAX_ROOM = 40;   // players per city instance; the 41st player is moved to instance #2, etc.
const MAX_ROOMS = 50;
const LIM = 150;
const SEND_MS = 200;          // 5 position updates / second, only while someone else is in your instance
const clampN = (v: unknown, d = 0) => (typeof v === 'number' && isFinite(v) ? Math.max(-LIM, Math.min(LIM, v)) : d);
const angle = (v: unknown, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
const r2 = (n: number) => Math.round(n * 100) / 100;
const lookKey = (l: Look) => [l.gender, l.hair, l.hairColor, l.skin, l.outfit, l.pants, l.height].join('|');
const blank = (look: Look): NetPeer => ({ look, init: false, mv: 0, drv: false, cp: false, x: 0, z: 16, r: 0, tx: 0, tz: 16, tr: 0, cx: 0, cz: 0, cr: 0, tcx: 0, tcz: 0, tcr: 0 });

export type ChatMsg = { id: number; u: string; t: string };
export type NetStatus = 'off' | 'connecting' | 'online' | 'error';

export function useCityNet(look: Look, onSocial?: () => void) {
  const [roster, setRoster] = useState<string[]>([]);
  const [ver, setVer] = useState(0);
  const [status, setStatus] = useState<NetStatus>(supabase ? 'connecting' : 'off');
  const [room, setRoom] = useState(1);
  const [log, setLog] = useState<ChatMsg[]>([]);
  const [bub, setBub] = useState<Record<string, string>>({});
  const [unread, setUnread] = useState(0);
  const [mutedList, setMutedList] = useState<string[]>([]);
  const ch = useRef<RealtimeChannel | null>(null), muted = useRef(new Set<string>()), statusRef = useRef<NetStatus>(status);
  const lastSend = useRef(0), lastIn = useRef<Record<string, number>>({}), seq = useRef(0), lastKey = useRef(''), lastBeat = useRef(0);
  const lookRef = useRef(look), socialRef = useRef(onSocial);
  lookRef.current = look; socialRef.current = onSocial; statusRef.current = status;
  const name = look.name, lk = lookKey(look);

  const say = useCallback((u: string, t: string, mine = false) => {
    setLog(l => [...l.slice(-60), { id: ++seq.current, u, t }]);
    if (!mine) setUnread(n => n + 1);
    setBub(b => ({ ...b, [u]: t }));
    setTimeout(() => setBub(b => { if (b[u] !== t) return b; const n = { ...b }; delete n[u]; return n; }), 7000);
  }, []);

  // join a city instance (room); if it is full, hop to the next one
  useEffect(() => {
    const sb = supabase; if (!sb) return;
    let dead = false, cur: RealtimeChannel | null = null;
    const join = (n: number) => {
      if (dead) return;
      setStatus('connecting');
      const c = sb.channel(`city:abuja-${n}`, { config: { presence: { key: name }, broadcast: { self: false } } });
      cur = c; ch.current = c; NET.peers = {};
      let decided = false;
      c.on('presence', { event: 'sync' }, () => {
        if (cur !== c || dead) return;
        const st = c.presenceState() as Record<string, { look?: Partial<Look> }[]>, names = Object.keys(st);
        if (!decided && names.includes(name)) {
          if (names.length > MAX_ROOM && n < MAX_ROOMS) { sb.removeChannel(c); join(n + 1); return; }
          decided = true; setRoom(n); setStatus('online');
        }
        let changed = false;
        names.forEach(k => {
          if (k === name) return;
          const l = sanitizeLook(st[k]?.[0]?.look, k.slice(0, 24)), p = NET.peers[k];
          if (!p) { NET.peers[k] = blank(l); lastKey.current = ''; changed = true; }
          else if (lookKey(p.look) !== lookKey(l)) { p.look = l; changed = true; }
        });
        Object.keys(NET.peers).forEach(k => { if (!names.includes(k)) { delete NET.peers[k]; changed = true; } });
        setRoster(names.filter(k => k !== name));
        if (changed) setVer(v => v + 1);
      })
        .on('broadcast', { event: 'pos' }, ({ payload }) => {
          if (cur !== c) return;
          const p = NET.peers[String(payload?.u)]; if (!p) return;
          p.tx = clampN(payload.x); p.tz = clampN(payload.z, 16); p.tr = angle(payload.r, p.tr);
          p.mv = payload.m === 2 ? 2 : payload.m === 1 ? 1 : 0; p.drv = !!payload.d; p.cp = !!payload.p;
          p.tcx = clampN(payload.cx); p.tcz = clampN(payload.cz); p.tcr = angle(payload.cr, p.tcr);
          if (!p.init) { p.init = true; p.x = p.tx; p.z = p.tz; p.r = p.tr; p.cx = p.tcx; p.cz = p.tcz; p.cr = p.tcr; }
        })
        .on('broadcast', { event: 'chat' }, ({ payload }) => {
          if (cur !== c) return;
          const u = String(payload?.u), t = String(payload?.t || '').trim().slice(0, 120), now = Date.now();
          if (!t || !NET.peers[u] || muted.current.has(u) || now - (lastIn.current[u] || 0) < 900) return;
          lastIn.current[u] = now; say(u, t);
        })
        .subscribe(async s => {
          if (cur !== c || dead) return;
          if (s === 'SUBSCRIBED') await c.track({ look: lookRef.current });
          else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') setStatus('error');
        });
    };
    join(1);
    return () => { dead = true; if (cur) sb.removeChannel(cur); ch.current = null; NET.peers = {}; setRoster([]); };
  }, [name, say]);

  // outfit / hair changes: update presence without reconnecting
  useEffect(() => { if (statusRef.current === 'online') ch.current?.track({ look: lookRef.current }); }, [lk]);

  // position broadcast loop (skipped while you are alone, to save realtime quota)
  useEffect(() => {
    if (!supabase) return;
    const id = setInterval(() => {
      const c = ch.current; if (!c || statusRef.current !== 'online' || !Object.keys(NET.peers).length) return;
      const m = NET.me, now = Date.now();
      const pl = { u: name, x: r2(m.x), z: r2(m.z), r: r2(m.r), m: m.mv, d: m.drv, p: m.cp, cx: r2(m.cx), cz: r2(m.cz), cr: r2(m.cr) };
      const key = `${pl.x}|${pl.z}|${pl.r}|${pl.m}|${pl.d}|${pl.p}|${pl.cx}|${pl.cz}|${pl.cr}`;
      if (key === lastKey.current && now - lastBeat.current < 2500) return;
      lastKey.current = key; lastBeat.current = now;
      c.send({ type: 'broadcast', event: 'pos', payload: pl });
    }, SEND_MS);
    return () => clearInterval(id);
  }, [name]);

  // standing near other real players fills the Social need
  useEffect(() => {
    const id = setInterval(() => {
      const m = NET.me;
      if (Object.values(NET.peers).some(p => Math.hypot(p.x - m.x, p.z - m.z) < 7)) socialRef.current?.();
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const send = useCallback((txt: string) => {
    const t = txt.trim().slice(0, 120), now = Date.now();
    if (!t || now - lastSend.current < 1200) return false;
    lastSend.current = now; say(name, t, true);
    ch.current?.send({ type: 'broadcast', event: 'chat', payload: { u: name, t } });
    return true;
  }, [name, say]);
  const toggleMute = useCallback((u: string) => {
    if (muted.current.has(u)) muted.current.delete(u); else muted.current.add(u);
    setMutedList([...muted.current]);
  }, []);
  const clearUnread = useCallback(() => setUnread(0), []);
  return { status, room, roster, ver, log, bub, unread, clearUnread, send, muted: mutedList, toggleMute, enabled: !!supabase };
}
