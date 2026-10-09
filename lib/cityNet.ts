import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { sanitizeLook, type Look } from './characterModels';

/* Shared, mutable multiplayer state. The 3D scene writes NET.me every frame and reads NET.peers every frame
   (no React re-renders in the hot path). React state only changes when people join/leave or chat. */
export type NetMe = { x: number; z: number; r: number; mv: 0 | 1 | 2; drv: boolean; cp: boolean; cx: number; cz: number; cr: number; call: boolean; anim: string; animUntil: number; hp: number; ko: number; hurt: number; safe: number };
export type NetPeer = {
  look: Look; init: boolean; mv: number; drv: boolean; cp: boolean; call: boolean; anim: string; animUntil: number; ko: boolean;
  x: number; z: number; r: number; tx: number; tz: number; tr: number;
  cx: number; cz: number; cr: number; tcx: number; tcz: number; tcr: number;
};
export const NET = {
  me: { x: 0, z: 16, r: Math.PI, mv: 0, drv: false, cp: false, cx: 0, cz: 0, cr: 0, call: false, anim: '', animUntil: 0, hp: 100, ko: 0, hurt: 0, safe: 0 } as NetMe,
  peers: {} as Record<string, NetPeer>,
  reason: '' as string, // why multiplayer is offline, shown in the chat panel
  msg: '' as string, // one-line toast written by the net layer, shown by the scene
  talk: {} as Record<string, number>, // name -> timestamp until which that player counts as "speaking" (voice chat indicator)
};

/* Fighting: any real player can punch any other real player. Damage is applied on the VICTIM's client; the victim also reports who started it to /api/fight (heat, fine, wanted). */
export const FIGHT = { range: 2.6, dmg: 10, cooldown: 600, koMs: 10_000 };

