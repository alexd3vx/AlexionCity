import { createStore, get, set, type UseStore } from 'idb-keyval';
import { type PackManifest } from '@alexioncity/shared';
import { planUpdate, type InstalledPacks, type PackPlan, type UpdatePlan } from './plan';

const CACHE_NAME = 'alexion-packs-v1';
const INSTALLED_KEY = 'installed';

export interface Progress {
  doneBytes: number;
  totalBytes: number;
  file: string;
}

export interface LoaderDeps {
  /** Where packs and manifest.json are served from, for example a CDN URL. */
  base: string;
  fetchFn?: typeof fetch;
  caches?: CacheStorage;
  /** Where the installed-pack record lives. Defaults to IndexedDB. */
  store?: {
    get: () => Promise<InstalledPacks | undefined>;
    set: (v: InstalledPacks) => Promise<void>;
  };
}

export class HashMismatchError extends Error {
  constructor(readonly file: string) {
    super(`Downloaded file failed its integrity check: ${file}`);
  }
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function idbStore(): NonNullable<LoaderDeps['store']> {
  let db: UseStore | undefined;
  const handle = () => (db ??= createStore('alexion', 'packs'));
  return {
    get: () => get<InstalledPacks>(INSTALLED_KEY, handle()),
    set: (v) => set(INSTALLED_KEY, v, handle()),
  };
}

/**
 * Downloads versioned asset packs once and keeps them in Cache Storage, so later visits and
 * updates fetch only what changed. Every file is checked against its manifest hash before it is stored.
 */
export class PackLoader {
  private readonly base: string;
  private readonly fetchFn: typeof fetch;
  private readonly cacheStorage: CacheStorage;
  private readonly store: NonNullable<LoaderDeps['store']>;

  constructor(deps: LoaderDeps) {
    this.base = deps.base.replace(/\/$/, '');
    this.fetchFn = deps.fetchFn ?? ((...a) => fetch(...a));
    this.cacheStorage = deps.caches ?? caches;
    this.store = deps.store ?? idbStore();
  }

  fileUrl(packId: string, version: string, path: string): string {
    return `${this.base}/${packId}/${version}/${path}`;
  }

  async fetchManifest(signal?: AbortSignal): Promise<PackManifest> {
    const res = await this.fetchFn(`${this.base}/manifest.json`, {
      cache: 'no-cache',
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) throw new Error(`Could not load the content list (${res.status})`);
    // a static host that falls back to index.html answers with HTML when no manifest exists
    if (res.headers.get('content-type')?.includes('text/html'))
      throw new Error('no content list found at this address');
    const manifest = (await res.json()) as PackManifest;
    if (manifest.schema !== 1) throw new Error('Content list is a newer format; update the app');
    return manifest;
  }

  async installed(): Promise<InstalledPacks> {
    return (await this.store.get()) ?? {};
  }

  async plan(manifest: PackManifest): Promise<UpdatePlan> {
    return planUpdate(await this.installed(), manifest);
  }

  /** Download the given packs, reporting progress; resolves once everything is verified and stored. */
  async download(
    plans: readonly PackPlan[],
    onProgress?: (p: Progress) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const cache = await this.cacheStorage.open(CACHE_NAME);
    const installed = await this.installed();
    const totalBytes = plans.reduce((sum, p) => sum + p.bytes, 0);
    let doneBytes = 0;

    for (const { pack, files } of plans) {
      const record =
        installed[pack.id]?.version === pack.version
          ? installed[pack.id]!
          : { version: pack.version, files: {} };
      for (const file of files) {
        const url = this.fileUrl(pack.id, pack.version, file.path);
        const res = await this.fetchFn(url, signal ? { signal } : undefined);
        if (!res.ok) throw new Error(`Download failed (${res.status}): ${file.path}`);
        const body = await res.arrayBuffer();
        if ((await sha256Hex(body)) !== file.sha256) throw new HashMismatchError(file.path);
        await cache.put(
          url,
          new Response(body, { headers: { 'content-type': 'model/gltf-binary' } }),
        );
        record.files[file.path] = file.sha256;
        doneBytes += file.bytes;
        onProgress?.({ doneBytes, totalBytes, file: file.path });
      }
      installed[pack.id] = record;
      await this.store.set(installed);
    }
  }

  /** Read a cached file, or undefined if that pack has not been downloaded. */
  async read(packId: string, version: string, path: string): Promise<ArrayBuffer | undefined> {
    const cache = await this.cacheStorage.open(CACHE_NAME);
    const hit = await cache.match(this.fileUrl(packId, version, path));
    return hit?.arrayBuffer();
  }

  /** Delete cached files that belong to packs or versions the manifest no longer lists. */
  async prune(manifest: PackManifest): Promise<void> {
    const keep = new Set(
      manifest.packs.flatMap((p) => p.files.map((f) => this.fileUrl(p.id, p.version, f.path))),
    );
    const cache = await this.cacheStorage.open(CACHE_NAME);
    for (const req of await cache.keys()) if (!keep.has(req.url)) await cache.delete(req);

    const installed = await this.installed();
    const listed = new Map(manifest.packs.map((p) => [p.id, p.version]));
    for (const id of Object.keys(installed))
      if (listed.get(id) !== installed[id]?.version) delete installed[id];
    await this.store.set(installed);
  }
}
