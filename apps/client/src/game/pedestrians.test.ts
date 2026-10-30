import { describe, expect, it } from 'vitest';
import { loopPoint, LOOP_HALF } from './pedestrians';

const loop = { cx: 0, cz: 0, half: 10 };

describe('loopPoint', () => {
  it('starts at the north-west corner and walks east along the north edge', () => {
    expect(loopPoint(loop, 0)).toMatchObject({ x: -10, z: -10 });
    expect(loopPoint(loop, 10)).toMatchObject({ x: 0, z: -10 });
  });

  it('turns each corner clockwise', () => {
    expect(loopPoint(loop, 20)).toMatchObject({ x: 10, z: -10 });
    expect(loopPoint(loop, 40)).toMatchObject({ x: 10, z: 10 });
    expect(loopPoint(loop, 60)).toMatchObject({ x: -10, z: 10 });
  });

  it('comes back to the start after one full lap, and handles negative distances', () => {
    expect(loopPoint(loop, 80)).toMatchObject({ x: -10, z: -10 });
    expect(loopPoint(loop, -10)).toMatchObject({ x: -10, z: 0 });
  });

  it('heads along the edge it is walking', () => {
    expect(loopPoint(loop, 5).yaw).toBeCloseTo(Math.PI / 2); // east
    expect(loopPoint(loop, 25).yaw).toBeCloseTo(0); // south
  });

  it('keeps the loop between the tree line and the buildings', () => {
    // buildings front at 30 from the block centre, trees at 33.2
    expect(LOOP_HALF).toBeGreaterThan(30.5);
    expect(LOOP_HALF).toBeLessThan(32.5);
  });
});
