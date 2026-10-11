'use client';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

/* A TV / cinema screen that actually plays something.
   There is no video file in the project, so the "film" is drawn live on a canvas (an Abuja skyline at dusk, a night drive, a
   two-person scene with subtitles, Jabi Lake at sunrise) and used as the screen texture. A simple road game plays when the
   player is gaming, and a bouncing logo shows when the TV is on but nobody is watching.
   To play a REAL video instead, drop a file at /public/video/movie.mp4 - the screen picks it up automatically (see VIDEO_SRC). */

export type ScreenMode = 'movie' | 'game' | null;
const W = 512, H = 288, LB = Math.round(H * .13);
const VIDEO_SRC = '/video/movie.mp4';
type Ctx = CanvasRenderingContext2D;
const rnd = (a: number) => { const x = Math.sin(a * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

const SCENE_LEN = 9;
const SUBS: string[][] = [
  ['Abuja, 6:47pm. The city never waits.', 'Some people came for work. Some came to hide.'],
  ['Drive. Just drive, Chidi.', 'He was behind us... now he is ahead.'],
  ['You lied to me, Emeka.', 'Na for your own good, I swear down.'],
  ['Jabi Lake. Where it all started.', 'Today, we finish it.'],
];
const TINT = ['#ff9a5a', '#7fa6ff', '#ffc080', '#ffb090'];

function dusk(g: Ctx, s: number) {
  const k = g.createLinearGradient(0, 0, 0, H); k.addColorStop(0, '#1b1647'); k.addColorStop(.55, '#c8553a'); k.addColorStop(1, '#ffb45e'); g.fillStyle = k; g.fillRect(0, 0, W, H);
  g.fillStyle = '#ffe2a0'; g.beginPath(); g.arc(W * .68 - s * 20, H * .62 - s * H * .05, 34, 0, 7); g.fill();
  const px = -s * 26;
  g.fillStyle = '#3a2335'; g.beginPath(); g.moveTo(px - 40, H); g.bezierCurveTo(px + 40, H * .5, px + 120, H * .33, px + 210, H * .46); g.bezierCurveTo(px + 290, H * .55, px + 330, H * .8, px + 420, H); g.fill();
  for (let i = 0; i < 18; i++) {
    const bx = px + i * 34 - 20, bh = 40 + rnd(i) * 70; g.fillStyle = '#1a1020'; g.fillRect(bx, H - bh, 26, bh);
    g.fillStyle = '#ffd27a'; for (let r = 0; r < bh / 12 - 1; r++) if (rnd(i * 9 + r) > .55) g.fillRect(bx + 5 + (r % 2) * 11, H - bh + 6 + r * 12, 5, 6);
  }
  g.fillStyle = '#120a14'; for (let i = 0; i < 4; i++) { const bx = (W * .2 + i * 46 + s * 120) % W, by = H * .22 + Math.sin(i * 2 + s * 9) * 8; g.fillRect(bx, by, 7, 1.5); g.fillRect(bx + 2, by - 2, 3, 1.5); }
}

function drive(g: Ctx, s: number, t: number) {
  const k = g.createLinearGradient(0, 0, 0, H); k.addColorStop(0, '#05060d'); k.addColorStop(1, '#14223a'); g.fillStyle = k; g.fillRect(0, 0, W, H);
  const hor = H * .5; g.fillStyle = '#15171c'; g.beginPath(); g.moveTo(W / 2 - 6, hor); g.lineTo(W / 2 + 6, hor); g.lineTo(W * .98, H); g.lineTo(W * .02, H); g.fill();
  g.fillStyle = '#d9d9a0'; for (let i = 0; i < 8; i++) { const z = (i / 8 + t * .6) % 1, zz = z * z, y = hor + (H - hor) * zz, w = 2 + 10 * zz; g.fillRect(W / 2 - w / 2, y, w, 4 + 26 * zz); }
  for (let i = 0; i < 6; i++) { const z = (i / 6 + t * .35) % 1, zz = z * z, y = hor + (H - hor) * zz, hw = 6 + W * .46 * zz; for (const sd of [-1, 1]) { const x = W / 2 + sd * (hw + 6 + 20 * zz); g.fillStyle = '#9aa0a8'; g.fillRect(x - 1, y - 30 * zz - 6, 2 + 2 * zz, 30 * zz + 6); const gl = g.createRadialGradient(x, y - 30 * zz - 6, 0, x, y - 30 * zz - 6, 20 + 40 * zz); gl.addColorStop(0, 'rgba(255,220,150,.8)'); gl.addColorStop(1, 'rgba(255,220,150,0)'); g.fillStyle = gl; g.fillRect(x - 70, y - 100 * zz - 70, 140, 140); } }
  const z = (s * 1.25) % 1, zz = z * z, hy = hor + (H - hor) * zz * .9, r = 3 + 26 * zz;
  for (const dx of [-1, 1]) { const x = W * .4 + dx * (6 + 40 * zz), gl = g.createRadialGradient(x, hy, 0, x, hy, r * 3); gl.addColorStop(0, 'rgba(255,255,240,1)'); gl.addColorStop(.25, 'rgba(255,245,200,.7)'); gl.addColorStop(1, 'rgba(255,245,200,0)'); g.fillStyle = gl; g.beginPath(); g.arc(x, hy, r * 3, 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(180,200,255,.28)'; g.lineWidth = 1; g.beginPath();
  for (let i = 0; i < 60; i++) { const x = rnd(i) * W, y = (rnd(i + 50) * H + t * 420) % H; g.moveTo(x, y); g.lineTo(x - 3, y + 12); } g.stroke();
}

function talk(g: Ctx, s: number, t: number) {
  const k = g.createLinearGradient(0, 0, 0, H); k.addColorStop(0, '#3b2416'); k.addColorStop(1, '#6d4326'); g.fillStyle = k; g.fillRect(0, 0, W, H);
  const gl = g.createRadialGradient(W / 2, H * .3, 0, W / 2, H * .3, 170); gl.addColorStop(0, 'rgba(255,200,120,.65)'); gl.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = gl; g.fillRect(0, 0, W, H);
  g.fillStyle = '#2a1a10'; g.fillRect(W * .44, H * .1, W * .12, H * .26); g.fillStyle = '#e9b36b'; g.fillRect(W * .445, H * .105, W * .11, H * .25);
  const sp = s < .5 ? 0 : 1;
  [[W * .27, 1], [W * .73, -1]].forEach(([x, f], i) => {
    const bob = i === sp ? Math.sin(t * 14) * 1.6 : 0, y = H * .5 + bob;
    g.fillStyle = '#150d10'; g.beginPath(); g.ellipse(x, H * .98, 92, 78, 0, Math.PI, 0); g.fill();
    g.beginPath(); g.arc(x, y, 30, 0, 7); g.fill(); g.fillRect(x - 11, y + 20, 22, 26);
    g.strokeStyle = 'rgba(255,190,110,.75)'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 30, f > 0 ? -.9 : Math.PI - .9 + .6, f > 0 ? .9 : Math.PI + .9 - .0); g.stroke();
  });
}

function lake(g: Ctx, s: number, t: number) {
  const hz = H * .55, k = g.createLinearGradient(0, 0, 0, hz); k.addColorStop(0, '#2a3a6a'); k.addColorStop(1, '#f0a070'); g.fillStyle = k; g.fillRect(0, 0, W, hz);
  const sy = hz - 4 - s * H * .12; g.fillStyle = '#fff0c0'; g.beginPath(); g.arc(W * .5, sy, 28, 0, 7); g.fill();
  g.fillStyle = '#35294a'; g.beginPath(); g.moveTo(0, hz); g.bezierCurveTo(W * .15, hz - 50, W * .3, hz - 10, W * .45, hz - 34); g.bezierCurveTo(W * .65, hz - 60, W * .8, hz - 12, W, hz - 40); g.lineTo(W, hz); g.fill();
  const wk = g.createLinearGradient(0, hz, 0, H); wk.addColorStop(0, '#d98a70'); wk.addColorStop(1, '#1d2748'); g.fillStyle = wk; g.fillRect(0, hz, W, H - hz);
  g.fillStyle = 'rgba(255,235,180,.55)'; for (let i = 0; i < 14; i++) { const y = hz + 4 + i * i * .65 + (i * 1.3), w = 16 + i * 5 + Math.sin(t * 2 + i) * 6; g.fillRect(W * .5 - w / 2, y, w, 1.5 + i * .12); }
  const bx = -60 + s * (W + 120), by = hz + 34; g.fillStyle = '#120d1c'; g.beginPath(); g.moveTo(bx - 34, by); g.lineTo(bx + 34, by); g.lineTo(bx + 24, by + 10); g.lineTo(bx - 24, by + 10); g.fill(); g.beginPath(); g.moveTo(bx, by - 40); g.lineTo(bx + 24, by - 2); g.lineTo(bx, by - 2); g.fill();
}

function game(g: Ctx, t: number) {
  const hor = H * .42, k = g.createLinearGradient(0, 0, 0, hor); k.addColorStop(0, '#4aa8ff'); k.addColorStop(1, '#bfe6ff'); g.fillStyle = k; g.fillRect(0, 0, W, hor);
  g.fillStyle = '#6aa05a'; g.beginPath(); g.moveTo(0, hor); g.lineTo(60, hor - 26); g.lineTo(150, hor); g.lineTo(260, hor - 34); g.lineTo(380, hor); g.lineTo(W, hor - 22); g.lineTo(W, hor); g.fill();
  for (let i = 0; i < 12; i++) { const z = (i / 12 + t * .7) % 1, zz = z * z, y = hor + (H - hor) * zz, nh = (H - hor) / 12 * (.6 + zz * 2); g.fillStyle = i % 2 ? '#3f8a3a' : '#4a9a44'; g.fillRect(0, y, W, nh); }
  const rd = (zz: number) => 6 + W * .42 * zz; g.fillStyle = '#3a3d44'; g.beginPath(); g.moveTo(W / 2 - 6, hor); g.lineTo(W / 2 + 6, hor); g.lineTo(W / 2 + rd(1), H); g.lineTo(W / 2 - rd(1), H); g.fill();
  g.fillStyle = '#f4f4e8'; for (let i = 0; i < 9; i++) { const z = (i / 9 + t * 1.1) % 1, zz = z * z, y = hor + (H - hor) * zz; g.fillRect(W / 2 - 1 - 4 * zz, y, 2 + 8 * zz, 3 + 22 * zz); }
  const cols = ['#e8423a', '#f2c230', '#8a5ae8']; for (let n = 0; n < 3; n++) { const q = t * .45 + n / 3, z = q % 1, zz = z * z, lane = Math.floor(rnd(Math.floor(q) * 3 + n) * 3) - 1, y = hor + (H - hor) * zz, x = W / 2 + lane * rd(zz) * .6, w = 8 + zz * 60, h = 5 + zz * 34; g.fillStyle = cols[n]; g.fillRect(x - w / 2, y - h, w, h); g.fillStyle = '#111'; g.fillRect(x - w * .38, y - h * .85, w * .76, h * .3); }
  const px = W / 2 + Math.sin(t * 1.1) * 80; g.fillStyle = '#18a05a'; g.fillRect(px - 32, H - 52, 64, 34); g.fillStyle = '#0e6034'; g.fillRect(px - 24, H - 66, 48, 18); g.fillStyle = '#111'; g.fillRect(px - 36, H - 26, 14, 10); g.fillRect(px + 22, H - 26, 14, 10);
  g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(10, 8, 150, 20); g.fillStyle = '#fff'; g.font = 'bold 13px monospace'; g.fillText('SCORE ' + String(Math.floor(t * 37)).padStart(6, '0'), 16, 23);
}

function idle(g: Ctx, t: number) {
  g.fillStyle = '#071322'; g.fillRect(0, 0, W, H); const k = g.createLinearGradient(0, 0, W, H); k.addColorStop(0, 'rgba(60,120,220,.25)'); k.addColorStop(1, 'rgba(20,40,90,0)'); g.fillStyle = k; g.fillRect(0, 0, W, H);
  const rw = W - 170, rh = H - 50, x = 10 + Math.abs(((t * 46) % (rw * 2)) - rw), y = 10 + Math.abs(((t * 30) % (rh * 2)) - rh);
  g.fillStyle = '#e8f1ff'; g.font = 'bold 34px sans-serif'; g.fillText('ABUJA TV', x, y + 34);
}

function overlay(g: Ctx, mt: number, scene: number, s: number, t: number) {
  const v = g.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, W * .65); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.5)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
  g.fillStyle = '#000'; g.fillRect(0, 0, W, LB); g.fillRect(0, H - LB, W, LB);
  const sub = SUBS[scene][s < .5 ? 0 : 1], fade = Math.min(1, ((s % .5) * 2) * 6, (1 - (s % .5) * 2) * 6);
  g.font = 'bold 15px sans-serif'; g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = `rgba(0,0,0,${.85 * fade})`; g.strokeText(sub, W / 2, H - LB - 12); g.fillStyle = `rgba(255,255,255,${fade})`; g.fillText(sub, W / 2, H - LB - 12); g.textAlign = 'left';
  if (mt < 3.6) { const a = Math.min(1, (3.6 - mt) * 1.4); g.fillStyle = `rgba(0,0,0,${.78 * a})`; g.fillRect(0, 0, W, H); g.textAlign = 'center'; g.fillStyle = `rgba(240,200,120,${a})`; g.font = 'bold 40px serif'; g.fillText('ABUJA NIGHTS', W / 2, H / 2 + 6); g.font = '14px sans-serif'; g.fillStyle = `rgba(255,255,255,${a * .8})`; g.fillText('A  NOLLYWOOD  ORIGINAL', W / 2, H / 2 + 34); g.textAlign = 'left'; }
  g.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < 40; i++) g.fillRect(rnd(i + Math.floor(t * 12)) * W, rnd(i * 3 + Math.floor(t * 12)) * H, 1.5, 1.5);
}

