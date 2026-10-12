'use client';
/* The flat billboard drawing used on /adbooking and /adminad. With a flyer, the picture fills the face (it is already the board's shape). */
export type BoardProps = { title: string; sub: string; contact?: string; color: string; img?: string };
export default function AdBoard({ title, sub, contact, color, img }: BoardProps) {
  return <div className="abkBoard"><div className={'abkFace' + (img ? ' hasImg' : '')} style={{ background: color }}>
    {img
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={img} alt={title ? `Flyer: ${title}` : 'Ad flyer'} />
      : <><b>{title || 'YOUR HEADLINE'}</b><span>{sub || 'Your tagline goes here'}</span>{contact ? <small>{contact}</small> : null}</>}
  </div><i className="abkPost l" /><i className="abkPost r" /></div>;
}
