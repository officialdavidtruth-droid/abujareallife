'use client';
import { useEffect, useRef, useState } from 'react';
import RuntimeStyle from './RuntimeStyle';
import { sfx } from '../lib/audio';
import { NET } from '../lib/cityNet';
import { GAME } from './cityShared';

/* In-game tutorial. Nothing blocks the screen: a small objective card sits at the top while you PLAY,
   the real UI element you need glows, and each step completes only when you actually do the thing.
   After the main path, one-time contextual tips pop up the first time something happens (crime, low needs, a player nearby...).
   It shows ONCE per account: when the player finishes or skips it, that is saved on the account (server) and on this device, and it never comes back. */

export type TutProbe = () => { x: number; z: number; act: string | null; minNeed: number; power: boolean };
type Ctx = { outside: boolean; inside: boolean; hud: boolean; menu: boolean; p: ReturnType<TutProbe>; input: boolean; moved: number; keys: Set<string>; enteredEv: boolean; touch: boolean };
type Step = {
  id: string; e: string; title: string; text: string; touchText?: string; keys?: string[]; where?: 'home' | 'city'; desktopOnly?: boolean;
  glow?: string; done: (c: Ctx) => boolean;
};

const FOOD = new Set(['cook', 'snack', 'water', 'meal', 'famdinner', 'order']);
const STEPS: Step[] = [
  { id: 'move', e: '🚶', where: 'home', title: 'Walk around your home', text: 'Move your character around the house.', touchText: 'Drag the left stick, or just tap the floor.', keys: ['W', 'A', 'S', 'D'], done: c => c.input && c.moved > 1.2 },
  { id: 'eat', e: '🍲', where: 'home', title: 'Feed your character', text: 'Your needs (bottom left) drop all day. Tap the kitchen and choose Cook or Snack.', glow: '.needs', done: c => c.input && !!c.p.act && FOOD.has(c.p.act) },
  { id: 'menu', e: '☰', where: 'home', title: 'Open the menu', text: 'Tap the ☰ button at the top right.', glow: '.menuBtn', done: c => c.menu },
  { id: 'go', e: '🏙️', where: 'home', title: 'Head into the city', text: 'Tap 🏙️ Neighborhood at the top.', glow: 'pill:Neighborhood', done: c => c.outside },
  { id: 'walk', e: '🧭', where: 'city', title: 'Explore the city', text: 'Walk around. Drag the mouse to look.', touchText: 'Left stick to walk, drag the right side to look around.', keys: ['W', 'A', 'S', 'D'], done: c => c.input && c.moved > 6 },
  { id: 'sprint', e: '🏃', where: 'city', desktopOnly: true, title: 'Sprint and jump', text: 'Hold Shift to run, tap Space to jump. Try both.', keys: ['Shift', 'Space'], done: c => c.keys.has('shift') || c.keys.has(' ') },
  { id: 'dock', e: '📱', where: 'city', title: 'Open your city menu', text: 'Tap ☰ at the bottom: Map, Jobs, Market, Phone and more live here.', glow: '.dockToggle', done: c => c.hud },
  { id: 'goals', e: '🎯', where: 'city', title: 'Open Goals', text: 'Goals teach you the game and pay real cash for each step.', glow: 'dock:Goals', done: () => !!document.querySelector('.gcPanel') },
  { id: 'enter', e: '🚪', where: 'city', title: 'Go inside a building', text: 'Walk up to any shop, bank or club and press Enter (or E).', keys: ['E'], done: c => c.inside || c.enteredEv },
];

