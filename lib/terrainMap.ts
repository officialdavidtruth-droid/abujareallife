/* A small colour picture of the whole map (water, sand, grass, hills) for the minimap. Built in slices after the game starts so a phone never freezes:
   getTerrainMap() returns the canvas straight away (it fills in over the first second or two). Client only. */
import { CORE, WATER_Y, WORLD_LIM, groundColor, terrainH } from './terrain';

const PX = 6;   // metres per pixel
let cv: HTMLCanvasElement | null = null;

export function getTerrainMap(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  if (cv) return cv;
  const N = Math.round((WORLD_LIM * 2) / PX); cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d'); if (!g) return cv;
  g.fillStyle = '#35553f'; g.fillRect(0, 0, N, N);
  let row = 0;
  const slice = () => {
    const end = Math.min(N, row + 12), img = g.createImageData(N, end - row);
    for (let j = row; j < end; j++) for (let i = 0; i < N; i++) {
      const x = -WORLD_LIM + i * PX, z = -WORLD_LIM + j * PX, h = terrainH(x, z), o = ((j - row) * N + i) * 4;
      let r: number, gr: number, b: number;
      if (Math.abs(x) <= CORE && Math.abs(z) <= CORE) { r = 53; gr = 85; b = 63; }   // the city floor keeps its old colour
      else if (h < WATER_Y) { const d = Math.min(1, (WATER_Y - h) / 9); r = 70 - d * 40; gr = 140 - d * 60; b = 190 - d * 50; }
      else { const c = groundColor(x, z, h, 0), shade = .75 + Math.min(.45, Math.max(0, h) / 60); r = c[0] * 255 * shade; gr = c[1] * 255 * shade; b = c[2] * 255 * shade; }
      img.data[o] = r; img.data[o + 1] = gr; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, row); row = end;
    if (row < N) setTimeout(slice, 8);
  };
  setTimeout(slice, 400);
  return cv;
}
export const TERRAIN_MAP_EXTENT = WORLD_LIM;
