'use client';
/* Shared graphics layer (desktop-first).
   - <Post />        screen-space ambient occlusion, soft bloom, vignette, SMAA and neutral tone mapping.
                     Off on phones / tablets (coarse pointer) and when localStorage "arl-gfx" is "off".
                     Drops itself to a cheaper level when the frame rate stays low, so slow PCs stay playable.
   - <ProceduralEnv /> a small generated studio environment (no network) so furniture, paint and metal
                     get soft reflections and fill light indoors. */
import { Environment, Lightformer } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useRef, useState } from 'react';

export function gfxEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try { if (window.localStorage.getItem('arl-gfx') === 'off') return false; } catch { /* private mode */ }
  return !window.matchMedia?.('(pointer: coarse)').matches;
}

type Level = 0 | 1 | 2;
const START: Level = 2;

/** Post-processing stack. level 2 = AO + bloom + vignette, 1 = bloom + vignette, 0 = nothing. */
export function Post({ ao = 1 }: { ao?: number }) {
  const [on] = useState(gfxEnabled);
  const [level, setLevel] = useState<Level>(() => {
    try { const v = Number(window.sessionStorage.getItem('arl-gfx-level')); if (v === 0 || v === 1 || v === 2) return v as Level; } catch { /* private mode */ }
    return START;
  });
  const acc = useRef({ t: 0, n: 0, warm: 90 });
  useFrame((_, dt) => {
    if (!on || level === 0) return;
    const a = acc.current;
    if (a.warm > 0) { a.warm--; return; }       // ignore the first frames: shaders compile and models load
    a.t += Math.min(dt, .25); a.n++;
    if (a.n >= 150) {
      const fps = a.n / a.t; a.t = 0; a.n = 0;
      if (fps < 32) setLevel(l => { const nl = Math.max(0, l - 1) as Level; try { window.sessionStorage.setItem('arl-gfx-level', String(nl)); } catch { /* ignore */ } return nl; });
    }
  });
  if (!on || level === 0) return null;
  if (level === 1) return (
    <EffectComposer multisampling={0}>
      <Bloom intensity={.35} luminanceThreshold={.88} luminanceSmoothing={.2} mipmapBlur />
      <Vignette eskil={false} offset={.25} darkness={.5} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
    </EffectComposer>
  );
  return (
    <EffectComposer multisampling={0}>
      <N8AO aoRadius={1.6 * ao} distanceFalloff={1.2} intensity={2.2 * ao} quality="medium" halfRes />
      <Bloom intensity={.4} luminanceThreshold={.88} luminanceSmoothing={.2} mipmapBlur />
      <Vignette eskil={false} offset={.25} darkness={.55} />
      <SMAA />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
    </EffectComposer>
  );
}

/** Generated studio environment: a bright ceiling panel, two window-like side panels and a warm floor bounce. */
export function ProceduralEnv({ intensity = .55 }: { intensity?: number }) {
  return (
    <Environment resolution={128} frames={1} environmentIntensity={intensity}>
      <color attach="background" args={['#9fb4c8']} />
      <Lightformer form="rect" intensity={2.4} color="#fff4e0" position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[14, 14, 1]} />
      <Lightformer form="rect" intensity={1.6} color="#cfe3ff" position={[-8, 3, 0]} rotation-y={Math.PI / 2} scale={[10, 5, 1]} />
      <Lightformer form="rect" intensity={1.2} color="#ffe6c4" position={[8, 3, 2]} rotation-y={-Math.PI / 2} scale={[10, 5, 1]} />
      <Lightformer form="rect" intensity={.6} color="#d9b48a" position={[0, -4, 0]} rotation-x={-Math.PI / 2} scale={[16, 16, 1]} />
    </Environment>
  );
}
