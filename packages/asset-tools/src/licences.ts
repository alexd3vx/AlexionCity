import type { LicenceEntry, LicenceKind, LicenceStatus } from '@alexioncity/shared';

const KINDS: readonly LicenceKind[] = ['CC0', 'CC-BY', 'CC-BY-SA', 'custom'];
const STATUSES: readonly LicenceStatus[] = ['verified', 'user-attested', 'unknown'];

export interface LicenceReport {
  errors: string[];
  warnings: string[];
}

/**
 * Check the licence manifest against the model files on disk.
 * Errors block a build; warnings are shown but do not.
 *
 * - every model file needs an entry, and every entry needs a file
 * - CC-BY and CC-BY-SA entries need an author so the credits screen can name them
 * - `unknown` or `user-attested` status is a warning until someone verifies the source page
 */
export function validateLicences(raw: unknown, files: readonly string[]): LicenceReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Array.isArray(raw)) {
    return { errors: ['licences.json must be an array of entries'], warnings };
  }

  const seen = new Set<string>();
  raw.forEach((item: unknown, i) => {
    const where = `entry ${i}`;
    if (typeof item !== 'object' || item === null) {
      errors.push(`${where}: not an object`);
      return;
    }
    const e = item as Partial<LicenceEntry>;
    for (const key of ['file', 'pack', 'source'] as const) {
      if (typeof e[key] !== 'string' || e[key] === '') errors.push(`${where}: missing "${key}"`);
    }
    if (!e.licence || !KINDS.includes(e.licence)) errors.push(`${where}: bad "licence"`);
    if (!e.status || !STATUSES.includes(e.status)) errors.push(`${where}: bad "status"`);
    if (typeof e.file !== 'string') return;

    if (seen.has(e.file)) errors.push(`${e.file}: listed more than once`);
    seen.add(e.file);

    if ((e.licence === 'CC-BY' || e.licence === 'CC-BY-SA') && !e.author) {
      errors.push(`${e.file}: ${e.licence} needs an "author" for the credits screen`);
    }
    if (e.status === 'unknown') warnings.push(`${e.file}: licence status unknown`);
    if (e.status === 'user-attested')
      warnings.push(`${e.file}: licence not yet verified at its source`);
  });

  const onDisk = new Set(files);
  for (const f of files) if (!seen.has(f)) errors.push(`${f}: no entry in licences.json`);
  for (const f of seen)
    if (!onDisk.has(f))
      errors.push(`${f}: listed in licences.json but not found in assets-src/raw`);

  return { errors, warnings };
}

/** Build the credits list shown in-game: only entries that require attribution. */
export function creditsFrom(
  entries: readonly LicenceEntry[],
): { file: string; author: string; source: string; licence: LicenceKind }[] {
  return entries
    .filter((e) => e.licence === 'CC-BY' || e.licence === 'CC-BY-SA')
    .map((e) => ({
      file: e.file,
      author: e.author ?? 'Unknown',
      source: e.source,
      licence: e.licence,
    }));
}
