import { type PackFile, type PackManifest, type PackManifestEntry } from '@alexioncity/shared';
/** What this device already holds: pack id -> version and the hash of each file. */
export type InstalledPacks = Record<string, { version: string; files: Record<string, string> }>;

export interface PackPlan {
  pack: PackManifestEntry;
  /** Files that are missing or changed; only these are downloaded. */
  files: PackFile[];
  bytes: number;
}

export interface UpdatePlan {
  /** Packs with something to download. */
  needed: PackPlan[];
  /** Pack ids already complete and current. */
  current: string[];
  /** Installed pack ids the manifest no longer lists; their files can be deleted. */
  removed: string[];
}

/**
 * Work out what to download. A pack needs work when it is not installed, its version changed,
 * or any file hash differs; within a pack only the missing or changed files are fetched, so an
 * update that touches one model does not re-download the whole pack.
 */
export function planUpdate(installed: InstalledPacks, manifest: PackManifest): UpdatePlan {
  const needed: PackPlan[] = [];
  const current: string[] = [];

  for (const pack of manifest.packs) {
    const have = installed[pack.id];
    const sameVersion = have?.version === pack.version;
    const files = pack.files.filter((f) => !sameVersion || have?.files[f.path] !== f.sha256);
    if (files.length === 0) {
      current.push(pack.id);
    } else {
      needed.push({ pack, files, bytes: files.reduce((sum, f) => sum + f.bytes, 0) });
    }
  }

  const listed = new Set(manifest.packs.map((p) => p.id));
  const removed = Object.keys(installed).filter((id) => !listed.has(id));
  return { needed, current, removed };
}

export const requiredFirst = (plans: readonly PackPlan[]): PackPlan[] =>
  [...plans].sort((a, b) => Number(b.pack.required) - Number(a.pack.required));

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
