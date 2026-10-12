'use client';
import { useEffect, useState } from 'react';
import RuntimeStyle from './RuntimeStyle';

/* First-time player guide: a short illustrated tour (welcome, controls, needs, home, city, money, cars and your street house, crime, social, tips).
   Opens by itself the first time a player enters the game (remembered per username on this device) and any time from Menu > Game guide
   (or window.dispatchEvent(new CustomEvent('arl-open-guide'))). */
const KEY = (u: string) => `arl-guide-v1:${u.toLowerCase()}`;
export const guideSeen = (u: string) => { try { return localStorage.getItem(KEY(u)) === '1'; } catch { return true; } };
const markSeen = (u: string) => { try { localStorage.setItem(KEY(u), '1'); } catch { /* private mode */ } };

type Step = { e: string; t: string; lead: string; pts: [string, string][] };
const STEPS: Step[] = [
  { e: '🇳🇬', t: 'Welcome to Abuja Real Life', lead: 'A living online city. Real players, real traffic, day and night, seasons and weather that are the same for everyone. Build the life you want.',
    pts: [['🏠', 'You start in your own home with a family, furniture and daily needs.'], ['🏙️', 'Step outside to a full 3D city of shops, banks, hotels, clubs and more.'], ['👥', 'Other players are in the same city right now. Say hello, trade, team up or stay out of trouble.'], ['🎯', 'Not sure what to do? Open the phone and follow the Goals chain: it walks you through your first steps and pays rewards.']] },
  { e: '🎮', t: 'Controls', lead: 'The same keys work at home and in the city.',
    pts: [['⌨️', 'Computer: W A S D walk · Shift run · Space jump (handbrake in a car) · E use / enter / get in · H horn · drag or ← → to turn the camera.'], ['📱', 'Phone: left thumb stick to move, right side to look around, and the round buttons for run, jump, punch and your car.'], ['👆', 'At home you can also just tap the floor to walk, or tap furniture and family for actions.'], ['💡', 'The prompt at the bottom of the screen always tells you what E will do.']] },
  { e: '🍽️', t: 'Look after your needs', lead: 'Hunger, energy, hygiene, bladder, fun and social drop all day. Keep them up and your mood stays high.',
    pts: [['🍲', 'Cook and eat, sleep, shower, relax and use the toilet at home. Groceries are bought in the city.'], ['😊', 'Mood shows how you are doing. Low needs make everything harder.'], ['🧠', '"Free will" (in the menu) lets your character go to work on their own when you are idle, and even earn while you are away.'], ['⚡', 'Power cuts happen (NEPA!). Upgrade your home to cope.']] },
  { e: '🛋️', t: 'Make your home yours', lead: 'Your home is the heart of your game.',
    pts: [['🏗️', 'Menu → Home upgrades: build extra rooms and buy luxury items.'], ['🛋️', 'Menu → Edit home: move furniture around and design it your way.'], ['👨‍👩‍👧', 'Spend time with your family. Happy homes slow how fast your Social need drops.'], ['👕', 'Menu → Character: change your look. Clothes are sold at Fashion Boutiques in the city.']] },
  { e: '🏙️', t: 'Explore the city', lead: 'Press 🏙️ Neighborhood or walk out through your front door. Your own house stands on the street, with your name on it.',
    pts: [['🗺️', 'Open the map from the phone to see every business and drop a pin: a red route line guides you.'], ['🚪', 'Walk up to any building and tap Enter to go inside.'], ['🚕', 'Taxis, bikes and buses drive past. Wave one down and ride, or buy your own car at a Car Dealer.'], ['🚗', 'Drive home like in GTA: park on your driveway, walk to your front door and press E (on a phone, tap Interact) to go in. Other players\' houses are locked.']] },
  { e: '💼', t: 'Earn money', lead: 'Naira makes the city go round.',
    pts: [['💼', 'Get a job: open the Jobs list, walk to the building, go inside and apply. Shifts are short mini-games that pay.'], ['📜', 'Take quests and missions from the phone for cash and fame.'], ['🏪', 'Run your own business, buy and sell in the marketplace, and send money to friends.'], ['🎰', 'Casinos exist. Set a loss limit first and play for fun, not to chase money.']] },
  { e: '🚨', t: 'Crime has consequences', lead: 'There are no rules, only consequences. Anything you do can be seen.',
    pts: [['👀', 'Witnesses, cameras and police react. Heat of 40 or more makes you WANTED and patrol cars hunt you.'], ['🥷', 'Break line of sight to lose the police. Being caught means jail and losing cash.'], ['💀', 'If you are knocked out you wake up at home and lose your cash. Rob or fight people with care: they are real players.'], ['🛡️', 'Prefer the quiet life? You can also join the police.']] },
  { e: '💬', t: 'Meet people', lead: 'Cities are better with friends.',
    pts: [['📨', 'Messages: text any player from your phone and get a notification when they reply.'], ['🎙️', 'Voice chat lets you talk to players near you in the city.'], ['🎉', 'Throw or join parties, join a crew, race other drivers and hang out at the clubs.'], ['🤝', 'Tap a player to see what you can do with them.']] },
  { e: '🚀', t: 'You are ready!', lead: 'A few tips before you go.',
    pts: [['1️⃣', 'Check your needs, then open the phone → Goals for your first mission.'], ['2️⃣', 'Get a job or take a quest to earn your first cash.'], ['3️⃣', 'Buy a car, then drive to your house on the street.'], ['📖', 'You can reopen this guide any time from Menu → Game guide.']] },
];

