import { NET, type NetPeer } from '../lib/cityNet';
import type { Look } from '../lib/characterModels';
import { GAME, VEH } from './cityShared';

/* Ride-along: a friend rides in YOUR car (up to 3), or a couple shares one taxi (1 guest).
   No server tables: it is a consent handshake over the realtime channel, and everyone's position keeps flowing through the normal "pos" broadcast.

   host  = the player whose vehicle it is (driving their own car, or sitting in a taxi / being driven).
   guest = a player who is carried along. Their screen follows the host's vehicle, their body is hidden, and everybody draws them sitting inside it.
   Messages (event "seat"):  invite (host -> friend) · ask (friend -> host) · join (friend accepts an invite) · seated (host -> friend: you are in, seat n)
                             leave (guest gets out) · drop (host stops, everyone out) · no (refused, with a reason) */

export type PaxKind = 'car' | 'taxi';
export const PAX_MAX: Record<PaxKind, number> = { car: 3, taxi: 1 };

export const PAX = {
  me: '', look: null as Look | null,                       // my own name and look (set by the scene)
  host: '', kind: '' as '' | PaxKind, seat: 0,              // guest side: whose vehicle I ride in
  guests: {} as Record<string, { seat: number; at: number; seen: number }>,   // host side: who rides with me
  invited: {} as Record<string, number>,                    // host side: friends I invited (until when they may join)
  pending: {} as Record<string, number>,                    // guest side: hosts I asked / accepted (until when a "seated" is believed)
  wantOut: false, forced: false, msg: '',                   // guest side: leave on the next frame
  lost: 0, spd: 0, lx: 0, lz: 0, px: 0, pz: 0, pr: 0,       // guest side: how long the host has been missing, host speed, last host pose
  off: 0, ver: 0,                                           // host side: how long I have been out of a vehicle; change counter
};

export const paxChanged = () => { PAX.ver++; if (typeof window !== 'undefined') window.dispatchEvent(new Event('arl-pax')); };
export const paxSend = (to: string, k: string, extra: { kind?: PaxKind; seat?: number; r?: string } = {}) => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('arl-seat-out', { detail: { to, k, ...extra } })); };

export type Pose = { x: number; z: number; r: number };

/** Where a player's vehicle is right now (null = they are not in one). For a taxi ride x / z / r ARE the vehicle; for a car it is the car's own pose. */
export const poseOf = (q: NetPeer): Pose | null => (q.rd ? { x: q.x, z: q.z, r: q.r } : q.drv ? { x: q.cx, z: q.cz, r: q.cr } : null);

/** What kind of vehicle I am the host of right now ('' = none): my own car while I drive it, or a taxi that has really set off. */
export function hostKind(): '' | PaxKind {
  const r = GAME.ride;
  if (r) return !r.pax && r.kind === 'taxi' && r.vOn && !r.exiting ? 'taxi' : '';
  return VEH.drv ? 'car' : '';
}

export const paxBusy = () => !!(PAX.host || GAME.ride || VEH.drv || GAME.jailed || NET.me.ko > Date.now());

/** Everybody sitting in `host`'s vehicle (other players, and me when I am the guest). */
export function guestsOf(host: string): { name: string; look: Look; seat: number }[] {
  const out: { name: string; look: Look; seat: number }[] = [];
  for (const [n, q] of Object.entries(NET.peers)) if (q.pa === host && n !== host) out.push({ name: n, look: q.look, seat: q.ps });
  if (PAX.host === host && PAX.look) out.push({ name: PAX.me, look: PAX.look, seat: PAX.seat });
  return out.sort((a, b) => a.seat - b.seat);
}
export const guestKey = (host: string) => guestsOf(host).map(g => g.name + ':' + g.seat).join(',');

/** Host: let a friend in. Returns why not, or null when they are seated (they are told with a "seated" message). */
export function admit(friend: string): string | null {
  const kind = hostKind(); if (!kind) return 'You are not in a car or taxi right now.';
  const q = NET.peers[friend]; if (!q || !q.init) return `@${friend} is not around any more.`;
  if (q.pa || q.rd || q.drv) return `@${friend} is busy.`;
  const g = PAX.guests, used = new Set(Object.values(g).map(v => v.seat));
  if (g[friend]) { paxSend(friend, 'seated', { kind, seat: g[friend].seat }); return null; }
  if (Object.keys(g).length >= PAX_MAX[kind]) return kind === 'taxi' ? 'A taxi has room for one guest.' : 'Your car is full.';
  const far = Math.hypot(q.x - NET.me.x, q.z - NET.me.z); if (far > 90) return `@${friend} is too far away to catch up.`;
  let seat = 0; while (used.has(seat)) seat++;
  g[friend] = { seat, at: Date.now(), seen: Date.now() };
  paxSend(friend, 'seated', { kind, seat });
  GAME.notice = `👥 @${friend} is riding with you`;
  paxChanged();
  return null;
}

