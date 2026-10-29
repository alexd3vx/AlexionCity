#!/usr/bin/env -S npx tsx
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { creditsFrom, validateLicences } from './licences';
import { buildPacks, type PackDefinition } from './manifest';
import { buildAll, type BuildConfig } from './build';
import { optimizeGlb } from './optimize';
import type { LicenceEntry } from '@alexioncity/shared';

const USAGE = `alexion-assets <command>

  validate  [--root assets-src]
      Check licences.json against the .glb files in <root>/raw. Exits 1 on errors.

  scaffold  [--root assets-src] [--source <url>] [--licence CC0] [--status user-attested]
      Add a licences.json entry for every model that has none. The pack name is the model's
      first folder under raw/. Review and verify the entries by hand afterwards.

  credits   [--root assets-src] [--out credits.json]
      Write the attribution list for models that need credit.

  optimize  <input.glb> <output.glb> [--ratio 0.25] [--error 0.01]
      Simplify (ratio < 1) and meshopt-compress one model. --error is the largest
      allowed distortion as a fraction of model size; raise it to reduce more.

  build     [--root assets-src] [--out packs-out] --game-version <x.y.z>
      Validate licences, optimize every model listed in <root>/packs.json and write versioned
      packs plus manifest.json to --out. Fails if licences.json has errors.

  packs     --config packs.json --src <dir> --out <dir> --game-version <x.y.z>
      Copy files into versioned packs and write manifest.json with hashes.
`;

async function listGlb(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listGlb(full, base)));
    else if (entry.name.toLowerCase().endsWith('.glb'))
      out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out.sort();
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      root: { type: 'string', default: 'assets-src' },
      out: { type: 'string' },
      src: { type: 'string' },
      config: { type: 'string' },
      ratio: { type: 'string' },
      error: { type: 'string' },
      source: { type: 'string', default: 'https://poly.pizza (downloaded by the project owner)' },
      licence: { type: 'string', default: 'CC0' },
      status: { type: 'string', default: 'user-attested' },
      'game-version': { type: 'string' },
    },
  });

  switch (command) {
    case 'validate': {
      const root = values.root as string;
      const raw: unknown = JSON.parse(
        await readFile(path.join(root, 'licences.json'), 'utf8').catch(() => '[]'),
      );
      const rawDir = path.join(root, 'raw');
      // raw model downloads are not in git, so on CI only the manifest format can be checked
      const haveFiles = existsSync(rawDir);
      const files = haveFiles
        ? await listGlb(rawDir)
        : Array.isArray(raw)
          ? raw.map((e: { file?: string }) => e.file ?? '')
          : [];
      if (!haveFiles) console.log(`note: ${rawDir} not found, checking the manifest format only`);
      const { errors, warnings } = validateLicences(raw, files);
      for (const w of warnings) console.warn(`warn  ${w}`);
      for (const e of errors) console.error(`error ${e}`);
      console.log(
        `${files.length} model(s), ${errors.length} error(s), ${warnings.length} warning(s)`,
      );
      return errors.length > 0 ? 1 : 0;
    }
    case 'scaffold': {
      const root = values.root as string;
      const file = path.join(root, 'licences.json');
      const entries = JSON.parse(await readFile(file, 'utf8').catch(() => '[]')) as LicenceEntry[];
      const known = new Set(entries.map((e) => e.file));
      const added: LicenceEntry[] = (await listGlb(path.join(root, 'raw')))
        .filter((f) => !known.has(f))
        .map((f) => ({
          file: f,
          pack: f.split('/')[0] ?? 'unknown',
          source: values.source as string,
          licence: values.licence as LicenceEntry['licence'],
          status: values.status as LicenceEntry['status'],
        }));
      await writeFile(file, `${JSON.stringify([...entries, ...added], null, 2)}\n`);
      console.log(`${added.length} entr${added.length === 1 ? 'y' : 'ies'} added to ${file}`);
      return 0;
    }
    case 'credits': {
      const root = values.root as string;
      const entries = JSON.parse(
        await readFile(path.join(root, 'licences.json'), 'utf8'),
      ) as LicenceEntry[];
      const credits = creditsFrom(entries);
      const out = values.out ?? path.join(root, 'credits.json');
      await writeFile(out, `${JSON.stringify(credits, null, 2)}\n`);
      console.log(`${credits.length} credit(s) written to ${out}`);
      return 0;
    }
    case 'optimize': {
      const [input, output] = positionals;
      if (!input || !output) throw new Error('optimize needs <input.glb> <output.glb>');
      const result = await optimizeGlb(new Uint8Array(await readFile(input)), {
        ratio: values.ratio ? Number(values.ratio) : 1,
        ...(values.error ? { error: Number(values.error) } : {}),
      });
      await mkdir(path.dirname(output), { recursive: true });
      await writeFile(output, result.glb);
      console.log(
        `${path.basename(input)}: ${result.trianglesBefore} -> ${result.trianglesAfter} triangles, ` +
          `${result.bytesBefore} -> ${result.bytesAfter} bytes`,
      );
      return 0;
    }
    case 'build': {
      const root = values.root as string;
      const gameVersion = values['game-version'];
      if (!gameVersion) throw new Error('build needs --game-version');
      const rawDir = path.join(root, 'raw');
      const rawFiles = await listGlb(rawDir);
      const licences: unknown = JSON.parse(
        await readFile(path.join(root, 'licences.json'), 'utf8').catch(() => '[]'),
      );
      const { errors } = validateLicences(licences, rawFiles);
      if (errors.length > 0) {
        for (const e of errors) console.error(`error ${e}`);
        throw new Error('licences.json has errors; fix them before building packs');
      }
      const config = JSON.parse(
        await readFile(path.join(root, 'packs.json'), 'utf8'),
      ) as BuildConfig;
      const out = values.out ?? 'packs-out';
      const manifest = await buildAll({
        rawDir,
        workDir: path.join(out, '.work'),
        outDir: out,
        gameVersion,
        config,
        rawFiles,
        log: (l) => console.log(l),
      });
      const total = manifest.packs.reduce((s, p) => s + p.bytes, 0);
      console.log(
        `manifest.json written: ${manifest.packs.length} pack(s), ${(total / 1e6).toFixed(1)} MB`,
      );
      return 0;
    }
    case 'packs': {
      const { config, src, out } = values;
      const gameVersion = values['game-version'];
      if (!config || !src || !out || !gameVersion)
        throw new Error('packs needs --config, --src, --out and --game-version');
      const packs = JSON.parse(await readFile(config, 'utf8')) as PackDefinition[];
      const manifest = await buildPacks({ sourceDir: src, outDir: out, gameVersion, packs });
      for (const p of manifest.packs)
        console.log(`${p.id}@${p.version}: ${p.files.length} file(s), ${p.bytes} bytes`);
      return 0;
    }
    default:
      console.log(USAGE);
      return command ? 1 : 0;
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
