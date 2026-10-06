'use client';
import { useEffect, useState } from 'react';

// Registers the service worker, locks to landscape when possible, and shows a rotate hint in portrait.
export default function PWARegister() {
  const [portrait, setPortrait] = useState(false);
  const [install, setInstall] = useState<any>(null);
  const [full, setFull] = useState(false);
  const [standalone, setStandalone] = useState(true);
  const [canFs, setCanFs] = useState(false);
  useEffect(() => {
    setStandalone(window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches || !!(navigator as any).standalone);
    setCanFs(!!document.fullscreenEnabled);
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('/sw.js').catch(() => {});
    const chk = () => setPortrait(window.innerHeight > window.innerWidth * 1.05);
    chk(); window.addEventListener('resize', chk); window.addEventListener('orientationchange', chk);
    const bip = (e: Event) => { e.preventDefault(); setInstall(e); setTimeout(() => setInstall(null), 10000); };
    window.addEventListener('beforeinstallprompt', bip);
    // block pinch-zoom / double-tap zoom / pull-to-refresh on iOS Safari
    const stop = (e: Event) => e.preventDefault();
    document.addEventListener('gesturestart', stop);
    let last = 0; const dbl = (e: TouchEvent) => { const n = Date.now(); if (n - last < 300) e.preventDefault(); last = n; };
    document.addEventListener('touchend', dbl, { passive: false });
    const ctx = (e: Event) => { if ((e.target as HTMLElement)?.tagName === 'CANVAS') e.preventDefault(); };
    document.addEventListener('contextmenu', ctx);
    const fs = () => setFull(!!document.fullscreenElement); document.addEventListener('fullscreenchange', fs);
    return () => { window.removeEventListener('resize', chk); window.removeEventListener('orientationchange', chk); window.removeEventListener('beforeinstallprompt', bip); document.removeEventListener('gesturestart', stop); document.removeEventListener('touchend', dbl); document.removeEventListener('contextmenu', ctx); document.removeEventListener('fullscreenchange', fs); };
  }, []);
  async function goFull() {
    try { await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' } as any); await (screen.orientation as any)?.lock?.('landscape'); } catch { /* not supported (iOS) */ }
  }
  return <>
    {portrait && <div className="rotateHint"><div className="rotIcon">📱</div><b>Rotate your phone</b><span>Abuja Real Life plays best in landscape</span></div>}
    {!standalone && !full && canFs && <button className="fsBtn" onClick={goFull} aria-label="Fullscreen">⛶</button>}
    {install && !standalone && <button className="installBtn" onClick={async () => { install.prompt(); await install.userChoice; setInstall(null); }}>⬇ Install game</button>}
  </>;
}
