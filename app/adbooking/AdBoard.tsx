'use client';
import { useState } from 'react';
/* The flat billboard drawing used on /adbooking and /adminad. With a flyer, the picture fills the face (it is already the board's shape).
   If the flyer picture cannot be loaded the board shows the ad's text and says so, instead of an empty board. */
export type BoardProps = { title: string; sub: string; contact?: string; color: string; img?: string };
export default function AdBoard({ title, sub, contact, color, img }: BoardProps) {
  const [failed, setFailed] = useState('');
  const showImg = !!img && failed !== img;
  return <div className="abkBoard"><div className={'abkFace' + (showImg ? ' hasImg' : '')} style={{ background: color }}>
    {showImg
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={img} alt={title ? `Flyer: ${title}` : 'Ad flyer'} onError={() => setFailed(img!)} />
      : <><b>{title || 'YOUR HEADLINE'}</b><span>{sub || 'Your tagline goes here'}</span>{contact ? <small>{contact}</small> : null}{img ? <small style={{ background: '#7a1f17' }}>Flyer picture could not be loaded</small> : null}</>}
  </div><i className="abkPost l" /><i className="abkPost r" /></div>;
}
