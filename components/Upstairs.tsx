'use client';
import { ST, TOP_Z, RISE, TREAD, ROOM, DOOR } from '../lib/upstairs';

/* The upstairs of a two-storey house (see lib/upstairs.ts): the stair that climbs north from the doorway in the flat's north wall, and the upstairs room.
   Drawn with plain boxes. `tall` = third-person view (full-height walls), otherwise half-height cutaway walls like the rest of the flat.
   Clicking the stair or the upstairs floor walks you there (`onFloor`). */
type V3 = [number, number, number];
const Bx = ({ p, s, c, ro = .8, op, rot, onClick }: { p: V3; s: V3; c: string; ro?: number; op?: number; rot?: V3; onClick?: (e: any) => void }) =>
  <mesh position={p} rotation={rot} castShadow receiveShadow onClick={onClick}><boxGeometry args={s} /><meshStandardMaterial color={c} roughness={ro} transparent={op !== undefined} opacity={op ?? 1} /></mesh>;

const WALL = '#e8e2d2', TRIM = '#f4f0e6', WOOD = '#8a6240', FLOOR = '#b88a58', BASE = '#cfc9bd';

export default function Upstairs({ tall, onFloor }: { tall: boolean; onFloor: (x: number, z: number) => void }) {
  const { ax, hw, z0, N, H } = ST, W = ROOM.x1 - ROOM.x0, D = ROOM.z1 - ROOM.z0, cx = (ROOM.x0 + ROOM.x1) / 2, cz = (ROOM.z0 + ROOM.z1) / 2;
  const Hw = tall ? 2.6 : 1.3, go = (e: any) => { if (e.delta > 4) return; e.stopPropagation(); onFloor(e.point.x, e.point.z); };
  const slope = Math.atan2(H, ST.run), railL = Math.hypot(ST.run, H), railZ = z0 - ST.run / 2;
  const sw = (hw + .05) * 2;   // inner width of the stair
  const south = [[ROOM.x0, ax - hw - .1], [ax + hw + .1, ROOM.x1]];   // the room's south wall, with the stair coming in between
  return <group>
    {/* steps: solid blocks, step k is k risers high (step 0 is the floor) */}
    {Array.from({ length: N - 1 }, (_, i) => { const k = i + 1; return <Bx key={k} p={[ax, k * RISE / 2, z0 - (k + .5) * TREAD]} s={[sw, k * RISE, TREAD]} c={k % 2 ? '#a07b55' : '#94704c'} ro={.7} onClick={go} />; })}
    {/* handrails and posts both sides */}
    {[-1, 1].map(side => <group key={side}>
      <Bx p={[ax + side * (hw + .08), .95 + H / 2, railZ]} s={[.06, .06, railL]} c="#3a2a1c" ro={.5} rot={[slope, 0, 0]} />
      {[0, 4, 8, 12, 16].map(k => <Bx key={k} p={[ax + side * (hw + .08), k * RISE + .5, z0 - k * TREAD]} s={[.05, 1, .05]} c="#3a2a1c" ro={.5} />)}
    </group>)}
    {/* doorway trim in the north wall */}
    <Bx p={[ax, DOOR.h + (2.6 - DOOR.h) / 2, -4.7]} s={[DOOR.x1 - DOOR.x0 + .2, 2.6 - DOOR.h, .2]} c="#e0dbcd" ro={.9} />
    {[DOOR.x0 - .05, DOOR.x1 + .05].map(x => <Bx key={x} p={[x, DOOR.h / 2, -4.7]} s={[.1, DOOR.h, .22]} c={TRIM} ro={.5} />)}

    {/* the upstairs floor: a block under the room, a plank floor on top (click to walk) */}
    <Bx p={[cx, (H - .1) / 2, cz]} s={[W + .2, H - .1, D + .2]} c={BASE} ro={.95} />
    <mesh position={[cx, H + .005, cz]} rotation-x={-Math.PI / 2} receiveShadow onClick={go}><planeGeometry args={[W, D]} /><meshStandardMaterial color={FLOOR} roughness={.6} /></mesh>
    <Bx p={[cx, H + .03, ROOM.z1 - .03]} s={[W, .06, .06]} c={TRIM} ro={.5} />
    {/* walls: north, west, east and the south wall either side of the stair (cutaway height, full in third person) */}
    <Bx p={[cx, H + Hw / 2, ROOM.z0 - .1]} s={[W + .4, Hw, .2]} c={WALL} ro={.95} />
    <Bx p={[ROOM.x0 - .1, H + Hw / 2, cz]} s={[.2, Hw, D]} c={WALL} ro={.95} />
    <Bx p={[ROOM.x1 + .1, H + Hw / 2, cz]} s={[.2, Hw, D]} c={WALL} ro={.95} />
    {south.map(([a, b]) => <Bx key={a} p={[(a + b) / 2, H + Hw / 2, ROOM.z1 + .1]} s={[b - a, Hw, .2]} c={WALL} ro={.95} />)}
    {!tall && <>{[[cx, ROOM.z0 - .1, W + .46, .26], [ROOM.x0 - .1, cz, .26, D + .06], [ROOM.x1 + .1, cz, .26, D + .06]].map(([x, z, w, d], i) => <Bx key={i} p={[x, H + Hw + .02, z]} s={[w, .04, d]} c={TRIM} ro={.5} />)}</>}
    {/* window on the north wall */}
    <Bx p={[ax + 1.9, H + 1.5, ROOM.z0 + .02]} s={[1.7, 1.15, .05]} c="#9bc4e0" op={.55} ro={.1} />
    <Bx p={[ax + 1.9, H + 1.5, ROOM.z0 + .045]} s={[1.78, 1.23, .02]} c="#3a2a1c" ro={.5} />
    <Bx p={[ax + 1.9, H + 1.5, ROOM.z0 + .06]} s={[1.6, 1.05, .02]} c="#9bc4e0" op={.5} ro={.1} />

    {/* furniture (to look at: the footprints are solid, see UP_BLOCKS) */}
    <group position={[0, H, 0]}>
      <Bx p={[0, .006 + .01, -12.6]} s={[2.8, .02, 3.2]} c="#8c3a2f" ro={1} />
      <group position={[.8, 0, -12.875]}>
        <Bx p={[0, .2, 0]} s={[1.8, .26, 2.45]} c={WOOD} ro={.55} />
        <Bx p={[0, .66, -1.22]} s={[1.88, 1.32, .12]} c={WOOD} ro={.5} />
        <Bx p={[0, .48, .02]} s={[1.68, .27, 2.3]} c="#f4f0e6" ro={.95} />
        <Bx p={[0, .66, .56]} s={[1.74, .12, 1.4]} c="#2f6b6b" ro={1} />
        <Bx p={[-.42, .72, -.84]} s={[.7, .17, .4]} c="#fbfaf6" ro={1} /><Bx p={[.42, .72, -.84]} s={[.7, .17, .4]} c="#fbfaf6" ro={1} />
        <Bx p={[1.15, .26, -1.0]} s={[.5, .52, .5]} c="#6b4a30" ro={.55} />
      </group>
      <Bx p={[5.2, 1.0, -13.2]} s={[.6, 2.0, 1.8]} c="#6b4a30" ro={.6} />
      <Bx p={[-1.05, .45, -11.0]} s={[.5, .9, 1.4]} c="#7b563a" ro={.6} />
      <Bx p={[-1.05, .94, -11.0]} s={[.54, .04, 1.44]} c="#cfc9bd" ro={.4} />
    </group>
  </group>;
}
