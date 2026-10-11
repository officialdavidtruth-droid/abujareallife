'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { DESIGNS, DOORS, EXTRAS, ROOFS, TRIMS, WALLS, styleCost, type Style } from '../lib/houseStyle';
import { loadHouses } from '../lib/houses';
import { HouseMeshes, previewHouse } from './PlayerHouses';
import RuntimeStyle from './RuntimeStyle';

/* "🎨 House look": change how your house on the street looks. Live 3D preview (drag to turn it), free colours, one-off paid designs and extras (lib/houseStyle.ts).
   A NEPO baby already owns every design and extra. Other players see the new look as soon as it is saved. */
const naira = (n: number) => '₦' + Math.round(n).toLocaleString('en-NG');
type Snap = { nepo: boolean; style: Style; cash: number };

export default function HouseStyle({ user, onClose, onCash }: { user: string; onClose: () => void; onCash?: (cash: number) => void }) {
  const [snap, setSnap] = useState<Snap | null>(null), [draft, setDraft] = useState<Style | null>(null), [busy, setBusy] = useState(false), [night, setNight] = useState(false), [note, setNote] = useState<{ t: string; bad?: boolean } | null>(null);
  const say = (t: string, bad = false) => { setNote({ t, bad }); setTimeout(() => setNote(n => (n && n.t === t ? null : n)), 4000); };
  const load = useCallback(async () => {
    try { const r = await fetch('/api/housestyle', { cache: 'no-store' }); if (!r.ok) return say('Could not load your house.', true); const d = await r.json() as Snap; setSnap(d); setDraft(d.style); }
    catch { say('No connection.', true); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const nepo = !!snap?.nepo;
  const price = useMemo(() => (snap && draft ? styleCost({ ...draft, od: snap.style.od, ox: snap.style.ox }, nepo) : { cost: 0, buys: [] as string[] }), [snap, draft, nepo]);
  const house = useMemo(() => (draft ? [previewHouse(draft, user, nepo)] : []), [draft, user, nepo]);
  const changed = !!snap && !!draft && (['d', 'w', 'r', 't', 'k', 'x'] as const).some(k => snap.style[k] !== draft[k]);
  const set = (p: Partial<Style>) => setDraft(d => (d ? { ...d, ...p } : d));
  const ownsD = (i: number) => !!snap && (((snap.style.od >> i) & 1) === 1 || (nepo));
  const ownsX = (b: number) => !!snap && ((snap.style.ox & b) !== 0 || nepo);

  async function save() {
    if (!draft || !snap || busy) return; setBusy(true);
    try {
      const r = await fetch('/api/housestyle', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ s: [draft.d, draft.w, draft.r, draft.t, draft.k, draft.x, draft.od, draft.ox].join(',') }) }), d = await r.json().catch(() => ({}));
      if (!r.ok) say(d.error || 'Could not save.', true);
      else { setSnap(d); setDraft(d.style); onCash?.(d.cash); say(d.paid ? `✨ New look saved! Paid ${naira(d.paid)}.` : '✨ New look saved!'); loadHouses(); }
    } catch { say('No connection.', true); } finally { setBusy(false); }
  }
  const poor = !!snap && price.cost > snap.cash;
  const swatches = (label: string, list: string[], key: 'w' | 'r' | 't' | 'k') => draft && <div className="hsRow"><b>{label}</b><div className="hsSw">{list.map((c, i) => <button key={c} className={draft[key] === i ? 'on' : ''} style={{ background: c }} onClick={() => set({ [key]: i } as Partial<Style>)} aria-label={`${label} ${i + 1}`} />)}</div></div>;

  return <div className="hsWrap" onClick={onClose}><div className="hsBox" onClick={e => e.stopPropagation()}>
    <RuntimeStyle css={CSS} id="arl-housestyle" />
    <div className="hsHead"><div><h3>🎨 House look</h3><small>{snap ? `Your cash: ${naira(snap.cash)}${nepo ? ' · 👑 Nepo baby: every design and extra is yours' : ''}` : 'Loading…'}</small></div><button onClick={onClose} aria-label="Close">×</button></div>
    <div className="hsPrev">
      {draft && <Canvas shadows dpr={[1, 1.5]} camera={{ position: [9.5, 6, 13], fov: 38 }}>
        <color attach="background" args={[night ? '#0a1020' : '#bfe0f5']} />
        <ambientLight intensity={night ? .25 : .85} /><directionalLight position={[8, 12, 10]} intensity={night ? .35 : 2.1} castShadow />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.02, 3]} receiveShadow><planeGeometry args={[60, 60]} /><meshStandardMaterial color={night ? '#1d2b1f' : '#5d7f55'} /></mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.01, 12]}><planeGeometry args={[60, 9]} /><meshStandardMaterial color="#3b3c40" /></mesh>
        <HouseMeshes list={house} forceNight={night ? 1 : 0} />
        <OrbitControls target={[0, 2.6, 2]} enablePan={false} minDistance={9} maxDistance={26} maxPolarAngle={Math.PI / 2.05} autoRotate autoRotateSpeed={.8} />
      </Canvas>}
      <button className="hsNight" onClick={() => setNight(v => !v)}>{night ? '☀️ Day' : '🌙 Night'}</button>
    </div>
    {note && <div className={'hsNote' + (note.bad ? ' bad' : '')}>{note.t}</div>}
    {draft && snap && <div className="hsList">
      <h4>🏠 DESIGN</h4>
      <div className="hsDes">{DESIGNS.map(d => <button key={d.id} className={draft.d === d.id ? 'on' : ''} onClick={() => set({ d: d.id })}><i>{d.e}</i><b>{d.name}</b><small>{ownsD(d.id) ? (nepo && d.id > 0 ? 'Family built' : 'Owned') : naira(d.price)}</small></button>)}</div>
      <small className="hsHint">{DESIGNS[draft.d].blurb}</small>
      <h4>🎨 COLOURS · free</h4>
      {swatches('Walls', WALLS, 'w')}{swatches('Roof', ROOFS, 'r')}{swatches('Trim', TRIMS, 't')}{swatches('Front door', DOORS, 'k')}
      <h4>✨ EXTRAS</h4>
      {EXTRAS.map(e => { const on = (draft.x & e.bit) !== 0, own = ownsX(e.bit); return <button key={e.key} className={'hsEx' + (on ? ' on' : '')} onClick={() => set({ x: on ? draft.x & ~e.bit : draft.x | e.bit })}>
        <i>{e.e}</i><span><b>{e.name}</b><small>{e.blurb}</small></span><em>{own ? (on ? 'ON' : 'OFF') : on ? `+${naira(e.price)}` : naira(e.price)}</em></button>; })}
    </div>}
    <div className="hsFoot">
      <button className="hsReset" disabled={!changed || busy} onClick={() => snap && setDraft(snap.style)}>Undo</button>
      <button className="hsSave" disabled={!changed || busy || poor || !snap} onClick={save}>{!changed ? 'No changes' : poor ? `Need ${naira(price.cost - (snap?.cash || 0))} more` : price.cost ? `Save · ${naira(price.cost)}` : 'Save · free'}</button>
    </div>
    {price.buys.length > 0 && <small className="hsBuys">Buying: {price.buys.join(', ')}</small>}
  </div></div>;
}
const CSS = `.hsWrap{position:fixed;inset:0;z-index:82;background:#000a;display:grid;place-items:center;padding:10px;backdrop-filter:blur(3px)}
.hsBox{width:min(620px,100%);max-height:calc(100dvh - 20px);display:flex;flex-direction:column;gap:8px;background:#0f1b16;color:#fff;border:1px solid #ffffff22;border-radius:18px;padding:12px;font-family:Inter,system-ui,sans-serif}
.hsHead{display:flex;justify-content:space-between;align-items:flex-start}.hsHead h3{margin:0;font-size:18px}.hsHead small{color:#9fb5aa;font-size:11px}.hsHead button{background:#20372d;border:0;color:#fff;border-radius:50%;width:32px;height:32px;font-size:18px}
.hsPrev{position:relative;flex:none;height:clamp(170px,34dvh,300px);border-radius:14px;overflow:hidden;background:#10201a}.hsNight{position:absolute;right:8px;top:8px;background:#000a;color:#fff;border:1px solid #ffffff33;border-radius:999px;padding:5px 11px;font-size:12px;font-weight:800}
.hsNote{background:#1f3a2e;border:1px solid #ffffff22;border-radius:10px;padding:7px 10px;font-size:12px}.hsNote.bad{background:#4a1f22;border-color:#e5484d66}
.hsList{flex:1;min-height:120px;overflow:auto;display:flex;flex-direction:column;gap:7px}.hsList h4{margin:8px 0 0;font-size:12px;color:#d99a42;letter-spacing:.04em}.hsHint{color:#9fb5aa;font-size:11px}
.hsDes{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.hsDes button{all:unset;cursor:pointer;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 4px;background:#10201a;border:2px solid #ffffff14;border-radius:12px;text-align:center}.hsDes button.on{border-color:#d99a42;background:#1d2a1c}.hsDes i{font-style:normal;font-size:24px}.hsDes b{font-size:12px}.hsDes small{font-size:10px;color:#ffd9a0}
.hsRow{display:flex;align-items:center;gap:8px}.hsRow b{flex:none;width:76px;font-size:12px;color:#c3d6cb}.hsSw{display:flex;flex-wrap:wrap;gap:5px}.hsSw button{all:unset;cursor:pointer;width:26px;height:26px;border-radius:50%;border:2px solid #ffffff33;box-sizing:border-box}.hsSw button.on{border-color:#ffd23f;box-shadow:0 0 0 2px #0f1b16,0 0 0 4px #ffd23f}
.hsEx{all:unset;cursor:pointer;box-sizing:border-box;display:flex;align-items:center;gap:10px;background:#10201a;border:2px solid #ffffff14;border-radius:14px;padding:9px 10px}.hsEx.on{border-color:#d99a42}.hsEx>i{flex:none;font-style:normal;font-size:24px;width:34px;text-align:center}.hsEx>span{flex:1;min-width:0}.hsEx b{display:block;font-size:13px}.hsEx small{display:block;color:#c3d6cb;font-size:11px;line-height:1.3}.hsEx em{flex:none;font-style:normal;font-weight:900;font-size:12px;color:#ffd9a0}
.hsFoot{display:flex;gap:8px}.hsFoot button{all:unset;cursor:pointer;text-align:center;padding:11px 14px;border-radius:12px;font-weight:900;font-size:14px;box-sizing:border-box}.hsReset{background:#20372d}.hsSave{flex:1;background:#d99a42;color:#1a1208}.hsFoot button:disabled{opacity:.45;cursor:default}.hsBuys{color:#9fb5aa;font-size:11px;text-align:center}`;
