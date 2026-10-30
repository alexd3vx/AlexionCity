import { describe, expect, it } from 'vitest';
import { approachAngle, cameraPose, nextView, VIEWS } from './cameras';

describe('cameraPose', () => {
  it('puts the chase camera behind and above the player', () => {
    const pose = cameraPose('chase', { x: 10, z: 20 }, 0);
    // looking along +z, so the camera sits at smaller z
    expect(pose.position[2]).toBeCloseTo(20 - VIEWS.chase.distance);
    expect(pose.position[0]).toBeCloseTo(10);
    expect(pose.position[1]).toBe(VIEWS.chase.height);
    expect(pose.lookAt).toEqual([10, VIEWS.chase.look, 20]);
  });

  it('follows the yaw around the player', () => {
    const pose = cameraPose('chase', { x: 0, z: 0 }, Math.PI / 2);
    expect(pose.position[0]).toBeCloseTo(-VIEWS.chase.distance);
    expect(pose.position[2]).toBeCloseTo(0, 5);
  });

  it('gets higher from chase to high to overhead', () => {
    const heights = (['chase', 'high', 'overhead'] as const).map(
      (m) => cameraPose(m, { x: 0, z: 0 }, 0).position[1],
    );
    expect(heights).toEqual([...heights].sort((a, b) => a - b));
  });
});

describe('nextView', () => {
  it('cycles through all three and back', () => {
    expect(nextView('chase')).toBe('high');
    expect(nextView('high')).toBe('overhead');
    expect(nextView('overhead')).toBe('chase');
  });
});

describe('approachAngle', () => {
  it('turns the short way around', () => {
    const next = approachAngle(Math.PI - 0.1, -Math.PI + 0.1, 1, 0.5);
    expect(next).toBeGreaterThan(Math.PI - 0.1);
  });

  it('reaches the target when the step is large', () => {
    expect(approachAngle(0, 1, 10, 10)).toBeCloseTo(1);
  });
});
