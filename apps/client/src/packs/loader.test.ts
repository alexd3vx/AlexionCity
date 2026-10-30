import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { type PackManifest } from '@alexioncity/shared';
import { HashMismatchError, PackLoader } from './loader';
import type { InstalledPacks } from './plan';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** Minimal in-memory stand-in for Cache Storage. */
function fakeCaches(): CacheStorage {
  const entries = new Map<string, Response>();
  const cache = {
    put: async (url: string, res: Response) => void entries.set(url, res.clone()),
    match: async (url: string) => entries.get(url)?.clone(),
    keys: async () => [...entries.keys()].map((url) => ({ url }) as Request),
    delete: async (req: Request) => entries.delete(req.url),
  };
  return { open: async () => cache } as unknown as CacheStorage;
}

function memoryStore() {
  let value: InstalledPacks | undefined;
  return { get: async () => value, set: async (v: InstalledPacks) => void (value = v) };
}

const files: Record<string, string> = { 'a.glb': 'AAA', 'b.glb': 'BBBB' };

const manifest = (override: Partial<Record<string, string>> = {}): PackManifest => ({
  schema: 1,
  gameVersion: '1',
  generatedAt: 'x',
  packs: [
    {
      id: 'core',
      title: 'Core',
      version: '1',
      required: true,
      bytes: 7,
      files: Object.entries(files).map(([path, body]) => ({
        path,
        bytes: body.length,
        sha256: override[path] ?? sha(body),
      })),
    },
  ],
});

function server(calls: string[]): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith('/manifest.json')) return new Response(JSON.stringify(manifest()));
    const name = url.split('/').pop() ?? '';
    return name in files ? new Response(files[name]) : new Response('no', { status: 404 });
  }) as typeof fetch;
}

describe('PackLoader', () => {
  it('downloads, verifies and caches, then skips what is already installed', async () => {
    const calls: string[] = [];
    const loader = new PackLoader({
      base: 'https://cdn.test/packs',
      fetchFn: server(calls),
      caches: fakeCaches(),
      store: memoryStore(),
    });

    const first = await loader.plan(manifest());
    const seen: number[] = [];
    await loader.download(first.needed, (p) => seen.push(p.doneBytes));
    expect(seen).toEqual([3, 7]);
    expect(new TextDecoder().decode(await loader.read('core', '1', 'b.glb'))).toBe('BBBB');

    const second = await loader.plan(manifest());
    expect(second.needed).toEqual([]);
    expect(second.current).toEqual(['core']);
  });

  it('re-downloads only the file that changed', async () => {
    const calls: string[] = [];
    const loader = new PackLoader({
      base: 'https://cdn.test/packs',
      fetchFn: server(calls),
      caches: fakeCaches(),
      store: memoryStore(),
    });
    await loader.download((await loader.plan(manifest())).needed);
    calls.length = 0;

    // same version, but b.glb now has a different expected hash
    files['b.glb'] = 'BBBB2';
    const next = await loader.plan(manifest());
    expect(next.needed[0]?.files.map((f) => f.path)).toEqual(['b.glb']);
    await loader.download(next.needed);
    expect(calls).toEqual(['https://cdn.test/packs/core/1/b.glb']);
    files['b.glb'] = 'BBBB';
  });

  it('reports a missing manifest clearly when the host answers with a page', async () => {
    const html = (async () =>
      new Response('<!doctype html>', {
        headers: { 'content-type': 'text/html' },
      })) as typeof fetch;
    const loader = new PackLoader({
      base: 'https://cdn.test/packs',
      fetchFn: html,
      caches: fakeCaches(),
      store: memoryStore(),
    });
    await expect(loader.fetchManifest()).rejects.toThrow('no content list found');
  });

  it('rejects a file whose bytes do not match the manifest hash', async () => {
    const loader = new PackLoader({
      base: 'https://cdn.test/packs',
      fetchFn: server([]),
      caches: fakeCaches(),
      store: memoryStore(),
    });
    const plan = await loader.plan(manifest({ 'a.glb': sha('tampered') }));
    await expect(loader.download(plan.needed)).rejects.toBeInstanceOf(HashMismatchError);
  });

  it('prunes cached files the manifest no longer lists', async () => {
    const caches = fakeCaches();
    const store = memoryStore();
    const loader = new PackLoader({
      base: 'https://cdn.test/packs',
      fetchFn: server([]),
      caches,
      store,
    });
    await loader.download((await loader.plan(manifest())).needed);

    const trimmed = manifest();
    trimmed.packs[0]!.files = trimmed.packs[0]!.files.filter((f) => f.path === 'a.glb');
    await loader.prune(trimmed);
    expect(await loader.read('core', '1', 'b.glb')).toBeUndefined();
    expect(await loader.read('core', '1', 'a.glb')).toBeDefined();
  });
});
