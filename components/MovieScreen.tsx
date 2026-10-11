'use client';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

/* A TV / cinema screen that actually plays something.
   There is no video file in the project, so the "film" is drawn live on a canvas (an Abuja skyline at dusk, a night drive, a
   two-person scene with subtitles, Jabi Lake at sunrise) and used as the screen texture. A simple road game plays when the
   player is gaming, and a bouncing logo shows when the TV is on but nobody is watching.
   To play a REAL video instead, drop a file at /public/video/movie.mp4 - the screen picks it up automatically (see VIDEO_SRC). */

export type ScreenMode = 'movie' | 'game' | 'work' | 'hustle' | 'browse' | null;
export type JobInfo = { prog: number; pay: number };
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


/* ---------- computer-desk screens: one per activity on the desk menu ---------- */
const rr = (g: Ctx, x: number, y: number, w: number, h: number, r: number) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
const naira = (n: number) => '\u20A6' + Math.round(n).toLocaleString('en-US');

function footer(g: Ctx, label: string, job: JobInfo, col: string) { // progress strip shown under the work screens
  const y = H - 26; g.fillStyle = 'rgba(8,10,14,.92)'; g.fillRect(0, y, W, 26);
  g.textAlign = 'left'; g.font = 'bold 12px sans-serif'; g.fillStyle = '#cfd8e3'; g.fillText(label, 10, y + 17);
  const bx = 200, bw = 170; g.fillStyle = 'rgba(255,255,255,.14)'; rr(g, bx, y + 9, bw, 8, 4); g.fill();
  if (job.prog > 0) { g.fillStyle = col; rr(g, bx, y + 9, Math.max(8, bw * job.prog), 8, 4); g.fill(); }
  g.fillStyle = '#e8eef5'; g.fillText(Math.round(job.prog * 100) + '%', bx + bw + 8, y + 17);
  if (job.pay) { g.textAlign = 'right'; g.fillStyle = '#7ef0a8'; g.fillText('+' + naira(job.pay), W - 10, y + 17); g.textAlign = 'left'; }
}

type Tok = [string, string];
const KW = '#c792ea', FN = '#82aaff', STR = '#c3e88d', NUM = '#f78c6c', CM = '#6b7a90', PL = '#d6deeb';
const CODE: Tok[][] = [
  [['// Zenith Pay: checkout API', CM]],
  [['import', KW], [' { pay, uid } ', PL], ['from', KW], [" './gateway'", STR], [';', PL]],
  [],
  [['export async function ', KW], ['charge', FN], ['(order) {', PL]],
  [['  const ', KW], ['fee', PL], [' = order.total * ', PL], ['0.015', NUM], [';', PL]],
  [['  const ', KW], ['res', PL], [' = ', PL], ['await ', KW], ['pay', FN], ['({', PL]],
  [['    amount: order.total + fee,', PL]],
  [['    currency: ', PL], ["'NGN'", STR], [',', PL]],
  [['    ref: ', PL], ['uid', FN], ['(),', PL]],
  [['  });', PL]],
  [['  if ', KW], ['(!res.ok) ', PL], ['throw new ', KW], ['Error', FN], ['(', PL], ["'Payment failed'", STR], [');', PL]],
  [['  return ', KW], ['res.receipt;', PL]],
  [['}', PL]],
];
const CODE_LEN = CODE.reduce((a, l) => a + l.reduce((b, t) => b + t[0].length, 0) + 1, 0);

