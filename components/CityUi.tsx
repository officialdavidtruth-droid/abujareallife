'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NET } from '../lib/cityNet';
import { createRoot, type Root } from 'react-dom/client';
import { GRID, WS, halfW } from '../lib/roadRoute';
import { BUILDS, CAMV, Ctl, GAME, Hud, toggleDriveCam } from './cityShared';

/** Renders plain DOM into document.body from inside <Canvas>. react-dom's createPortal can't be used there: R3F's reconciler would try to build <button>/<small> as THREE objects. */
export function BodyDom({ children }: { children: ReactNode }) {
  const rootRef = useRef<Root | null>(null);
  const elRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    elRef.current = el; rootRef.current = createRoot(el);
    return () => { const r = rootRef.current; rootRef.current = null; setTimeout(() => { r?.unmount(); el.remove(); }, 0); };
  }, []);
  useEffect(() => { rootRef.current?.render(<>{children}</>); });
  return null;
}


/* ───────────── on-screen controls ───────────── */
export function Stick({ ctl }: { ctl: React.MutableRefObject<Ctl> }) {
  const base = useRef<HTMLDivElement>(null), knob = useRef<HTMLDivElement>(null), pid = useRef<number | null>(null);
  const set = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect(), R = r.width / 2;
    let dx = (e.clientX - (r.left + R)) / R, dy = (e.clientY - (r.top + R)) / R; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
    ctl.current.joy = { x: dx, y: dy }; knob.current!.style.transform = `translate(calc(-50% + ${dx * R * .6}px), calc(-50% + ${dy * R * .6}px))`;
  };
  const end = () => { pid.current = null; ctl.current.joy = { x: 0, y: 0 }; if (knob.current) knob.current.style.transform = 'translate(-50%,-50%)'; };
  return <div className="cwStick" ref={base} onPointerDown={e => { pid.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); set(e); }} onPointerMove={e => { if (pid.current === e.pointerId) set(e); }} onPointerUp={end} onPointerCancel={end}><div ref={knob} className="cwKnob" /></div>;
}

export function LookPad({ ctl }: { ctl: React.MutableRefObject<Ctl> }) {
  const active = useRef<number | null>(null);
  const last = useRef({ x: 0, y: 0 });
  const end = (e: React.PointerEvent) => { if (active.current === e.pointerId) active.current = null; };
  return <div className="cwLookPad" aria-label="Camera look area"
    onPointerDown={e => { if (active.current !== null) return; active.current = e.pointerId; last.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); }}
    onPointerMove={e => { if (active.current !== e.pointerId) return; const l = ctl.current.look; ctl.current.look = { x: l.x + (e.clientX - last.current.x), y: l.y + (e.clientY - last.current.y) }; last.current = { x: e.clientX, y: e.clientY }; }}
    onPointerUp={end}
    onPointerCancel={end}
    onLostPointerCapture={end}
  ><span>↔ LOOK</span></div>;
}

