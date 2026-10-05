'use client';
import { Canvas, useFrame } from '@react-three/fiber';
import { Suspense, useRef, useState } from 'react';
import * as THREE from 'three';
import Human from './Human';
import { DEFAULT_LOOK, MODELS, OUTFITS, SKIN_TONES, type Look } from '../lib/characterModels';

function Turntable({ look }: { look: Look }) {
  const g = useRef<THREE.Group>(null!);
  useFrame((_, dt) => { g.current.rotation.y += dt * .5; });
  return <group ref={g}><Human look={look} getState={() => 'idle'} /></group>;
}
const Swatches = ({ list, value, on }: { list: string[]; value: string; on: (c: string) => void }) =>
  <div className="sw">{list.map(c => <button key={c} aria-label={c} className={value === c ? 'sel' : ''} style={{ background: c }} onClick={() => on(c)} />)}</div>;

export default function Creator({ initial, onDone }: { initial: Look | null; onDone: (l: Look) => void }) {
  const [l, setL] = useState<Look>(initial || DEFAULT_LOOK);
  const set = <K extends keyof Look>(k: K, v: Look[K]) => setL(p => ({ ...p, [k]: v }));
  return <div className="cr">
    <div className="crView"><Canvas camera={{ position: [0, 1.1, 3.6], fov: 34 }} dpr={[1, 1.75]}>
      <hemisphereLight args={['#dfeeff', '#554433', 1.3]} /><directionalLight position={[3, 5, 4]} intensity={2.2} />
      <Suspense fallback={null}><group position={[0, -.9, 0]}><Turntable look={l} /></group></Suspense></Canvas></div>
    <div className="crPanel"><h2>Create your character</h2>
      <p className="who">Playing as <b>{l.name}</b></p>
      {MODELS.length > 1 && <label>Body<select value={l.model} onChange={e => set('model', e.target.value)}>{MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>}
      <label>Skin tone</label><Swatches list={SKIN_TONES} value={l.skin} on={c => set('skin', c)} />
      <label>Outfit colour</label><Swatches list={OUTFITS} value={l.outfit} on={c => set('outfit', c)} />
      <label>Height<input type="range" min=".92" max="1.08" step=".01" value={l.height} onChange={e => set('height', +e.target.value)} /></label>
      <button className="go" onClick={() => onDone(l)}>Enter Abuja →</button></div>
    <style>{`.cr{position:fixed;inset:0;z-index:50;display:grid;grid-template-columns:1fr 340px;background:radial-gradient(circle at 40% 30%,#1c4a39,#07100d);color:#fff;font-family:Inter,system-ui,sans-serif}
.crView{min-height:0}.crPanel{padding:28px 24px;background:#0c1713f2;border-left:1px solid #ffffff22;display:flex;flex-direction:column;gap:12px;overflow:auto}.crPanel h2{margin:0 0 6px;font-size:20px}
.crPanel label{font-size:11px;color:#9fb5aa;display:flex;flex-direction:column;gap:6px;letter-spacing:.06em;text-transform:uppercase}.crPanel input[type=text],.crPanel input:not([type]),.crPanel select{background:#0a1511;border:1px solid #2a4337;border-radius:9px;padding:10px;color:#fff;font-size:14px}
.sw{display:flex;gap:8px}.sw button{width:34px;height:34px;border-radius:50%;border:2px solid #ffffff33;cursor:pointer}.sw button.sel{border-color:#f0b94a;transform:scale(1.15)}
.who{margin:0;font-size:14px;color:#cfe}.go{margin-top:auto;background:#d99a42;color:#1a1208;border:0;border-radius:12px;padding:14px;font-weight:800;font-size:15px;cursor:pointer}.go:disabled{opacity:.4}
@media(max-width:700px){.cr{grid-template-columns:1fr;grid-template-rows:45% 1fr}.crPanel{border-left:0;border-top:1px solid #ffffff22}}`}</style></div>;
}
