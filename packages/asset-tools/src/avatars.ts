import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import type { AvatarPart } from '@alexioncity/shared';

/**
 * Which slot a mesh fills. The source packs name meshes like `Suit_Head`, `Casual2_Legs` and
 * `Farmer_Pants`; anything else (a sword, a backpack) is an accessory and is left out for now.
 */
export function classifyPart(meshName: string): AvatarPart | undefined {
  const tail = meshName.split('_').pop()?.toLowerCase() ?? '';
  if (tail === 'head') return 'head';
  if (tail === 'body') return 'body';
  if (tail === 'legs' || tail === 'pants') return 'legs';
  if (tail === 'feet') return 'feet';
  return undefined;
}

export interface SplitCharacter {
  /** One GLB per slot: that mesh and the skeleton it is skinned to, with no animations. */
  parts: Partial<Record<AvatarPart, Uint8Array>>;
  /** Mesh names that were not a head, body, legs or feet, so were dropped. */
  skipped: string[];
}

const io = () => new NodeIO().registerExtensions(ALL_EXTENSIONS);

/**
 * Cut one character into its parts. All 21 modular characters share a 62-joint skeleton (the men's
 * and women's packs each have their own bind pose), so a head from one outfit can be worn with the
 * body from another, as long as they come from the same frame.
 */
export async function splitCharacter(glb: Uint8Array): Promise<SplitCharacter> {
  const probe = await io().readBinary(glb);
  const meshNames = probe
    .getRoot()
    .listMeshes()
    .map((m) => m.getName());
  const parts: SplitCharacter['parts'] = {};
  const skipped: string[] = [];

  for (const name of meshNames) {
    const slot = classifyPart(name);
    if (!slot) {
      skipped.push(name);
      continue;
    }
    const doc = await io().readBinary(glb);
    for (const node of doc.getRoot().listNodes()) {
      const mesh = node.getMesh();
      if (mesh && mesh.getName() !== name) {
        node.setMesh(null);
        node.setSkin(null);
      }
    }
    for (const anim of doc.getRoot().listAnimations()) anim.dispose();
    await doc.transform(prune());
    parts[slot] = await io().writeBinary(doc);
  }
  return { parts, skipped };
}

/**
 * The skeleton and every animation clip, with no meshes. Shipped once per frame instead of inside
 * every character, which is about a quarter of each source file.
 */
export async function extractRig(glb: Uint8Array): Promise<Uint8Array> {
  const doc = await io().readBinary(glb);
  for (const node of doc.getRoot().listNodes()) {
    node.setMesh(null);
    node.setSkin(null);
  }
  // keepLeaves: fingertip and toe joints have no children but are still bones the meshes use
  await doc.transform(prune({ keepLeaves: true }));
  return io().writeBinary(doc);
}
