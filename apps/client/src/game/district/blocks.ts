import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { QualityTier } from '@alexioncity/shared';
import type { AssetStore } from '../assets';
import { PITCH, type Layout, type Placement } from './layout';
import { dims, DISTRICT_PACKS, MODELS, type ModelId } from './models';
import {
  bakeUntextured,
  hasTexture,
  lite,
  standInGeometry,
  windowTextures,
  withFlippedWinding,
  type Piece,
} from './scene';

/**
 * Detail by distance, one city block at a time. A block close to the player is drawn from the real
 * models; every other block is one merged, low-detail mesh (a handful of triangles per building).
 * Before any model pack is downloaded, every block uses the low-detail mesh, which is the default look.
 */
export interface DistrictView {
  group: THREE.Group;
  /** Whether the real models have been built. */
  detailed: boolean;
  /** Call every frame with the player's position. */
  update(px: number, pz: number): void;
  setGlow(glow: number): void;
  /** Build the real models for every block from the downloaded packs. */
  upgrade(store: AssetStore): Promise<void>;
  dispose(): void;
}

/** Blocks closer than this (metres from the block centre to the player) use the real models. */
const NEAR: Record<QualityTier, number> = { low: 62, high: 100 };
/** A block must move this far past the limit before it switches back, so it does not flicker. */
const HYSTERESIS = 8;

const blockKey = (x: number, z: number) => `${Math.round(x / PITCH)},${Math.round(z / PITCH)}`;

function groupByBlock(placements: readonly Placement[]): Map<string, Placement[]> {
  const map = new Map<string, Placement[]>();
  for (const p of placements) {
    const key = blockKey(p.x, p.z);
    map.set(key, [...(map.get(key) ?? []), p]);
  }
  return map;
}

function parseKey(key: string): { cx: number; cz: number } {
  const [i, j] = key.split(',').map(Number) as [number, number];
  return { cx: i * PITCH, cz: j * PITCH };
}

