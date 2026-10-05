'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Html, OrbitControls, RoundedBox, Text } from '@react-three/drei';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export type PlayerLook = {
  skin: string;
  shirt: string;
  pants: string;
  hair: string;
};

export type District =
  | 'Wuse'
  | 'Garki'
  | 'Maitama'
  | 'Jabi'
  | 'Gwarinpa'
  | 'Asokoro';

const districtPositions: Record<District, [number, number, number]> = {
  Wuse: [-5, 0, -2],
  Garki: [-1.8, 0, 3],
  Maitama: [3.8, 0, -3],
  Jabi: [4.7, 0, 2],
  Gwarinpa: [-5, 0, 4.8],
  Asokoro: [1.8, 0, 5],
};

function Avatar({ look, moving }: { look: PlayerLook; moving: boolean }) {
  const group = useRef<THREE.Group>(null);

  useFrame((s) => {
    if (!group.current) return;
    const t = s.clock.elapsedTime;
    group.current.position.y = Math.abs(Math.sin(t * (moving ? 8 : 2))) * 0.035;
    const swing = moving ? Math.sin(t * 8) * 0.5 : 0;

    const children = group.current.children;
    if (children[2]) children[2].rotation.x = swing;
    if (children[3]) children[3].rotation.x = -swing;
    if (children[4]) children[4].rotation.x = -swing;
    if (children[5]) children[5].rotation.x = swing;
  });

  return (
    <group ref={group}>
      <mesh position={[0, 1.62, 0]} castShadow>
        <sphereGeometry args={[0.31, 24, 18]} />
        <meshStandardMaterial color={look.skin} />
      </mesh>
      <mesh position={[0, 1.18, 0]} castShadow>
        <capsuleGeometry args={[0.3, 0.62, 8, 16]} />
        <meshStandardMaterial color={look.shirt} />
      </mesh>
      <mesh position={[-0.13, 0.59, 0]} castShadow>
        <capsuleGeometry args={[0.105, 0.62, 6, 10]} />
        <meshStandardMaterial color={look.pants} />
      </mesh>
      <mesh position={[0.13, 0.59, 0]} castShadow>
        <capsuleGeometry args={[0.105, 0.62, 6, 10]} />
        <meshStandardMaterial color={look.pants} />
      </mesh>
      <mesh position={[-0.39, 1.2, 0]} rotation={[0, 0, -0.15]} castShadow>
        <capsuleGeometry args={[0.09, 0.55, 6, 10]} />
        <meshStandardMaterial color={look.skin} />
      </mesh>
      <mesh position={[0.39, 1.2, 0]} rotation={[0, 0, 0.15]} castShadow>
        <capsuleGeometry args={[0.09, 0.55, 6, 10]} />
        <meshStandardMaterial color={look.skin} />
      </mesh>
      <mesh position={[0, 1.88, 0]} castShadow>
        <sphereGeometry args={[0.34, 18, 16]} />
        <meshStandardMaterial color={look.hair} />
      </mesh>
      <mesh position={[0, 1.72, 0.28]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshBasicMaterial color="#111" />
      </mesh>
      <Html position={[0, 2.25, 0]} center>
        <div className="worldTag">YOU</div>
      </Html>
    </group>
  );
}

function Npc({
  x,
  z,
  name,
  skin,
  shirt,
}: {
  x: number;
  z: number;
  name: string;
  skin: string;
  shirt: string;
}) {
  const ref = useRef<THREE.Group>(null);

  useFrame((s) => {
    if (!ref.current) return;
    ref.current.position.x = x + Math.sin(s.clock.elapsedTime * 0.35 + x) * 0.8;
    ref.current.position.z = z + Math.cos(s.clock.elapsedTime * 0.28 + z) * 0.6;
  });

  return (
    <group ref={ref}>
      <mesh position={[0, 1.45, 0]} castShadow>
        <sphereGeometry args={[0.22, 16, 12]} />
        <meshStandardMaterial color={skin} />
      </mesh>
      <mesh position={[0, 1.05, 0]} castShadow>
        <capsuleGeometry args={[0.22, 0.42, 6, 12]} />
        <meshStandardMaterial color={shirt} />
      </mesh>
      <mesh position={[-0.09, 0.62, 0]}>
        <boxGeometry args={[0.09, 0.42, 0.1]} />
        <meshStandardMaterial color="#20232a" />
      </mesh>
      <mesh position={[0.09, 0.62, 0]}>
        <boxGeometry args={[0.09, 0.42, 0.1]} />
        <meshStandardMaterial color="#20232a" />
      </mesh>
      <Html position={[0, 1.85, 0]} center>
        <div className="worldNpc">{name}</div>
      </Html>
    </group>
  );
}

function Building({
  x,
  z,
  w = 1.8,
  h = 1.7,
  d = 1.5,
  color,
  label,
  accent = '#d99a42',
}: {
  x: number;
  z: number;
  w?: number;
  h?: number;
  d?: number;
  color: string;
  label: string;
  accent?: string;
}) {
  return (
    <group position={[x, h / 2, z]}>
      <RoundedBox args={[w, h, d]} radius={0.08} smoothness={2} castShadow receiveShadow>
        <meshStandardMaterial color={color} />
      </RoundedBox>
      <mesh position={[0, h / 2 + 0.06, 0]}>
        <boxGeometry args={[w + 0.1, 0.1, d + 0.1]} />
        <meshStandardMaterial color={accent} />
      </mesh>
      <Text position={[0, h / 2 + 0.28, d / 2 + 0.02]} fontSize={0.2} color="#f8fafc" anchorX="center" anchorY="middle">
        {label}
      </Text>
    </group>
  );
}

function Road({ x, z, w, d }: { x: number; z: number; w: number; d: number }) {
  return (
    <mesh position={[x, 0.015, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color="#252b32" />
    </mesh>
  );
}

function Car({ x, z, rot = 0 }: { x: number; z: number; rot?: number }) {
  return (
    <group position={[x, 0.18, z]} rotation={[0, rot, 0]}>
      <RoundedBox args={[1.15, 0.28, 0.55]} radius={0.08} smoothness={2}>
        <meshStandardMaterial color="#b43c35" />
      </RoundedBox>
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[0.58, 0.25, 0.48]} />
        <meshStandardMaterial color="#9fb8c7" />
      </mesh>
    </group>
  );
}

/** Runs INSIDE Canvas, fixing the R3F "hooks can only be used within Canvas" error. */
function PlayerController({
  position,
  setPosition,
  keys,
  joystick,
  moving,
  onMoving,
}: {
  position: [number, number, number];
  setPosition: React.Dispatch<React.SetStateAction<[number, number, number]>>;
  keys: React.MutableRefObject<Record<string, boolean>>;
  joystick: React.MutableRefObject<{ x: number; y: number }>;
  moving: boolean;
  onMoving: (value: boolean) => void;
}) {
  useFrame((_, delta) => {
    let dx = 0;
    let dz = 0;

    if (keys.current.w || keys.current.arrowup) dz -= 1;
    if (keys.current.s || keys.current.arrowdown) dz += 1;
    if (keys.current.a || keys.current.arrowleft) dx -= 1;
    if (keys.current.d || keys.current.arrowright) dx += 1;

    dx += joystick.current.x;
    dz += joystick.current.y;

    const length = Math.hypot(dx, dz);
    if (length > 0.05) {
      dx /= Math.max(length, 1);
      dz /= Math.max(length, 1);
      if (!moving) onMoving(true);

      setPosition((p) => [
        THREE.MathUtils.clamp(p[0] + dx * delta * 2.7, -10, 10),
        0,
        THREE.MathUtils.clamp(p[2] + dz * delta * 2.7, -10, 10),
      ]);
    } else if (moving) {
      onMoving(false);
    }
  });

  return (
    <group position={position}>
      {/* Avatar is rendered separately by Scene */}
    </group>
  );
}

function Scene({
  look,
  district,
  onMove,
  joystick,
}: {
  look: PlayerLook;
  district: District;
  onMove: (moving: boolean) => void;
  joystick: React.MutableRefObject<{ x: number; y: number }>;
}) {
  const [moving, setMoving] = useState(false);
  const [pos, setPos] = useState<[number, number, number]>([0, 0, 0]);
  const keys = useRef<Record<string, boolean>>({});
  const target = districtPositions[district];

  useEffect(() => {
    setPos([target[0], 0, target[2]]);
  }, [district]);

  const setMovingState = useCallback(
    (value: boolean) => {
      setMoving(value);
      onMove(value);
    },
    [onMove]
  );

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        keys.current[k] = true;
        setMovingState(true);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = false;
      const active = Object.values(keys.current).some(Boolean);
      setMovingState(active);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [setMovingState]);

  return (
    <>
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ position: [9, 9, 11], fov: 44 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={['#101820']} />
        <fog attach="fog" args={['#101820', 16, 30]} />
        <ambientLight intensity={1.8} />
        <directionalLight position={[7, 12, 4]} intensity={3.2} castShadow shadow-mapSize={[1024, 1024]} />
        <Environment preset="city" />

        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[24, 24]} />
          <meshStandardMaterial color="#36533d" />
        </mesh>

        <Road x={0} z={0} w={22} d={1.1} />
        <Road x={0} z={0} w={1.1} d={22} />
        <Road x={-4.2} z={3.8} w={1} d={10} />
        <Road x={4.2} z={-3.8} w={1} d={10} />

        <Building x={-5} z={-2} w={2.2} h={2.2} d={1.7} color="#72513d" label="WUSE MARKET" />
        <Building x={-1.8} z={3} color="#5e6d76" label="GARKI BUSINESS" />
        <Building x={3.8} z={-3} w={2.3} h={2.5} color="#746447" label="MAITAMA VILLAS" />
        <Building x={4.7} z={2} w={2.2} h={1.7} color="#315a72" label="JABI LAKE" />
        <Building x={-5} z={4.8} w={2.3} h={1.8} color="#536044" label="GWARINPA" />
        <Building x={1.8} z={5} w={2} h={2.2} color="#5b4c58" label="ASOKORO" />
        <Building x={-2.4} z={-3.2} w={1.5} h={1.3} d={1.3} color="#294d43" label="GYM" />
        <Building x={2.3} z={1.7} w={1.5} h={1.5} d={1.4} color="#70433d" label="CAFE" />
        <Building x={0} z={-5} w={1.7} h={1.5} d={1.5} color="#3f5368" label="HOSPITAL" />

        <Car x={-1.5} z={-0.75} rot={Math.PI / 2} />
        <Car x={2.2} z={0.75} rot={-Math.PI / 2} />
        <Car x={5.5} z={-1.2} />

        <Npc x={-3} z={-1} name="Ada" skin="#7d4b2d" shirt="#e0a21b" />
        <Npc x={2.8} z={3.2} name="Ibrahim" skin="#6d432c" shirt="#3c7b68" />
        <Npc x={-4} z={2.2} name="Chioma" skin="#8a5837" shirt="#9c4c5b" />

        <PlayerController
          position={pos}
          setPosition={setPos}
          keys={keys}
          joystick={joystick}
          moving={moving}
          onMoving={setMovingState}
        />
        <group position={pos}>
          <Avatar look={look} moving={moving} />
        </group>

        <OrbitControls
          enablePan={false}
          minDistance={5}
          maxDistance={16}
          maxPolarAngle={Math.PI / 2.12}
          touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
        />
      </Canvas>
    </>
  );
}

