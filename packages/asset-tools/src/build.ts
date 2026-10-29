import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PackManifest, QualityTier } from '@alexioncity/shared';
import { buildPacks, type PackDefinition } from './manifest';
import { optimizeGlb } from './optimize';

export interface PackConfig {
  id: string;
  title: string;
  version: string;
  required: boolean;
  tier?: QualityTier;
  /** Raw files to include: exact paths, or a folder written as `folder/*`. Paths are relative to raw/. */
  include: string[];
  /** Fraction of triangles to keep for this pack, 1 = compress only. */
  ratio?: number;
}

export interface BuildConfig {
  packs: PackConfig[];
}

/** `City Pack/Sports Car.glb` becomes `city-pack/sports-car.glb` so URLs stay simple. */
export function slugPath(rel: string): string {
  return rel
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9./-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/-?\.glb$/, '.glb');
}

export function resolveInclude(include: readonly string[], rawFiles: readonly string[]): string[] {
  const out = new Set<string>();
  for (const pattern of include) {
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -1);
      for (const f of rawFiles) if (f.startsWith(prefix)) out.add(f);
    } else if (rawFiles.includes(pattern)) {
      out.add(pattern);
    } else {
      throw new Error(`pack include "${pattern}" matches no file in raw/`);
    }
  }
  return [...out].sort();
}

export interface BuildAllOptions {
  rawDir: string;
  workDir: string;
  outDir: string;
  gameVersion: string;
  config: BuildConfig;
  rawFiles: string[];
  log?: (line: string) => void;
}

/** Optimize every included model into `workDir`, then publish versioned packs into `outDir`. */
export async function buildAll(opts: BuildAllOptions): Promise<PackManifest> {
  const log = opts.log ?? (() => {});
  const defs: PackDefinition[] = [];

  for (const pack of opts.config.packs) {
    const files = resolveInclude(pack.include, opts.rawFiles);
    const outFiles: string[] = [];
    let before = 0;
    let after = 0;
    for (const rel of files) {
      const input = new Uint8Array(await readFile(path.join(opts.rawDir, rel)));
      const result = await optimizeGlb(input, { ratio: pack.ratio ?? 1 });
      const outRel = slugPath(rel);
      const dest = path.join(opts.workDir, outRel);
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, result.glb);
      outFiles.push(outRel);
      before += result.bytesBefore;
      after += result.bytesAfter;
    }
    log(
      `${pack.id}: ${files.length} model(s), ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB`,
    );
    defs.push({
      id: pack.id,
      title: pack.title,
      version: pack.version,
      required: pack.required,
      ...(pack.tier ? { tier: pack.tier } : {}),
      files: outFiles,
    });
  }

  return buildPacks({
    sourceDir: opts.workDir,
    outDir: opts.outDir,
    gameVersion: opts.gameVersion,
    packs: defs,
  });
}
