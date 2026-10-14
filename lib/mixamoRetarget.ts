import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Rig } from './humanRig';
import type { HumanState } from './humanRig';

/* Plays the Mixamo motion files on the PROCEDURAL character (the one built from the creator: hair, outfit, shoes, accessories).
   public/models/characters/animations.glb holds the Mixamo skeleton + clips (and walking.fbx the Walking clip). They run on a hidden copy of that skeleton;
   every frame each bone's world rotation change (animated vs rest) is copied onto the matching joint of the procedural rig.
   Actions with no Mixamo clip (eat, cook, shoot, phone, sit, sleep ...) keep the rig's own procedural animation, blended in and out. */

export const ANIM_URL = '/models/characters/animations.glb';
export const WALK_URL = '/models/characters/walking.fbx';

type JK = 'hips' | 'spine' | 'head' | 'la' | 'le' | 'ra' | 're' | 'll' | 'lk' | 'lf' | 'rl' | 'rk' | 'rf';
// aim: for arm joints, the bone pair whose animated direction the segment must follow (fixes the rest-pose difference between the Mixamo skeleton and the rig)
const JOINTS: { j: JK; b: string; p: JK | null; aim?: [string, string] }[] = [
  { j: 'hips', b: 'mixamorigHips', p: null }, { j: 'spine', b: 'mixamorigSpine2', p: 'hips' }, { j: 'head', b: 'mixamorigHead', p: 'spine' },
  { j: 'la', b: 'mixamorigLeftArm', p: 'spine', aim: ['mixamorigLeftArm', 'mixamorigLeftForeArm'] }, { j: 'le', b: 'mixamorigLeftForeArm', p: 'la', aim: ['mixamorigLeftForeArm', 'mixamorigLeftHand'] },
  { j: 'ra', b: 'mixamorigRightArm', p: 'spine', aim: ['mixamorigRightArm', 'mixamorigRightForeArm'] }, { j: 're', b: 'mixamorigRightForeArm', p: 'ra', aim: ['mixamorigRightForeArm', 'mixamorigRightHand'] },
  { j: 'll', b: 'mixamorigLeftUpLeg', p: 'hips' }, { j: 'lk', b: 'mixamorigLeftLeg', p: 'll' }, { j: 'lf', b: 'mixamorigLeftFoot', p: 'lk' },
  { j: 'rl', b: 'mixamorigRightUpLeg', p: 'hips' }, { j: 'rk', b: 'mixamorigRightLeg', p: 'rl' }, { j: 'rf', b: 'mixamorigRightFoot', p: 'rk' },
];
const RIG_HIPS_Y = .88, RIG_FOOT_Y = .02;   // the rig's standing hip height, and its foot joint height above the floor

export type MixamoSource = { scene: THREE.Object3D; clips: Map<string, THREE.AnimationClip> };

/** The GLB clips plus the Walking FBX (Mixamo bone names 'mixamorig:Hips' -> 'mixamorigHips', centimetres -> metres, walks in place: the game moves the character). */
export function buildClipMap(animations: THREE.AnimationClip[], walk?: THREE.AnimationClip): Map<string, THREE.AnimationClip> {
  const map = new Map<string, THREE.AnimationClip>();
  for (const a of animations) map.set(a.name, a.clone());
  if (walk) {
    const f = walk.clone(); f.name = 'Walking';
    f.tracks = f.tracks.map(t => {
      const nt = t.clone(); nt.name = nt.name.replace(/mixamorig:?/g, 'mixamorig');
      if (nt.name.endsWith('.position')) for (let i = 0; i < nt.values.length; i++) nt.values[i] *= 0.01;
      if (nt.name === 'mixamorigHips.position') for (let i = 0; i < nt.values.length; i += 3) { nt.values[i] = 0; nt.values[i + 2] = 0; }
      return nt;
    });
    map.set('Walking', f);
  }
  return map;
}

