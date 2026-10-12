import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/* Car detail parts: real wheels (tyre with sidewall, rim ring, 5 spokes, hub, brake disc) and a one-draw-call trim kit
 * (mirrors, number plates, bumper strips, side skirts, exhaust tips, dark wheel arches). Everything is merged with vertex colours. */
export const WHEEL_R = .37, WHEELBASE = 2.7;
/** wheel centre [x forward, z sideways] and whether it steers */
export const WHEEL_AT: [number, number, boolean][] = [[1.35, .9, true], [1.35, -.9, true], [-1.35, .9, false], [-1.35, -.9, false]];

const paint = (g: THREE.BufferGeometry, hex: string) => {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
};
const box = (w: number, h: number, d: number, x: number, y: number, z: number, hex: string) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return paint(g, hex); };

const WHEELS = new Map<string, THREE.BufferGeometry>();
/** one wheel, axis along z, outer face towards +z */
export function wheelGeo(rim: string): THREE.BufferGeometry {
  let w = WHEELS.get(rim); if (w) return w;
  const cz = (r: number, h: number, z: number, hex: string, open = false) => { const g = new THREE.CylinderGeometry(r, r, h, 22, 1, open); g.rotateX(Math.PI / 2); g.translate(0, 0, z); return paint(g, hex); };
  const prof = [[.23, -.13], [.32, -.145], [.365, -.11], [.378, -.045], [.378, .045], [.365, .11], [.32, .145], [.23, .13]].map(([x, y]) => new THREE.Vector2(x, y));
  const tire = new THREE.LatheGeometry(prof, 26); tire.rotateX(Math.PI / 2); paint(tire, '#16181b');
  const ring = new THREE.TorusGeometry(.215, .032, 6, 24); ring.translate(0, 0, .12); paint(ring, rim);
  const spokes = [0, 1, 2, 3, 4].map(i => { const g = new THREE.BoxGeometry(.2, .05, .025); g.translate(.11, 0, 0); g.rotateZ(i * Math.PI * 2 / 5); g.translate(0, 0, .115); return paint(g, rim); });
  w = mergeGeometries([tire, cz(.24, .25, 0, '#2a2d31', true), cz(.23, .02, -.05, '#0c0d0f'), cz(.2, .02, .05, '#5a6068'), ring, ...spokes, cz(.055, .05, .125, rim)])!;
  WHEELS.set(rim, w); return w;
}
export const WHEEL_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .45, metalness: .4, side: THREE.DoubleSide });

export function trimGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const sd of [1, -1]) {
    parts.push(box(.1, .07, .16, .62, .93, sd * 1.0, '#1b1d20'), box(.04, .04, .1, .62, .9, sd * .93, '#1b1d20'));   // mirror + stalk
    parts.push(box(1.9, .05, .025, 0, .34, sd * .945, '#15171a'));                                                     // side skirt
    for (const x of [1.35, -1.35]) { const g = new THREE.CircleGeometry(1, 24, 0, Math.PI); g.scale(.47, .37, 1); if (sd < 0) g.rotateY(Math.PI); g.translate(x, .37, sd * .938); parts.push(paint(g, '#0b0c0e')); }   // wheel arch
  }
  parts.push(box(.02, .14, .46, -2.215, .5, 0, '#f4f4f0'), box(.022, .03, .4, -2.216, .56, 0, '#1d6b3a'), box(.02, .12, .44, 2.215, .4, 0, '#f4f4f0'));   // plates
  parts.push(box(.1, .12, 1.55, 2.15, .36, 0, '#1a1c1f'), box(.1, .12, 1.55, -2.12, .36, 0, '#1a1c1f'));               // lower bumper strips
  for (const z of [-.5, .5]) { const g = new THREE.CylinderGeometry(.045, .045, .14, 10); g.rotateZ(Math.PI / 2); g.translate(-2.2, .3, z); parts.push(paint(g, '#c9ced3')); }   // exhaust tips
  return mergeGeometries(parts)!;
}
export const TRIM_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .55, metalness: .3, side: THREE.DoubleSide });
