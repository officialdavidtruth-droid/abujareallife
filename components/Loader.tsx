'use client';
import { useEffect, useState, type CSSProperties } from 'react';

const TIPS = [
  'Click any object in your flat to see what you can do.',
  'Keep your needs above 25% to stay in a good mood.',
  'NEPA took the light? Check the generator.',
  'Free will lets your character act on their own.',
  'Take a freelance gig to earn some naira.',
  'Head out to the Neighborhood to meet other players.',
];
const BUILDINGS: [number, number][] = [[46, 0], [70, 1], [34, 2], [88, 3], [58, 4], [100, 5], [64, 6], [40, 7], [78, 8], [52, 9]];

export default function Loader({ label = 'Loading Abuja', progress, fading }: { label?: string; progress?: number; fading?: boolean }) {
  const [tip, setTip] = useState(0);
  useEffect(() => { const t = setInterval(() => setTip(i => (i + 1) % TIPS.length), 2400); return () => clearInterval(t); }, []);
  return <div className={'ld' + (fading ? ' out' : '')} role="status" aria-live="polite">
    <div className="ldGlow g1" /><div className="ldGlow g2" />
    <div className="ldCity" aria-hidden>
      <svg className="ldRock" viewBox="0 0 400 90" preserveAspectRatio="none"><path d="M0 90 L0 70 Q40 66 70 52 Q110 20 160 14 Q215 8 250 34 Q290 58 330 62 Q370 66 400 70 L400 90 Z" /></svg>
      <div className="ldBlds">{BUILDINGS.map(([h, i]) => <i key={i} style={{ '--h': h + 'px', '--d': i * 0.12 + 's' } as CSSProperties} />)}</div>
    </div>
    <div className="ldCore"><div className="ldRing" /><div className="ldRing r2" /><div className="ldLogo">AR</div></div>
    <h2 className="ldTitle">Abuja Real Life</h2>
    <p className="ldLabel">{label}<span className="ldDots"><i /><i /><i /></span></p>
    <div className="ldBar"><i className={progress == null ? 'ind' : ''} style={progress == null ? undefined : { width: Math.max(4, Math.min(100, progress)) + '%' }} /></div>
    <p key={tip} className="ldTip">{TIPS[tip]}</p>
  </div>;
}