function MobileControls({
  joystick,
  onAction,
}: {
  joystick: React.MutableRefObject<{ x: number; y: number }>;
  onAction: (action: string) => void;
}) {
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const activePointer = useRef<number | null>(null);
  const baseRef = useRef<HTMLDivElement>(null);

  const updateStick = (clientX: number, clientY: number) => {
    const el = baseRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let x = (clientX - cx) / (rect.width / 2);
    let y = (clientY - cy) / (rect.height / 2);
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    const next = { x, y };
    joystick.current = next;
    setStick(next);
  };

  return (
    <div className="mobileControls">
      <div
        ref={baseRef}
        className="joystickBase"
        onPointerDown={(e) => {
          activePointer.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          updateStick(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (activePointer.current === e.pointerId) updateStick(e.clientX, e.clientY);
        }}
        onPointerUp={() => {
          activePointer.current = null;
          joystick.current = { x: 0, y: 0 };
          setStick({ x: 0, y: 0 });
        }}
        onPointerCancel={() => {
          activePointer.current = null;
          joystick.current = { x: 0, y: 0 };
          setStick({ x: 0, y: 0 });
        }}
      >
        <div
          className="joystickKnob"
          style={{
            transform: `translate(calc(-50% + ${stick.x * 35}px), calc(-50% + ${stick.y * 35}px))`,
          }}
        />
      </div>

      <div className="actionCluster">
        <button onPointerDown={() => onAction('interact')}>A</button>
        <button onPointerDown={() => onAction('phone')}>☰</button>
        <button onPointerDown={() => onAction('jump')}>↟</button>
        <button onPointerDown={() => onAction('run')}>RUN</button>
      </div>
    </div>
  );
}

export default function World({
  look,
  district,
  setDistrict,
  onMove,
}: {
  look: PlayerLook;
  district: District;
  setDistrict: (d: District) => void;
  onMove: (moving: boolean) => void;
}) {
  const joystick = useRef({ x: 0, y: 0 });
  const [toast, setToast] = useState('');

  const action = (name: string) => {
    const messages: Record<string, string> = {
      interact: 'Interaction ready',
      phone: 'Phone opened',
      jump: 'Jump',
      run: 'Run mode',
    };
    setToast(messages[name] || name);
    window.setTimeout(() => setToast(''), 900);
  };

  return (
    <div className="canvasWrap">
      <Scene look={look} district={district} onMove={onMove} joystick={joystick} />

      <div className="districtButtons">
        {(Object.keys(districtPositions) as District[]).map((d) => (
          <button key={d} onClick={() => setDistrict(d)} className={district === d ? 'active' : ''}>
            {d}
          </button>
        ))}
      </div>

      <div className="mobileHud">
        <div className="hudTitle">ABUJA REAL LIFE</div>
        <div className="hudDistrict">{district}</div>
      </div>

      {toast && <div className="actionToast">{toast}</div>}

      <MobileControls joystick={joystick} onAction={action} />
    </div>
  );
}