function draw(g: Ctx, mode: ScreenMode, mt: number, t: number): string {
  if (mode === 'movie') {
    const T = mt % (SUBS.length * SCENE_LEN), sc = Math.floor(T / SCENE_LEN), s = (T % SCENE_LEN) / SCENE_LEN;
    if (sc === 0) dusk(g, s); else if (sc === 1) drive(g, s, mt); else if (sc === 2) talk(g, s, mt); else lake(g, s, mt);
    overlay(g, mt, sc, s, t); const f = Math.min(1, T % SCENE_LEN * 2.2); if (f < 1 && mt > SCENE_LEN * .5) { g.fillStyle = `rgba(0,0,0,${1 - f})`; g.fillRect(0, 0, W, H); } // fade in from black at each scene change
    return TINT[sc];
  }
  if (mode === 'game') { game(g, mt); return '#9fd4ff'; }
  idle(g, t); return '#6aa0ff';
}

export default function MovieScreen({ p, w, h, on, ry = 0, watch, light = false }: { p: [number, number, number]; w: number; h: number; on: boolean; ry?: number; watch: () => ScreenMode; light?: boolean }) {
  const { cv, tex } = useMemo(() => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return { cv, tex }; }, []);
  const last = useRef(-1), start = useRef(0), prev = useRef<ScreenMode>(null), lit = useRef<THREE.PointLight>(null!), vid = useRef<HTMLVideoElement | null>(null), vTex = useRef<THREE.VideoTexture | null>(null), vOk = useRef(false), mat = useRef<THREE.MeshBasicMaterial>(null!);

  // optional real video: only used if /public/video/movie.mp4 exists
  useEffect(() => {
    const v = document.createElement('video'); v.src = VIDEO_SRC; v.loop = true; v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
    const ok = () => { vOk.current = true; vTex.current = new THREE.VideoTexture(v); vTex.current.colorSpace = THREE.SRGBColorSpace; };
    v.addEventListener('loadeddata', ok); vid.current = v;
    return () => { v.removeEventListener('loadeddata', ok); v.pause(); v.removeAttribute('src'); v.load(); vTex.current?.dispose(); vTex.current = null; vOk.current = false; };
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime, mode = on ? watch() : null;
    if (lit.current) lit.current.intensity = on ? (mode ? .9 : .18) : 0;
    if (!on) { if (vid.current && !vid.current.paused) vid.current.pause(); return; }
    if (mode !== prev.current) { prev.current = mode; start.current = t; if (vid.current && vOk.current) { if (mode === 'movie') { vid.current.currentTime = 0; vid.current.play().catch(() => { }); } else vid.current.pause(); } }
    const useVid = mode === 'movie' && vOk.current && !!vTex.current;
    if (mat.current) { const want = useVid ? vTex.current! : tex; if (mat.current.map !== want) { mat.current.map = want; mat.current.needsUpdate = true; } }
    if (useVid) return;
    if (t - last.current < 1 / 12) return; last.current = t;
    const tint = draw(cv.getContext('2d')!, mode, t - start.current, t); tex.needsUpdate = true;
    if (lit.current) lit.current.color.set(tint);
  });

  return <group position={p} rotation-y={ry}>
    <mesh><planeGeometry args={[w, h]} />{on ? <meshBasicMaterial ref={mat} map={tex} toneMapped={false} /> : <meshStandardMaterial color="#05070a" roughness={.2} />}</mesh>
    {light && <pointLight ref={lit} position={[0, -.05, .7]} intensity={0} distance={4.5} decay={2} color="#6aa0ff" />}
  </group>;
}