export default function Guide({ user, canOpen }: { user: string; canOpen: boolean }) {
  const [open, setOpen] = useState(false), [i, setI] = useState(0);
  useEffect(() => { if (canOpen && user && !guideSeen(user)) { setI(0); setOpen(true); } }, [canOpen, user]);
  useEffect(() => { const f = () => { setI(0); setOpen(true); }; window.addEventListener('arl-open-guide', f); return () => window.removeEventListener('arl-open-guide', f); }, []);
  if (!open) return null;
  const s = STEPS[i], last = i === STEPS.length - 1, close = () => { markSeen(user); setOpen(false); };
  return <div className="gdWrap" role="dialog" aria-modal="true" aria-label="Game guide">
    <div className="gdCard">
      <button className="gdX" onClick={close} aria-label="Close guide">×</button>
      <div className="gdE">{s.e}</div>
      <h2>{s.t}</h2>
      <p className="gdLead">{s.lead}</p>
      <ul>{s.pts.map(([e, t], k) => <li key={k}><span>{e}</span><div>{t}</div></li>)}</ul>
      <div className="gdDots">{STEPS.map((_, k) => <i key={k} className={k === i ? 'on' : ''} onClick={() => setI(k)} />)}</div>
      <div className="gdBtns">
        {i > 0 ? <button className="ghost" onClick={() => setI(i - 1)}>‹ Back</button> : <button className="ghost" onClick={close}>Skip</button>}
        <small>{i + 1} / {STEPS.length}</small>
        {last ? <button onClick={close}>Start playing</button> : <button onClick={() => setI(i + 1)}>Next ›</button>}
      </div>
    </div>
    <RuntimeStyle css={`.gdWrap{position:fixed;inset:0;z-index:90;display:grid;place-items:center;padding:12px;background:radial-gradient(circle at 40% 20%,#1c4a39cc,#050c09ee);backdrop-filter:blur(4px)}
.gdCard{position:relative;width:min(460px,100%);max-height:calc(100dvh - 24px);overflow:auto;background:#0c1713;border:1px solid #f0b94a55;border-radius:20px;padding:22px 20px 16px;color:#fff;display:flex;flex-direction:column;gap:10px;box-shadow:0 20px 60px #000a}
.gdX{position:absolute;right:10px;top:8px;background:none;border:0;color:#9fb5aa;font-size:26px;cursor:pointer}
.gdE{font-size:44px;line-height:1;text-align:center}.gdCard h2{margin:0;text-align:center;font-size:21px;color:#f3c56f}.gdLead{margin:0;text-align:center;color:#cfe;font-size:13px;line-height:1.45}
.gdCard ul{list-style:none;margin:4px 0;padding:0;display:flex;flex-direction:column;gap:8px}.gdCard li{display:flex;gap:10px;align-items:flex-start;background:#10201a;border:1px solid #ffffff1a;border-radius:12px;padding:9px 11px;font-size:12.5px;line-height:1.45}.gdCard li span{font-size:20px;line-height:1.1}
.gdDots{display:flex;justify-content:center;gap:6px}.gdDots i{width:8px;height:8px;border-radius:50%;background:#ffffff33;cursor:pointer}.gdDots i.on{background:#f0b94a;width:20px;border-radius:6px}
.gdBtns{display:flex;align-items:center;justify-content:space-between;gap:10px}.gdBtns small{color:#9fb5aa}.gdBtns button{background:#d99a42;color:#1a1208;border:0;border-radius:12px;padding:11px 20px;font-weight:800;font-size:14px;cursor:pointer}.gdBtns button.ghost{background:#ffffff14;color:#cfe;font-weight:600}`} />
  </div>;
}
