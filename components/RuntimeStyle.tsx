'use client';
import { useEffect } from 'react';

export default function RuntimeStyle({ css, id }: { css: string; id?: string }) {
  useEffect(() => {
    if (!css) return;
    const key = id || `arl-style-${Math.abs(hash(css)).toString(36)}`;
    let el = document.querySelector<HTMLStyleElement>(`style[data-arl-style="${key}"]`);
    if (!el) {
      el = document.createElement('style');
      el.setAttribute('data-arl-style', key);
      document.head.appendChild(el);
    }
    if (el.textContent !== css) el.textContent = css;
    // Intentionally do not remove it on unmount: React 19 may hoist/remove DOM style nodes
    // while react-three-fiber is reconciling the Canvas.
  }, [css, id]);
  return null;
}
function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