function work(g: Ctx, mt: number, t: number, job: JobInfo) { // Freelance gig: an editor that types a function out, line by line
  g.fillStyle = '#0f1724'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#18222f'; g.fillRect(0, 0, W, 24); [['#ff5f57', 12], ['#febc2e', 28], ['#28c840', 44]].forEach(([c, x]) => { g.fillStyle = c as string; g.beginPath(); g.arc(x as number, 12, 4.5, 0, 7); g.fill(); });
  g.fillStyle = '#0f1724'; g.fillRect(66, 4, 118, 20); g.fillStyle = '#e8eef5'; g.font = '12px sans-serif'; g.fillText('checkout.ts', 76, 18);
  g.textAlign = 'right'; g.fillStyle = '#7ef0a8'; g.fillText('\u25CF Client: Zenith Pay', W - 10, 16); g.textAlign = 'left';
  g.fillStyle = '#131c2a'; g.fillRect(0, 24, 30, H - 50);
  const total = CODE_LEN + 70, n = Math.floor(mt * 26) % total; let left = n; const y0 = 44, lh = 16.5; g.font = '13px monospace';
  let cx = 38, cy = y0;
  for (let i = 0; i < CODE.length; i++) {
    const y = y0 + i * lh; if (left <= 0) break;
    g.fillStyle = '#4b5a70'; g.textAlign = 'right'; g.fillText(String(i + 1), 24, y); g.textAlign = 'left';
    let x = 38;
    for (const [txt, col] of CODE[i]) { const sub = txt.slice(0, Math.max(0, left)); left -= txt.length; g.fillStyle = col; g.fillText(sub, x, y); x += g.measureText(sub).width; if (left <= 0) break; }
    cx = x; cy = y; left -= 1;
  }
  if (Math.floor(t * 2.4) % 2 === 0 && n < CODE_LEN) { g.fillStyle = '#ffcb6b'; g.fillRect(cx + 1, cy - 11, 7, 14); }
  if (n >= CODE_LEN) { g.fillStyle = 'rgba(40,200,120,.18)'; rr(g, W - 150, H - 62, 138, 26, 6); g.fill(); g.fillStyle = '#7ef0a8'; g.font = 'bold 13px sans-serif'; g.fillText('\u2713 Build passed', W - 140, H - 44); }
  footer(g, 'Delivering gig', job, '#5aa9ff');
}

const SHEET: [string, number, number][] = [['Ankara fabric (3 yd)', 3, 4500], ['Phone case, Tecno', 2, 3000], ['Zobo drink (crate)', 1, 6500], ['Logo design', 1, 12000], ['Braiding supplies', 4, 2200], ['Kilishi pack', 5, 1800], ['Wig bundle', 1, 9500], ['Data resale (10GB)', 6, 2500], ['Gele headtie', 2, 3800], ['Shea butter jar', 3, 2400], ['Suya spice mix', 4, 1200], ['Bakery order', 1, 7000]];

function hustle(g: Ctx, mt: number, job: JobInfo) { // Side hustle: a sales ledger that fills with paid orders
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#1d6f42'; g.fillRect(0, 0, W, 26); g.fillStyle = '#fff'; g.font = 'bold 13px sans-serif'; g.fillText('\uD83E\uDDFE  Orders.xlsx  \u2013  Side hustle', 10, 18);
  const cols = [26, 236, 286, 386], hy = 26; g.fillStyle = '#e9eef0'; g.fillRect(0, hy, W, 20); g.fillStyle = '#44525c'; g.font = 'bold 11px sans-serif';
  ['', 'Item', 'Qty', 'Amount', 'Status'].forEach((h, i) => g.fillText(h, i === 0 ? 8 : cols[i - 1] + 6, hy + 14));
  const per = 1.35, cyc = SHEET.length + 3, k = mt / per, count = Math.min(SHEET.length, Math.floor(k % cyc) + 1), rows = 8, rh = 21, ty = H - 26 - 24;
  const first = Math.max(0, count - rows); let sum = 0; for (let i = 0; i < count; i++) sum += SHEET[i][1] * SHEET[i][2];
  g.font = '12px sans-serif';
  for (let i = first; i < count; i++) {
    const y = hy + 20 + (i - first) * rh, [nm, q, pr] = SHEET[i], age = k % cyc - i;
    if (age < .7) { g.fillStyle = `rgba(80,200,120,${.35 * (1 - age / .7)})`; g.fillRect(0, y, W, rh); }
    g.strokeStyle = '#dde3e6'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, y + rh - .5); g.lineTo(W, y + rh - .5); g.stroke();
    g.fillStyle = '#8a98a2'; g.fillText(String(i + 1), 8, y + 15); g.fillStyle = '#1b2a33'; g.fillText(nm, cols[0] + 6, y + 15); g.fillText(String(q), cols[1] + 6, y + 15); g.fillText(naira(q * pr), cols[2] + 6, y + 15);
    if (age > .7) { g.fillStyle = '#1d8a4e'; g.fillText('\u2713 Paid', cols[3] + 6, y + 15); } else { g.fillStyle = '#d9921f'; g.fillText('\u2026 pending', cols[3] + 6, y + 15); }
  }
  g.strokeStyle = '#dde3e6'; for (const x of cols) { g.beginPath(); g.moveTo(x, hy); g.lineTo(x, ty); g.stroke(); }
  g.fillStyle = '#e4f2e9'; g.fillRect(0, ty, W, 24); g.fillStyle = '#1b2a33'; g.font = 'bold 13px sans-serif'; g.fillText('TOTAL', 8, ty + 16); g.fillText(naira(sum), cols[2] + 6, ty + 16);
  footer(g, 'Closing orders', job, '#3fb97a');
}

