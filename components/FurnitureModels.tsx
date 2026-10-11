'use client';
/* 3D models for the furniture varieties in lib/catalog.ts (beds, sofas, chairs, wardrobes, TVs, tables, kitchen).
   Front of every piece faces +z, back/headboard at -z; the group origin is the floor centre of the footprint. */
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { itemById } from '../lib/catalog';
import { shade } from '../lib/colorShade';

type V3 = [number, number, number];
const B = ({ p, s, c, r = .02, ro = .7, m = 0, rot, op, e, ei = .8 }: { p: V3; s: V3; c: string; r?: number; ro?: number; m?: number; rot?: V3; op?: number; e?: string; ei?: number }) =>
  <RoundedBox args={s} radius={Math.max(.002, Math.min(r, Math.min(...s) / 2 - .002))} smoothness={2} position={p} rotation={rot} castShadow={op === undefined} receiveShadow>
    <meshStandardMaterial color={c} roughness={ro} metalness={m} transparent={op !== undefined} opacity={op ?? 1} depthWrite={op === undefined} emissive={e ?? '#000'} emissiveIntensity={e ? ei : 0} /></RoundedBox>;
const Cy = ({ p, r, h, c, rt, ro = .6, m = 0, rot, e }: { p: V3; r: number; h: number; c: string; rt?: number; ro?: number; m?: number; rot?: V3; e?: string }) =>
  <mesh position={p} rotation={rot} castShadow receiveShadow><cylinderGeometry args={[rt ?? r, r, h, 20]} /><meshStandardMaterial color={c} roughness={ro} metalness={m} emissive={e ?? '#000'} emissiveIntensity={e ? .8 : 0} /></mesh>;
const Sp = ({ p, r, c, sc = [1, 1, 1], ro = .85 }: { p: V3; r: number; c: string; sc?: V3; ro?: number }) =>
  <mesh position={p} scale={sc} castShadow receiveShadow><sphereGeometry args={[r, 18, 14]} /><meshStandardMaterial color={c} roughness={ro} /></mesh>;