let SRC: Promise<MixamoSource | null> | null = null;
/** Loads the Mixamo skeleton + clips once for the whole game. A missing animations.glb gives null (the characters then use their procedural animation); a missing walking.fbx only drops the Walking clip. */
export function loadMixamo(): Promise<MixamoSource | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  return SRC ??= (async () => {
    try {
      const [g, walk] = await Promise.all([
        new GLTFLoader().loadAsync(ANIM_URL),
        new FBXLoader().loadAsync(WALK_URL).then(x => x.animations[0] as THREE.AnimationClip | undefined).catch(() => undefined),
      ]);
      return { scene: g.scene, clips: buildClipMap(g.animations, walk) };
    } catch { return null; }
  })();
}

/** game action name -> Mixamo clip. A clip name passed directly as `anim` (e.g. 'Punching') also works. */
export const ACTION: Record<string, string> = {
  dance: 'Hip_Hop_Dancing', cheer: 'Rumba_Dancing', wave: 'Salute', salute: 'Salute',
  door: 'Opening_Door_Inwards', work: 'Pilot_Flips_Switches', game: 'Pilot_Flips_Switches',
  pray: 'Praying', dismiss: 'Dismissing_Gesture', punch: 'Punching', fight: 'Punching',
  elbow: 'Illegal_Elbow_Punch', block: 'Body_Block', die: 'Dying', dead: 'Dying', crouch: 'Crouch_Running',
  getup: 'Situp_To_Idle', wake: 'Waking', drive: 'Driving', honk: 'Honking_Horn', entercar: 'Entering_Car', exitcar: 'Exiting_Car',
  stop: 'Running_To_Stop', turn: 'Running_Right_Turn',
};
export const ONCE = new Set(['Dying', 'Salute', 'Opening_Door_Inwards', 'Punching', 'Illegal_Elbow_Punch', 'Body_Block', 'Dismissing_Gesture', 'Situp_To_Idle', 'Running_To_Stop', 'Running_Right_Turn', 'Entering_Car', 'Exiting_Car', 'Honking_Horn', 'Waking']);
export const CLAMP = new Set(['Dying']);   // stays on the last frame

/** Which Mixamo clip to play, or null when the rig should use its own procedural pose: standing, walking, sitting, sleeping, and actions that have no Mixamo clip (eating, cooking, shooting, phone ...).
 *  Mixamo is used for running and for the actions (dances, doors, cars, punches, ...). */
export function chooseClip(state: HumanState, anim: string | undefined, speed: number, names: Set<string>): { clip: string; ts: number } | null {
  if (state === 'sit' || state === 'sleep') return null;
  if (anim) {
    const direct = [...names].find(n => n.toLowerCase() === anim.toLowerCase());
    const c = direct || ACTION[anim];
    return c && names.has(c) ? { clip: c, ts: 1 } : null;
  }
  if (state === 'walk' && speed >= 1.8 && names.has('Running')) return { clip: 'Running', ts: Math.min(1.3, Math.max(.8, speed / 2.4)) };
  return null;   // standing and normal walking: the original procedural animation
}

const DOWN = new THREE.Vector3(0, -1, 0), v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), qc = new THREE.Quaternion();
const qa = new THREE.Quaternion(), qd = new THREE.Quaternion(), ql = new THREE.Quaternion(), QI = new THREE.Quaternion(), vp = new THREE.Vector3();

export class MixamoDriver {
  readonly skel: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  readonly clips: Map<string, THREE.AnimationClip>;
  readonly names: Set<string>;
  private bones: { j: JK; p: JK | null; bone: THREE.Object3D; restInv: THREE.Quaternion; rigRest: THREE.Quaternion; aim?: [THREE.Object3D, THREE.Object3D] }[] = [];
  private hipsBone: THREE.Object3D;
  private restHipsY: number;
  private lift = 0;
  private cur: { name: string; action: THREE.AnimationAction } | null = null;
  private world = new Map<JK, THREE.Quaternion>();