/** Guest: climb in (the host just confirmed). The scene then follows the host's vehicle. */
export function board(host: string, seat: number, kind: PaxKind) {
  const q = NET.peers[host], pose = q && q.init ? poseOf(q) : null;
  if (!pose || paxBusy()) { paxSend(host, 'leave'); return; }
  PAX.host = host; PAX.kind = kind; PAX.seat = Math.max(0, Math.min(2, seat | 0)); PAX.wantOut = false; PAX.forced = false; PAX.lost = 0; PAX.spd = 0; PAX.lx = pose.x; PAX.lz = pose.z; PAX.px = pose.x; PAX.pz = pose.z; PAX.pr = pose.r;
  GAME.ride = { kind: 'taxi', x: pose.x, z: pose.z, r: pose.r, name: `@${host}'s ${kind === 'car' ? 'car' : 'taxi'}`, path: [], i: 0, speed: 0, stand: -1, pax: true };
  GAME.notice = `🚗 You are riding with @${host}`;
  paxChanged();
}

/** Host: everybody out (the vehicle stopped, the ride ended, or the host chose to drop them). */
export function dropAll(msg = '') {
  const names = Object.keys(PAX.guests); if (!names.length) return;
  for (const n of names) paxSend(n, 'drop', { r: msg });
  PAX.guests = {}; paxChanged();
}

type Body = { x: number; z: number; r: number; y: number; vy: number };

/** Called once per frame by the scene, before it moves the player. `fix` pushes a position out of walls. */
export function stepPax(p: Body, dt: number, fix: (b: Body) => void) {
  const now = Date.now();

  /* ── guest: stay glued to the host's vehicle, and get out when asked / when it is over ── */
  if (PAX.host) {
    const ride = GAME.ride, q = NET.peers[PAX.host], pose = q && q.init ? poseOf(q) : null;
    const leave = (forced: boolean, msg: string) => {
      const h = PAX.host, r = PAX.pr, lx = -Math.sin(r), lz = -Math.cos(r);   // step out on the left, like leaving your own car
      p.x = PAX.px + lx * 2.4; p.z = PAX.pz + lz * 2.4; fix(p); p.r = Math.atan2(lx, lz); p.y = 0; p.vy = 0;
      GAME.player.x = p.x; GAME.player.z = p.z; GAME.ride = null; NET.me.pa = ''; NET.me.ps = 0;
      PAX.host = ''; PAX.kind = ''; PAX.wantOut = false; PAX.forced = false; PAX.lost = 0; PAX.spd = 0;
      if (!forced) paxSend(h, 'leave');
      if (msg) GAME.notice = msg;
      paxChanged();
    };
    if (!ride || !ride.pax || GAME.jailed) { leave(true, ''); return; }
    if (pose) {
      PAX.lost = 0;
      const d = Math.hypot(pose.x - PAX.lx, pose.z - PAX.lz); PAX.spd += (d / Math.max(dt, 1e-3) - PAX.spd) * Math.min(1, dt * 3); PAX.lx = pose.x; PAX.lz = pose.z;
      PAX.px = pose.x; PAX.pz = pose.z; PAX.pr = pose.r; ride.x = pose.x; ride.z = pose.z; ride.r = pose.r;
    } else {
      PAX.lost += dt;
      if (PAX.lost > 2.5) { leave(true, 'The ride is over.'); return; }
    }
    if (PAX.wantOut) {
      if (!PAX.forced && PAX.spd > 7) { PAX.wantOut = false; GAME.notice = '🚗 Wait until the car slows down.'; }
      else leave(PAX.forced, PAX.msg || (PAX.forced ? 'You got out.' : '')); // a forced exit has nobody to tell; a voluntary one tells the host
    }
    return;
  }

  /* ── host: guests only ride while I am really in a vehicle, and only while their own screen says so ── */
  const names = Object.keys(PAX.guests);
  if (names.length) {
    if (!hostKind()) { PAX.off += dt; if (PAX.off > .5) { PAX.off = 0; dropAll('The ride is over.'); } } else PAX.off = 0;
    let changed = false;
    for (const n of Object.keys(PAX.guests)) {
      const g = PAX.guests[n], q = NET.peers[n];
      if (!q) { delete PAX.guests[n]; changed = true; continue; }
      if (q.pa === PAX.me) g.seen = now; else if (now - g.at > 4000 && now - g.seen > 3000) { delete PAX.guests[n]; changed = true; }   // they left without telling us
    }
    if (changed) paxChanged();
  } else PAX.off = 0;
  for (const n of Object.keys(PAX.invited)) if (PAX.invited[n] < now) delete PAX.invited[n];
  for (const n of Object.keys(PAX.pending)) if (PAX.pending[n] < now) delete PAX.pending[n];
}
