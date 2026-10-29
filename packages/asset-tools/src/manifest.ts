import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PackFile, PackManifest, PackManifestEntry, QualityTier } from '@alexioncity/shared';

export interface PackDefinition {
  id: string;
  title: string;
  version: string;
  required: boolean;
  tier?: QualityTier;
  /** Files relative to the source directory. */
  files: string[];
}

export interface BuildOptions {
  sourceDir: string;
  outDir: string;
  gameVersion: string;
  packs: PackDefinition[];
  now?: () => Date;
}

export async function sha256File(file: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(file))
    .digest('hex');
}

/**
 * Copy each pack's files into `<outDir>/<id>/<version>/` and write `<outDir>/manifest.json`.
 * File names carry a content hash in the manifest, so the client re-downloads only what changed.
 */
export async function buildPacks(opts: BuildOptions): Promise<PackManifest> {
  const entries: PackManifestEntry[] = [];

  for (const pack of opts.packs) {
    const files: PackFile[] = [];
    for (const rel of pack.files) {
      const src = path.join(opts.sourceDir, rel);
      const dest = path.join(opts.outDir, pack.id, pack.version, rel);
      await mkdir(path.dirname(dest), { recursive: true });
      await copyFile(src, dest);
      const { size } = await stat(dest);
      files.push({
        path: rel.split(path.sep).join('/'),
        bytes: size,
        sha256: await sha256File(dest),
      });
    }
    entries.push({
      id: pack.id,
      title: pack.title,
      version: pack.version,
      required: pack.required,
      ...(pack.tier ? { tier: pack.tier } : {}),
      bytes: files.reduce((sum, f) => sum + f.bytes, 0),
      files,
    });
  }

  const manifest: PackManifest = {
    schema: 1,
    gameVersion: opts.gameVersion,
    generatedAt: (opts.now?.() ?? new Date()).toISOString(),
    packs: entries,
  };
  await mkdir(opts.outDir, { recursive: true });
  await writeFile(
    path.join(opts.outDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}
