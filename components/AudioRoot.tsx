'use client';
import { useEffect, useState } from 'react';
import { audioReady, sfx, unlockAudio } from '../lib/audio';
import { closeSettings, getSettings, resetSettings, setSetting, usePanelOpen, useSettings, type Settings } from '../lib/settings';

import RuntimeStyle from './RuntimeStyle';
/* Mounted once in app/layout.tsx.
   1. Unlocks audio on the first tap/key (browser rule) and starts the music.
   2. Gives EVERY button in the game a click sound and a soft hover tick (no per-button wiring).
   3. Hosts the Settings panel (opened from anywhere with openSettings()). */
export default function AudioRoot() {
  const open = usePanelOpen(), [blocked, setBlocked] = useState(false);
  useEffect(() => { const t = setInterval(() => setBlocked(!audioReady()), 900); return () => clearInterval(t); }, []);
  useEffect(() => {
    getSettings();
    const unlock = () => unlockAudio();
    const gestures = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const; // iOS Safari only counts touchend/click as a "tap" for audio, so listen to all of them
    gestures.forEach(g => window.addEventListener(g, unlock, { passive: true }));
    const btn = (e: Event) => (e.target as HTMLElement | null)?.closest?.('button,[role=button],a[href],summary') as HTMLButtonElement | null;
    let lastHover: Element | null = null;
    const down = (e: PointerEvent) => { const b = btn(e); if (b && !b.disabled && !b.closest('[data-nosound]')) sfx('click', { ui: true }); };
    const over = (e: PointerEvent) => { if (e.pointerType !== 'mouse') return; const b = btn(e); if (b && b !== lastHover && !b.disabled && !b.closest('[data-nosound]')) sfx('hover', { ui: true }); lastHover = b; };
    document.addEventListener('pointerdown', down, true); document.addEventListener('pointerover', over, true);
    return () => { gestures.forEach(g => window.removeEventListener(g, unlock)); document.removeEventListener('pointerdown', down, true); document.removeEventListener('pointerover', over, true); };
  }, []);
  useEffect(() => {
    if (!open) return; sfx('open');
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') closeSettings(); };
    window.addEventListener('keydown', k); return () => { window.removeEventListener('keydown', k); sfx('close'); };
  }, [open]);
  return <>{blocked && !open && <button className="tapSound" onClick={() => { unlockAudio(); setTimeout(() => sfx('success'), 60); }}>🔊 Tap to turn sound on</button>}{open && <SettingsPanel />}<RuntimeStyle css={`.tapSound{all:unset;position:fixed;z-index:150;left:50%;top:calc(10px + env(safe-area-inset-top,0px));transform:translateX(-50%);cursor:pointer;background:var(--gold,#f0b94a);color:#fff;font-family:var(--gf,system-ui);font-size:17px;letter-spacing:.04em;padding:8px 18px;border:3px solid var(--ink,#1a1208);border-radius:999px;box-shadow:0 4px 0 var(--ink,#1a1208);-webkit-text-stroke:4px var(--ink,#1a1208);paint-order:stroke fill;animation:tapPulse 1.2s ease-in-out infinite}@keyframes tapPulse{50%{transform:translateX(-50%) scale(1.06)}}`} /></>;
}

function Slider({ label, icon, k, s }: { label: string; icon: string; k: 'master' | 'music' | 'sfx' | 'voice'; s: Settings }) {
  const v = Math.round(s[k] * 100);
  return <label className="stRow"><span className="stIco">{icon}</span><span className="stLbl">{label}</span>
    <input type="range" min={0} max={100} value={v} style={{ ['--p' as string]: v + '%' }} onChange={e => setSetting({ [k]: +e.target.value / 100 })} onPointerUp={() => k === 'sfx' || k === 'master' ? sfx('coin') : undefined} />
    <b className="stVal">{v}</b></label>;
}
function Switch({ label, icon, on, set }: { label: string; icon: string; on: boolean; set: (v: boolean) => void }) {
  return <button className={'stSw' + (on ? ' on' : '')} role="switch" aria-checked={on} onClick={() => { set(!on); setTimeout(() => sfx('toggle'), 0); }}><span className="stIco">{icon}</span><span className="stLbl">{label}</span><i><u /></i></button>;
}

function SettingsPanel() {
  const s = useSettings();
  return <div className="stBack" onPointerDown={e => { if (e.target === e.currentTarget) closeSettings(); }}>
    <div className="stBox" role="dialog" aria-label="Settings">
      <div className="stTitle"><span>⚙️ Settings</span><button className="stX" aria-label="Close" onClick={closeSettings}>✕</button></div>
      <div className="stBody">
        <section><h4>Sound</h4>
          <Slider label="Master" icon="🔊" k="master" s={s} />
          <Slider label="Music" icon="🎵" k="music" s={s} />
          <Slider label="Effects" icon="💥" k="sfx" s={s} />
          <Slider label="Voice chat" icon="🎙️" k="voice" s={s} />
          <div className="stGrid">
            <Switch label="Music" icon="🎶" on={s.musicOn} set={v => setSetting({ musicOn: v })} />
            <Switch label="Effects" icon="🔔" on={s.sfxOn} set={v => setSetting({ sfxOn: v })} />
            <Switch label="Button clicks" icon="👆" on={s.uiSounds} set={v => setSetting({ uiSounds: v })} />
            <Switch label="Mute everything" icon="🔇" on={s.muteAll} set={v => setSetting({ muteAll: v })} />
          </div>
        </section>
        <section><h4>Display</h4>
          <div className="stRow"><span className="stIco">🔤</span><span className="stLbl">Label size</span>
            <div className="stSeg">{([[0.85, 'Small'], [1, 'Normal'], [1.2, 'Large']] as const).map(([v, l]) => <button key={v} className={s.labelScale === v ? 'on' : ''} onClick={() => setSetting({ labelScale: v })}>{l}</button>)}</div></div>
          <div className="stGrid">
            <Switch label="Reduce motion" icon="🐢" on={s.reduceMotion} set={v => setSetting({ reduceMotion: v })} />
            <Switch label="Show hints" icon="💡" on={s.showHints} set={v => setSetting({ showHints: v })} />
          </div>
        </section>
      </div>
      <div className="stFoot"><button className="ghost" onClick={() => sfx('success')}>▶ Test sounds</button><button className="ghost" onClick={resetSettings}>↺ Reset</button><button className="done" onClick={closeSettings}>Done</button></div>
    </div>
    <RuntimeStyle css={CSS} />
  </div>;
}

