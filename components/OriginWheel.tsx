'use client';
import { useEffect, useState } from 'react';
import { NEPO_CASH, LAPO_CASH, WHEEL_SLICES, type Origin } from '../lib/profile';

const N = WHEEL_SLICES.length, SLICE = 360 / N, naira = (n: number) => '₦' + n.toLocaleString();
// The server already decided the result; the wheel only animates to it, so it cannot be gamed from the browser.
export default function OriginWheel({ origin, onDone }: { origin: Origin; onDone: () => void }) {
  const [deg, setDeg] = useState(0), [done, setDone] = useState(false);
  useEffect(() => {
    const options = WHEEL_SLICES.map((o, i) => (o === origin ? i : -1)).filter(i => i >= 0);
    const pick = options[Math.floor(Math.random() * options.length)];
    const target = 360 * 6 + (360 - (pick * SLICE + SLICE / 2)); // pointer is at the top
    const t1 = setTimeout(() => setDeg(target), 150), t2 = setTimeout(() => setDone(true), 5200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [origin]);
  const grad = WHEEL_SLICES.map((o, i) => `${o === 'NEPO' ? '#d99a42' : '#2a6f55'} ${i * SLICE}deg ${(i + 1) * SLICE}deg`).join(',');
  const rich = origin === 'NEPO';
  return <div className="owWrap">
    <div className="owCard">
      <h2>🎡 Wheel of Luck</h2>
      <p className="owSub">Spins once, at sign-up. Where did you come from?</p>
      <div className="owBox"><div className="owPtr">▼</div>
        <div className="owWheel" style={{ background: `conic-gradient(${grad})`, transform: `rotate(${deg}deg)` }}>
          {WHEEL_SLICES.map((o, i) => <span key={i} style={{ transform: `rotate(${i * SLICE + SLICE / 2}deg) translateY(-86px)` }}>{o === 'NEPO' ? '👑' : '🥣'}</span>)}
        </div><div className="owHub" /></div>
      <div className="owKey"><span><i style={{ background: '#2a6f55' }} />LAPO · poor</span><span><i style={{ background: '#d99a42' }} />NEPO · rich</span></div>
      {done ? <div className="owRes">
        <h3>{rich ? '👑 You are a NEPO baby!' : '🥣 You are a LAPO baby'}</h3>
        <p>{rich ? `Rich family. You start with ${naira(NEPO_CASH)}.` : `You start from nothing: ${naira(LAPO_CASH)}. Hustle your way up.`}</p>
        <p className="owSmall">This is final: your origin can never be changed. You own a house, but no car. Buy one at a Car Dealer.</p>
        <button onClick={onDone}>Continue →</button></div> : <p className="owSpin">Spinning…</p>}
    </div></div>;
}
