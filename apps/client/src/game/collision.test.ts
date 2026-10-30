import { describe, expect, it } from 'vitest';
import { resolveBoxes, resolveCircles } from './collision';

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

describe('resolveBoxes', () => {
  const box = { x: 0, z: 0, hw: 5, hd: 3 };

  it('leaves a free position alone', () => {
    expect(resolveBoxes(10, 0, 0.4, [box])).toEqual({ x: 10, z: 0, hit: false });
  });

  it('pushes a circle out of a face', () => {
    const r = resolveBoxes(5.1, 0, 0.4, [box]);
    expect(r.hit).toBe(true);
    expect(r.x).toBeCloseTo(5.4);
    expect(r.z).toBeCloseTo(0);
  });

  it('rounds a corner by the circle radius', () => {
    const r = resolveBoxes(5.1, 3.1, 0.4, [box]);
    expect(Math.hypot(r.x - 5, r.z - 3)).toBeCloseTo(0.4);
  });

  it('gets a circle out when its centre is inside the box', () => {
    const r = resolveBoxes(4.5, 0, 0.4, [box]);
    expect(r.x).toBeCloseTo(5.4);
  });

  it('slides along a wall instead of sticking', () => {
    const r = resolveBoxes(2, 3.2, 0.4, [box]);
    expect(r.x).toBeCloseTo(2);
    expect(r.z).toBeCloseTo(3.4);
  });
});