const GOLD = '#c9a24a', STEEL = '#aeb4ba', DARK = '#17181b', GLASS = '#a9c7d6', STONE = '#e7e3dc';
const hashPick = <T,>(c: string, a: T[]): T => a[[...c].reduce((s, ch) => s + ch.charCodeAt(0), 0) % a.length];
const legs4 = (w: number, d: number, h: number, c: string, t = .05, ins = .06) =>
  ([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map(([x, z]) => <B key={x + '' + z} p={[x * (w / 2 - ins), h / 2, z * (d / 2 - ins)]} s={[t, h, t]} c={c} r={.01} />);

/* ───────── Beds ───────── */
function Bed({ w, l, st, c }: { w: number; l: number; st: string; c: string }) {
  const fab = ['tufted', 'storage', 'wingback', 'led'].includes(st);
  const frame = fab ? shade(c, -.3) : c, duv = fab ? shade(c, .22) : hashPick(c, ['#f1efe9', '#cdd5dc', '#dccdb4', '#e9d4d7']), pil = fab ? shade(c, .65) : '#f6f4ef', fold = fab ? shade(c, -.1) : shade(duv, -.15);
  const lg = st === 'storage' || st === 'platform' ? .03 : st === 'led' ? .14 : .16, bt = st === 'storage' ? .36 : st === 'platform' ? .22 : .14, top = lg + bt, hz = -l / 2, mt = .2;
  const px = w > 1.2 ? [-w * .24, w * .24] : [0];
  return <group>
    <B p={[0, lg + bt / 2, 0]} s={[w, bt, l]} c={frame} ro={fab ? .9 : .6} r={.03} />
    {st === 'storage' && [-1, 1].map(x => <B key={x} p={[x * w * .25, lg + bt / 2, l / 2 + .005]} s={[.012, bt * .8, .01]} c={shade(frame, -.3)} />)}
    {st === 'led' && <B p={[0, .06, 0]} s={[w - .1, .03, l - .1]} c="#69d2ff" e="#69d2ff" ei={1.4} />}
    {!['platform', 'storage', 'led'].includes(st) && legs4(w, l, lg, frame, .06, .05)}
    <B p={[0, top + mt / 2, .02]} s={[w - .06, mt, l - .08]} c="#f2eee6" ro={.95} r={.06} />
    <B p={[0, top + mt + .02, .22]} s={[w - .04, .08, l - .5]} c={duv} ro={.98} r={.04} />
    <B p={[0, top + mt + .005, l / 2 - .2]} s={[w - .02, .06, .24]} c={fold} ro={.98} r={.03} />
    {px.map(x => <B key={x} p={[x, top + mt + .12, hz + .32]} s={[Math.min(.62, w * .42), .14, .38]} c={pil} ro={.98} r={.07} />)}
    {st === 'panel' && <><B p={[0, .55, hz + .04]} s={[w + .08, 1.1, .08]} c={c} /><B p={[0, top + .15, l / 2 - .02]} s={[w + .04, .3, .05]} c={c} /></>}
    {st === 'tufted' && <><B p={[0, .62, hz + .06]} s={[w + .1, 1.24, .12]} c={c} ro={.95} r={.05} />
      {Array.from({ length: Math.max(3, Math.round(w * 3)) }, (_, i) => [0, 1].map(j => <Sp key={i + '' + j} p={[(i - (Math.max(3, Math.round(w * 3)) - 1) / 2) * (w / Math.max(3, Math.round(w * 3))), .5 + j * .4, hz + .13]} r={.022} c={shade(c, -.35)} />))}</>}
    {st === 'slat' && <><B p={[0, .75, hz + .04]} s={[w + .06, .06, .06]} c={c} /><B p={[0, .32, hz + .04]} s={[w + .06, .06, .06]} c={c} />
      {Array.from({ length: 8 }, (_, i) => <B key={i} p={[(i - 3.5) * ((w - .1) / 7), .53, hz + .04]} s={[.045, .5, .045]} c={shade(c, .08)} r={.01} />)}</>}
    {st === 'metal' && <>{[-1, 1].map(x => <Cy key={x} p={[x * (w / 2 - .02), .6, hz + .03]} r={.022} h={1.2} c={c} m={.8} ro={.35} />)}
      {[.45, .75, 1.05].map(y => <Cy key={y} p={[0, y, hz + .03]} r={.014} h={w - .04} c={c} m={.8} ro={.35} rot={[0, 0, Math.PI / 2]} />)}
      {[-1, 1].map(x => <Cy key={x} p={[x * (w / 2 - .02), .35, l / 2 - .03]} r={.02} h={.7} c={c} m={.8} ro={.35} />)}<Cy p={[0, .62, l / 2 - .03]} r={.014} h={w - .04} c={c} m={.8} ro={.35} rot={[0, 0, Math.PI / 2]} /></>}
    {st === 'platform' && <><B p={[0, .38, hz + .05]} s={[w + .2, .6, .1]} c={c} /><B p={[0, .08, 0]} s={[w + .08, .06, l + .08]} c={shade(c, -.35)} /></>}
    {st === 'poster' && <><B p={[0, .5, hz + .05]} s={[w, .9, .08]} c={c} />
      {([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map(([x, z]) => <B key={x + '' + z} p={[x * (w / 2 - .03), .95, z * (l / 2 - .04)]} s={[.07, 1.9, .07]} c={c} r={.02} />)}
      {[-1, 1].map(z => <B key={z} p={[0, 1.88, z * (l / 2 - .04)]} s={[w, .05, .05]} c={c} />)}{[-1, 1].map(x => <B key={x} p={[x * (w / 2 - .03), 1.88, 0]} s={[.05, .05, l]} c={c} />)}</>}
    {st === 'sleigh' && <><B p={[0, .62, hz + .08]} s={[w + .1, 1.0, .1]} c={c} r={.12} /><B p={[0, 1.12, hz + .08]} s={[w + .12, .12, .14]} c={shade(c, .08)} r={.06} /><B p={[0, .5, l / 2 - .06]} s={[w + .1, .64, .1]} c={c} r={.12} /><B p={[0, .84, l / 2 - .06]} s={[w + .12, .1, .14]} c={shade(c, .08)} r={.05} /></>}
    {st === 'wingback' && <><B p={[0, .72, hz + .07]} s={[w - .1, 1.44, .14]} c={c} ro={.95} r={.06} />{[-1, 1].map(x => <B key={x} p={[x * (w / 2 - .02), .62, hz + .22]} s={[.16, 1.04, .34]} c={shade(c, -.08)} ro={.95} r={.07} />)}<B p={[0, top + .02, l / 2 - .03]} s={[w, .26, .08]} c={frame} ro={.95} /></>}
    {st === 'led' && <><B p={[0, .55, hz + .05]} s={[w + .1, 1.0, .1]} c={c} ro={.95} r={.05} /><B p={[0, .55, hz + .115]} s={[w - .1, .06, .02]} c="#69d2ff" e="#69d2ff" ei={1.4} /></>}
  </group>;
}

/* ───────── Sofas & armchairs ───────── */
function Seat({ x = 0, z = 0, w, d, c, back = true, h = .45, ry = 0, soft = .12, pad }: { x?: number; z?: number; w: number; d: number; c: string; back?: boolean; h?: number; ry?: number; soft?: number; pad?: string }) {
  return <group position={[x, 0, z]} rotation-y={ry}>
    <B p={[0, h - .12, 0]} s={[w, .24, d]} c={shade(c, -.2)} ro={.9} r={.05} />
    <B p={[0, h + .02, .04]} s={[w - .04, .16, d - .14]} c={pad || c} ro={.95} r={soft} />
    {back && <B p={[0, h + .3, -d / 2 + .13]} s={[w - .04, .5, .22]} c={pad || c} ro={.95} r={soft} rot={[-.12, 0, 0]} />}</group>;
}
function Sofa({ w, d, st, c }: { w: number; d: number; st: string; c: string }) {
  const dk = shade(c, -.28), leg = st === 'mid' ? '#6b4a2f' : '#2a2a2c', n = Math.max(1, Math.round((w - .3) / .75)), sw = (w - .3) / n;
  if (st === 'sectional' || st === 'ushape') {
    const u = st === 'ushape', cw = .95, sd = .95, x0 = u ? -w / 2 + cw : -w / 2, x1 = w / 2 - cw, nb = Math.max(2, Math.round((x1 - x0) / .85)), sw = (x1 - x0) / nb, zb = -d / 2 + sd / 2;
    const Chaise = ({ x }: { x: number }) => <group position={[x, 0, 0]}><B p={[0, .24, 0]} s={[cw, .24, d]} c={dk} ro={.9} r={.05} /><B p={[0, .47, (sd) / 2 * .5]} s={[cw - .04, .16, d - sd + .1]} c={c} ro={.95} r={.1} /><B p={[0, .47, zb]} s={[cw - .04, .16, sd - .14]} c={c} ro={.95} r={.1} /><B p={[0, .75, zb - .1]} s={[cw - .04, .5, .22]} c={c} ro={.95} r={.1} rot={[-.12, 0, 0]} /></group>;
    return <group>
      {Array.from({ length: nb }, (_, i) => <Seat key={i} x={x0 + sw * (i + .5)} z={zb} w={sw - .01} d={sd} c={c} />)}
      <Chaise x={w / 2 - cw / 2} />{u && <Chaise x={-w / 2 + cw / 2} />}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => <B key={x + '' + z} p={[x * (w / 2 - .08), .04, z * (d / 2 - .08)]} s={[.05, .08, .05]} c={leg} />)}</group>;
  }
  const arm = st === 'chester' || st === 'tuxedo' ? .72 : st === 'cloud' ? .6 : .6, aw = st === 'cloud' ? .26 : st === 'mid' ? .1 : .17;
  return <group>
    {Array.from({ length: n }, (_, i) => <Seat key={i} x={-w / 2 + .15 + sw * (i + .5)} w={sw - .01} d={d} c={c} pad={st === 'rattan' ? '#ece3d0' : undefined} soft={st === 'cloud' ? .2 : st === 'mid' ? .04 : .12} h={st === 'mid' ? .5 : .45} />)}
    {[-1, 1].map(x => <B key={x} p={[x * (w / 2 - aw / 2), arm / 2 + .08, 0]} s={[aw, arm, d]} c={dk} ro={.9} r={st === 'chester' ? .1 : st === 'cloud' ? .12 : .04} />)}
    {(st === 'chester' || st === 'tuxedo') && <B p={[0, .85, -d / 2 + .1]} s={[w - .1, .56, .2]} c={dk} ro={.7} r={.06} />}
    {st === 'chester' && Array.from({ length: n * 3 }, (_, i) => <Sp key={i} p={[-w / 2 + .3 + i * ((w - .6) / (n * 3 - 1)), .92, -d / 2 + .21]} r={.018} c="#000" />)}
    {st === 'rattan' && <><B p={[0, .13, 0]} s={[w, .22, d]} c="#a8814f" ro={.95} />{Array.from({ length: 6 }, (_, i) => <B key={i} p={[0, .06 + i * .03, d / 2 + .003]} s={[w, .008, .005]} c="#7c5c34" />)}</>}
    {st === 'recsofa' && <B p={[0, .5, d / 2 - .02]} s={[.03, .1, .04]} c={GOLD} />}
    {st === 'recsofa' && Array.from({ length: n - 1 }, (_, i) => <B key={i} p={[-w / 2 + .15 + sw * (i + 1), .58, .1]} s={[.14, .3, d - .3]} c={dk} r={.04} />)}
    {st === 'love' && <B p={[0, .3, d / 2 - .01]} s={[w - .5, .02, .02]} c={GOLD} />}
    {legs4(w, d, .1, leg, st === 'mid' ? .04 : .05, .08)}
  </group>;
}

/* ───────── Chairs, stools & friends ───────── */
function Chair({ w, d, st, c }: { w: number; d: number; st: string; c: string }) {
  const wood = ['dc_classic', 'dc_ladder', 'dc_cross', 'folding', 'rock', 'cane'].includes(st), dk = shade(c, -.3);
  if (st.startsWith('dc_')) { const leg = wood ? c : '#2a2a2c', seat = wood ? shade(c, -.1) : c;
    return <group>{legs4(w, d, .44, leg, .04, .04)}<B p={[0, .46, 0]} s={[w, .06, d]} c={seat} ro={.9} r={.025} />
      {st === 'dc_cush' && <B p={[0, .51, 0]} s={[w - .04, .06, d - .04]} c={c} ro={.95} r={.03} />}
      {st === 'dc_cush' || st === 'dc_classic' ? <B p={[0, .74, -d / 2 + .03]} s={[w - .04, .5, .05]} c={wood ? c : c} r={.02} /> : null}
      {st === 'dc_shell' && <B p={[0, .72, -d / 2 + .06]} s={[w, .54, .08]} c={c} ro={.8} r={.07} rot={[-.1, 0, 0]} />}
      {st === 'dc_wing' && <><B p={[0, .85, -d / 2 + .05]} s={[w, .8, .08]} c={c} ro={.95} r={.05} />{[-1, 1].map(x => <B key={x} p={[x * (w / 2 - .02), .82, -d / 2 + .15]} s={[.05, .5, .2]} c={dk} ro={.95} r={.03} />)}</>}
      {st === 'dc_ladder' && [.62, .74, .86, .98].map(y => <B key={y} p={[0, y, -d / 2 + .03]} s={[w - .06, .05, .03]} c={c} r={.01} />)}
      {st === 'dc_cross' && <><B p={[0, .66, -d / 2 + .03]} s={[w - .04, .04, .04]} c={c} /><B p={[0, .92, -d / 2 + .03]} s={[w - .04, .05, .04]} c={c} /><B p={[0, .79, -d / 2 + .03]} s={[.03, .3, .03]} c={c} rot={[0, 0, .6]} /><B p={[0, .79, -d / 2 + .03]} s={[.03, .3, .03]} c={c} rot={[0, 0, -.6]} /></>}
      {['dc_classic', 'dc_ladder', 'dc_cross'].includes(st) && [-1, 1].map(x => <B key={x} p={[x * (w / 2 - .03), .75, -d / 2 + .04]} s={[.04, .6, .04]} c={leg} r={.01} />)}</group>; }
  if (st.startsWith('stool')) { const tall = .72;
    return <group><Cy p={[0, tall, 0]} r={w / 2} h={.07} c={st === 'stool_pad' ? c : c} ro={.85} />{st === 'stool_pad' && <Cy p={[0, tall - .05, 0]} r={w / 2 - .02} h={.06} c={'#2a2a2c'} />}
      {st === 'stool_pad' ? <Cy p={[0, tall / 2 - .04, 0]} r={.025} h={tall - .1} c={STEEL} m={.8} ro={.3} /> : legs4(w, w, tall - .03, c, .03, .05)}
      {st === 'stool_pad' && <Cy p={[0, .03, 0]} r={w / 2} h={.03} c={STEEL} m={.8} ro={.3} />}{st !== 'stool_pad' && <Cy p={[0, .26, 0]} r={w / 2 - .04} rt={w / 2 - .04} h={.015} c={c} />}
      {st === 'stool_back' && <B p={[0, tall + .2, -w / 2 + .03]} s={[w - .06, .3, .04]} c={c} />}</group>; }
  if (st === 'off_mesh' || st === 'off_exec' || st === 'off_ergo' || st === 'game') {
    const ex = st === 'off_exec', gm = st === 'game', bk = ex ? .78 : gm ? .88 : .6, sc = gm ? '#1a1a1d' : st === 'off_mesh' ? '#2a2c30' : c;
    return <group><Cy p={[0, .28, 0]} r={.03} h={.4} c={STEEL} m={.8} ro={.3} />{[0, 1, 2, 3, 4].map(i => <B key={i} p={[Math.sin(i * 1.2566) * .22, .05, Math.cos(i * 1.2566) * .22]} s={[.05, .035, .05]} c={DARK} />)}{[0, 1, 2, 3, 4].map(i => <B key={'s' + i} p={[Math.sin(i * 1.2566) * .11, .07, Math.cos(i * 1.2566) * .11]} s={[.26, .025, .035]} c={STEEL} m={.8} ro={.3} rot={[0, i * 1.2566 + Math.PI / 2, 0]} />)}
      <B p={[0, .5, 0]} s={[.52, .09, .5]} c={ex ? c : sc} ro={.9} r={.04} /><B p={[0, .5 + bk / 2 + .05, -.22]} s={[.5, bk, .08]} c={st === 'off_mesh' ? c : ex ? c : gm ? c : c} ro={st === 'off_mesh' ? 1 : .8} r={.05} rot={[-.1, 0, 0]} />
      {[-1, 1].map(x => <B key={x} p={[x * .3, .7, -.02]} s={[.05, .05, .3]} c={ex ? c : DARK} r={.02} />)}
      {gm && <><B p={[0, .5 + bk + .02, -.26]} s={[.36, .26, .07]} c={shade(c, .1)} r={.04} rot={[-.1, 0, 0]} />{[-1, 1].map(x => <B key={x} p={[x * .19, .98, -.2]} s={[.06, .7, .06]} c={'#e8e8e8'} r={.02} rot={[-.1, 0, 0]} />)}</>}</group>;
  }
  if (st === 'folding') return <group>{[-1, 1].map(x => <B key={x} p={[x * .17, .24, 0]} s={[.03, .48, .03]} c={dk} rot={[0, 0, x * .4]} />)}<B p={[0, .42, 0]} s={[w, .04, d]} c={c} />{[-1, 1].map(x => <B key={x} p={[x * (w / 2 - .03), .7, -d / 2 + .04]} s={[.03, .5, .03]} c={dk} />)}<B p={[0, .75, -d / 2 + .04]} s={[w - .04, .3, .03]} c={c} /></group>;
  if (st === 'rock') return <group>{[-1, 1].map(x => <B key={x} p={[x * .28, .04, 0]} s={[.04, .06, d]} c={dk} r={.03} />)}{[-1, 1].map(x => <B key={'l' + x} p={[x * .26, .22, .1]} s={[.04, .36, .04]} c={c} />)}<B p={[0, .44, .02]} s={[w - .1, .05, d - .3]} c={c} /><B p={[0, .8, -.2]} s={[w - .14, .7, .05]} c={c} rot={[-.15, 0, 0]} /></group>;
  if (st === 'bean') return <group><Sp p={[0, .3, 0]} r={.45} c={c} sc={[1, .7, 1]} /><Sp p={[0, .55, -.25]} r={.34} c={shade(c, -.06)} sc={[1.1, .9, .6]} /></group>;
  if (st === 'egg') return <group><Cy p={[0, 1.8, 0]} r={.012} h={1.3} c={STEEL} m={.8} /><mesh position={[0, 1.0, 0]} scale={[1, 1.1, .9]} castShadow><sphereGeometry args={[.45, 18, 14, 0, Math.PI * 2, 0, Math.PI * .72]} /><meshStandardMaterial color={c} roughness={.9} side={THREE.DoubleSide} /></mesh><Sp p={[0, .82, .06]} r={.34} c={'#eee6d6'} sc={[1, .5, 1]} /><Cy p={[0, .02, -.1]} r={.4} h={.04} c={DARK} /></group>;
  /* upholstered armchairs & recliners */
  const rec = st === 'recl', wg = st === 'wing', ba = st === 'barrel';
  return <group>
    {ba ? <><Cy p={[0, .3, 0]} r={.38} h={.6} c={dk} ro={.9} /><Cy p={[0, .52, 0]} r={.33} h={.06} c={c} ro={.95} /><mesh position={[0, .75, -.06]} castShadow><cylinderGeometry args={[.4, .4, .5, 24, 1, true, Math.PI * .45, Math.PI * 1.1]} /><meshStandardMaterial color={c} roughness={.9} side={THREE.DoubleSide} /></mesh></>
      : <><Seat w={w} d={d} c={c} h={.42} soft={st === 'scoop' ? .2 : .1} />
        {[-1, 1].map(x => <B key={x} p={[x * (w / 2 - .09), .5, 0]} s={[.18, .5, d]} c={dk} ro={.9} r={.06} />)}
        {wg && [-1, 1].map(x => <B key={x} p={[x * (w / 2 - .12), .98, -d / 2 + .2]} s={[.12, .4, .3]} c={c} ro={.95} r={.05} />)}
        {wg && <B p={[0, .98, -d / 2 + .13]} s={[w - .3, .7, .14]} c={c} ro={.95} r={.06} />}
        {rec && <B p={[0, .24, d / 2 + .1]} s={[w - .3, .12, .4]} c={dk} r={.05} rot={[.2, 0, 0]} />}
        {st === 'cane' && <><B p={[0, .8, -d / 2 + .1]} s={[w - .1, .6, .05]} c="#d8c39a" ro={1} />{Array.from({ length: 5 }, (_, i) => <B key={i} p={[0, .58 + i * .11, -d / 2 + .13]} s={[w - .1, .01, .01]} c={'#8a6b3c'} />)}</>}</>}
    {legs4(w, d, .12, wood ? c : '#2a2a2c', .05, .1)}</group>;
}

/* ───────── Wardrobes ───────── */
function Wardrobe({ w, d, st, c }: { w: number; d: number; st: string; c: string }) {
  const kids = st === 'kids', H = kids ? 1.5 : st === 'armoire' ? 2.2 : 2.15, lt = shade(c, .12), hd = st === 'gold' ? GOLD : '#c8cacc';
  const n = st === 'kids' ? 2 : st === 'h2' || st === 'louvre' || st === 'armoire' ? 2 : st === 'h3' || st === 's2' ? (st === 's2' ? 2 : 3) : st === 'h4' ? 4 : st === 's3' ? 3 : st === 'mirror' ? 3 : st === 'gold' ? 4 : 2;
  if (st === 'open') return <group><B p={[0, H / 2, -d / 2 + .02]} s={[w, H, .03]} c={shade(c, -.1)} />{[-1, 0, 1].map(x => <B key={x} p={[x * (w / 2 - .02), H / 2, 0]} s={[.04, H, d]} c={c} />)}{[.3, 1.0, 1.9].map(y => <B key={y} p={[0, y, 0]} s={[w, .03, d]} c={c} />)}
    <Cy p={[-w / 4, 1.7, 0]} r={.015} h={w / 2 - .06} c={STEEL} m={.8} rot={[0, 0, Math.PI / 2]} />{Array.from({ length: 6 }, (_, i) => <B key={i} p={[-w / 4 - .3 + i * .12, 1.4, 0]} s={[.05, .55, .2]} c={hashPick(c + i, ['#f1efe9', '#2b3a55', '#8a2a2a', '#d6c4a2', '#3a5a45'])} r={.02} />)}<Cy p={[w / 4, 1.7, 0]} r={.015} h={w / 2 - .06} c={STEEL} m={.8} rot={[0, 0, Math.PI / 2]} /></group>;
  const dw = (w - .06) / n, sl = st === 's2' || st === 's3';
  return <group>
    <B p={[0, H / 2 + .04, 0]} s={[w, H - .08, d]} c={shade(c, -.12)} /><B p={[0, .04, 0]} s={[w + .02, .08, d + .02]} c={shade(c, -.4)} />{st === 'armoire' && <B p={[0, H + .05, 0]} s={[w + .1, .12, d + .08]} c={shade(c, -.05)} r={.04} />}
    {st === 'corner' && <B p={[w / 2 - d / 2, H / 2 + .04, d / 2 - w / 2 + .1]} s={[d, H - .08, w - .2]} c={c} />}
    {Array.from({ length: n }, (_, i) => { const x = -w / 2 + .03 + dw * (i + .5), z = d / 2 + (sl ? (i % 2 ? .035 : .0) : .012), mir = st === 'mirror' && i === 1;
      return <group key={i}><B p={[x, H / 2 + .04, z]} s={[dw - .01, H - .12, .03]} c={mir ? '#cfe3ee' : c} m={mir ? .9 : 0} ro={mir ? .08 : .6} r={.012} />
        {st === 'louvre' && Array.from({ length: 14 }, (_, k) => <B key={k} p={[x, .25 + k * .14, z + .02]} s={[dw - .06, .02, .02]} c={lt} />)}
        {st === 'gold' && <><B p={[x, H / 2 + .04, z + .018]} s={[dw - .08, H - .2, .006]} c={GOLD} m={.8} ro={.3} op={.0001} /><B p={[x, H - .15, z + .02]} s={[dw - .07, .015, .01]} c={GOLD} m={.8} ro={.3} /><B p={[x, .25, z + .02]} s={[dw - .07, .015, .01]} c={GOLD} m={.8} ro={.3} /></>}
        {st === 'mirror' && !mir && <B p={[x, H / 2 + .04, z + .018]} s={[dw - .1, H - .3, .006]} c={lt} />}
        <B p={[sl ? x + (i % 2 ? -dw / 2 + .06 : dw / 2 - .06) : x + (i % 2 ? -dw / 2 + .06 : dw / 2 - .06), kids ? .8 : 1.0, z + .03]} s={[.02, kids ? .22 : .3, .02]} c={hd} m={.7} ro={.3} /></group>; })}
    {sl && <><B p={[0, H - .05, d / 2 + .02]} s={[w - .04, .02, .06]} c={STEEL} m={.7} /><B p={[0, .1, d / 2 + .02]} s={[w - .04, .02, .06]} c={STEEL} m={.7} /></>}
  </group>;
}

/* ───────── TVs & TV furniture ───────── */
function TV({ w, st, c }: { w: number; st: string; c: string }) {
  const [type, size] = st.split(':'), h = w * .5625, oled = type === 'oled', curved = type === 'curved', bz = oled || type === 'mini' ? .008 : .018, th = oled ? .025 : .06, y0 = .12 + (size && +size >= 75 ? .06 : 0);
  const scr = '#06101c', glow = type === 'mini' ? '#10284a' : oled ? '#0b1626' : '#0a1b30';
  const panel = (x: number, ry: number, ww: number) => <group position={[x, y0 + h / 2 + .06, 0]} rotation-y={ry}><B p={[0, 0, 0]} s={[ww, h + bz * 2, th]} c={c} m={.5} ro={.35} r={.01} /><mesh position={[0, 0, th / 2 + .001]}><planeGeometry args={[ww - bz * 2, h]} /><meshStandardMaterial color={scr} emissive={glow} emissiveIntensity={.9} roughness={.15} metalness={.2} /></mesh></group>;
  return <group>
    {curved ? <>{panel(-w / 3, .22, w / 3 + .02)}{panel(0, 0, w / 3 + .02)}{panel(w / 3, -.22, w / 3 + .02)}</> : panel(0, 0, w)}
    <B p={[0, y0 + .04, -.04]} s={[w * .22, .08, .1]} c={shade(c, -.2)} r={.02} />
    {oled || type === 'mini' ? <B p={[0, .05, -.02]} s={[w * .5, .03, .22]} c={c} m={.6} r={.01} /> : [-1, 1].map(x => <B key={x} p={[x * w * .38, .05, 0]} s={[.07, .08, .24]} c={c} m={.5} ro={.3} r={.02} />)}
    {w > 1 && <B p={[0, y0 + .02 + .06, th / 2 + .01]} s={[.001, .001, .001]} c={c} />}
  </group>;
}
function TvStand({ w, d, st, c }: { w: number; d: number; st: string; c: string }) {
  const dk = shade(c, -.25), lt = shade(c, .12);
  if (st === 'wall') return <group><B p={[0, 1.0, -d / 2 + .02]} s={[w, 2.0, .04]} c={dk} /><B p={[0, .2, 0]} s={[w, .4, d]} c={c} />{[-1, 1].map(x => <B key={x} p={[x * (w / 2 - .02), 1.0, 0]} s={[.04, 2.0, d]} c={c} />)}<B p={[0, 1.98, 0]} s={[w, .04, d]} c={c} />
    {[.8, 1.3, 1.8].map(y => <B key={y} p={[0, y, 0]} s={[w * .3, .03, d - .1]} c={c} />)}
    {[-1, 1].map(s => <group key={s}><B p={[s * w * .36, 1.2, 0]} s={[w * .24, 1.6, d - .05]} c={dk} />{[.7, 1.2, 1.7].map(y => <B key={y} p={[s * w * .36, y, d / 2 - .02]} s={[w * .22, .45, .02]} c={lt} />)}</group>)}</group>;
  if (st === 'float') return <group><B p={[0, .6, 0]} s={[w, .28, d]} c={c} r={.03} /><B p={[0, .6, d / 2 + .004]} s={[.01, .22, .01]} c={'#d8d8d8'} />{[-.3, .3].map(x => <B key={x} p={[x * w, .6, d / 2 + .004]} s={[.01, .22, .01]} c={'#d8d8d8'} />)}<B p={[0, .8, -d / 2 + .004]} s={[w * .9, .01, .01]} c={'#ffd9a0'} e="#ffd9a0" /></group>;
  if (st === 'corner') return <group>{legs4(w, d, .12, dk)}<B p={[0, .32, 0]} s={[w, .4, d]} c={c} rot={[0, 0, 0]} /><B p={[0, .56, 0]} s={[w + .02, .04, d + .02]} c={lt} />{[-1, 1].map(x => <B key={x} p={[x * w * .25, .32, d / 2 + .004]} s={[w * .44, .34, .01]} c={dk} />)}</group>;
  const dr = st === 'drawers', gl = st === 'glass';
  return <group>{legs4(w, d, .14, st === 'low' ? dk : '#2a2a2c', .04, .06)}<B p={[0, .36, 0]} s={[w, .42, d]} c={c} r={.02} /><B p={[0, .585, 0]} s={[w + .02, .03, d + .02]} c={lt} />
    {dr ? [-1, 0, 1].map(x => <B key={x} p={[x * w * .31, .36, d / 2 + .005]} s={[w * .3, .34, .01]} c={dk} />) : gl ? [-1, 1].map(x => <B key={x} p={[x * w * .26, .36, d / 2 + .005]} s={[w * .44, .34, .012]} c={GLASS} op={.45} />) : [-1, 1].map(x => <B key={x} p={[x * w * .26, .36, d / 2 + .005]} s={[w * .44, .34, .01]} c={dk} />)}
    {dr && [-1, 0, 1].map(x => <B key={'h' + x} p={[x * w * .31, .4, d / 2 + .02]} s={[.1, .015, .015]} c={GOLD} m={.8} />)}</group>;
}

/* ───────── Tables, desks & storage ───────── */
function Table({ w, d, st, c }: { w: number; d: number; st: string; c: string }) {
  const dk = shade(c, -.25), lt = shade(c, .1);
  if (st === 'coffee_round' || st === 'dine_round') { const h = st === 'dine_round' ? .76 : .42; return <group><Cy p={[0, h, 0]} r={w / 2} h={.05} c={c} ro={.5} />{st === 'dine_round' ? <><Cy p={[0, h / 2, 0]} r={.07} h={h} c={dk} /><Cy p={[0, .03, 0]} r={.3} h={.06} c={dk} /></> : [0, 1, 2].map(i => <B key={i} p={[Math.sin(i * 2.09) * .3, h / 2, Math.cos(i * 2.09) * .3]} s={[.05, h, .05]} c={dk} />)}</group>; }
  if (st === 'desk_l') return <group><B p={[0, .74, -d / 2 + .3]} s={[w, .04, .6]} c={c} /><B p={[w / 2 - .3, .74, 0]} s={[.6, .04, d]} c={c} />{[[-w / 2 + .05, -d / 2 + .1], [w / 2 - .05, -d / 2 + .1], [w / 2 - .05, d / 2 - .05], [w / 2 - .55, d / 2 - .05]].map(([x, z], i) => <B key={i} p={[x, .36, z]} s={[.05, .72, .05]} c={dk} />)}<B p={[-w / 2 + .35, .5, -d / 2 + .3]} s={[.5, .45, .5]} c={dk} /></group>;
  if (st === 'desk' || st === 'desk_stand') { const h = st === 'desk_stand' ? 1.05 : .74; return <group><B p={[0, h, 0]} s={[w, .04, d]} c={c} />{st === 'desk_stand' ? <>{[-1, 1].map(x => <B key={x} p={[x * (w / 2 - .12), h / 2, 0]} s={[.06, h, d - .1]} c={'#202226'} />)}<B p={[0, .05, 0]} s={[w - .1, .04, .06]} c={'#202226'} /></> : <>{legs4(w, d, h, dk, .05, .04)}<B p={[w / 2 - .27, h - .22, 0]} s={[.5, .38, d - .08]} c={dk} />{[0, 1].map(k => <B key={k} p={[w / 2 - .27, h - .13 - k * .18, d / 2 - .035]} s={[.46, .15, .012]} c={lt} />)}</>}</group>; }
  if (st === 'shelf') return <group><B p={[0, .9, -d / 2 + .01]} s={[w, 1.8, .02]} c={dk} />{[-1, 1].map(x => <B key={x} p={[x * (w / 2 - .01), .9, 0]} s={[.03, 1.8, d]} c={c} />)}{[.02, .45, .9, 1.35, 1.78].map(y => <B key={y} p={[0, y, 0]} s={[w, .03, d]} c={c} />)}{[.45, .9, 1.35].map((y, i) => Array.from({ length: 5 }, (_, k) => <B key={i + '' + k} p={[-w / 2 + .15 + k * .17, y + .15, 0]} s={[.07 + (k % 2) * .03, .26 - (k % 3) * .03, .22]} c={hashPick(c + i + k, ['#8a2a2a', '#2b3a55', '#d6c4a2', '#3a5a45', '#6b4a2f'])} r={.005} />))}</group>;
  if (st === 'shoe') return <group>{[.05, .25, .45].map(y => <B key={y} p={[0, y, 0]} s={[w, .03, d]} c={c} />)}{[-1, 1].map(x => <B key={x} p={[x * (w / 2 - .01), .25, 0]} s={[.03, .5, d]} c={dk} />)}{[.05, .25, .45].map(y => [0, 1, 2].map(k => <B key={y + '' + k} p={[-w / 3 + k * w / 3, y + .06, 0]} s={[.2, .1, .1]} c={hashPick(c + y + k, ['#222', '#f2f2f2', '#7a4a2a', '#2b3a55'])} r={.04} />))}</group>;
  if (st === 'drawers' || st === 'dresser' || st === 'bedside' || st === 'side') { const h = st === 'side' ? .5 : st === 'bedside' ? .55 : st === 'dresser' ? .85 : .9, rows = st === 'side' ? 0 : st === 'bedside' ? 2 : st === 'dresser' ? 3 : 4;
    return <group>{legs4(w, d, .1, dk, .04, .03)}<B p={[0, .1 + (h - .1) / 2, 0]} s={[w, h - .1, d]} c={c} r={.02} /><B p={[0, h + .015, 0]} s={[w + .02, .03, d + .02]} c={lt} />
      {Array.from({ length: rows }, (_, i) => <group key={i}><B p={[0, .15 + (i + .5) * ((h - .2) / rows), d / 2 + .004]} s={[w - .06, (h - .2) / rows - .02, .012]} c={dk} /><B p={[0, .15 + (i + .5) * ((h - .2) / rows), d / 2 + .02]} s={[.1, .015, .015]} c={GOLD} m={.8} ro={.3} /></group>)}
      {st === 'dresser' && <><B p={[0, h + .55, -d / 2 + .03]} s={[w * .75, .9, .03]} c={'#cfe3ee'} m={.9} ro={.08} /><B p={[0, h + .55, -d / 2 + .015]} s={[w * .75 + .06, .96, .02]} c={dk} /></>}</group>; }
  const glass = st === 'coffee_glass', dine = st === 'dine', h = dine ? .76 : .42;
  return <group><B p={[0, h, 0]} s={[w, .04, d]} c={glass ? GLASS : c} op={glass ? .45 : undefined} ro={glass ? .1 : .5} m={glass ? .2 : 0} />
    {legs4(w, d, h, glass ? STEEL : dk, dine ? .08 : .05, dine ? .06 : .05)}{(glass || st === 'coffee_rect') && <B p={[0, .12, 0]} s={[w - .1, .03, d - .1]} c={glass ? STEEL : lt} />}</group>;
}

/* ───────── Kitchen ───────── */
const Door = ({ y, h, w, z, c, hd = STEEL, bar = true }: { y: number; h: number; w: number; z: number; c: string; hd?: string; bar?: boolean }) => <group><B p={[0, y, z]} s={[w, h, .025]} c={c} r={.01} />{bar && <B p={[w / 2 - .06, y + h / 2 - .1, z + .03]} s={[.02, h * .7, .03]} c={hd} m={.8} ro={.25} />}</group>;
function Fridge({ w, d, st, c }: { w: number; d: number; st: string; c: string }) {
  const H = ({ single: 1.7, double: 1.85, sbs: 1.8, french: 1.85, chest: .85, mini: .9 } as Record<string, number>)[st] || 1.8, dk = shade(c, -.18), z = d / 2 + .012;
  return <group><B p={[0, H / 2 + .02, 0]} s={[w, H, d]} c={dk} m={.3} ro={.45} r={.03} />
    {st === 'chest' ? <><B p={[0, H + .02, 0]} s={[w + .01, .06, d + .01]} c={c} m={.3} r={.03} /><B p={[0, H - .06, d / 2 + .02]} s={[.3, .03, .03]} c={STEEL} m={.8} /></>
      : st === 'sbs' ? <><B p={[-w / 4, H / 2 + .02, z]} s={[w / 2 - .02, H - .04, .025]} c={c} m={.3} r={.01} /><B p={[w / 4, H / 2 + .02, z]} s={[w / 2 - .02, H - .04, .025]} c={c} m={.3} r={.01} /><B p={[-.04, H * .55, z + .03]} s={[.02, .7, .03]} c={STEEL} m={.8} /><B p={[.04, H * .55, z + .03]} s={[.02, .7, .03]} c={STEEL} m={.8} /></>
      : st === 'french' ? <><B p={[-w / 4, H * .72, z]} s={[w / 2 - .02, H * .56, .025]} c={c} m={.3} r={.01} /><B p={[w / 4, H * .72, z]} s={[w / 2 - .02, H * .56, .025]} c={c} m={.3} r={.01} /><B p={[0, H * .22, z]} s={[w - .02, H * .42, .025]} c={c} m={.3} r={.01} /><B p={[0, H * .22 + .12, z + .03]} s={[.3, .02, .03]} c={STEEL} m={.8} /></>
      : st === 'double' ? <><B p={[0, H * .76, z]} s={[w - .02, H * .44, .025]} c={c} m={.3} r={.01} /><B p={[0, H * .3, z]} s={[w - .02, H * .52, .025]} c={c} m={.3} r={.01} /><B p={[w / 2 - .08, H * .6, z + .03]} s={[.02, .35, .03]} c={STEEL} m={.8} /><B p={[w / 2 - .08, H * .42, z + .03]} s={[.02, .5, .03]} c={STEEL} m={.8} /></>
      : <><B p={[0, H / 2 + .02, z]} s={[w - .02, H - .04, .025]} c={c} m={.3} r={.01} /><B p={[w / 2 - .08, H * .55, z + .03]} s={[.02, .6, .03]} c={STEEL} m={.8} /></>}
    {['double', 'french', 'sbs'].includes(st) && <B p={[w / 2 - .14, H * .88, z + .02]} s={[.1, .12, .01]} c={'#0b1018'} e="#6ec6ff" ei={.5} />}
  </group>;
}
function Cooker({ w, d, st, c }: { w: number; d: number; st: string; c: string }) {
  const dk = shade(c, -.2);
  if (st === 'hood') return <group><mesh position={[0, 1.7, 0]} castShadow><cylinderGeometry args={[w * .2, w * .5, .35, 4, 1]} /><meshStandardMaterial color={c} metalness={.6} roughness={.3} /></mesh><B p={[0, 2.1, -d / 4]} s={[w * .3, .8, .25]} c={c} m={.6} ro={.3} /><B p={[0, 1.55, d / 2 - .1]} s={[w * .5, .01, .1]} c={'#fff4d0'} e="#ffe9a8" /></group>;
  if (st === 'micro') return <group><B p={[0, .25, 0]} s={[w, .28, d]} c={c} m={.3} r={.03} /><B p={[-.07, .25, d / 2 + .005]} s={[w * .65, .2, .01]} c={'#0b1219'} ro={.1} /><B p={[w * .36, .25, d / 2 + .005]} s={[.09, .22, .01]} c={dk} />{[0, 1].map(i => <Cy key={i} p={[w * .36, .3 - i * .08, d / 2 + .02]} r={.015} h={.02} c={STEEL} rot={[Math.PI / 2, 0, 0]} />)}</group>;
  if (st === 'oven') return <group><B p={[0, .3, 0]} s={[w, .6, d]} c={dk} m={.3} /><B p={[0, .27, d / 2 + .005]} s={[w - .06, .4, .02]} c={c} m={.3} r={.01} /><B p={[0, .27, d / 2 + .02]} s={[w * .62, .2, .01]} c={'#0b1219'} ro={.1} /><B p={[0, .52, d / 2 + .02]} s={[w * .6, .05, .02]} c={'#10151a'} e="#ff7a2a" ei={.2} /><B p={[0, .38, d / 2 + .04]} s={[w * .7, .02, .02]} c={STEEL} m={.8} /></group>;
  const burners = st === 'gas6' ? 6 : st === 'gas5' ? 5 : 4, ind = st === 'induct', cols = burners > 4 ? 3 : 2;
  return <group><B p={[0, .45, 0]} s={[w, .9, d]} c={dk} m={.3} ro={.45} r={.02} /><B p={[0, .905, 0]} s={[w, .02, d]} c={ind ? '#0b0d10' : '#15171a'} ro={.2} m={.5} />
    {Array.from({ length: burners }, (_, i) => { const r = Math.floor(i / cols), k = i % cols, x = (k - (cols - 1) / 2) * (w / cols), z = (r === 0 ? -1 : 1) * d * .2 + (burners === 5 && i === 4 ? 0 : 0); return ind ? <Cy key={i} p={[x, .92, z]} r={.1} h={.004} c={'#101216'} e="#2a6fff" /> : <group key={i}><Cy p={[x, .93, z]} r={.075} h={.025} c={'#2c2f33'} m={.5} /><Cy p={[x, .945, z]} r={.04} h={.01} c={STEEL} m={.8} /></group>; })}
    <B p={[0, .35, d / 2 + .005]} s={[w - .06, .5, .02]} c={c} m={.3} r={.015} /><B p={[0, .34, d / 2 + .02]} s={[w * .65, .28, .01]} c={'#0b1219'} ro={.1} /><B p={[0, .62, d / 2 + .04]} s={[w * .75, .025, .03]} c={STEEL} m={.8} />
    {Array.from({ length: Math.min(5, burners) }, (_, i) => <Cy key={i} p={[(i - (Math.min(5, burners) - 1) / 2) * (w / 5.5), .8, d / 2 + .03]} r={.022} h={.03} c={'#111'} rot={[Math.PI / 2, 0, 0]} />)}</group>;
}
function Laundry({ w, d, st, c }: { w: number; d: number; st: string; c: string }) {
  const dk = shade(c, -.15);
  if (st === 'twin') return <group><B p={[0, .45, 0]} s={[w, .9, d]} c={c} r={.04} />{[-1, 1].map(x => <Cy key={x} p={[x * w * .24, .92, 0]} r={.17} h={.02} c={STEEL} m={.7} />)}<B p={[0, .85, d / 2 - .03]} s={[w - .04, .08, .04]} c={dk} /></group>;
  if (st === 'dish') return <group><B p={[0, .43, 0]} s={[w, .86, d]} c={dk} m={.3} /><B p={[0, .4, d / 2 + .005]} s={[w - .02, .78, .02]} c={c} m={.3} r={.01} /><B p={[0, .8, d / 2 + .02]} s={[w - .04, .06, .01]} c={'#0b1018'} e="#6ec6ff" ei={.4} /><B p={[0, .72, d / 2 + .04]} s={[w * .7, .02, .02]} c={STEEL} m={.8} /></group>;
  return <group><B p={[0, .45, 0]} s={[w, .9, d]} c={dk} m={.2} r={.03} /><B p={[0, .45, d / 2 + .004]} s={[w - .02, .88, .01]} c={c} r={.02} /><Cy p={[0, .42, d / 2 + .02]} r={.22} h={.04} c={'#d8dde2'} m={.7} rot={[Math.PI / 2, 0, 0]} /><Cy p={[0, .42, d / 2 + .04]} r={.17} h={.03} c={st === 'dryer' ? '#3a4a5a' : '#12202e'} ro={.05} rot={[Math.PI / 2, 0, 0]} /><B p={[0, .82, d / 2 + .02]} s={[w - .06, .08, .01]} c={'#0b1018'} /><Cy p={[-w * .3, .82, d / 2 + .03]} r={.025} h={.02} c={STEEL} rot={[Math.PI / 2, 0, 0]} /><B p={[w * .28, .82, d / 2 + .03]} s={[.1, .03, .01]} c={'#6ec6ff'} e="#6ec6ff" /></group>;
}
function Cabinet({ w, d, st, c }: { w: number; d: number; st: string; c: string }) {
  const dk = shade(c, -.22), top = shade(c, .0) === c && ['#222326', '#27406b', '#5b3d29'].includes(c) ? '#e7e3dc' : '#4a4a4c', n = Math.max(1, Math.round(w / .6));
  if (st === 'wall') return <group><B p={[0, 1.55, 0]} s={[w, .7, d]} c={c} r={.02} />{Array.from({ length: n }, (_, i) => <group key={i}><B p={[-w / 2 + (i + .5) * (w / n), 1.55, d / 2 + .005]} s={[w / n - .02, .66, .015]} c={dk} /><B p={[-w / 2 + (i + .5) * (w / n) + (w / n) * .35, 1.35, d / 2 + .02]} s={[.015, .1, .015]} c={STEEL} m={.8} /></group>)}</group>;
  const h = st === 'bar' ? 1.05 : .88;
  return <group><B p={[0, h / 2, 0]} s={[w, h - .04, d]} c={c} r={.015} /><B p={[0, .04, d / 2 - .02]} s={[w, .08, .03]} c={'#1a1a1c'} />
    <B p={[0, h, st === 'island' || st === 'bar' ? .04 : 0]} s={[w + .04, .05, d + (st === 'island' || st === 'bar' ? .12 : .03)]} c={top} ro={.3} m={.1} r={.01} />
    {Array.from({ length: n }, (_, i) => <group key={i}><B p={[-w / 2 + (i + .5) * (w / n), h / 2, d / 2 + .005]} s={[w / n - .02, h - .16, .015]} c={dk} /><B p={[-w / 2 + (i + .5) * (w / n), h - .15, d / 2 + .02]} s={[.14, .015, .015]} c={STEEL} m={.8} /></group>)}
    {st === 'sink' && <><B p={[-w * .2, h + .03, 0]} s={[w * .34, .02, d * .6]} c={'#0b0d10'} m={.7} ro={.2} /><B p={[w * .2, h + .03, 0]} s={[w * .34, .02, d * .6]} c={'#0b0d10'} m={.7} ro={.2} /><Cy p={[0, h + .17, -d / 2 + .08]} r={.015} h={.3} c={STEEL} m={.9} ro={.2} /><B p={[0, h + .31, -d / 2 + .15]} s={[.02, .02, .16]} c={STEEL} m={.9} /></>}
  </group>;
}
function Gadget({ st, c }: { st: string; c: string }) {
  const dk = shade(c, -.25);
  switch (st) {
    case 'airfryer': return <group><B p={[0, .15, 0]} s={[.32, .3, .32]} c={c} r={.08} /><B p={[0, .12, .165]} s={[.22, .12, .01]} c={'#10151a'} /><B p={[0, .28, .16]} s={[.2, .05, .01]} c={'#0b1018'} e="#6ec6ff" ei={.4} /></group>;
    case 'blender': return <group><B p={[0, .08, 0]} s={[.2, .16, .2]} c={c} r={.04} /><Cy p={[0, .29, 0]} r={.085} rt={.1} h={.28} c={GLASS} /><Cy p={[0, .45, 0]} r={.1} h={.03} c={dk} /></group>;
    case 'toaster': return <group><B p={[0, .1, 0]} s={[.28, .2, .17]} c={c} m={.4} r={.05} /><B p={[-.05, .205, 0]} s={[.07, .01, .13]} c={'#101010'} /><B p={[.05, .205, 0]} s={[.07, .01, .13]} c={'#101010'} /></group>;
    case 'kettle': return <group><Cy p={[0, .1, 0]} r={.1} rt={.08} h={.2} c={c} m={.5} ro={.3} /><Cy p={[0, .21, 0]} r={.07} h={.03} c={dk} /><B p={[.11, .12, 0]} s={[.03, .13, .05]} c={dk} /><Cy p={[0, .01, 0]} r={.11} h={.02} c={'#222'} /></group>;
    case 'coffee': return <group><B p={[0, .02, 0]} s={[.28, .04, .32]} c={dk} /><B p={[0, .2, -.1]} s={[.26, .38, .1]} c={c} m={.4} r={.03} /><B p={[0, .36, 0]} s={[.26, .08, .28]} c={c} m={.4} r={.03} /><Cy p={[0, .1, .08]} r={.05} h={.1} c={'#f2f2f2'} /></group>;
    default: return <group><B p={[0, .04, 0]} s={[.2, .08, .26]} c={c} r={.03} /><B p={[0, .22, -.07]} s={[.1, .3, .12]} c={c} r={.04} /><B p={[0, .36, .02]} s={[.1, .1, .22]} c={c} r={.04} /><Cy p={[0, .18, .06]} r={.09} h={.1} c={STEEL} m={.8} /></group>;
  }
}

/** Does this catalog item have a 3D model? */
export const hasFurnitureModel = (itemKey: string) => !!itemById(itemKey)?.kind;

/** Renders the 3D model for a catalog variant at the origin of its parent group. Returns null for classic items (the caller draws its box). */
export default function FurnitureModel({ itemKey, fp }: { itemKey: string; fp?: [number, number] }) {
  const it = itemById(itemKey); if (!it?.kind) return null;
  const [w, d] = fp || it.fp || [.8, .6], c = it.col || '#8a8a8a', st = it.style || '';
  switch (it.kind) {
    case 'bed': return <Bed w={w} l={d} st={st} c={c} />;
    case 'sofa': return <Sofa w={w} d={d} st={st} c={c} />;
    case 'chair': return <Chair w={w} d={d} st={st} c={c} />;
    case 'wardrobe': return <Wardrobe w={w} d={d} st={st} c={c} />;
    case 'tv': return <TV w={w} st={st} c={c} />;
    case 'tvstand': return <TvStand w={w} d={d} st={st} c={c} />;
    case 'table': return <Table w={w} d={d} st={st} c={c} />;
    case 'fridge': return <Fridge w={w} d={d} st={st} c={c} />;
    case 'cooker': return <Cooker w={w} d={d} st={st} c={c} />;
    case 'laundry': return <Laundry w={w} d={d} st={st} c={c} />;
    case 'cabinet': return <Cabinet w={w} d={d} st={st} c={c} />;
    case 'gadget': return <Gadget st={st} c={c} />;
    default: return null;
  }
}