export function Minimap({ hud, onOpen }: { hud: React.MutableRefObject<Hud>; onOpen?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null), north = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const cv = ref.current!, g = cv.getContext('2d')!, S = cv.width; let raf = 0, last = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw); if (now - last < 50) return; last = now;
      const h = hud.current, sc = S / 100;
      if (north.current) { const th = Math.atan2(h.fx, -h.fz); north.current.style.left = (50 - Math.sin(th) * 46) + '%'; north.current.style.top = (50 - Math.cos(th) * 46) + '%'; }   // 'N' rides the rim of the map and always points north
      g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#35553f'; g.fillRect(0, 0, S, S);
      g.translate(S / 2, S / 2); g.rotate(-Math.atan2(h.fx, -h.fz)); g.scale(sc, sc); g.translate(-h.x, -h.z);
      g.fillStyle = '#6a6f77'; for (let i = -5; i <= 5; i++) { g.fillRect(i * GRID - halfW(i), -125 * WS, halfW(i) * 2, 250 * WS); g.fillRect(-125 * WS, i * GRID - halfW(i), 250 * WS, halfW(i) * 2); }
      for (const b of BUILDS) { g.fillStyle = b.color; g.fillRect(b.x - b.w / 2, b.z - b.d / 2, b.w, b.d); }
      const rt = GAME.route, nv = GAME.nav;
      if (rt && nv) {
        g.strokeStyle = '#ff3b30'; g.lineWidth = 1.4; g.lineJoin = 'round'; g.setLineDash([3, 2]); g.beginPath(); g.moveTo(h.x, h.z);
        for (let i = rt.i; i < rt.pts.length; i++) g.lineTo(rt.pts[i][0], rt.pts[i][1]);
        g.lineTo(nv.x, nv.z); g.stroke(); g.setLineDash([]);
      }
      const mf = (window as any).__arlMissionId ? GAME.missionFinal : null;
      if (mf && nv && (mf.x !== nv.x || mf.z !== nv.z)) { // final destination of the mission: dotted guide from this stop to the end + a gold flag (clamped to the minimap edge)
        g.strokeStyle = '#ffd23f'; g.lineWidth = 1; g.setLineDash([1.5, 2.5]); g.beginPath(); g.moveTo(nv.x, nv.z); g.lineTo(mf.x, mf.z); g.stroke(); g.setLineDash([]);
        const fd = Math.hypot(mf.x - h.x, mf.z - h.z), fk = fd > 46 ? 46 / fd : 1; g.fillStyle = '#ffd23f'; g.strokeStyle = '#000'; g.lineWidth = .5; g.beginPath(); g.arc(h.x + (mf.x - h.x) * fk, h.z + (mf.z - h.z) * fk, 3, 0, Math.PI * 2); g.fill(); g.stroke();
      }
      if (nv) { const dd = Math.hypot(nv.x - h.x, nv.z - h.z), k = dd > 46 ? 46 / dd : 1, mx = h.x + (nv.x - h.x) * k, mz = h.z + (nv.z - h.z) * k; g.fillStyle = '#ff3b30'; g.strokeStyle = '#fff'; g.lineWidth = .5; g.beginPath(); g.arc(mx, mz, k < 1 ? 2.6 : 3.4, 0, Math.PI * 2); g.fill(); g.stroke(); }
      const tl = (window as any).__arlTail as { x: number; z: number } | undefined;
      if (tl) { const dd = Math.hypot(tl.x - h.x, tl.z - h.z), k = dd > 46 ? 46 / dd : 1; g.fillStyle = '#35d0ff'; g.strokeStyle = '#fff'; g.lineWidth = .5; g.beginPath(); g.arc(h.x + (tl.x - h.x) * k, h.z + (tl.z - h.z) * k, k < 1 ? 2.6 : 3.4, 0, Math.PI * 2); g.fill(); g.stroke(); }   // the dealer (stealth tail mission)
      if (h.vp) { g.fillStyle = '#ff6a00'; g.strokeStyle = '#000'; g.lineWidth = .3; g.fillRect(h.vx - 1.6, h.vz - 1.6, 3.2, 3.2); g.strokeRect(h.vx - 1.6, h.vz - 1.6, 3.2, 3.2); }
      g.save(); g.translate(h.x, h.z); g.rotate(Math.PI - h.r); g.fillStyle = '#ffd23f'; g.strokeStyle = '#000'; g.lineWidth = .3;
      g.beginPath(); g.moveTo(0, -3); g.lineTo(2.1, 2.1); g.lineTo(0, 1); g.lineTo(-2.1, 2.1); g.closePath(); g.fill(); g.stroke(); g.restore();
    };
    raf = requestAnimationFrame(draw); return () => cancelAnimationFrame(raf);
  }, [hud]);
  return <button type="button" className="cwMapBtn" aria-label="Open game map" onClick={onOpen}><canvas ref={ref} className="cwMap" width={280} height={280} /><span ref={north} className="cwN">N</span></button>;
}

