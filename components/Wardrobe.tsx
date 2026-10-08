'use client';
import { Canvas, useFrame } from '@react-three/fiber';
import { Suspense, useRef, useState } from 'react';
import * as THREE from 'three';
import Human from './Human';
import RuntimeStyle from './RuntimeStyle';
import { HAIR_COLORS, OUTFITS, PANTS, applyOutfitModel, hairsFor, outfitOk, type Look } from '../lib/characterModels';
import { OUTFIT_MODELS, STYLES, type Profile } from '../lib/profile';

function Turntable({ look, spin }: { look: Look; spin: boolean }) {
  const g = useRef<THREE.Group>(null!);
  useFrame((_, dt) => { if (spin) g.current.rotation.y += dt * .6; });
  return <group ref={g}><Human look={look} getState={() => 'idle'} /></group>;
}
const Swatches = ({ list, value, on }: { list: string[]; value: string; on: (c: string) => void }) =>
  <div className="wdSw">{list.map(c => <button key={c} aria-label={c} className={value.toLowerCase() === c ? 'sel' : ''} style={{ background: c }} onClick={() => on(c)} />)}</div>;

// The bedroom mirror: try on outfits, colours and hairstyles before saving.
export default function Wardrobe({ look, profile, onSave, onClose }: { look: Look; profile: Profile; onSave: (l: Look, p: Profile) => Promise<void> | void; onClose: () => void }) {
  const [l, setL] = useState<Look>(look), [pf, setPf] = useState<Profile>(profile), [spin, setSpin] = useState(true), [busy, setBusy] = useState(false);
  const cop = look.outfitModel === 'uniform'; // officers keep the uniform; they can still change hair
  const models = OUTFIT_MODELS.filter(m => !('police' in m && m.police) && outfitOk(m.id, l.gender));
  const pick = (id: string) => { const m = OUTFIT_MODELS.find(x => x.id === id)!; setL(p => applyOutfitModel(p, id)); setPf(p => ({ ...p, outfitModel: id as Profile['outfitModel'], style: m.style as Profile['style'] })); };
  const save = async () => { setBusy(true); try { await onSave(l, pf); } finally { setBusy(false); } };
  return <div className="wd">
    <div className="wdView"><Canvas camera={{ position: [0, 1.1, 3.9], fov: 32 }} dpr={[1, 1.75]}>
      <hemisphereLight args={['#fff4e6', '#443322', 1.25]} /><directionalLight position={[3, 5, 4]} intensity={2.2} /><directionalLight position={[-4, 2, -3]} intensity={.8} color="#9fc4ff" />
      <mesh rotation-x={-Math.PI / 2} position={[0, -.88, 0]}><circleGeometry args={[1.05, 48]} /><meshStandardMaterial color="#2a1c14" roughness={.9} /></mesh>
      <Suspense fallback={null}><group position={[0, -.88, 0]}><Turntable look={l} spin={spin} /></group></Suspense></Canvas>
      <button className="wdSpin" onClick={() => setSpin(s => !s)}>{spin ? '⏸ Pause' : '↻ Rotate'}</button></div>
    <div className="wdPanel"><h2>🪞 Wardrobe &amp; mirror</h2>
      {cop ? <p className="wdNote">You are on duty: your police uniform stays on. You can still change your hair.</p> : <>
        <label>Outfit</label><div className="wdSeg">{models.map(m => <button key={m.id} className={l.outfitModel === m.id ? 'sel' : ''} onClick={() => pick(m.id)}>{m.label}</button>)}</div>
        <p className="wdNote">Style: {STYLES.find(x => x.id === pf.style)?.label}</p>
        <label>Outfit colour</label><Swatches list={OUTFITS} value={l.outfit} on={c => setL(p => ({ ...p, outfit: c }))} />
        <label>Bottoms / accent colour</label><Swatches list={PANTS} value={l.pants} on={c => setL(p => ({ ...p, pants: c }))} /></>}
      <label>Hairstyle</label><div className="wdSeg">{hairsFor(l.gender).map(h => <button key={h.id} className={l.hair === h.id ? 'sel' : ''} onClick={() => setL(p => ({ ...p, hair: h.id }))}>{h.label}</button>)}</div>
      <label>Hair colour</label><Swatches list={HAIR_COLORS} value={l.hairColor} on={c => setL(p => ({ ...p, hairColor: c }))} />
      <div className="wdBtns"><button className="wdGhost" onClick={onClose}>Cancel</button><button className="wdGo" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Wear it ✓'}</button></div></div>
    <RuntimeStyle css={`.wd{position:fixed;inset:0;z-index:60;display:grid;grid-template-columns:1fr 360px;background:radial-gradient(circle at 40% 30%,#4a3322,#120c08);color:#fff;font-family:Inter,system-ui,sans-serif}
.wdView{position:relative;min-height:0}.wdSpin{position:absolute;left:14px;bottom:14px;background:#00000066;color:#fff;border:1px solid #ffffff33;border-radius:999px;padding:6px 12px;font-size:12px;cursor:pointer}
.wdPanel{padding:24px 22px;background:#140d09f2;border-left:1px solid #ffffff22;display:flex;flex-direction:column;gap:10px;overflow:auto}.wdPanel h2{margin:0 0 4px;font-size:20px}
.wdPanel label{font-size:11px;color:#c9b3a2;letter-spacing:.06em;text-transform:uppercase;margin-top:4px}.wdNote{margin:0;font-size:12px;color:#d9c7b8}
.wdSw{display:flex;gap:8px;flex-wrap:wrap}.wdSw button{width:32px;height:32px;border-radius:50%;border:2px solid #ffffff33;cursor:pointer}.wdSw button.sel{border-color:#f0b94a;transform:scale(1.15)}
.wdSeg{display:flex;gap:6px;flex-wrap:wrap}.wdSeg button{background:#2a1c14;border:1px solid #4a3426;color:#f3e3d3;border-radius:9px;padding:8px 10px;cursor:pointer;font-size:12px;transition:background .2s,transform .15s}.wdSeg button:hover{transform:translateY(-1px)}.wdSeg button.sel{background:#b8741f;border-color:#f0b94a;color:#fff}
.wdBtns{display:flex;gap:8px;margin-top:auto;padding-top:10px}.wdGo{flex:2;background:#d99a42;color:#1a1208;border:0;border-radius:12px;padding:14px;font-weight:800;font-size:15px;cursor:pointer}.wdGo:disabled{opacity:.5}.wdGhost{flex:1;background:transparent;color:#f3e3d3;border:1px solid #ffffff33;border-radius:12px;cursor:pointer}
@media(max-width:700px){.wd{grid-template-columns:1fr;grid-template-rows:42% 1fr}.wdPanel{border-left:0;border-top:1px solid #ffffff22}}`} /></div>;
}