  constructor(src: MixamoSource, rig: Rig) {
    this.skel = cloneSkinned(src.scene) as THREE.Object3D;
    this.clips = src.clips; this.names = new Set(src.clips.keys());
    this.skel.updateMatrixWorld(true); rig.root.updateMatrixWorld(true);
    const rootInv = rig.root.getWorldQuaternion(new THREE.Quaternion()).invert();
    for (const d of JOINTS) {
      const bone = this.skel.getObjectByName(d.b); if (!bone) continue;
      const restInv = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
      const rigRest = rootInv.clone().multiply(rig[d.j].getWorldQuaternion(new THREE.Quaternion()));
      const a0 = d.aim && this.skel.getObjectByName(d.aim[0]), a1 = d.aim && this.skel.getObjectByName(d.aim[1]);
      this.bones.push({ j: d.j, p: d.p, bone, restInv, rigRest, aim: a0 && a1 ? [a0, a1] : undefined });
    }
    this.hipsBone = this.skel.getObjectByName('mixamorigHips') || this.skel;
    this.restHipsY = this.hipsBone.getWorldPosition(new THREE.Vector3()).y || .894;
    this.mixer = new THREE.AnimationMixer(this.skel);
    this.calibrate(rig);
  }

  /** Measures once how far the rig's feet float or sink in the Idle pose and corrects every clip by that, so the characters stand on the floor. */
  private calibrate(rig: Rig) {
    const idle = this.clips.get('Idle'); if (!idle || this.bones.length < JOINTS.length) return;
    const a = this.mixer.clipAction(idle); a.play(); this.mixer.update(0); this.skel.updateMatrixWorld(true);
    this.lift = 0; this.apply(rig, 1);
    rig.root.updateMatrixWorld(true);
    const inv = rig.root.matrixWorld.clone().invert(), y = (o: THREE.Object3D) => vp.setFromMatrixPosition(o.matrixWorld).applyMatrix4(inv).y;
    this.lift = RIG_FOOT_Y - Math.min(y(rig.lf), y(rig.rf));
    a.stop(); this.mixer.stopAllAction(); this.mixer.uncacheAction(idle); this.cur = null;
  }

  /** Switch to a clip (cross-fades) and set its speed. */
  set(pick: { clip: string; ts: number }) {
    if (!this.cur || this.cur.name !== pick.clip) {
      const clip = this.clips.get(pick.clip); if (!clip) return;
      const a = this.mixer.clipAction(clip);
      a.reset().setLoop(ONCE.has(pick.clip) ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = CLAMP.has(pick.clip);
      a.fadeIn(.2).play();
      if (this.cur) this.cur.action.fadeOut(.2);
      this.cur = { name: pick.clip, action: a };
    }
    this.cur.action.timeScale = pick.ts;
  }

  /** Advance the hidden skeleton. A one-shot that has finished lets the next frame pick again (it replays while the action lasts). */
  update(dt: number) {
    this.mixer.update(dt); this.skel.updateMatrixWorld(true);
    const a = this.cur?.action; if (a && !a.isRunning() && ONCE.has(this.cur!.name) && !CLAMP.has(this.cur!.name)) this.cur = null;
  }

  /** Copy the skeleton's current pose onto the rig. w = 1 fully Mixamo, 0 leaves the rig's own procedural pose, in between blends. Call after animateHuman. */
  apply(rig: Rig, w: number) {
    this.world.clear();
    for (const b of this.bones) {
      b.bone.getWorldQuaternion(qa);
      qd.copy(qa).multiply(b.restInv).multiply(b.rigRest);                 // world rotation wanted on this joint
      if (b.aim) {                                                          // arms: keep the twist from above but point the segment exactly where the animated arm points
        b.aim[1].getWorldPosition(v1).sub(b.aim[0].getWorldPosition(v2)).normalize();
        qd.premultiply(qc.setFromUnitVectors(v2.copy(DOWN).applyQuaternion(qd), v1));
      }
      const pw = b.p ? this.world.get(b.p)! : QI;
      ql.copy(pw).invert().multiply(qd);                                    // ... as a rotation relative to its (already placed) parent
      const o = rig[b.j]; o.quaternion.slerp(ql, w);
      this.world.set(b.j, new THREE.Quaternion().copy(pw).multiply(o.quaternion));
    }
    this.hipsBone.getWorldPosition(vp);
    const k = RIG_HIPS_Y / this.restHipsY, h = rig.hips.position;
    h.set(vp.x * k * w, h.y + (vp.y * k + this.lift - h.y) * w, vp.z * k * w);   // the rig's own pose keeps hips at x = z = 0
  }

  /** Mixamo is fully faded out: put the hips back on the rig's own axis. */
  release(rig: Rig) { rig.hips.position.x = 0; rig.hips.position.z = 0; }

  dispose() { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.skel); }
}