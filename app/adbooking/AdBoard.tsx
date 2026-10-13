'use client';
import { useState } from 'react';
/* The flat billboard drawing used on /adbooking and /adminad. With a flyer, the picture fills the face (it is already the board's shape).
   If the flyer picture cannot be loaded the board shows the ad's text and, underneath, the exact reason the server gave. */
export type BoardProps = { title: string; sub: string; contact?: string; color: string; img?: string };
export default function AdBoard({ title, sub, contact, color, img }: BoardProps) {
  const [failed, setFailed] = useState(''), [why, setWhy] = useState('');
  const showImg = !!img && failed !== img;
  const onError = async () => {
    setFailed(img!); setWhy('checking…');
    try {
      const r = await fetch(img!, { cache: 'no-store' }), ct = r.headers.get('content-type') || 'no content-type';
      if (!ct.startsWith('image/')) { setWhy(`HTTP ${r.status} · ${(await r.text()).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 110) || ct}`); return; }
      const b = new Uint8Array(await r.arrayBuffer());
      setWhy(`HTTP ${r.status} · ${ct} · ${b.length} bytes · starts ${Array.from(b.slice(0, 4)).map(x => x.toString(16).padStart(2, '0')).join(' ')} (a JPEG starts ff d8 ff)`);
    } catch (e) { setWhy('request failed: ' + String((e as Error).message || e).slice(0, 80)); }
  };
  return <div className="abkBoard"><div className={'abkFace' + (showImg ? ' hasImg' : '')} style={{ background: color }}>
    {showImg
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={img} alt={title ? `Flyer: ${title}` : 'Ad flyer'} onError={onError} />
      : <><b>{title || 'YOUR HEADLINE'}</b><span>{sub || 'Your tagline goes here'}</span>{contact ? <small>{contact}</small> : null}{img ? <small style={{ background: '#7a1f17', whiteSpace: 'normal', maxWidth: '100%' }}>Flyer picture could not be loaded{why ? ': ' + why : ''}</small> : null}</>}
  </div><i className="abkPost l" /><i className="abkPost r" /></div>;
}
