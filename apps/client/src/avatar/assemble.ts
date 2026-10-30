import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { type AvatarCatalog } from '@alexioncity/shared';
import type { AssetStore } from '../game/assets';
import { frameOf, HAIR_COLORS, SKIN_TONES, SLOTS, swatch, type AvatarSpec } from './catalog';

export type Motion = 'idle' | 'walk' | 'run';

export interface Avatar {
  root: THREE.Group;
  /** Crossfade to a motion; does nothing if it is already playing. */
  play(motion: Motion): void;
  /** Advance the animation by `dt` seconds. */
  update(dt: number): void;
  dispose(): void;
}

const PACK = 'avatars';

/** Every avatar is scaled to this height in metres, so mixed parts always match. */
export const AVATAR_HEIGHT = 1.75;

/** A material's colour, changed by its name in the source model: Skin, Skin_Darker, Hair, Eyebrows. */
function tintColor(material: THREE.Material, spec: AvatarSpec): THREE.Color {
  const color = (
    (material as THREE.MeshStandardMaterial).color ?? new THREE.Color(0xffffff)
  ).clone();
  const name = material.name.toLowerCase();
  if (name === 'skin') color.set(swatch(SKIN_TONES, spec.skin).hex);
  else if (name === 'skin_darker') color.set(swatch(SKIN_TONES, spec.skin).hex).multiplyScalar(0.8);
  else if (name.startsWith('hair')) color.set(swatch(HAIR_COLORS, spec.hair).hex);
  else if (name.startsWith('eyebrow'))
    color.set(swatch(HAIR_COLORS, spec.hair).hex).multiplyScalar(0.6);
  return color;
}

interface ColouredPart {
  mesh: THREE.SkinnedMesh;
  color: THREE.Color;
}

/**
 * Join every part into ONE geometry with the colours baked in as vertex colours, so a whole
 * avatar is a single draw call. Bone indices are remapped onto one shared bone list, so parts whose
 * skeletons list the same bones in a different order still line up.
 *
 * Each part was quantized on its own, and that scale and offset are baked into its inverse bind
 * matrices, so the same bone has a different matrix in every part. One correction matrix per part
 * (worked out from a bone they share) brings every part into the first part's space.
 */
function mergeSkinned(parts: readonly ColouredPart[]): {
  geometry: THREE.BufferGeometry;
  bones: THREE.Bone[];
  inverses: THREE.Matrix4[];
} {
  const bones: THREE.Bone[] = [];
  const inverses: THREE.Matrix4[] = [];
  const indexOfBone = new Map<string, number>();

  let vertexTotal = 0;
  let indexTotal = 0;
  for (const { mesh } of parts) {
    const count = mesh.geometry.getAttribute('position').count;
    vertexTotal += count;
    indexTotal += mesh.geometry.index?.count ?? count;
  }
  const position = new Float32Array(vertexTotal * 3);
  const normal = new Float32Array(vertexTotal * 3);
  const color = new Float32Array(vertexTotal * 3);
  const skinIndex = new Uint16Array(vertexTotal * 4);
  const skinWeight = new Float32Array(vertexTotal * 4);
  const index = new Uint32Array(indexTotal);

  let vertexAt = 0;
  let indexAt = 0;
  for (const { mesh, color: tint } of parts) {
    const g = mesh.geometry;
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const si = g.getAttribute('skinIndex');
    const sw = g.getAttribute('skinWeight');
    // correction into the first part's space: reference inverse * this part's inverse, for a shared bone
    let correction = new THREE.Matrix4();
    if (bones.length > 0) {
      const shared = mesh.skeleton.bones.findIndex((b) => indexOfBone.has(b.name));
      if (shared >= 0) {
        const reference = inverses[indexOfBone.get(mesh.skeleton.bones[shared]!.name)!]!;
        correction = reference.clone().invert().multiply(mesh.skeleton.boneInverses[shared]!);
      }
    }
    const remap = mesh.skeleton.bones.map((bone, i) => {
      let at = indexOfBone.get(bone.name);
      if (at === undefined) {
        at = bones.length;
        indexOfBone.set(bone.name, at);
        bones.push(bone);
        // a bone only this part has: express its inverse in the shared space
        inverses.push(mesh.skeleton.boneInverses[i]!.clone().multiply(correction.clone().invert()));
      }
      return at;
    });

    // the part's own bind matrix holds its quantization scale; fold both into the vertices
    const bind = correction.clone().multiply(mesh.bindMatrix);
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(bind);
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const v = vertexAt + i;
      p.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(bind);
      position.set([p.x, p.y, p.z], v * 3);
      if (nor) n.set(nor.getX(i), nor.getY(i), nor.getZ(i)).applyMatrix3(normalMatrix).normalize();
      else n.set(0, 1, 0);
      normal.set([n.x, n.y, n.z], v * 3);
      color.set([tint.r, tint.g, tint.b], v * 3);
      skinIndex.set(
        [remap[si!.getX(i)]!, remap[si!.getY(i)]!, remap[si!.getZ(i)]!, remap[si!.getW(i)]!],
        v * 4,
      );
      skinWeight.set([sw!.getX(i), sw!.getY(i), sw!.getZ(i), sw!.getW(i)], v * 4);
    }
    const count = g.index?.count ?? pos.count;
    for (let i = 0; i < count; i++) index[indexAt + i] = vertexAt + (g.index ? g.index.getX(i) : i);
    vertexAt += pos.count;
    indexAt += count;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  return { geometry, bones, inverses };
}