const FEED_USERS = ['chidi_abj', 'amaka.styles', 'jabi.lake.vibes', 'nepa_updates', 'okada_gist', 'wuse2_foodie', 'tobi.codes', 'maitama_mum'];
const FEED_CAPS = ['Abuja traffic today \uD83D\uDE29', 'Jollof wars: who is winning?', 'NEPA just took light again', 'Weekend plan: Jabi Lake?', 'Fuel price don turn comedian', 'New suya spot in Wuse 2 \uD83D\uDD25', 'Sunday service fit check', 'Who else is working from home?'];
const FEED_ICO = ['\uD83C\uDF06', '\uD83C\uDF5B', '\uD83D\uDE97', '\uD83C\uDFB6', '\u26BD', '\uD83C\uDF34', '\uD83D\uDCF8', '\uD83D\uDECD\uFE0F'];

function browse(g: Ctx, mt: number, t: number) { // Scroll social media: a feed that flicks upward post by post
  g.fillStyle = '#0f1419'; g.fillRect(0, 0, W, H);
  const PH = 172, top = 30, stepT = 2.4, n = Math.floor(mt / stepT), f = Math.min(1, (mt % stepT) / .7), sc = (n + (1 - Math.pow(1 - f, 3))) * PH;
  for (let k = 0; k < 3; k++) {
    const idx = Math.floor(sc / PH) + k, py = top + idx * PH - sc, r = rnd(idx + 3), u = FEED_USERS[idx % FEED_USERS.length], liked = rnd(idx * 7 + 1) > .45;
    g.fillStyle = '#18202b'; rr(g, 10, py + 4, W - 20, PH - 10, 10); g.fill();
    g.fillStyle = `hsl(${Math.floor(r * 360)},60%,55%)`; g.beginPath(); g.arc(30, py + 24, 12, 0, 7); g.fill();
    g.textAlign = 'left'; g.fillStyle = '#e8eef5'; g.font = 'bold 12px sans-serif'; g.fillText(u, 48, py + 22); g.fillStyle = '#7a8896'; g.font = '11px sans-serif'; g.fillText(Math.floor(r * 11 + 1) + 'h', 48, py + 35);
    g.fillStyle = '#d6deeb'; g.font = '12px sans-serif'; g.fillText(FEED_CAPS[(idx * 3) % FEED_CAPS.length], 20, py + 56);
    const im = g.createLinearGradient(0, py + 64, W, py + 130); im.addColorStop(0, `hsl(${Math.floor(r * 360)},55%,42%)`); im.addColorStop(1, `hsl(${Math.floor(r * 360 + 60) % 360},60%,28%)`);
    g.fillStyle = im; rr(g, 20, py + 64, W - 40, 70, 8); g.fill(); g.font = '40px sans-serif'; g.textAlign = 'center'; g.fillText(FEED_ICO[idx % FEED_ICO.length], W / 2, py + 113); g.textAlign = 'left';
    g.font = '13px sans-serif'; g.fillStyle = liked ? '#ff4d6d' : '#8a98a6'; g.fillText(liked ? '\u2665' : '\u2661', 22, py + 154); g.fillStyle = '#aeb9c5'; g.font = '11px sans-serif'; g.fillText(Math.floor(r * 900 + 40) + '', 40, py + 154); g.fillText('\uD83D\uDCAC ' + Math.floor(r * 60 + 2), 90, py + 154); g.fillText('\u2197', 150, py + 154);
  }
  g.fillStyle = '#0f1419'; g.fillRect(0, 0, W, top); g.fillStyle = '#ffd36b'; g.font = 'italic bold 16px serif'; g.fillText('abujagram', 12, 21);
  g.textAlign = 'right'; g.fillStyle = '#e8eef5'; g.font = '14px sans-serif'; g.fillText('\u2661  \u2709', W - 12, 21); g.textAlign = 'left';
  if (Math.sin(t * 3) > 0) { g.fillStyle = '#ff4d6d'; g.beginPath(); g.arc(W - 22, 10, 3.5, 0, 7); g.fill(); }
  g.fillStyle = '#0b0f14'; g.fillRect(0, H - 22, W, 22); g.fillStyle = '#aeb9c5'; g.font = '13px sans-serif'; g.textAlign = 'center'; ['\u2302', '\u2315', '\uFF0B', '\u2661', '\u263A'].forEach((c, i) => g.fillText(c, 51 + i * 102, H - 6)); g.textAlign = 'left';
}

