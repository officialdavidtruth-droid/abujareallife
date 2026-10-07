'use client';
import { Canvas, useFrame } from '@react-three/fiber';
import { Suspense, useRef, useState } from 'react';
import * as THREE from 'three';
import Human from './Human';
import { DEFAULT_LOOK, HAIRS, HAIR_COLORS, OUTFITS, PANTS, SKIN_TONES, applyOutfitModel, type Look } from '../lib/characterModels';
import { DEFAULT_PROFILE, OUTFIT_MODELS, PROFESSIONS, SKILLS, STYLES, skillLevel, type Profile } from '../lib/profile';

import RuntimeStyle from './RuntimeStyle';
function Turntable({ look }: { look: Look }) {
  const g = useRef<THREE.Group>(null!);
  useFrame((_, dt) => { g.current.rotation.y += dt * .5; });
  return <group ref={g}><Human look={look} getState={() => 'idle'} /></group>;
}
const Swatches = ({ list, value, on }: { list: string[]; value: string; on: (c: string) => void }) =>
  <div className="sw">{list.map(c => <button key={c} aria-label={c} className={value === c ? 'sel' : ''} style={{ background: c }} onClick={() => on(c)} />)}</div>;

export default function Creator({ initial, initialProfile, onDone }: { initial: Look | null; initialProfile?: Profile | null; onDone: (l: Look, p: Profile) => void }) {
  const [l, setL] = useState<Look>({ ...DEFAULT_LOOK, ...(initial || {}) });
  const first = !initialProfile; // onboarding (no profile yet) vs. editing from the character profile
  const [pf, setPf] = useState<Profile>(initialProfile || DEFAULT_PROFILE);
  const setP = <K extends keyof Profile>(k: K, v: Profile[K]) => setPf(p => ({ ...p, [k]: v }));
  const set = <K extends keyof Look>(k: K, v: Look[K]) => setL(p => ({ ...p, [k]: v }));
  return <div className="cr">
    <div className="crView"><Canvas camera={{ position: [0, 1.15, 4.2], fov: 32 }} dpr={[1, 1.75]}>
      <hemisphereLight args={['#dfeeff', '#554433', 1.3]} /><directionalLight position={[3, 5, 4]} intensity={2.2} /><mesh rotation-x={-Math.PI / 2} position={[0, -.88, 0]}><circleGeometry args={[1.1, 48]} /><meshStandardMaterial color="#173126" roughness={.9} /></mesh>
      <Suspense fallback={null}><group position={[0, -.88, 0]}><Turntable look={l} /></group></Suspense></Canvas></div>
    <div className="crPanel"><h2>Create your character</h2>
      <p className="who">Playing as <b>{l.name}</b></p>
      <label>Profession</label><div className="seg wrap">{PROFESSIONS.filter(x => first || x.id !== 'police' || pf.profession === 'police').map(x => <button key={x.id} title={x.blurb} className={pf.profession === x.id ? 'sel' : ''} onClick={() => { setP('profession', x.id); if (x.id === 'police') setL(p => applyOutfitModel(p, 'uniform')); else if (l.outfitModel === 'uniform') setL(p => applyOutfitModel(p, 'tee')); if (x.id === 'police') setP('outfitModel', 'uniform'); else if (pf.outfitModel === 'uniform') setP('outfitModel', 'tee'); }}>{x.e} {x.label}</button>)}</div>
      <p className="who">{PROFESSIONS.find(x => x.id === pf.profession)?.blurb}</p>
      <label>Skill to focus on <i>(every skill starts at 0)</i></label><div className="seg wrap">{SKILLS.map(x => <button key={x.id} className={pf.focus === x.id ? 'sel' : ''} onClick={() => setP('focus', x.id)}>{x.e} {x.label}{!first && <small> Lv {skillLevel(pf.skills[x.id])}</small>}</button>)}</div>
      <label>Style</label><div className="seg wrap">{STYLES.map(x => <button key={x.id} className={pf.style === x.id ? 'sel' : ''} onClick={() => setP('style', x.id)}>{x.label}</button>)}</div>
      <label>Outfit model</label><div className="seg wrap">{OUTFIT_MODELS.filter(m => !('police' in m && m.police) || pf.profession === 'police').map(m => <button key={m.id} className={pf.outfitModel === m.id ? 'sel' : ''} onClick={() => { setP('outfitModel', m.id); setL(p => applyOutfitModel(p, m.id)); }}>{m.label}</button>)}</div>
      <label>Body</label><div className="seg">{([['m', 'Man'], ['f', 'Woman']] as const).map(([k, n]) => <button key={k} className={l.gender === k ? 'sel' : ''} onClick={() => setL(p => ({ ...p, gender: k, hair: p.gender === k ? p.hair : k === 'f' ? 'braids' : 'short' }))}>{n}</button>)}</div>
      <label>Hair style</label><div className="seg wrap">{HAIRS.map(h => <button key={h.id} className={l.hair === h.id ? 'sel' : ''} onClick={() => set('hair', h.id)}>{h.label}</button>)}</div>
      <label>Hair colour</label><Swatches list={HAIR_COLORS} value={l.hairColor} on={c => set('hairColor', c)} />
      <label>Skin tone</label><Swatches list={SKIN_TONES} value={l.skin} on={c => set('skin', c)} />
      <label>Top colour</label><Swatches list={OUTFITS} value={l.outfit} on={c => set('outfit', c)} />
      <label>Trousers</label><Swatches list={PANTS} value={l.pants} on={c => set('pants', c)} />
      <label>Height<input type="range" min=".92" max="1.08" step=".01" value={l.height} onChange={e => set('height', +e.target.value)} /></label>
      <button className="go" onClick={() => onDone(l, pf)}>{first ? 'Enter Abuja →' : 'Save profile'}</button></div>
    <RuntimeStyle css={`.cr{position:fixed;inset:0;z-index:50;display:grid;grid-template-columns:1fr 340px;background:radial-gradient(circle at 40% 30%,#1c4a39,#07100d);color:#fff;font-family:Inter,system-ui,sans-serif}
.crView{min-height:0}.crPanel{padding:28px 24px;background:#0c1713f2;border-left:1px solid #ffffff22;display:flex;flex-direction:column;gap:12px;overflow:auto}.crPanel h2{margin:0 0 6px;font-size:20px}
.crPanel label{font-size:11px;color:#9fb5aa;display:flex;flex-direction:column;gap:6px;letter-spacing:.06em;text-transform:uppercase}.crPanel input[type=text],.crPanel input:not([type]),.crPanel select{background:#0a1511;border:1px solid #2a4337;border-radius:9px;padding:10px;color:#fff;font-size:14px}
.sw{display:flex;gap:8px;flex-wrap:wrap}.sw button{width:34px;height:34px;border-radius:50%;border:2px solid #ffffff33;cursor:pointer}.sw button.sel{border-color:#f0b94a;transform:scale(1.15)}
.seg{display:flex;gap:6px}.seg.wrap{flex-wrap:wrap}.seg button{flex:1;background:#14261f;border:1px solid #2a4337;color:#cfe;border-radius:9px;padding:8px 10px;cursor:pointer;font-size:12px;transition:background .2s,transform .15s}.seg button:hover{transform:translateY(-1px)}.seg button.sel{background:#1d7654;border-color:#3fb98a;color:#fff}
.who{margin:0;font-size:14px;color:#cfe}.go{margin-top:auto;background:#d99a42;color:#1a1208;border:0;border-radius:12px;padding:14px;font-weight:800;font-size:15px;cursor:pointer}.go:disabled{opacity:.4}
@media(max-width:700px){.cr{grid-template-columns:1fr;grid-template-rows:45% 1fr}.crPanel{border-left:0;border-top:1px solid #ffffff22}}`} /></div>;
}
