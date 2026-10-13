'use client';
import { useEffect, useState } from 'react';
/* The flat billboard drawing used on /adbooking and /adminad. With a flyer, the picture fills the face (it is already the board's shape).
   If the picture tag fails, it is fetched again fresh (skipping any stale cached copy) and shown from memory. If that also fails the board
   shows the ad's text and, underneath, exactly what the server sent. */
export type BoardProps = { title: string; sub: string; contact?: string; color: string; img?: string };
export default function AdBoard({ title, sub, contact, color, img }: BoardProps) {
  const [src, setSrc] = useState(img), [retried, setRetried] = useState(false), [failed, setFailed] = useState(''), [why, setWhy] = useState('');
  useEffect(() => { setSrc(img); setRetried(false); setFailed(''); setWhy(''); }, [img]);
  const onError = async () => {
    if (!retried) {
      setRetried(true);
      try { const r = await fetch(img!, { cache: 'reload' }); if (r.ok && (r.headers.get('content-type') || '').startsWith('image/')) { setSrc(URL.createObjectURL(await r.blob())); return; } } catch { /* fall through to the report */ }
    }
    setFailed(img!); setWhy('checking…');
    try {
      const r = await fetch(img!, { cache: 'reload' }), ct = r.headers.get('content-type') || 'no content-type';
      if (!ct.startsWith('image/')) { setWhy(`HTTP ${r.status} · ${(await r.text()).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 110) || ct}`); return; }
      const bl = await r.blob(), b = new Uint8Array(await bl.arrayBuffer()), hex = (a: Uint8Array) => Array.from(a).map(x => x.toString(16).padStart(2, '0')).join(' ');
      let dec = 'decodes fine'; try { await createImageBitmap(bl); } catch (e) { dec = 'browser cannot decode it (' + String((e as Error).message || e).slice(0, 50) + ')'; }
      setWhy(`HTTP ${r.status} · ${ct} · ${b.length} bytes · starts ${hex(b.slice(0, 4))} · ends ${hex(b.slice(-2))} (JPEG ends ff d9) · ${dec}`);
    } catch (e) { setWhy('request failed: ' + String((e as Error).message || e).slice(0, 80)); }
  };
  const showImg = !!img && failed !== img;
  return <div className="abkBoard"><div className={'abkFace' + (showImg ? ' hasImg' : '')} style={{ background: color }}>
    {showImg
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={src || img} alt={title ? `Flyer: ${title}` : 'Ad flyer'} onError={onError} />
      : <><b>{title || 'YOUR HEADLINE'}</b><span>{sub || 'Your tagline goes here'}</span>{contact ? <small>{contact}</small> : null}{img ? <small style={{ background: '#7a1f17', whiteSpace: 'normal', maxWidth: '100%' }}>Flyer picture could not be loaded{why ? ': ' + why : ''}</small> : null}</>}
  </div><i className="abkPost l" /><i className="abkPost r" /></div>;
}