type Tip = { id: string; e: string; title: string; text: string };
const TIPS: Record<string, Tip> = {
  done: { id: 'done', e: '🎉', title: 'You are ready!', text: 'Get a job or take a quest for your first cash. Replay this any time from ☰ → Tutorial.' },
  needs: { id: 'needs', e: '⚠️', title: 'A need is running low', text: 'Hungry, tired or dirty? Cook, sleep or shower at home. Low needs drag your mood down.' },
  power: { id: 'power', e: '🕯️', title: 'NEPA took the light!', text: 'Power cuts happen. TV, computer and games need electricity. Upgrade your home to cope.' },
  crime: { id: 'crime', e: '🚨', title: 'Heat rising', text: 'Witnesses and cameras saw that. Heat of 40 or more makes you WANTED and patrol cars hunt you. Break line of sight to lose them.' },
  wanted: { id: 'wanted', e: '🚓', title: 'You are WANTED', text: 'Run, hide, break line of sight. If you get caught: jail and lost cash.' },
  ko: { id: 'ko', e: '💀', title: 'Knocked out', text: 'You wake up at home and lose your cash. Rob or fight people with care: they are real players.' },
  social: { id: 'social', e: '🤝', title: 'Another player', text: 'Message them, send money, or team up. Voice chat works with players near you.' },
};

const KEY = (u: string) => `arl-tut-v2:${u.toLowerCase()}`;
const TIPKEY = (u: string) => `arl-tut-tips-v2:${u.toLowerCase()}`;
type Save = { i: number; done: boolean };
const load = (u: string): Save | null => { try { const s = localStorage.getItem(KEY(u)); return s ? JSON.parse(s) : null; } catch { return { i: 0, done: true }; } };
const store = (u: string, s: Save) => { try { localStorage.setItem(KEY(u), JSON.stringify(s)); } catch { /* private mode */ } };
const seenTips = (u: string): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(TIPKEY(u)) || '[]')); } catch { return new Set(); } };
const markTip = (u: string, id: string) => { try { const s = seenTips(u); s.add(id); localStorage.setItem(TIPKEY(u), JSON.stringify(Array.from(s))); } catch { /* ignore */ } };

