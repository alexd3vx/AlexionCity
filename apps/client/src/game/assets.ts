import type { PackManifest } from '@alexioncity/shared';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { PackLoader } from '../packs/loader';
import { planUpdate } from '../packs/plan';

const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

export const parseGlb = (bytes: ArrayBuffer): Promise<GLTF> =>
  new Promise((resolve, reject) => gltfLoader.parse(bytes, '', resolve, reject));

/**
 * Reads models and data out of the packs already downloaded to this device. A pack counts as
 * available only when every file in it is installed and current, so a half-finished download never
 * leaves the world with missing pieces. Parsed models are kept in memory and shared.
 */
export class AssetStore {
  private readonly parsed = new Map<string, Promise<GLTF>>();

  private constructor(
    private readonly loader: PackLoader,
    private readonly versions: ReadonlyMap<string, string>,
  ) {}

  static async open(loader: PackLoader, manifest: PackManifest): Promise<AssetStore> {
    const plan = planUpdate(await loader.installed(), manifest);
    const versions = new Map(
      manifest.packs.filter((p) => plan.current.includes(p.id)).map((p) => [p.id, p.version]),
    );
    return new AssetStore(loader, versions);
  }

  has(packId: string): boolean {
    return this.versions.has(packId);
  }

  private async bytes(packId: string, path: string): Promise<ArrayBuffer> {
    const version = this.versions.get(packId);
    if (!version) throw new Error(`pack "${packId}" is not downloaded`);
    const data = await this.loader.read(packId, version, path);
    if (!data) throw new Error(`file "${path}" is missing from pack "${packId}"`);
    return data;
  }

  /** Parsed model, shared by everything that asks for the same file. Clone it before changing it. */
  gltf(packId: string, path: string): Promise<GLTF> {
    const key = `${packId}/${path}`;
    let hit = this.parsed.get(key);
    if (!hit) {
      hit = this.bytes(packId, path).then(parseGlb);
      this.parsed.set(key, hit);
    }
    return hit;
  }

  async json<T>(packId: string, path: string): Promise<T> {
    return JSON.parse(new TextDecoder().decode(await this.bytes(packId, path))) as T;
  }
}