export function createDistrictView(layout: Layout, tier: QualityTier): DistrictView {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const { facade, glow } = windowTextures();
  disposables.push(facade, glow);
  const windows = new THREE.MeshLambertMaterial({
    vertexColors: true,
    map: facade,
    emissive: 0xffffff,
    emissiveMap: glow,
    emissiveIntensity: 0,
  });
  const plain = new THREE.MeshLambertMaterial({ vertexColors: true });
  const baked = new THREE.MeshLambertMaterial({ vertexColors: true });
  disposables.push(windows, plain, baked);

  const blocks = groupByBlock(layout.placements);
  const far = new Map<string, THREE.Group>();
  const near = new Map<string, THREE.Group>();
  const isNear = new Map<string, boolean>();

  // ---- far look: every block's buildings in one mesh, everything else in a second
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const standIns = new Map<ModelId, THREE.BufferGeometry>();
  const standIn = (id: ModelId) => {
    let g = standIns.get(id);
    if (!g) {
      g = standInGeometry(id).toNonIndexed();
      standIns.set(id, g);
      disposables.push(g);
    }
    return g;
  };

  for (const [key, list] of blocks) {
    const holder = new THREE.Group();
    for (const [material, kind] of [
      [windows, 'building'],
      [plain, 'other'],
    ] as const) {
      const parts = list
        .filter((p) => (MODELS[p.model].kind === 'building') === (kind === 'building'))
        .map((p) => {
          quaternion.setFromAxisAngle(up, p.yaw);
          matrix.compose(new THREE.Vector3(p.x, 0, p.z), quaternion, new THREE.Vector3(1, 1, 1));
          return standIn(p.model).clone().applyMatrix4(matrix);
        });
      if (parts.length === 0) continue;
      const geometry = mergeGeometries(parts)!;
      parts.forEach((g) => g.dispose());
      disposables.push(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = tier === 'high' && kind === 'building';
      mesh.receiveShadow = tier === 'high';
      holder.add(mesh);
    }
    far.set(key, holder);
    group.add(holder);
  }

  let builtFrom = '';
  const view: DistrictView = {
    group,
    detailed: false,
    update(px, pz) {
      for (const key of blocks.keys()) {
        const n = near.get(key);
        const f = far.get(key)!;
        if (!n) {
          f.visible = true;
          continue;
        }
        const { cx, cz } = parseKey(key);
        const distance = Math.hypot(cx - px, cz - pz);
        const wasNear = isNear.get(key) ?? false;
        const nowNear = wasNear ? distance < NEAR[tier] + HYSTERESIS : distance < NEAR[tier];
        isNear.set(key, nowNear);
        n.visible = nowNear;
        f.visible = !nowNear;
      }
    },
    setGlow(g) {
      windows.emissiveIntensity = g * 0.9;
      // detailed buildings have no window texture; a faint cool glow keeps them from going black at night
      baked.emissive.setHex(0x2c3558);
      baked.emissiveIntensity = g * 0.55;
    },
    async upgrade(store) {
      // rebuild only when a pack the district uses has become available since the last time
      const available = DISTRICT_PACKS.filter((pack) => store.has(pack)).join(',');
      if (available === builtFrom) return;
      for (const holder of near.values()) holder.removeFromParent();
      near.clear();
      isNear.clear();
      for (const [key, list] of blocks) {
        const holder = new THREE.Group();
        holder.visible = false;
        for (const [id, placements] of groupBlockByModel(list)) {
          // a model whose pack is not downloaded keeps its simple stand-in, so nothing goes missing
          if (!store.has(MODELS[id].pack)) {
            const fallback = new THREE.InstancedMesh(
              standIn(id),
              MODELS[id].kind === 'building' ? windows : plain,
              placements.length,
            );
            placements.forEach((p, i) => {
              quaternion.setFromAxisAngle(up, p.yaw);
              fallback.setMatrixAt(
                i,
                matrix.compose(
                  new THREE.Vector3(p.x, 0, p.z),
                  quaternion,
                  new THREE.Vector3(1, 1, 1),
                ),
              );
            });
            fallback.instanceMatrix.needsUpdate = true;
            fallback.computeBoundingSphere();
            fallback.receiveShadow = tier === 'high';
            holder.add(fallback);
            continue;
          }
          for (const piece of await piecesFor(id, store, tier, disposables, baked)) {
            const def = MODELS[id];
            const instanced = new THREE.InstancedMesh(
              piece.geometry,
              piece.material,
              placements.length,
            );
            instanced.name = id;
            const recentre = piece.recentre;
            placements.forEach((p, i) => {
              quaternion.setFromAxisAngle(up, p.yaw);
              matrix.compose(
                new THREE.Vector3(p.x, 0, p.z),
                quaternion,
                new THREE.Vector3(1, 1, 1),
              );
              instanced.setMatrixAt(i, matrix.multiply(recentre).multiply(piece.local));
            });
            instanced.instanceMatrix.needsUpdate = true;
            instanced.computeBoundingSphere();
            instanced.castShadow = tier === 'high' && def.kind !== 'prop';
            instanced.receiveShadow = tier === 'high';
            holder.add(instanced);
          }
        }
        near.set(key, holder);
        group.add(holder);
      }
      builtFrom = available;
      view.detailed = true;
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
      group.removeFromParent();
    },
  };
  return view;
}

function groupBlockByModel(list: readonly Placement[]): Map<ModelId, Placement[]> {
  const map = new Map<ModelId, Placement[]>();
  for (const p of list) map.set(p.model, [...(map.get(p.model) ?? []), p]);
  return map;
}

interface ModelPiece extends Piece {
  /** Scale and centring that bring the model to its size in metres, standing on y = 0. */
  recentre: THREE.Matrix4;
}

const pieceCache = new WeakMap<AssetStore, Map<ModelId, Promise<ModelPiece[]>>>();

/** The drawable pieces of a model, shared by every block that uses it. */
function piecesFor(
  id: ModelId,
  store: AssetStore,
  tier: QualityTier,
  owned: { dispose(): void }[],
  bakedMaterial: THREE.Material,
): Promise<ModelPiece[]> {
  let byStore = pieceCache.get(store);
  if (!byStore) pieceCache.set(store, (byStore = new Map()));
  let hit = byStore.get(id);
  if (!hit) {
    hit = (async () => {
      const def = MODELS[id];
      const gltf = await store.gltf(def.pack, def.file);
      gltf.scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const centre = box.getCenter(new THREE.Vector3());
      const { scale } = dims(id);
      const recentre = new THREE.Matrix4()
        .makeScale(scale, scale, scale)
        .multiply(new THREE.Matrix4().makeTranslation(-centre.x, -box.min.y, -centre.z));

      const meshes: THREE.Mesh[] = [];
      gltf.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && !(o as THREE.SkinnedMesh).isSkinnedMesh)
          meshes.push(o as THREE.Mesh);
      });

      const pieces: ModelPiece[] = [];
      const merged = bakeUntextured(meshes.filter((m) => !hasTexture(m)));
      if (merged) {
        merged.computeBoundingSphere();
        owned.push(merged);
        pieces.push({
          geometry: merged,
          material: bakedMaterial,
          local: new THREE.Matrix4(),
          owned: true,
          recentre,
        });
      }
      for (const mesh of meshes.filter(hasTexture)) {
        const source = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
        const material = tier === 'low' ? lite(source) : source;
        if (material !== source) owned.push(material);
        const mirrored = mesh.matrixWorld.determinant() < 0;
        const geometry = mirrored ? withFlippedWinding(mesh.geometry) : mesh.geometry;
        if (mirrored) owned.push(geometry);
        geometry.computeBoundingSphere();
        pieces.push({
          geometry,
          material,
          local: mesh.matrixWorld.clone(),
          owned: false,
          recentre,
        });
      }
      return pieces;
    })();
    byStore.set(id, hit);
  }
  return hit;
}
