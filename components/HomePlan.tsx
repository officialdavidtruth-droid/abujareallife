'use client';
import { useMemo } from 'react';
import { ROOM_TYPES, exteriorWalls, isStarter, type Room, type WallSeg } from '../lib/homeRooms';
/* Build mode, step 2 (BUILD-MODE.md): draws a house from its saved rooms. Floors per room (with a faint colour per room type so you can tell them apart),
   outside walls (half-height cutaway like the rest of the house, full height in third person) and an opening where the front door is.
   Walls between rooms arrive with doors in step 5; until then the rooms are open plan. */
const ACCENT: Record<string, string> = { living: '#c9a46a', bedroom: '#8fa8d8', kitchen: '#e3c26b', bathroom: '#8fd0d4', gym: '#d98a8a', cinema: '#9a8ad0', office: '#8ac49a', empty: '#cccccc' };
export type FloorProps = { map?: unknown; color: string; roughness: number; metalness: number };
const T = 0.2, DOOR_GAP = 1.1;

/** Split a wall around the front door (a gap DOOR_GAP wide centred on `at`). */
function withGap(segs: WallSeg[], door: { x: number; z: number } | null): WallSeg[] {
  if (!door) return segs;
  const out: WallSeg[] = [];
  for (const s of segs) {
    const along = s.axis === 'x' ? door.x : door.z, line = s.axis === 'x' ? door.z : door.x, s0 = s.axis === 'x' ? s.x : s.z, s1 = s0 + s.len, onLine = Math.abs((s.axis === 'x' ? s.z : s.x) - line) < 0.01;
    if (!onLine || along < s0 || along > s1) { out.push(s); continue; }
    const a = along - DOOR_GAP / 2, b = along + DOOR_GAP / 2;
    if (a - s0 > 0.05) out.push(s.axis === 'x' ? { ...s, len: a - s0 } : { ...s, len: a - s0 });
    if (s1 - b > 0.05) out.push(s.axis === 'x' ? { ...s, x: b, len: s1 - b } : { ...s, z: b, len: s1 - b });
  }
  return out;
}

export default function PlanHouse({ rooms, skipStarter, tall, wall, trim, floor, door, onFloor }: {
  rooms: Room[]; skipStarter: boolean; tall: boolean; wall: string; trim: string; floor: FloorProps;
  door: { x: number; z: number } | null; onFloor: (x: number, z: number, e: { delta: number; stopPropagation: () => void }) => void;
}) {
  const segs = useMemo(() => withGap(exteriorWalls(rooms, skipStarter ? isStarter : undefined), door), [rooms, door, skipStarter]);   // skipStarter: the original flat draws its own floor and walls
  const H = tall ? 2.6 : 1.3;
  return <group>
    {rooms.filter(r => !(skipStarter && isStarter(r))).map(r => <group key={r.id}>
      <mesh rotation-x={-Math.PI / 2} position={[r.x + r.w / 2, .01, r.z + r.d / 2]} receiveShadow onClick={e => { if (e.delta > 4) return; e.stopPropagation(); onFloor(e.point.x, e.point.z, e); }}>
        <planeGeometry args={[r.w, r.d]} /><meshStandardMaterial map={floor.map as never} color={floor.color} roughness={floor.roughness} metalness={floor.metalness} /></mesh>
      <mesh rotation-x={-Math.PI / 2} position={[r.x + r.w / 2, .014, r.z + r.d / 2]} raycast={() => null}>
        <planeGeometry args={[r.w - .3, r.d - .3]} /><meshStandardMaterial color={ACCENT[r.type] ?? '#ccc'} transparent opacity={r.type === 'empty' ? 0 : .22} depthWrite={false} /></mesh>
    </group>)}
    {segs.map((s, i) => {
      const cx = s.axis === 'x' ? s.x + s.len / 2 : s.x, cz = s.axis === 'x' ? s.z : s.z + s.len / 2, sx = s.axis === 'x' ? s.len + T : T, sz = s.axis === 'x' ? T : s.len + T;
      return <group key={i} position={[cx, 0, cz]}>
        <mesh position={[0, H / 2, 0]} castShadow receiveShadow><boxGeometry args={[sx, H, sz]} /><meshStandardMaterial color={wall} roughness={.95} /></mesh>
        {!tall && <mesh position={[0, H + .02, 0]}><boxGeometry args={[sx + .06, .04, sz + .06]} /><meshStandardMaterial color={trim} roughness={.5} /></mesh>}
      </group>;
    })}
  </group>;
}
export { ROOM_TYPES };
