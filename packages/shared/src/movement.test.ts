import { describe, expect, it } from 'vitest';
import { isMoveAllowed } from './movement';

describe('isMoveAllowed', () => {
  it('accepts a normal walk', () => {
    expect(isMoveAllowed({ x: 0, z: 0 }, { x: 2, z: 0 }, 1, 'walk')).toBe(true);
  });

  it('rejects walking faster than the limit plus tolerance', () => {
    expect(isMoveAllowed({ x: 0, z: 0 }, { x: 10, z: 0 }, 1, 'walk')).toBe(false);
  });

  it('allows a run that a walk would not', () => {
    expect(isMoveAllowed({ x: 0, z: 0 }, { x: 6, z: 0 }, 1, 'run')).toBe(true);
    expect(isMoveAllowed({ x: 0, z: 0 }, { x: 6, z: 0 }, 1, 'walk')).toBe(false);
  });

  it('rejects non-finite positions and non-positive time steps', () => {
    expect(isMoveAllowed({ x: 0, z: 0 }, { x: Number.NaN, z: 0 }, 1, 'walk')).toBe(false);
    expect(isMoveAllowed({ x: 0, z: 0 }, { x: 1, z: 0 }, 0, 'walk')).toBe(false);
  });
});
