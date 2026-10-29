import { describe, expect, it } from 'vitest';
import { resolveCircles } from './collision';

describe('resolveCircles', () => {
  it('leaves a free position alone', () => {
    expect(resolveCircles(0, 0, 0.4, [{ x: 5, z: 5, r: 1 }])).toEqual({ x: 0, z: 0, hit: false });
  });

  it('pushes a circle out to the combined radius', () => {
    const r = resolveCircles(0.5, 0, 0.4, [{ x: 0, z: 0, r: 1 }]);
    expect(r.hit).toBe(true);
    expect(Math.hypot(r.x, r.z)).toBeCloseTo(1.4);
  });

  it('handles standing exactly on an obstacle centre', () => {
    const r = resolveCircles(0, 0, 0.4, [{ x: 0, z: 0, r: 1 }]);
    expect(r.hit).toBe(true);
    expect(Number.isFinite(r.x) && Number.isFinite(r.z)).toBe(true);
  });

  it('settles between two obstacles', () => {
    const r = resolveCircles(0, 0, 0.4, [
      { x: -1.2, z: 0, r: 1 },
      { x: 1.2, z: 0, r: 1 },
    ]);
    expect(r.hit).toBe(true);
  });
});
