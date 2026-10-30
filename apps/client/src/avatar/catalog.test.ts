import { describe, expect, it } from 'vitest';
import { type AvatarCatalog } from '@alexioncity/shared';
import {
  defaultSpec,
  HAIR_COLORS,
  normalizeSpec,
  outfitsFor,
  randomSpec,
  SKIN_TONES,
} from './catalog';

const parts = (id: string) => ({
  head: `${id}-h`,
  body: `${id}-b`,
  legs: `${id}-l`,
  feet: `${id}-f`,
});

const catalog: AvatarCatalog = {
  schema: 1,
  frames: [
    {
      id: 'a',
      rig: 'a/rig.glb',
      clips: { idle: 'i', walk: 'w', run: 'r' },
      outfits: [
        { id: 'king', name: 'King', tags: ['costume'], parts: parts('king') },
        { id: 'casual', name: 'Casual', tags: ['everyday'], parts: parts('casual') },
        { id: 'sword', name: 'Sword only', tags: ['everyday'], parts: { body: 'sword-b' } },
      ],
    },
    {
      id: 'b',
      rig: 'b/rig.glb',
      clips: { idle: 'i', walk: 'w', run: 'r' },
      outfits: [{ id: 'suit', name: 'Suit', tags: ['everyday'], parts: parts('suit') }],
    },
  ],
};

describe('outfitsFor', () => {
  it('lists everyday outfits first and skips outfits without that slot', () => {
    expect(outfitsFor(catalog.frames[0]!, 'head').map((o) => o.id)).toEqual(['casual', 'king']);
    expect(outfitsFor(catalog.frames[0]!, 'body').map((o) => o.id)).toContain('sword');
  });
});

describe('defaultSpec', () => {
  it('starts on an everyday outfit in the first frame', () => {
    expect(defaultSpec(catalog)).toMatchObject({
      frame: 'a',
      head: 'casual',
      body: 'casual',
      legs: 'casual',
      feet: 'casual',
    });
  });

  it('can start in another frame', () => {
    expect(defaultSpec(catalog, 'b').frame).toBe('b');
  });
});

describe('normalizeSpec', () => {
  it('keeps a valid mixed spec', () => {
    const spec = { ...defaultSpec(catalog), head: 'king', skin: 's2', hair: 'h8' };
    expect(normalizeSpec(catalog, spec)).toEqual(spec);
  });

  it('replaces outfits that do not exist or do not fit the frame', () => {
    const fixed = normalizeSpec(catalog, { frame: 'b', head: 'king', body: 'nope', legs: 'suit' });
    expect(fixed).toMatchObject({ frame: 'b', head: 'suit', body: 'suit', legs: 'suit' });
  });

  it('falls back for an unknown frame, tone or hair colour', () => {
    const fixed = normalizeSpec(catalog, { frame: 'zzz', skin: 'x', hair: 'y' });
    expect(fixed.frame).toBe('a');
    expect(SKIN_TONES.some((s) => s.id === fixed.skin)).toBe(true);
    expect(HAIR_COLORS.some((s) => s.id === fixed.hair)).toBe(true);
  });

  it('survives nothing at all', () => {
    expect(normalizeSpec(catalog, undefined).frame).toBe('a');
  });
});

describe('randomSpec', () => {
  it('only uses everyday outfits that have the slot, within one frame', () => {
    let seed = 1;
    const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 50; i++) {
      const spec = randomSpec(catalog, rng);
      expect(normalizeSpec(catalog, spec)).toEqual(spec);
      expect(spec.head).not.toBe('king');
    }
  });
});

describe('swatches', () => {
  it('offers a wide range of tones, all distinct', () => {
    expect(SKIN_TONES.length).toBeGreaterThanOrEqual(10);
    expect(new Set(SKIN_TONES.map((s) => s.hex)).size).toBe(SKIN_TONES.length);
  });
});