export default function Tutorial({ user, canStart, outside, inside, hud, menu, probe }: { user: string; canStart: boolean; outside: boolean; inside: boolean; hud: boolean; menu: boolean; probe: TutProbe }) {
  const [i, setI] = useState(0), [active, setActive] = useState(false), [ok, setOk] = useState(false), [tips, setTips] = useState<Tip[]>([]);
  const R = useRef({ start: { x: 0, z: 0 }, inputAt: 0, stepAt: 0, keys: new Set<string>(), enteredEv: false, advancing: false, lastWhere: '' });
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  const live = useRef({ outside, inside, hud, menu, active, i }); live.current = { outside, inside, hud, menu, active, i };

  const showTip = (id: string, force = false) => {
    if (!user || (!force && !live.current.active) || seenTips(user).has(id)) return;
    markTip(user, id); const t = TIPS[id]; if (!t) return;
    sfx('notify'); setTips(a => [...a.slice(-1), t]); setTimeout(() => setTips(a => a.filter(x => x.id !== id)), id === 'done' ? 9000 : 8000);
  };
  const begin = (n: number) => { const p = probe(); const where = live.current.outside ? 'city' : 'home'; R.current.start = where === 'city' ? { x: NET.me.x, z: NET.me.z } : { x: p.x, z: p.z }; R.current.stepAt = Date.now(); R.current.keys.clear(); R.current.enteredEv = false; R.current.advancing = false; setOk(false); setI(n); store(user, { i: n, done: false }); };
  const finish = (celebrate: boolean) => { setActive(false); setOk(false); live.current.active = false; store(user, { i: 0, done: true }); fetch('/api/tutorial', { method: 'POST' }).catch(() => {}); if (celebrate) showTip('done', true); };

  // start once per account: the server says whether this account already finished or skipped it
  useEffect(() => {
    if (!canStart || !user) return;
    const l = load(user); if (l?.done) return;
    let dead = false;
    fetch('/api/tutorial', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => {
      if (dead || !d) return;
      if (d.done) { store(user, { i: 0, done: true }); return; }
      setActive(true); begin(l?.i ?? 0);
    }).catch(() => { /* offline: stay quiet rather than risk showing it twice */ });
    return () => { dead = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canStart, user]);

  // raw player input + game events
  useEffect(() => {
    const down = (e: KeyboardEvent) => { R.current.inputAt = Date.now(); R.current.keys.add(e.key.toLowerCase()); };
    const ptr = () => { R.current.inputAt = Date.now(); };
    const ent = () => { R.current.enteredEv = true; };
    const rsp = () => showTip('ko'), soc = () => showTip('social'), wit = () => showTip('crime');
    window.addEventListener('keydown', down); window.addEventListener('pointerdown', ptr); window.addEventListener('touchstart', ptr, { passive: true });
    window.addEventListener('arl-enter', ent); window.addEventListener('arl-respawn-home', rsp); window.addEventListener('arl-player-select', soc); window.addEventListener('arl-witness-report', wit);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('pointerdown', ptr); window.removeEventListener('touchstart', ptr); window.removeEventListener('arl-enter', ent); window.removeEventListener('arl-respawn-home', rsp); window.removeEventListener('arl-player-select', soc); window.removeEventListener('arl-witness-report', wit); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // the heartbeat: checks the current objective, glows the right button, fires contextual tips
  useEffect(() => {
    if (!user || !canStart) return;
    const clearGlow = () => document.querySelectorAll('.arl-tutGlow').forEach(el => el.classList.remove('arl-tutGlow'));
    const findGlow = (g: string): Element | null => {
      if (g.startsWith('pill:')) return Array.from(document.querySelectorAll('.top > .pill')).find(el => (el.textContent || '').includes(g.slice(5))) || null;
      if (g.startsWith('dock:')) return Array.from(document.querySelectorAll('.dockGrid button')).find(el => (el.textContent || '').includes(g.slice(5))) || null;
      return document.querySelector(g);
    };
    const t = setInterval(() => {
      const L = live.current, p = probe();
      // contextual tips (always on, one time each)
      if (!L.inside) {
        if (!L.outside && p.minNeed < 25) showTip('needs');
        if (!L.outside && !p.power) showTip('power');
        if (GAME.heat >= 40) showTip('wanted'); else if (GAME.heat > 0) showTip('crime');
      }
      if (!L.active) { clearGlow(); return; }
      let n = L.i; const where = L.outside ? 'city' : 'home';
      // replaying from the city: skip home-only steps. At home, city steps simply wait their turn.
      while (n < STEPS.length && where === 'city' && STEPS[n].where === 'home') n++;
      while (n < STEPS.length && STEPS[n].desktopOnly && touch) n++;
      if (n !== L.i) { if (n >= STEPS.length) { finish(true); clearGlow(); return; } begin(n); return; }
      const s = STEPS[n]; if (!s) return;
      if (s.where && s.where !== where && !(s.where === 'city' && L.inside)) { clearGlow(); return; } // not the right place yet
      const r = R.current, base = r.start, cur = where === 'city' ? { x: NET.me.x, z: NET.me.z } : { x: p.x, z: p.z };
      const c: Ctx = { outside: L.outside, inside: L.inside, hud: L.hud, menu: L.menu, p, input: r.inputAt >= r.stepAt, moved: Math.hypot(cur.x - base.x, cur.z - base.z), keys: r.keys, enteredEv: r.enteredEv, touch };
      clearGlow(); if (s.glow && !r.advancing) findGlow(s.glow)?.classList.add('arl-tutGlow');
      if (!r.advancing && s.done(c)) {
        r.advancing = true; setOk(true); sfx('success'); clearGlow();
        setTimeout(() => { if (n + 1 >= STEPS.length) finish(true); else begin(n + 1); }, 1000);
      }
    }, 250);
    return () => { clearInterval(t); clearGlow(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, canStart]);

  // let the old Goals welcome/chip stay out of the way while the tutorial runs
  useEffect(() => { (window as unknown as { __arlTutActive?: boolean }).__arlTutActive = active; return () => { (window as unknown as { __arlTutActive?: boolean }).__arlTutActive = false; }; }, [active]);

  const s = STEPS[Math.min(i, STEPS.length - 1)], showCard = active && !inside && (!s.where || s.where === (outside ? 'city' : 'home') || (s.where === 'city' && !outside));
  const count = STEPS.filter(x => !(x.desktopOnly && touch)).length, num = STEPS.slice(0, i).filter(x => !(x.desktopOnly && touch)).length + 1;
  return <>
    <div className="tutWrap" aria-live="polite">
      {showCard && <div className={'tutCard' + (ok ? ' ok' : '')} role="status">
        <div className="tutHead"><span>TUTORIAL</span><b>{Math.min(num, count)}/{count}</b><button onClick={() => finish(false)} aria-label="Skip tutorial">Skip ✕</button></div>
        <div className="tutBody"><i className="tutE">{ok ? '✅' : s.e}</i><div><h4>{s.title}</h4><p>{touch && s.touchText ? s.touchText : s.text}</p>
          {!touch && s.keys && <div className="tutKeys">{s.keys.map(k => <kbd key={k}>{k}</kbd>)}</div>}</div></div>
        <div className="tutBar"><i style={{ width: ((num - 1 + (ok ? 1 : 0)) / count) * 100 + '%' }} /></div>
      </div>}
      {!inside && tips.map(t => <div key={t.id} className="tutTip"><i>{t.e}</i><div><b>{t.title}</b><p>{t.text}</p></div><button aria-label="Close tip" onClick={() => setTips(a => a.filter(x => x.id !== t.id))}>×</button></div>)}
    </div>
    <RuntimeStyle id="arl-tutorial" css={CSS} />
  </>;
}

const CSS = `.tutWrap{position:fixed;left:50%;transform:translateX(-50%);top:calc(64px + env(safe-area-inset-top,0px));z-index:45;width:min(340px,calc(100vw - 20px));display:flex;flex-direction:column;gap:8px;pointer-events:none}
.tutCard,.tutTip{pointer-events:auto;background:#0d1a14ef;border:1px solid #f0b94a66;border-radius:14px;box-shadow:0 8px 24px #000a;color:#fff;animation:tutIn .3s both}
.tutCard{padding:8px 11px 0;overflow:hidden}.tutCard.ok{border-color:#58d68d;animation:tutPop .35s both}
.tutHead{display:flex;align-items:center;gap:8px;font-size:9.5px;letter-spacing:.12em;color:#f0b94a;font-weight:800}.tutHead b{color:#9fb5aa;font-weight:700;letter-spacing:.04em}
.tutHead button{margin-left:auto;background:none;border:0;color:#9fb5aa;font-size:11px;cursor:pointer;padding:2px 4px}.tutHead button:hover{color:#fff}
.tutBody{display:flex;gap:10px;align-items:center;padding:6px 0 9px}.tutE{font-style:normal;font-size:30px;line-height:1;flex:none}
.tutBody h4{margin:0;font-size:14px;color:#f3c56f}.tutBody p{margin:2px 0 0;font-size:12px;line-height:1.4;color:#d8ece2}
.tutKeys{display:flex;gap:5px;margin-top:6px;flex-wrap:wrap}.tutKeys kbd{min-width:24px;text-align:center;padding:2px 7px;border-radius:6px;background:#f0b94a;color:#1a1410;font:800 11px system-ui,sans-serif;box-shadow:0 2px 0 #9a6f1f}
.tutBar{height:3px;margin:0 -11px;background:#ffffff1a}.tutBar i{display:block;height:100%;background:linear-gradient(90deg,#f0b94a,#58d68d);transition:width .5s}
.tutTip{display:flex;gap:10px;align-items:flex-start;padding:9px 10px;border-color:#ffffff33}.tutTip>i{font-style:normal;font-size:24px;flex:none}.tutTip b{font-size:12.5px;color:#f3c56f}.tutTip p{margin:2px 0 0;font-size:11.5px;line-height:1.4;color:#d8ece2}
.tutTip button{margin-left:auto;background:none;border:0;color:#9fb5aa;font-size:18px;cursor:pointer;line-height:1}
.arl-tutGlow{position:relative;z-index:46;outline:3px solid #f0b94a;outline-offset:3px;animation:tutGlow 1.1s ease-in-out infinite}
@keyframes tutGlow{0%,100%{box-shadow:0 0 0 0 #f0b94acc}50%{box-shadow:0 0 0 12px #f0b94a00}}
@keyframes tutIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}@keyframes tutPop{0%{transform:scale(1)}50%{transform:scale(1.04)}100%{transform:scale(1)}}`;
