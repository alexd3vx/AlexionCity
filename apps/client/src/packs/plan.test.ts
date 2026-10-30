import { describe, expect, it } from 'vitest';
import { type PackManifest } from '@alexioncity/shared';
import { formatBytes, planUpdate, requiredFirst } from './plan';

const manifest: PackManifest = {
  schema: 1,
  gameVersion: '0.1.0',
  generatedAt: '2026-01-01T00:00:00Z',
  packs: [
    {
      id: 'core',
      title: 'Core',
      version: '2',
      required: true,
      bytes: 300,
      files: [
        { path: 'a.glb', bytes: 100, sha256: 'aa' },
        { path: 'b.glb', bytes: 200, sha256: 'bb2' },
      ],
    },
    {
      id: 'interiors',
      title: 'Interiors',
      version: '1',
      required: false,
      bytes: 50,
      files: [{ path: 'sofa.glb', bytes: 50, sha256: 'ss' }],
    },
  ],
};

describe('planUpdate', () => {
  it('downloads everything on a fresh install', () => {
    const plan = planUpdate({}, manifest);
    expect(plan.needed.map((p) => p.pack.id)).toEqual(['core', 'interiors']);
    expect(plan.needed[0]?.bytes).toBe(300);
  });

  it('fetches only changed files when the version is unchanged', () => {
    const plan = planUpdate(
      {
        core: { version: '2', files: { 'a.glb': 'aa', 'b.glb': 'old' } },
        interiors: { version: '1', files: { 'sofa.glb': 'ss' } },
      },
      manifest,
    );
    expect(plan.needed).toHaveLength(1);
    expect(plan.needed[0]?.files.map((f) => f.path)).toEqual(['b.glb']);
    expect(plan.current).toEqual(['interiors']);
  });

  it('re-downloads a whole pack when its version changes', () => {
    const plan = planUpdate(
      { core: { version: '1', files: { 'a.glb': 'aa', 'b.glb': 'bb2' } } },
      manifest,
    );
    expect(plan.needed.find((p) => p.pack.id === 'core')?.files).toHaveLength(2);
  });

  it('lists installed packs the manifest dropped', () => {
    const plan = planUpdate({ gone: { version: '1', files: {} } }, manifest);
    expect(plan.removed).toEqual(['gone']);
  });
});

describe('helpers', () => {
  it('puts required packs first', () => {
    const plan = planUpdate({}, manifest);
    const reversed = [...plan.needed].reverse();
    expect(requiredFirst(reversed).map((p) => p.pack.id)).toEqual(['core', 'interiors']);
  });

  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
