'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import RuntimeStyle from './RuntimeStyle';
import { WEAPONS as LOADOUT, weaponItemId } from '../lib/weapons';
import { MISSIONS, type Mission } from '../lib/missions';
import { NET } from '../lib/cityNet';

const HOLD_RADIUS = 12;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, '0')}`;

type Slot = { current: number; reserve: number };
const freshAmmo = (): Slot[] => LOADOUT.map(w => ({ current: w.mag, reserve: w.reserve }));
const post = async (body: object) => {
  try { const r = await fetch('/api/mission', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const d = await r.json().catch(() => ({})); return { ok: r.ok && d.ok !== false, d }; }
  catch { return { ok: false, d: { error: 'Network error.' } }; }
};

export default function MissionsCombat() {
  const [open, setOpen] = useState(false), [tab, setTab] = useState<'missions' | 'weapons'>('missions');
  const [active, setActiveState] = useState<string | null>(null), [completed, setCompleted] = useState<string[]>([]), [notice, setNotice] = useState(''), [weapon, setWeaponState] = useState(-1), [owned, setOwned] = useState<string[]>([]); // weapon = index into LOADOUT, -1 = unarmed
  const [ammo, setAmmoState] = useState<Slot[]>(freshAmmo);
  const [stage, setStage] = useState(0), [secsLeft, setSecsLeft] = useState(0), [holdLeft, setHoldLeft] = useState<number | null>(null);
  // refs hold the live values so event handlers never go stale and never need re-binding
  const ammoRef = useRef<Slot[]>(ammo), weaponRef = useRef(-1), ownedRef = useRef<string[]>([]), activeRef = useRef<string | null>(null), lastShot = useRef(0), busy = useRef(false);
  const stageRef = useRef(0), deadlineAt = useRef(0), holding = useRef(false), holdProg = useRef(0), lastWarn = useRef(0);
  const setAmmo = (a: Slot[]) => { ammoRef.current = a; setAmmoState(a); };
  const setWeapon = (i: number) => { if (i >= 0 && !ownedRef.current.includes(LOADOUT[i].id)) return; weaponRef.current = i; setWeaponState(i); window.dispatchEvent(new CustomEvent('arl-weapon-selected', { detail: i >= 0 ? LOADOUT[i].id : '' })); };
  const nextWeapon = () => { const mine = LOADOUT.map((w, i) => i).filter(i => ownedRef.current.includes(LOADOUT[i].id)); if (!mine.length) return; const at = mine.indexOf(weaponRef.current); setWeapon(mine[(at + 1) % mine.length]); };
  // Guns only come from Gun Shops: what you may use is whatever you actually own (server-side inventory)
  const syncOwned = useCallback(() => {
    fetch('/api/inventory').then(r => r.json()).then(d => {
      if (!Array.isArray(d?.items)) return;
      const ids = LOADOUT.filter(w => d.items.some((it: { id: string; qty: number }) => it.id === weaponItemId(w.id) && it.qty > 0)).map(w => w.id);
      ownedRef.current = ids; setOwned(ids);
      const cur = weaponRef.current;
      if (cur >= 0 && !ids.includes(LOADOUT[cur].id)) setWeapon(ids.length ? LOADOUT.findIndex(w => w.id === ids[0]) : -1);
      else if (cur < 0 && ids.length) setWeapon(LOADOUT.findIndex(w => w.id === ids[0]));
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const setActive = (id: string | null) => {
    activeRef.current = id; (window as any).__arlMissionId = id; setActiveState(id);
    if (!id) { holding.current = false; holdProg.current = 0; (window as any).__arlMissionHold = false; setHoldLeft(null); }
  };
  const sendStage = (m: Mission, idx: number) => window.dispatchEvent(new CustomEvent('arl-mission-start', { detail: { id: m.id, title: m.title, goto: m.stages[idx].goto, label: m.stages[idx].label } }));
  const begin = (m: Mission, startedAt: number) => {
    stageRef.current = 0; setStage(0); deadlineAt.current = startedAt + m.deadlineSecs * 1000; setSecsLeft(Math.max(0, Math.round((deadlineAt.current - Date.now()) / 1000)));
    setActive(m.id); sendStage(m, 0);
  };
  const say = useCallback((s: string) => { setNotice(s); window.setTimeout(() => setNotice(v => v === s ? '' : v), 3000); }, []);

  const reload = useCallback(() => {
    if (weaponRef.current < 0) { say('You have no weapon. Buy one at a Gun Shop.'); return; }
    const i = weaponRef.current, w = LOADOUT[i], slot = ammoRef.current[i], take = Math.min(w.mag - slot.current, slot.reserve);
    if (slot.current >= w.mag) { say('Magazine already full.'); return; }
    if (take <= 0) { say('No reserve ammunition.'); return; }
    const a = [...ammoRef.current]; a[i] = { current: slot.current + take, reserve: slot.reserve - take }; setAmmo(a);
    window.dispatchEvent(new CustomEvent('arl-player-animation', { detail: 'reload' })); say(`${w.name} reloaded.`);
  }, [say]);

  // Pulling the trigger only ASKS the world to fire. The bullet is spent when the world confirms a shot really went out ('arl-shot-fired').
  const trigger = useCallback(() => {
    if (weaponRef.current < 0) { say('You have no weapon. Buy one at a Gun Shop.'); return; }
    const i = weaponRef.current, w = LOADOUT[i], now = Date.now();
    if (now - lastShot.current < w.rate) return;
    if (ammoRef.current[i].current <= 0) { say('Magazine empty — press R to reload.'); return; }
    lastShot.current = now;
    window.dispatchEvent(new CustomEvent('arl-weapon-shoot', { detail: { weapon: w.id, damage: w.damage, range: w.range } }));
  }, [say]);

  const claim = useCallback(async (id: string, destination: string) => {
    const m = MISSIONS.find(x => x.id === id); if (!m || busy.current) return;
    busy.current = true; (window as any).__arlMissionHold = true; // arrived: nothing may abandon the contract while the claim is in flight
    const r = await post({ action: 'claim', id }); busy.current = false;
    setActive(null);
    if (r.ok) {
      setCompleted(old => old.includes(id) ? old : [...old, id]);
      window.dispatchEvent(new CustomEvent('arl-mission-paid', { detail: { cash: r.d.cash, reward: r.d.reward } }));
      say(`✅ ${m.title} complete: you earned ₦${Number(r.d.reward).toLocaleString()}.`);
    } else say(r.d?.error || `Reached ${destination}, but the contract could not be paid.`);
  }, [say]);

  const abandon = useCallback(async (msg: string) => {
    if (!activeRef.current) return;
    setActive(null); say(msg); await post({ action: 'abandon' });
  }, [say]);

  useEffect(() => {
    const onNotice = (e: Event) => { const d = (e as CustomEvent).detail; if (typeof d === 'string') say(d); };
    const advance = () => {
      const m = MISSIONS.find(x => x.id === activeRef.current); if (!m) return;
      holding.current = false; holdProg.current = 0; (window as any).__arlMissionHold = false; setHoldLeft(null);
      const next = stageRef.current + 1;
      if (next >= m.stages.length) { void claim(m.id, m.target); return; }
      stageRef.current = next; setStage(next); sendStage(m, next); say(`✔ ${m.stages[next - 1].label}. Next: ${m.stages[next].label}`);
    };
    const onArrived = (e: Event) => {
      const d = (e as CustomEvent).detail; const m = MISSIONS.find(x => x.id === activeRef.current);
      if (!m || !d?.id || d.id !== m.id) return;
      const st = m.stages[stageRef.current]; if (!st) return;
      if (st.hold) { holding.current = true; holdProg.current = 0; (window as any).__arlMissionHold = true; setHoldLeft(st.hold); say(`Hold the area for ${st.hold}s…`); }
      else advance();
    };
    const fail = (msg: string) => { window.dispatchEvent(new Event('arl-mission-cancel')); void abandon(msg); };
    const tick = window.setInterval(() => {
      const m = MISSIONS.find(x => x.id === activeRef.current); if (!m) return;
      const now = Date.now();
      if (now > deadlineAt.current) { fail('❌ Mission failed: time ran out.'); return; }
      setSecsLeft(Math.ceil((deadlineAt.current - now) / 1000));
      if (m.failOnKo && NET.me.ko > now) { fail('❌ Mission failed: you were knocked out and the VIP was left exposed.'); return; }
      if (holding.current) {
        const st = m.stages[stageRef.current], pos = (window as any).__arlPos as { x: number; z: number } | undefined, tg = (window as any).__arlMissionTarget as { x: number; z: number } | undefined;
        if (st?.hold && pos && tg && Math.hypot(pos.x - tg.x, pos.z - tg.z) <= HOLD_RADIUS) {
          holdProg.current += .25; setHoldLeft(Math.max(0, Math.ceil(st.hold - holdProg.current)));
          if (holdProg.current >= st.hold) advance();
        } else if (holdProg.current > 0 || now - lastWarn.current > 4000) { holdProg.current = 0; lastWarn.current = now; if (st?.hold) setHoldLeft(st.hold); say('You left the area — get back to continue.'); }
      }
    }, 250);
    const onFired = () => { const i = weaponRef.current, a = [...ammoRef.current]; if (i < 0 || a[i].current <= 0) return; a[i] = { ...a[i], current: a[i].current - 1 }; setAmmo(a); };
    const onLost = () => { if (busy.current) return; void abandon('Mission abandoned: your waypoint changed.'); };
    const onTrigger = () => trigger();
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null; if (t && (['INPUT', 'TEXTAREA'].includes(t.tagName) || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'm' && !e.repeat) setOpen(v => !v);
      else if (k === 'g' && !e.repeat) nextWeapon();
      else if (k === 'r' && !e.repeat) reload();
    };
    window.addEventListener('arl-inventory-changed', syncOwned); window.addEventListener('arl-combat-notice', onNotice); window.addEventListener('arl-mission-arrived', onArrived); window.addEventListener('arl-shot-fired', onFired);
    window.addEventListener('arl-mission-lost', onLost); window.addEventListener('arl-trigger-fire', onTrigger); window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('arl-inventory-changed', syncOwned); window.removeEventListener('arl-combat-notice', onNotice); window.removeEventListener('arl-mission-arrived', onArrived); window.removeEventListener('arl-shot-fired', onFired);
      window.removeEventListener('arl-mission-lost', onLost); window.removeEventListener('arl-trigger-fire', onTrigger); window.removeEventListener('keydown', onKey); window.clearInterval(tick);
    };
  }, [say, claim, abandon, trigger, reload]);

  useEffect(() => { syncOwned(); const i = window.setInterval(syncOwned, 20000); return () => window.clearInterval(i); }, [syncOwned]);

  // restore progress from the server (completed contracts survive reloads; an active one gets its waypoint back)
  useEffect(() => {
    let dead = false;
    fetch('/api/mission').then(r => r.json()).then(d => {
      if (dead || !d?.ok) return;
      setCompleted(Array.isArray(d.completed) ? d.completed : []);
      const m = MISSIONS.find(x => x.id === d.active);
      if (m) { if (Date.now() - Number(d.startedAt || 0) > m.deadlineSecs * 1000) void post({ action: 'abandon' }); else begin(m, Number(d.startedAt) || Date.now()); }
    }).catch(() => {});
    return () => { dead = true; };
  }, []);

  const startMission = async (id: string) => {
    const m = MISSIONS.find(x => x.id === id); if (!m || busy.current) return;
    busy.current = true; const r = await post({ action: 'start', id }); busy.current = false;
    if (!r.ok) { say(r.d?.error || 'Could not start the mission.'); return; }
    begin(m, Date.now()); say(`Mission started: ${m.title}${m.heat ? ' — the police are on you!' : ''}`); setOpen(false);
  };
  const activeMission = MISSIONS.find(m => m.id === active);
  return <><RuntimeStyle css={CSS}/><div className="mcQuick"><button title="Missions (M)" aria-label="Missions" onClick={()=>{setOpen(v=>!v);setTab('missions')}}>📋<kbd>M</kbd></button>{weapon>=0 && <button title={`${LOADOUT[weapon].name} (G to switch)`} aria-label="Weapons" onClick={()=>{setOpen(v=>!v);setTab('weapons')}}>{LOADOUT[weapon].icon}<kbd>G</kbd></button>}</div>
    {activeMission && <div className="mcTracker"><small>ACTIVE MISSION · {activeMission.type}</small><b>{activeMission.icon} {activeMission.title}</b><span>Stage {stage + 1}/{activeMission.stages.length}: {activeMission.stages[stage]?.label}</span><span>⏱ {fmt(secsLeft)}{holdLeft !== null ? ` · ⏳ Hold the area ${holdLeft}s` : ''}</span><button onClick={()=>{window.dispatchEvent(new Event('arl-mission-cancel'));void abandon('Mission abandoned.');}}>ABANDON</button></div>}
    {notice && <div className="mcNotice">{notice}</div>}
    {open && <div className="mcBackdrop" onClick={()=>setOpen(false)}><section className="mcPanel" onClick={e=>e.stopPropagation()}><header><div><small>ABUJA REAL LIFE</small><h2>{tab==='missions'?'Mission Control':'Weapon Loadout'}</h2></div><button className="mcClose" onClick={()=>setOpen(false)}>×</button></header><nav><button className={tab==='missions'?'on':''} onClick={()=>setTab('missions')}>📋 Missions</button><button className={tab==='weapons'?'on':''} onClick={()=>setTab('weapons')}>🔫 Weapons</button></nav>
      {tab==='missions' ? <div className="mcMissionList">{MISSIONS.map(m=><article key={m.id} className="mcMission"><div className="mcMissionIcon">{m.icon}</div><div className="mcMissionText"><div className="mcMeta"><span>{m.type}</span><span className={'diff '+m.difficulty.toLowerCase()}>{m.difficulty}</span></div><b>{m.title}</b><p>{m.desc}</p><small>📍 {m.target} · ⏱ {fmt(m.deadlineSecs)} · 💵 ₦{m.reward.toLocaleString()}</small></div><button disabled={active===m.id || completed.includes(m.id)} onClick={()=>void startMission(m.id)}>{completed.includes(m.id)?'DONE':active===m.id?'ACTIVE':'START'}</button></article>)}</div> : <div className="mcWeaponList">{LOADOUT.map((w,i)=>{const has=owned.includes(w.id);return <article key={w.id} className={'mcWeapon '+(weapon===i?'selected':'')} style={has?undefined:{opacity:.6}}><span className="mcWeaponIcon">{w.icon}</span><div><b>{w.name}</b><small>Damage {w.damage} · Range {w.range}m</small>{has ? <><div className="mcAmmo"><i style={{width:`${ammo[i].current/w.mag*100}%`}}/></div><small>{ammo[i].current} / {ammo[i].reserve} rounds</small></> : <small>₦{w.price.toLocaleString()} · sold at Gun Shops only</small>}</div>{has ? <button onClick={()=>setWeapon(i)}>EQUIP</button> : <button disabled>🔒</button>}</article>;})}{owned.length>0 && <button className="mcReload" onClick={reload}>↻ Reload current weapon (R)</button>}<p className="mcDisclaimer">{owned.length ? 'Fires at the nearest player in your forward aim cone. Ammunition is limited; reload before the next encounter.' : 'You own no weapon. Find a red Gun Shop on the map, go inside and buy one.'}</p></div>}
      <footer>WASD Move · Shift Sprint · F Melee · V Fire · G Switch Weapon · R Reload · M Missions</footer></section></div>}</>;
}
const CSS=`.mcQuick{position:absolute;z-index:14;top:316px;left:calc(10px + var(--sal,0px));display:flex;flex-direction:column;gap:8px;align-items:center}.mcQuick button{border:1px solid #ffffff40;border-radius:12px;background:#0b1511eF;color:#fff;padding:8px 10px;min-width:46px;font:800 16px system-ui;display:flex;gap:5px;align-items:center;justify-content:center;box-shadow:0 3px 12px #0005;cursor:pointer}.mcQuick kbd{font:700 9px system-ui;color:#e7b64f;border:1px solid #ffffff33;border-radius:4px;padding:2px 4px}.mcQuick .mcFire{background:#b7352b;padding:11px 15px}.mcTracker{position:absolute;z-index:12;left:calc(66px + var(--sal,0px));top:316px;max-width:min(300px,calc(100vw - 150px))!important;display:flex;flex-direction:column;gap:4px;min-width:220px;max-width:330px;background:#0b1511eF;color:white;border:1px solid #e5b14b;border-radius:12px;padding:10px 14px;box-shadow:0 4px 18px #0005;font:700 11px system-ui}.mcTracker small{font-size:8px;color:#e5b14b;letter-spacing:.12em}.mcTracker b{font-size:13px}.mcTracker span{color:#d3ded8;font-weight:500}.mcTracker button{align-self:flex-end;border:0;background:transparent;color:#e6b14b;font-size:9px;font-weight:900}.mcNotice{position:absolute;z-index:30;left:50%;top:90px;transform:translateX(-50%);background:#101a15f2;color:#fff;border:1px solid #e5b14b;border-radius:10px;padding:9px 14px;font:700 12px system-ui;box-shadow:0 5px 16px #0007;max-width:90vw}.mcBackdrop{position:absolute;inset:0;z-index:45;background:#020806b8;display:grid;place-items:center;padding:14px;font-family:system-ui,sans-serif}.mcPanel{width:min(700px,100%);max-height:min(80dvh,760px);display:flex;flex-direction:column;gap:12px;background:#101a15;color:#f8f4e9;border:1px solid #ffffff24;border-radius:20px;padding:17px;box-shadow:0 18px 60px #0009;overflow:hidden}.mcPanel header{display:flex;align-items:center;justify-content:space-between}.mcPanel header small{font-size:9px;letter-spacing:.18em;color:#e5b14b;font-weight:900}.mcPanel h2{margin:3px 0 0;font-size:23px}.mcClose{border:0;border-radius:50%;width:36px;height:36px;background:#26362d;color:white;font-size:25px}.mcPanel nav{display:flex;gap:7px}.mcPanel nav button{flex:1;background:#1b2b22;color:#b7c7bc;border:1px solid #ffffff17;border-radius:10px;padding:10px;font-weight:800}.mcPanel nav button.on{background:#e5b14b;color:#18130a}.mcMissionList,.mcWeaponList{overflow:auto;display:flex;flex-direction:column;gap:8px;min-height:120px}.mcMission,.mcWeapon{display:flex;align-items:center;gap:12px;background:#17251d;border:1px solid #ffffff13;border-radius:13px;padding:11px}.mcMissionIcon,.mcWeaponIcon{width:44px;height:44px;flex:none;display:grid;place-items:center;background:#24392c;border-radius:12px;font-size:23px}.mcMissionText{flex:1;min-width:0}.mcMeta{display:flex;gap:8px;font-size:8px;font-weight:900;letter-spacing:.12em;color:#a9c4b1}.diff{padding:3px 6px;border-radius:5px;background:#324b39}.diff.hard{background:#7a3029;color:#ffd5cd}.diff.medium{background:#695125;color:#ffe4a2}.mcMissionText b,.mcWeapon b{font-size:13px}.mcMissionText p{font-size:11px;line-height:1.45;color:#bdc9c0;margin:4px 0}.mcMissionText small,.mcWeapon small{display:block;font-size:10px;color:#9db3a4;margin-top:4px}.mcMission>button,.mcWeapon>button{border:0;border-radius:9px;background:#e5b14b;color:#1b1509;font-weight:900;font-size:10px;padding:9px 10px;flex:none}.mcMission>button:disabled{background:#2d4835;color:#b9d2bd}.mcWeapon.selected{border-color:#e5b14b}.mcWeapon>div:nth-child(2){flex:1}.mcAmmo{height:5px;border-radius:8px;background:#334438;overflow:hidden;margin-top:7px}.mcAmmo i{display:block;height:100%;background:#e5b14b}.mcReload{background:#e5b14b;border:0;border-radius:10px;padding:11px;font-weight:900}.mcDisclaimer{font-size:10px;color:#94aa9a;margin:0}.mcPanel footer{border-top:1px solid #ffffff16;padding-top:10px;color:#91a597;font-size:9px;text-align:center}@media(max-width:700px){.mcQuick{top:auto;bottom:175px;right:10px;gap:4px}.mcQuick button{padding:8px;font-size:9px}.mcQuick button span{display:none}.mcQuick .mcFire{padding:10px}.mcTracker{top:12px;left:50%;max-width:230px;min-width:190px}.mcNotice{top:76px}.mcPanel{padding:12px;max-height:76dvh}.mcMission{gap:8px;padding:8px}.mcMissionIcon{width:34px;height:34px;font-size:19px}.mcMissionText p{font-size:10px}.mcMission>button{padding:8px;font-size:9px}}`;