export function DriveHud({ hud }: { hud: React.MutableRefObject<Hud> }) {
  const spd = useRef<HTMLDivElement>(null), num = useRef<HTMLElement>(null), tip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const id = setInterval(() => {
      const h = hud.current;
      if (spd.current) spd.current.style.display = h.drv ? 'flex' : 'none';
      if (num.current) num.current.textContent = String(Math.round(h.spd));
      if (tip.current && tip.current.textContent !== h.prompt) tip.current.textContent = h.prompt;
    }, 100);
    return () => clearInterval(id);
  }, [hud]);
  return <><div ref={spd} className="cwSpeed"><b ref={num}>0</b><small>km/h</small></div><div ref={tip} className="cwTip" /></>;
}

export function FightHud() {
  const box = useRef<HTMLDivElement>(null), bar = useRef<HTMLDivElement>(null), fx = useRef<HTMLDivElement>(null), txt = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const id = setInterval(() => {
      const m = NET.me, now = Date.now(), ko = m.ko > now, hurtRecent = now - m.hurt < 7000;
      if (box.current) box.current.style.display = ko || m.hp < 100 || hurtRecent || m.safe > now ? 'flex' : 'none';
      if (bar.current) { bar.current.style.width = `${Math.max(0, m.hp)}%`; bar.current.style.background = m.hp > 50 ? '#35c46b' : m.hp > 25 ? '#f2b705' : '#ff5147'; }
      if (txt.current) txt.current.textContent = ko ? `${m.koKind === 'passout' ? '🥴 Passed out' : '😵 Knocked out'}: wakes in ${Math.ceil((m.ko - now) / 1000)}s` : m.safe > now ? `🛡️ Protected ${Math.ceil((m.safe - now) / 1000)}s · ❤️ ${Math.ceil(m.hp)}` : `❤️ ${Math.ceil(m.hp)}`;
      if (fx.current) fx.current.style.opacity = ko ? '.55' : String(Math.max(0, 1 - (now - m.hurt) / 350) * .5);
    }, 80);
    return () => clearInterval(id);
  }, []);
  return <><div ref={fx} className="cwHurt" /><div ref={box} className="cwHp" style={{ display: 'none' }}><span ref={txt} /><i><b ref={bar} /></i></div></>;
}

export function HoldBtn({ cls, label, icon, down, up }: { cls: string; label: string; icon: string; down: () => void; up?: () => void }) {
  return <button className={'cwBtn ' + cls} aria-label={label} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); down(); }} onPointerUp={() => up?.()} onPointerCancel={() => up?.()} onContextMenu={e => e.preventDefault()}><span>{icon}</span><small>{label}</small></button>;
}


/* ───────────── driving pad (phones) ─────────────
   Call of Duty style: while you drive, the walking joystick and action pad are replaced by direction buttons.
   Left thumb: ◀ ▶ steer.  Right thumb: GAS and BRAKE / reverse pedals, with small buttons for nitro, handbrake, horn, auto-drive and exit.
   Every button is its own pointer, so you can steer, hold gas and hit nitro at the same time. */
type Hold = { id: string; cls: string; label: string; icon: string; on: () => void; off?: () => void };
function PadBtn({ b }: { b: Hold }) {
  const pid = useRef<number | null>(null);
  const [down, setDown] = useState(false);
  const end = (e: React.PointerEvent) => { if (pid.current !== e.pointerId) return; pid.current = null; setDown(false); b.off?.(); };
  return <button type="button" className={'dpBtn ' + b.cls + (down ? ' on' : '')} aria-label={b.label}
    onPointerDown={e => { e.preventDefault(); e.stopPropagation(); if (pid.current !== null) return; pid.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); setDown(true); b.on(); }}
    onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} onContextMenu={e => e.preventDefault()}>
    <span>{b.icon}</span><small>{b.label}</small></button>;
}

