/** Tiny hex colour helper (no three.js, so catalog + 2D previews can use it). a>0 lightens toward white, a<0 darkens toward black. */
export function shade(hex: string, a: number): string {
  const n = parseInt(hex.replace('#', ''), 16), t = a >= 0 ? 255 : 0, k = Math.min(1, Math.abs(a));
  const ch = (v: number) => Math.round(v + (t - v) * k).toString(16).padStart(2, '0');
  return '#' + ch((n >> 16) & 255) + ch((n >> 8) & 255) + ch(n & 255);
}