function deskIdle(g: Ctx, t: number) { // computer on, nothing running: a desktop with one icon per thing you can do here
  const k = g.createLinearGradient(0, 0, W, H); k.addColorStop(0, '#0b3d6b'); k.addColorStop(1, '#2a8bd0'); g.fillStyle = k; g.fillRect(0, 0, W, H);
  const gl = g.createRadialGradient(W * .75, H * .2, 0, W * .75, H * .2, 220); gl.addColorStop(0, 'rgba(255,255,255,.22)'); gl.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gl; g.fillRect(0, 0, W, H);
  [['\uD83D\uDCBB', 'Gigs'], ['\uD83E\uDDFE', 'Ledger'], ['\uD83D\uDCF1', 'Social']].forEach(([ic, lb], i) => { const x = 24, y = 18 + i * 72; g.fillStyle = 'rgba(255,255,255,.14)'; rr(g, x, y, 54, 54, 10); g.fill(); g.font = '30px sans-serif'; g.textAlign = 'center'; g.fillText(ic, x + 27, y + 38); g.font = 'bold 11px sans-serif'; g.fillStyle = '#fff'; g.fillText(lb, x + 27, y + 68); });
  g.textAlign = 'left'; g.fillStyle = 'rgba(8,16,28,.8)'; g.fillRect(0, H - 26, W, 26); g.fillStyle = '#5aa9ff'; rr(g, 6, H - 22, 22, 18, 4); g.fill();
  const d = new Date(), hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  g.textAlign = 'right'; g.fillStyle = '#e8eef5'; g.font = 'bold 12px sans-serif'; g.fillText(hm, W - 10, H - 8); g.textAlign = 'left';
  g.fillStyle = `rgba(255,255,255,${.5 + .5 * Math.sin(t * 2)})`; g.fillRect(W / 2 - 1, H / 2 - 8, 2, 16);
}

