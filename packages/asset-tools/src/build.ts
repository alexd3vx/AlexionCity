import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PackManifest, QualityTier } from '@alexioncity/shared';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import type { AvatarCatalog, AvatarFrame, AvatarPart } from '@alexioncity/shared';
import { extractRig, splitCharacter } from './avatars';
import { buildPacks, type PackDefinition } from './manifest';
import { optimizeGlb } from './optimize';

export interface AvatarOutfitConfig {
  id: string;
  name: string;
  /** Source file, relative to raw/. */
  file: string;
  tags: string[];
}

export interface AvatarFrameConfig {
  id: string;
  /** The skeleton and animations come from this file. */
  rigFrom: string;
  outfits: AvatarOutfitConfig[];
}

export interface PackConfig {
  id: string;
  title: string;
  version: string;
  required: boolean;
  tier?: QualityTier;
  /** Raw files to include: exact paths, or a folder written as `folder/*`. Paths are relative to raw/. */
  include?: string[];
  /** Fraction of triangles to keep for this pack, 1 = compress only. */
  ratio?: number;
  /** Makes this an avatar pack: characters are split into parts and one rig per frame. */
  avatars?: { frames: AvatarFrameConfig[] };
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

/** Pick the idle, walk and run clips by name, ignoring variants such as Idle_Gun or Run_Back. */
export function pickClips(names: readonly string[]): AvatarFrame['clips'] {
  const find = (suffix: string) => {
    const hit = names.find((n) => n.toLowerCase().endsWith(suffix));
    if (!hit) throw new Error(`rig has no "${suffix}" clip; clips are: ${names.join(', ')}`);
    return hit;
  };
  return { idle: find('idle'), walk: find('walk'), run: find('run') };
}

async function buildAvatarFiles(
  rawDir: string,
  workDir: string,
  frames: AvatarFrameConfig[],
): Promise<{ files: string[]; before: number; after: number }> {
  const files: string[] = [];
  let before = 0;
  let after = 0;
  const catalog: AvatarCatalog = { schema: 1, frames: [] };

  const write = async (rel: string, glb: Uint8Array, sourceBytes: number) => {
    const optimized = await optimizeGlb(glb);
    const dest = path.join(workDir, rel);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, optimized.glb);
    files.push(rel);
    before += sourceBytes;
    after += optimized.bytesAfter;
  };

  for (const frame of frames) {
    const rigSource = new Uint8Array(await readFile(path.join(rawDir, frame.rigFrom)));
    const rigGlb = await extractRig(rigSource);
    await write(`${frame.id}/rig.glb`, rigGlb, rigSource.byteLength);
    const rigDoc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(rigGlb);
    const clips = pickClips(
      rigDoc
        .getRoot()
        .listAnimations()
        .map((a) => a.getName()),
    );

    const outfits: AvatarFrame['outfits'] = [];
    for (const outfit of frame.outfits) {
      const source = new Uint8Array(await readFile(path.join(rawDir, outfit.file)));
      const { parts } = await splitCharacter(source);
      const paths: Partial<Record<AvatarPart, string>> = {};
      for (const [slot, glb] of Object.entries(parts) as [AvatarPart, Uint8Array][]) {
        const rel = `${frame.id}/${outfit.id}-${slot}.glb`;
        await write(rel, glb, 0);
        paths[slot] = rel;
      }
      before += source.byteLength; // count each source character once
      outfits.push({ id: outfit.id, name: outfit.name, tags: outfit.tags, parts: paths });
    }
    catalog.frames.push({ id: frame.id, rig: `${frame.id}/rig.glb`, clips, outfits });
  }

  await writeFile(path.join(workDir, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
  files.push('catalog.json');
  return { files, before, after };
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
    if (pack.avatars) {
      const built = await buildAvatarFiles(opts.rawDir, opts.workDir, pack.avatars.frames);
      log(
        `${pack.id}: ${pack.avatars.frames.reduce((n, f) => n + f.outfits.length, 0)} outfit(s) split into parts, ` +
          `${(built.before / 1e6).toFixed(1)} MB -> ${(built.after / 1e6).toFixed(1)} MB`,
      );
      defs.push({
        id: pack.id,
        title: pack.title,
        version: pack.version,
        required: pack.required,
        ...(pack.tier ? { tier: pack.tier } : {}),
        files: built.files,
      });
      continue;
    }
    const files = resolveInclude(pack.include ?? [], opts.rawFiles);
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
