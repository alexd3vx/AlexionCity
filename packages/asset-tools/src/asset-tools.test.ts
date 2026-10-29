import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import { creditsFrom, validateLicences } from './licences';
import { buildPacks } from './manifest';
import { optimizeGlb } from './optimize';
import type { LicenceEntry } from '@alexioncity/shared';

const entry = (over: Partial<LicenceEntry> = {}): LicenceEntry => ({
  file: 'a/Car.glb',
  pack: 'city',
  source: 'https://poly.pizza/m/example',
  licence: 'CC0',
  status: 'verified',
  ...over,
});

describe('validateLicences', () => {
  it('passes when every file has a verified entry', () => {
    const r = validateLicences([entry()], ['a/Car.glb']);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('flags a model with no entry and an entry with no model', () => {
    const r = validateLicences([entry({ file: 'gone.glb' })], ['a/Car.glb']);
    expect(r.errors).toContain('a/Car.glb: no entry in licences.json');
    expect(r.errors.some((e) => e.startsWith('gone.glb: listed'))).toBe(true);
  });

  it('requires an author for CC-BY', () => {
    const r = validateLicences([entry({ licence: 'CC-BY' })], ['a/Car.glb']);
    expect(r.errors.some((e) => e.includes('needs an "author"'))).toBe(true);
  });

  it('warns, but does not fail, on user-attested licences', () => {
    const r = validateLicences([entry({ status: 'user-attested' })], ['a/Car.glb']);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(1);
  });

  it('rejects a non-array manifest', () => {
    expect(validateLicences({}, []).errors).toHaveLength(1);
  });
});

describe('creditsFrom', () => {
  it('lists only attribution-required models', () => {
    const credits = creditsFrom([
      entry(),
      entry({ file: 'b.glb', licence: 'CC-BY', author: 'Ada' }),
    ]);
    expect(credits).toEqual([
      { file: 'b.glb', author: 'Ada', source: 'https://poly.pizza/m/example', licence: 'CC-BY' },
    ]);
  });
});

describe('buildPacks', () => {
  it('copies files, hashes them and writes a manifest', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'packs-'));
    const src = path.join(dir, 'src');
    await mkdir(src, { recursive: true });
    await writeFile(path.join(src, 'a.bin'), 'hello');
    const manifest = await buildPacks({
      sourceDir: src,
      outDir: path.join(dir, 'out'),
      gameVersion: '0.1.0',
      now: () => new Date('2026-01-01T00:00:00Z'),
      packs: [{ id: 'core', title: 'Core', version: '1', required: true, files: ['a.bin'] }],
    });
    expect(manifest.packs[0]?.files[0]?.sha256).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
    expect(manifest.packs[0]?.bytes).toBe(5);
    const written = JSON.parse(await readFile(path.join(dir, 'out', 'manifest.json'), 'utf8'));
    expect(written.gameVersion).toBe('0.1.0');
  });
});

describe('optimizeGlb', () => {
  it('simplifies a dense mesh and applies meshopt compression', async () => {
    // a flat grid with plenty of coplanar triangles, which simplify can remove freely
    const n = 40;
    const positions: number[] = [];
    for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) positions.push(x, 0, y);
    const indices: number[] = [];
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const a = y * (n + 1) + x;
        indices.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2);
      }

    const doc = new Document();
    const buffer = doc.createBuffer();
    const prim = doc
      .createPrimitive()
      .setAttribute(
        'POSITION',
        doc
          .createAccessor()
          .setType('VEC3')
          .setArray(new Float32Array(positions))
          .setBuffer(buffer),
      )
      .setIndices(
        doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)).setBuffer(buffer),
      );
    const mesh = doc.createMesh().addPrimitive(prim);
    doc.createScene().addChild(doc.createNode().setMesh(mesh));
    const input = await new NodeIO().writeBinary(doc);

    const result = await optimizeGlb(input, { ratio: 0.2 });
    expect(result.trianglesBefore).toBe(n * n * 2);
    expect(result.trianglesAfter).toBeLessThan(result.trianglesBefore / 2);
    expect(new TextDecoder().decode(result.glb.slice(0, 4000))).toContain(
      'EXT_meshopt_compression',
    );
  });
});