export const MAX_ROOM = 40;   // players per city instance; the 41st player is moved to instance #2, etc.
const MAX_ROOMS = 50;
const LIM = 150;
const SEND_MS = 200;          // 5 position updates / second, only while someone else is in your instance
const clampN = (v: unknown, d = 0) => (typeof v === 'number' && isFinite(v) ? Math.max(-LIM, Math.min(LIM, v)) : d);
const angle = (v: unknown, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
const r2 = (n: number) => Math.round(n * 100) / 100;
const lookKey = (l: Look) => [l.gender, l.hair, l.hairColor, l.skin, l.outfit, l.pants, l.height, l.outfitModel].join('|');
const blank = (look: Look): NetPeer => ({ look, init: false, mv: 0, drv: false, cp: false, call: false, anim: '', animUntil: 0, ko: false, x: 0, z: 16, r: 0, tx: 0, tz: 16, tr: 0, cx: 0, cz: 0, cr: 0, tcx: 0, tcz: 0, tcr: 0 });

export const INTERACT_RANGE = 10; // metres: how close you must be to wave / high-five / dance with someone
export const ACT_LIST = [['wave', '👋', 'Wave'], ['cheer', '🙌', 'High-five'], ['dance', '💃', 'Dance']] as const;
const ACTS: Record<string, { text: string; reply: string; ms: number }> = {
  wave: { text: 'waved at you', reply: 'Wave back', ms: 3200 },
  cheer: { text: 'wants a high-five', reply: 'High-five!', ms: 3200 },
  dance: { text: 'invited you to dance', reply: 'Dance too', ms: 7000 },
  phone: { text: 'is using their phone', reply: 'Okay', ms: 8000 },
};
export type Notice = { id: number; from: string; k: string; text: string; reply: string };
export type RtcMsg = { u: string; to: string; t: string; d?: any };
export type ChatMsg = { id: number; u: string; t: string };
export type NetStatus = 'off' | 'connecting' | 'online' | 'error';

export function useCityNet(look: Look, onSocial?: (amount?: number) => void) {
  const [roster, setRoster] = useState<string[]>([]);
  const [ver, setVer] = useState(0);
  const [status, setStatus] = useState<NetStatus>(supabase ? 'connecting' : 'off');
  const [room, setRoom] = useState(1);
  const [log, setLog] = useState<ChatMsg[]>([]);
  const [bub, setBub] = useState<Record<string, string>>({});
  const [unread, setUnread] = useState(0);
  const [mutedList, setMutedList] = useState<string[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const rtcSubs = useRef(new Set<(m: RtcMsg) => void>()), lastAct = useRef(0);
  const ch = useRef<RealtimeChannel | null>(null), muted = useRef(new Set<string>()), statusRef = useRef<NetStatus>(status);
  const lastSend = useRef(0), lastIn = useRef<Record<string, number>>({}), seq = useRef(0), lastKey = useRef(''), lastBeat = useRef(0);
  const lookRef = useRef(look), socialRef = useRef(onSocial);
  const lastHitFrom = useRef<Record<string, number>>({}), myHits = useRef<Record<string, number>>({}), aggressor = useRef<Record<string, number>>({}), lastPunch = useRef(0);
  lookRef.current = look; socialRef.current = onSocial; statusRef.current = status;
  const name = look.name, lk = lookKey(look);

  const say = useCallback((u: string, t: string, mine = false) => {
    setLog(l => [...l.slice(-60), { id: ++seq.current, u, t }]);
    if (!mine) setUnread(n => n + 1);
    setBub(b => ({ ...b, [u]: t }));
    setTimeout(() => setBub(b => { if (b[u] !== t) return b; const n = { ...b }; delete n[u]; return n; }), 7000);
  }, []);

  // the victim tells the server who started it: the aggressor gets heat (wanted), a knockout also costs a fine that is paid to the victim
  const report = useCallback(async (kind: 'assault' | 'ko', attacker: string) => {
    try {
      const r = await fetch('/api/fight', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, attacker }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ignored) return;
      if (kind === 'ko' && d.fine) NET.msg = `🩹 ${attacker} was fined ₦${Number(d.fine).toLocaleString()} for knocking you out`;
      ch.current?.send({ type: 'broadcast', event: 'fx', payload: { u: name, to: attacker, t: kind === 'ko' ? `🚨 You knocked out ${name}: fined ₦${Number(d.fine || 0).toLocaleString()}${d.wanted ? ' and now WANTED' : ''}` : `⚠️ You attacked ${name}: police can now see you as a suspect` } });
    } catch {}
  }, [name]);
  const punch = useCallback((to: string) => {
    const now = Date.now(); if (now - lastPunch.current < FIGHT.cooldown || NET.me.ko > now) return false;
    lastPunch.current = now; NET.me.anim = 'punch'; NET.me.animUntil = now + 450;
    if (to) myHits.current[to] = now;
    ch.current?.send({ type: 'broadcast', event: 'hit', payload: { u: name, to } });
    return true;
  }, [name]);

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
          p.mv = payload.m === 2 ? 2 : payload.m === 1 ? 1 : 0; p.drv = !!payload.d; p.cp = !!payload.p; p.call = !!payload.c; p.ko = !!payload.k;
          p.tcx = clampN(payload.cx); p.tcz = clampN(payload.cz); p.tcr = angle(payload.cr, p.tcr);
          if (!p.init) { p.init = true; p.x = p.tx; p.z = p.tz; p.r = p.tr; p.cx = p.tcx; p.cz = p.tcz; p.cr = p.tcr; }
        })
        .on('broadcast', { event: 'act' }, ({ payload }) => {
          if (cur !== c) return;
          const u = String(payload?.u), k = String(payload?.k), a = ACTS[k], p = NET.peers[u];
          if (!a || !p || muted.current.has(u)) return;
          p.anim = k; p.animUntil = Date.now() + a.ms;
          if (payload.to === name) {
            const id = ++seq.current;
            setNotices(l => [...l.slice(-2), { id, from: u, k, text: a.text, reply: a.reply }]);
            setTimeout(() => setNotices(l => l.filter(n => n.id !== id)), 9000);
            socialRef.current?.(3);
          }
        })
        .on('broadcast', { event: 'hit' }, ({ payload }) => {
          if (cur !== c) return;
          const u = String(payload?.u), p = NET.peers[u]; if (!p) return;
          const now = Date.now(); p.anim = 'punch'; p.animUntil = now + 450;           // everybody sees the swing
          if (payload.to !== name || muted.current.has(u)) return;
          const m = NET.me; if (m.ko > now || m.safe > now) return;                    // already down / just woke up
          if (now - (lastHitFrom.current[u] || 0) < FIGHT.cooldown * .55) return;     // rate limit per attacker
          if (Math.hypot(p.x - m.x, p.z - m.z) > FIGHT.range + 3.5) return;           // must really be next to me
          lastHitFrom.current[u] = now;
          const retaliating = (myHits.current[u] || 0) > now - 20_000;                 // I hit them first -> a mutual brawl, nobody is reported
          m.hp = Math.max(0, m.hp - FIGHT.dmg); m.hurt = now;
          if (!retaliating && !aggressor.current[u]) { aggressor.current[u] = now; NET.msg = `👊 ${u} attacked you!`; report('assault', u); }
          if (m.hp <= 0) {
            m.ko = now + FIGHT.koMs; NET.msg = `😵 ${u} knocked you out!`;
            if (aggressor.current[u] && now - aggressor.current[u] < 120_000) report('ko', u);
          }
        })
        .on('broadcast', { event: 'fx' }, ({ payload }) => {
          if (cur !== c || payload?.to !== name || typeof payload?.t !== 'string') return;
          NET.msg = payload.t.slice(0, 140);
        })
        .on('broadcast', { event: 'rtc' }, ({ payload }) => {
          if (cur !== c || (payload?.to !== name && payload?.to !== '*') || typeof payload?.u !== 'string') return;
          rtcSubs.current.forEach(f => f(payload as RtcMsg));
        })
        .on('broadcast', { event: 'chat' }, ({ payload }) => {
          if (cur !== c) return;
          const u = String(payload?.u), t = String(payload?.t || '').trim().slice(0, 120), now = Date.now();
          if (!t || u === name || muted.current.has(u) || now - (lastIn.current[u] || 0) < 120) return; // accept chat even if their position has not arrived yet
          lastIn.current[u] = now; say(u, t);
        })
        .subscribe(async s => {
          if (cur !== c || dead) return;
          if (s === 'SUBSCRIBED') { await c.track({ look: lookRef.current }); NET.reason = ''; if (decided) setStatus('online'); } // coming back after a dropped connection must flip the status back to online
          else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
            NET.reason = s === 'TIMED_OUT' ? 'Realtime timed out (slow or blocked network). Retrying…' : 'Realtime refused the connection. Check NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel and that Supabase → Realtime → Settings allows public access. Retrying…';
            setStatus('error');
            setTimeout(() => { if (cur === c && !dead && statusRef.current === 'error') { sb.removeChannel(c); join(n); } }, 8000); // never stay dead until a page reload
          }
        });
    };
    join(1);
    return () => { dead = true; if (cur) sb.removeChannel(cur); ch.current = null; NET.peers = {}; setRoster([]); };
  }, [name, say, report]);

  // outfit / hair changes: update presence without reconnecting
  useEffect(() => { if (statusRef.current === 'online') ch.current?.track({ look: lookRef.current }); }, [lk]);

  // position broadcast loop (skipped while you are alone, to save realtime quota)
  useEffect(() => {
    if (!supabase) return;
    const id = setInterval(() => {
      const c = ch.current; if (!c || statusRef.current !== 'online' || !Object.keys(NET.peers).length) return;
      const m = NET.me, now = Date.now();
      const pl = { u: name, x: r2(m.x), z: r2(m.z), r: r2(m.r), m: m.mv, d: m.drv, p: m.cp, cx: r2(m.cx), cz: r2(m.cz), cr: r2(m.cr), c: m.call, k: m.ko > now ? 1 : 0 };
      const key = `${pl.x}|${pl.z}|${pl.r}|${pl.m}|${pl.d}|${pl.p}|${pl.cx}|${pl.cz}|${pl.cr}|${pl.c}|${pl.k}`;
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
    if (!t || now - lastSend.current < 350) return false;
    const c = ch.current;
    if (!c || statusRef.current === 'off') { NET.msg = 'Chat is offline: multiplayer is not connected.'; return false; }
    if (statusRef.current === 'error') { NET.msg = 'City chat is offline: cannot reach the realtime server. Retrying…'; return false; } // keep the text in the box instead of losing it
    lastSend.current = now; say(name, t, true);
    if (!Object.keys(NET.peers).length) NET.msg = 'Nobody else is in this city right now, so no one received that.';
    Promise.resolve(c.send({ type: 'broadcast', event: 'chat', payload: { u: name, t } })).then(r => { if (r && r !== 'ok') NET.msg = 'Message not delivered. Check your connection.'; }).catch(() => { NET.msg = 'Message not delivered. Check your connection.'; });
    return true;
  }, [name, say]);
  const toggleMute = useCallback((u: string) => {
    if (muted.current.has(u)) muted.current.delete(u); else muted.current.add(u);
    setMutedList([...muted.current]);
  }, []);
  const clearUnread = useCallback(() => setUnread(0), []);
  const signal = useCallback((to: string, t: string, d?: any) => { ch.current?.send({ type: 'broadcast', event: 'rtc', payload: { u: name, to, t, d } }); }, [name]);
  const subscribeRtc = useCallback((f: (m: RtcMsg) => void) => { rtcSubs.current.add(f); return () => { rtcSubs.current.delete(f); }; }, []);
  const act = useCallback((k: string, to?: string) => {
    const a = ACTS[k], now = Date.now(); if (!a || now - lastAct.current < 1500) return false;
    lastAct.current = now; NET.me.anim = k; NET.me.animUntil = now + a.ms;
    ch.current?.send({ type: 'broadcast', event: 'act', payload: { u: name, to: to || '', k } });
    socialRef.current?.(to ? 3 : 1); return true;
  }, [name]);
  useEffect(() => { const f = () => { const a = ACTS.phone, now = Date.now(); NET.me.anim = 'phone'; NET.me.animUntil = now + a.ms; ch.current?.send({ type: 'broadcast', event: 'act', payload: { u: name, to: '', k: 'phone' } }); }; window.addEventListener('arl-phone-use', f); return () => window.removeEventListener('arl-phone-use', f); }, [name]);
  const dismissNotice = useCallback((id: number) => setNotices(l => l.filter(n => n.id !== id)), []);
  return { name, status, room, roster, ver, log, bub, unread, clearUnread, send, muted: mutedList, toggleMute, enabled: !!supabase, signal, subscribeRtc, act, notices, dismissNotice, punch };
}