/**
 * The rig file has no skin, so its joints load as plain nodes. A skinned mesh needs real Bones, so
 * swap the named joints for Bones in place, keeping their transforms, children and order.
 */
function convertToBones(node: THREE.Object3D, names: ReadonlySet<string>): void {
  for (const child of [...node.children]) {
    let next = child;
    if (names.has(child.name) && !(child as THREE.Bone).isBone) {
      const bone = new THREE.Bone();
      bone.name = child.name;
      bone.position.copy(child.position);
      bone.quaternion.copy(child.quaternion);
      bone.scale.copy(child.scale);
      for (const grandchild of [...child.children]) bone.add(grandchild);
      node.add(bone);
      node.remove(child);
      next = bone;
    }
    convertToBones(next, names);
  }
}

function skinnedMeshes(scene: THREE.Object3D): THREE.SkinnedMesh[] {
  const found: THREE.SkinnedMesh[] = [];
  scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) found.push(o as THREE.SkinnedMesh);
  });
  return found;
}

/**
 * Build one avatar from parts. The rig holds the skeleton and every animation. Each part (head,
 * body, legs, feet) is a skinned mesh from some outfit; it is re-bound to the rig's bones by name,
 * which works because every character in a frame has the same 62 joints and bind pose.
 */
export async function assembleAvatar(
  store: AssetStore,
  catalog: AvatarCatalog,
  spec: AvatarSpec,
): Promise<Avatar> {
  const frame = frameOf(catalog, spec.frame);
  if (!frame) throw new Error(`unknown avatar frame "${spec.frame}"`);

  const rig = await store.gltf(PACK, frame.rig);
  const root = SkeletonUtils.clone(rig.scene) as THREE.Group;

  // load every part first, so we know which joints the meshes use
  const loaded: { slot: (typeof SLOTS)[number]; sources: THREE.SkinnedMesh[] }[] = [];
  const jointNames = new Set<string>();
  for (const slot of SLOTS) {
    const outfit = frame.outfits.find((o) => o.id === spec[slot]);
    const file = outfit?.parts[slot];
    if (!file) throw new Error(`outfit "${spec[slot]}" has no ${slot}`);
    const sources = skinnedMeshes((await store.gltf(PACK, file)).scene);
    for (const source of sources)
      for (const bone of source.skeleton.bones) jointNames.add(bone.name);
    loaded.push({ slot, sources });
  }

  convertToBones(root, jointNames);
  const bones = new Map<string, THREE.Bone>();
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.set(o.name, o as THREE.Bone);
  });

  const parts: ColouredPart[] = [];
  for (const { sources } of loaded) {
    for (const source of sources) {
      const material = Array.isArray(source.material) ? source.material[0]! : source.material;
      parts.push({ mesh: source, color: tintColor(material, spec) });
    }
  }
  const merged = mergeSkinned(parts);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.SkinnedMesh(merged.geometry, material);
  mesh.name = 'avatar';
  mesh.frustumCulled = false; // bounds follow the bind pose, not the animated pose
  mesh.castShadow = true;
  const riggedBones = merged.bones.map((b) => {
    const bone = bones.get(b.name);
    if (!bone) throw new Error(`rig has no bone "${b.name}"`);
    return bone;
  });
  mesh.bind(new THREE.Skeleton(riggedBones, merged.inverses), new THREE.Matrix4());
  root.add(mesh);

  // the models' own units are arbitrary, so scale to a real height and stand the feet on y = 0
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root, true);
  const fit = AVATAR_HEIGHT / Math.max(bounds.max.y - bounds.min.y, 0.001);
  root.scale.setScalar(fit);
  root.position.y = -bounds.min.y * fit;
  const stand = new THREE.Group();
  stand.add(root);

  const mixer = new THREE.AnimationMixer(root);
  const action = (name: string): THREE.AnimationAction => {
    const clip = rig.animations.find((c) => c.name === name);
    if (!clip) throw new Error(`rig has no clip "${name}"`);
    return mixer.clipAction(clip);
  };
  const actions: Record<Motion, THREE.AnimationAction> = {
    idle: action(frame.clips.idle),
    walk: action(frame.clips.walk),
    run: action(frame.clips.run),
  };
  let current: Motion | undefined;
  const play = (motion: Motion) => {
    if (current === motion) return;
    const next = actions[motion].reset().fadeIn(0.18).play();
    if (current) actions[current].fadeOut(0.18);
    next.enabled = true;
    current = motion;
  };
  play('idle');

  return {
    root: stand,
    play,
    update: (dt) => mixer.update(dt),
    dispose() {
      mixer.stopAllAction();
      merged.geometry.dispose();
      material.dispose();
      stand.removeFromParent();
    },
  };
}