function overlay(g: Ctx, mt: number, scene: number, s: number, t: number) {
  const v = g.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, W * .65); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.5)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
  g.fillStyle = '#000'; g.fillRect(0, 0, W, LB); g.fillRect(0, H - LB, W, LB);
  const sub = SUBS[scene][s < .5 ? 0 : 1], fade = Math.min(1, ((s % .5) * 2) * 6, (1 - (s % .5) * 2) * 6);
  g.font = 'bold 15px sans-serif'; g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = `rgba(0,0,0,${.85 * fade})`; g.strokeText(sub, W / 2, H - LB - 12); g.fillStyle = `rgba(255,255,255,${fade})`; g.fillText(sub, W / 2, H - LB - 12); g.textAlign = 'left';
  if (mt < 3.6) { const a = Math.min(1, (3.6 - mt) * 1.4); g.fillStyle = `rgba(0,0,0,${.78 * a})`; g.fillRect(0, 0, W, H); g.textAlign = 'center'; g.fillStyle = `rgba(240,200,120,${a})`; g.font = 'bold 40px serif'; g.fillText('ABUJA NIGHTS', W / 2, H / 2 + 6); g.font = '14px sans-serif'; g.fillStyle = `rgba(255,255,255,${a * .8})`; g.fillText('A  NOLLYWOOD  ORIGINAL', W / 2, H / 2 + 34); g.textAlign = 'left'; }
  g.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < 40; i++) g.fillRect(rnd(i + Math.floor(t * 12)) * W, rnd(i * 3 + Math.floor(t * 12)) * H, 1.5, 1.5);
}

function draw(g: Ctx, mode: ScreenMode, mt: number, t: number, kind: 'tv' | 'desk', job: JobInfo): string {
  if (mode === 'movie') {
    const T = mt % (SUBS.length * SCENE_LEN), sc = Math.floor(T / SCENE_LEN), s = (T % SCENE_LEN) / SCENE_LEN;
    if (sc === 0) dusk(g, s); else if (sc === 1) drive(g, s, mt); else if (sc === 2) talk(g, s, mt); else lake(g, s, mt);
    overlay(g, mt, sc, s, t); const f = Math.min(1, T % SCENE_LEN * 2.2); if (f < 1 && mt > SCENE_LEN * .5) { g.fillStyle = `rgba(0,0,0,${1 - f})`; g.fillRect(0, 0, W, H); } // fade in from black at each scene change
    return TINT[sc];
  }
  if (mode === 'game') { game(g, mt); return '#9fd4ff'; }
  if (mode === 'work') { work(g, mt, t, job); return '#9fc8ff'; }
  if (mode === 'hustle') { hustle(g, mt, job); return '#d8ffe6'; }
  if (mode === 'browse') { browse(g, mt, t); return '#ffd9a8'; }
  if (kind === 'desk') { deskIdle(g, t); return '#6aa0ff'; }
  idle(g, t); return '#6aa0ff';
}

export default function MovieScreen({ p, w, h, on, ry = 0, watch, light = false, kind = 'tv', job }: { p: [number, number, number]; w: number; h: number; on: boolean; ry?: number; watch: () => ScreenMode; light?: boolean; kind?: 'tv' | 'desk'; job?: () => JobInfo }) {
  const { cv, tex } = useMemo(() => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return { cv, tex }; }, []);
  const last = useRef(-1), start = useRef(0), prev = useRef<ScreenMode>(null), lit = useRef<THREE.PointLight>(null!), vid = useRef<HTMLVideoElement | null>(null), vTex = useRef<THREE.VideoTexture | null>(null), vOk = useRef(false), mat = useRef<THREE.MeshBasicMaterial>(null!);

  // optional real video: only used if /public/video/movie.mp4 exists
  useEffect(() => {
    if (kind === 'desk') return; // computer monitors never play the film
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
    const tint = draw(cv.getContext('2d')!, mode, t - start.current, t, kind, job ? job() : { prog: 0, pay: 0 }); tex.needsUpdate = true;
    if (lit.current) lit.current.color.set(tint);
  });

  return <group position={p} rotation-y={ry}>
    <mesh><planeGeometry args={[w, h]} />{on ? <meshBasicMaterial ref={mat} map={tex} toneMapped={false} /> : <meshStandardMaterial color="#05070a" roughness={.2} />}</mesh>
    {light && <pointLight ref={lit} position={[0, -.05, .7]} intensity={0} distance={4.5} decay={2} color="#6aa0ff" />}
  </group>;
}