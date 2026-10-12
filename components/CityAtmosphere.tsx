'use client';
/* Sky + light upgrade for the city scene. Self-contained, no extra packages.
   - SkyDome: gradient sky (horizon = fog colour so the ground melts into it), drifting clouds, sun glow.
   - Reflections: a small generated sky is baked once into an environment map, so car paint, glass and
     metal pick up sky reflections. Strength follows the time of day (almost off at night).
   - Neutral tone mapping: keeps colours rich instead of the washed-out default.
   All colours follow what CityWorld already computes each frame (time of day, weather, fog),
   so day / dusk / night / storms keep working. */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { weatherAt } from '../lib/worldClock';
import { NIGHT } from './cityShared';

const NOISE = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p*=2.03;a*=.5;}return v;}
`;

const SKY_VERT = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`;
const SKY_FRAG = `
uniform vec3 uHorizon; uniform vec3 uZenith; uniform vec3 uSunDir; uniform vec3 uSunCol;
uniform float uDay; uniform float uTime; uniform float uCloud;
varying vec3 vDir;
${NOISE}
void main(){
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0., 1.);
  vec3 col = mix(uHorizon, uZenith, pow(h, .5));
  float sd = max(dot(d, uSunDir), 0.);
  col += uSunCol * (pow(sd, 6.) * .14 + pow(sd, 90.) * .55 + smoothstep(.9996, .99985, sd) * 2.5) * uDay;
  if (d.y > .015) {
    vec2 uv = d.xz / (d.y + .28) * 1.5 + vec2(uTime * .006, uTime * .002);
    float n = fbm(uv);
    float c = smoothstep(1.02 - uCloud, 1.02 - uCloud + .30, n);
    float fade = smoothstep(.015, .20, d.y);
    vec3 lit = mix(vec3(.55,.60,.68), vec3(1.0,.97,.93), uDay);
    lit += uSunCol * pow(sd, 5.) * .22 * uDay;
    vec3 cc = lit * (.02 + .98 * uDay);
    col = mix(col, cc, c * fade * .92);
  }
  gl_FragColor = vec4(col, 1.);
  #include <colorspace_fragment>
}`;

export function Atmosphere({ sun }: { sun: React.MutableRefObject<THREE.DirectionalLight> }) {
  const { gl, scene, camera } = useThree();
  const mesh = useRef<THREE.Mesh>(null!);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, toneMapped: false,
    uniforms: {
      uHorizon: { value: new THREE.Color('#c9dff0') }, uZenith: { value: new THREE.Color('#4f90d8') },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color('#fff0d6') },
      uDay: { value: 1 }, uTime: { value: 0 }, uCloud: { value: .5 },
    },
  }), []);

  // richer colour: Khronos "neutral" tone mapping instead of the washed-out ACES default
  useEffect(() => { gl.toneMapping = THREE.NeutralToneMapping; gl.toneMappingExposure = 1.06; }, [gl]);

  // one-off environment map from a generated sky, so paint, glass and metal reflect something
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const env = new THREE.Scene();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { top: { value: new THREE.Color('#4d8fe0') }, mid: { value: new THREE.Color('#dbe8f3') }, bot: { value: new THREE.Color('#5f5a4f') } },
      vertexShader: 'varying vec3 v; void main(){ v = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 v; void main(){ float y=v.y; vec3 c = y>0. ? mix(mid, top, pow(y,.6)) : mix(mid, bot, pow(-y,.5)); gl_FragColor = vec4(c,1.); }',
    }));
    env.add(dome);
    const sunBall = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(14, 12, 9) }));
    sunBall.position.set(40, 60, 25).normalize().multiplyScalar(42); env.add(sunBall);
    const rt = pm.fromScene(env, .03);
    scene.environment = rt.texture;
    return () => { scene.environment = null; rt.dispose(); pm.dispose(); dome.geometry.dispose(); (dome.material as THREE.Material).dispose(); sunBall.geometry.dispose(); (sunBall.material as THREE.Material).dispose(); };
  }, [gl, scene]);

  const tmp = useMemo(() => ({ dir: new THREE.Vector3(), z: new THREE.Color(), mult: new THREE.Color(.62, .78, 1), dusk: new THREE.Color('#2f3f73') }), []);
  useFrame((st) => {
    const l = sun.current; if (!l) return;
    const u = mat.uniforms;
    tmp.dir.copy(l.position).sub(l.target.position).normalize();
    const el = tmp.dir.y, day = 1 - NIGHT.n, dusk = Math.min(1, Math.max(0, 1 - Math.abs(el) / .28)) * .75;
    const bg = scene.background as THREE.Color | null, fg = scene.fog as THREE.Fog | null;
    if (fg) u.uHorizon.value.copy(fg.color);
    if (bg) { tmp.z.copy(bg).multiply(tmp.mult).lerp(tmp.dusk, dusk * .65 * (1 - NIGHT.n * .5)); u.uZenith.value.copy(tmp.z); }
    u.uSunDir.value.copy(tmp.dir); u.uSunCol.value.copy(l.color); u.uDay.value = day; u.uTime.value = st.clock.elapsedTime;
    const W = weatherAt(); u.uCloud.value = Math.min(.95, .38 + W.cloud * .5 + W.rain * .3 + W.storm * .4);
    mesh.current.position.copy(camera.position);
    scene.environmentIntensity = .06 + .5 * day * (1 - Math.max(W.cloud * .35, W.rain * .5, W.storm * .6));
  });

  return <mesh ref={mesh} material={mat} renderOrder={-1000} frustumCulled={false}><sphereGeometry args={[480, 32, 16]} /></mesh>;
}
