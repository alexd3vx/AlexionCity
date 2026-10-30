import { describe, expect, it } from 'vitest';
import { bubbleMs, follow, followAngle, motionFromSpeed } from './remote-math';

describe('follow', () => {
  it('closes most of the gap in a fraction of a second', () => {
    expect(Math.abs(follow(0, 10, 0.2) - 10)).toBeLessThan(1);
  });

  it('is the same however the time is sliced', () => {
    let a = 0;
    for (let i = 0; i < 10; i++) a = follow(a, 10, 0.02);
    expect(a).toBeCloseTo(follow(0, 10, 0.2), 5);
  });

  it('never overshoots', () => {
    expect(follow(0, 10, 100)).toBeLessThanOrEqual(10);
  });
});

describe('followAngle', () => {
  it('takes the short way round the circle', () => {
    expect(followAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.05)).toBeGreaterThan(Math.PI - 0.1);
  });
});

describe('motionFromSpeed', () => {
  it.each([
    [0, 'idle'],
    [1.5, 'walk'],
    [5, 'run'],
  ] as const)('%d m/s is %s', (speed, motion) => expect(motionFromSpeed(speed)).toBe(motion));
});

describe('bubbleMs', () => {
  it('lasts longer for longer messages, up to a cap', () => {
    expect(bubbleMs('hi')).toBeLessThan(bubbleMs('x'.repeat(100)));
    expect(bubbleMs('x'.repeat(1000))).toBe(9000);
  });
});
