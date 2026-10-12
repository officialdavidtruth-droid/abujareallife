/* Touch-device helper: on phones and tablets the keyboard hints ("Press E", "Shift", "Space") make no sense,
   so every hint is written once as (touch text, keyboard text) and the right one is picked at runtime. */
export const isTouch = (): boolean => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse), (max-width: 700px)').matches;
/** hint('Tap Car', 'Press E') -> 'Tap Car' on a phone, 'Press E' on a computer */
export const hint = (touch: string, keys: string): string => (isTouch() ? touch : keys);
/** Marks <body> so CSS can hide keyboard-only hints (class "kbd") and show touch-only ones. */
export function markTouchBody() {
  if (typeof document === 'undefined') return;
  const m = window.matchMedia?.('(pointer: coarse), (max-width: 700px)');
  const sync = () => document.body.classList.toggle('isTouch', !!m?.matches);
  sync(); m?.addEventListener?.('change', sync);
}