export function DrivePad({ ctl, hud }: { ctl: React.MutableRefObject<Ctl>; hud: React.MutableRefObject<Hud> }) {
  const [drv, setDrv] = useState(false), [auto, setAuto] = useState(false), [, setCamTick] = useState(0);
  const inp = useRef({ l: false, r: false, gas: false, brake: false, auto: false, steer: 0 });
  useEffect(() => { const id = setInterval(() => { const d = !!hud.current.drv; setDrv(p => (p === d ? p : d)); document.body.classList.toggle('cwDriving', d); }, 100); return () => { clearInterval(id); document.body.classList.remove('cwDriving'); }; }, [hud]);
  useEffect(() => {
    if (!drv) { const i = inp.current; i.l = i.r = i.gas = i.brake = false; i.steer = 0; ctl.current.joy = { x: 0, y: 0 }; ctl.current.keys.delete('shift'); ctl.current.keys.delete(' '); return; }
    let raf = 0, last = performance.now();
    const loop = (now: number) => {   // eased steering: the wheel turns in over ~0.25 s and straightens out when you let go, like a real car
      raf = requestAnimationFrame(loop); const dt = Math.min(.05, (now - last) / 1000); last = now; const i = inp.current;
      const want = (i.r ? 1 : 0) - (i.l ? 1 : 0), rate = want === 0 ? 6 : 4.2; i.steer += Math.max(-rate * dt, Math.min(rate * dt, want - i.steer));
      const thr = i.brake ? -1 : i.gas || i.auto ? 1 : 0;
      ctl.current.joy = { x: i.steer, y: -thr };
    };
    raf = requestAnimationFrame(loop); return () => { cancelAnimationFrame(raf); ctl.current.joy = { x: 0, y: 0 }; };
  }, [drv, ctl]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'k' && !e.repeat && hud.current.drv) { toggleDriveCam(); setCamTick(n => n + 1); ctl.current.recenter = true; } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [hud, ctl]);
  if (!drv) return null;
  const i = inp.current, k = ctl.current.keys;
  const B: Record<string, Hold> = {
    left: { id: 'l', cls: 'steer', label: 'Left', icon: '◀', on: () => { i.l = true; }, off: () => { i.l = false; } },
    right: { id: 'r', cls: 'steer', label: 'Right', icon: '▶', on: () => { i.r = true; }, off: () => { i.r = false; } },
    gas: { id: 'g', cls: 'gas', label: 'Gas', icon: '⏫', on: () => { i.gas = true; }, off: () => { i.gas = false; } },
    brake: { id: 'b', cls: 'brake', label: 'Brake', icon: '⏬', on: () => { i.brake = true; }, off: () => { i.brake = false; } },
    nitro: { id: 'n', cls: 'nitro', label: 'Nitro', icon: '🔥', on: () => { k.add('shift'); }, off: () => { k.delete('shift'); } },
    hand: { id: 'h', cls: 'hand', label: 'Drift', icon: '🅿️', on: () => { k.add(' '); }, off: () => { k.delete(' '); } },
    cam: { id: 'c', cls: 'cam', label: CAMV.mode ? 'Chase' : 'Inside', icon: '🎥', on: () => { toggleDriveCam(); setCamTick(n => n + 1); ctl.current.recenter = true; } },
    horn: { id: 'o', cls: 'horn', label: 'Horn', icon: '📣', on: () => { ctl.current.horn = true; } },
    exit: { id: 'x', cls: 'exit', label: 'Exit', icon: '🚪', on: () => { ctl.current.interact = true; } },
  };
  return <div className="dpRoot" onContextMenu={e => e.preventDefault()}>
    <div className="dpLeft"><PadBtn b={B.left} /><PadBtn b={B.right} /></div>
    <div className="dpRight">
      <div className="dpSmall"><PadBtn b={B.cam} /><PadBtn b={B.exit} /><PadBtn b={B.horn} /><PadBtn b={B.hand} /><PadBtn b={B.nitro} /><button type="button" className={'dpBtn auto' + (auto ? ' on' : '')} aria-label="Auto drive" aria-pressed={auto} onClick={() => { i.auto = !i.auto; setAuto(i.auto); }}><span>🔁</span><small>Auto</small></button></div>
      <div className="dpPedals"><PadBtn b={B.brake} /><PadBtn b={B.gas} /></div>
    </div>
  </div>;
}