const CSS = `
.stBack{position:fixed;inset:0;z-index:200;background:#0a0612cc;display:grid;place-items:center;padding:14px;backdrop-filter:blur(3px);font-family:var(--gf)}
.stBox{width:min(440px,100%);max-height:calc(100dvh - 28px);display:flex;flex-direction:column;background:var(--plum);color:var(--cream);border:4px solid var(--ink);border-radius:22px;box-shadow:0 7px 0 var(--ink),0 24px 50px #000a;animation:glPop .22s cubic-bezier(.3,1.5,.5,1);overflow:hidden}
.stTitle{display:flex;align-items:center;justify-content:space-between;padding:10px 12px 10px 18px;background:var(--gold);border-bottom:4px solid var(--ink);font-size:24px;letter-spacing:.04em;color:#fff}
.stTitle span{-webkit-text-stroke:6px var(--ink);paint-order:stroke fill}
.stX{all:unset;cursor:pointer;width:34px;height:34px;display:grid;place-items:center;border-radius:50%;background:var(--red);border:3px solid var(--ink);box-shadow:0 3px 0 var(--ink);color:#fff;font-size:15px}.stX:active{transform:translateY(3px);box-shadow:none}
.stBody{overflow:auto;padding:6px 16px 4px}
.stBody section{padding:8px 0 10px}.stBody section+section{border-top:3px dashed #ffffff22}
.stBody h4{margin:6px 0 8px;font-weight:400;font-size:16px;letter-spacing:.06em;color:var(--gold)}
.stRow{display:flex;align-items:center;gap:10px;margin:9px 0;font-size:16px}
.stIco{width:30px;height:30px;flex:none;border-radius:50%;background:var(--cream);border:3px solid var(--ink);display:grid;place-items:center;font-size:14px}
.stLbl{flex:none;width:92px;letter-spacing:.03em}.stVal{width:34px;text-align:right;font-weight:400;font-size:16px;color:var(--gold)}
.stRow input[type=range]{flex:1;min-width:0;height:22px;-webkit-appearance:none;appearance:none;background:transparent;cursor:pointer}
.stRow input[type=range]::-webkit-slider-runnable-track{height:16px;border-radius:99px;border:3px solid var(--ink);background:linear-gradient(90deg,var(--green) var(--p),#120c1c var(--p))}
.stRow input[type=range]::-moz-range-track{height:10px;border-radius:99px;border:3px solid var(--ink);background:#120c1c}.stRow input[type=range]::-moz-range-progress{height:10px;border-radius:99px;background:var(--green)}
.stRow input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:26px;height:26px;margin-top:-8px;border-radius:50%;background:var(--gold);border:3px solid var(--ink);box-shadow:0 3px 0 var(--ink)}
.stRow input[type=range]::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:var(--gold);border:3px solid var(--ink);box-shadow:0 3px 0 var(--ink)}
.stGrid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:10px}
.stSw{all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--plum2);border:3px solid var(--ink);border-radius:14px;box-shadow:0 3px 0 var(--ink);font-size:14px;letter-spacing:.02em}
.stSw .stLbl{width:auto;flex:1}.stSw:active{transform:translateY(3px);box-shadow:none}
.stSw i{flex:none;width:44px;height:24px;border-radius:99px;background:#120c1c;border:3px solid var(--ink);position:relative;transition:background .15s}
.stSw i u{position:absolute;top:1px;left:1px;width:16px;height:16px;border-radius:50%;background:var(--cream);border:2px solid var(--ink);transition:transform .15s}
.stSw.on i{background:var(--green)}.stSw.on i u{transform:translateX(20px)}
.stSeg{flex:1;display:flex;gap:6px}.stSeg button{all:unset;box-sizing:border-box;flex:1;text-align:center;cursor:pointer;padding:6px 4px;background:var(--plum2);border:3px solid var(--ink);border-radius:11px;box-shadow:0 3px 0 var(--ink);font-size:14px}
.stSeg button.on{background:var(--gold);color:#fff;-webkit-text-stroke:4px var(--ink);paint-order:stroke fill}.stSeg button:active{transform:translateY(3px);box-shadow:none}
.stFoot{display:flex;gap:9px;padding:12px 16px 16px;border-top:4px solid var(--ink);background:#1d1329}
.stFoot button{all:unset;box-sizing:border-box;cursor:pointer;text-align:center;padding:9px 14px;border:3px solid var(--ink);border-radius:13px;box-shadow:0 4px 0 var(--ink);font-size:16px;letter-spacing:.03em}
.stFoot button:active{transform:translateY(4px);box-shadow:none}
.stFoot .ghost{flex:1;background:var(--plum2);color:var(--cream)}.stFoot .done{flex:1.1;background:var(--green);color:#fff;-webkit-text-stroke:5px var(--ink);paint-order:stroke fill}
@media (max-width:420px){.stLbl{width:70px;font-size:14px}.stGrid{grid-template-columns:1fr}}
`;
