import { describe, expect, it } from 'vitest';
import { clockLabel, skyAt } from './daynight';

describe('skyAt', () => {
  it('is bright at noon and dark at midnight', () => {
    expect(skyAt(12 * 60).sunIntensity).toBeGreaterThan(skyAt(0).sunIntensity * 3);
    expect(skyAt(12 * 60).hemiIntensity).toBeGreaterThan(skyAt(0).hemiIntensity);
  });

  it('turns windows and lamps on at night and off in the day', () => {
    expect(skyAt(12 * 60).glow).toBe(0);
    expect(skyAt(23 * 60).glow).toBe(1);
    const dusk = skyAt(19 * 60).glow;
    expect(dusk).toBeGreaterThan(0.5);
    expect(dusk).toBeLessThanOrEqual(1);
  });

  it('has no jump at midnight', () => {
    const before = skyAt(24 * 60 - 1);
    const after = skyAt(0);
    expect(Math.abs(before.sunIntensity - after.sunIntensity)).toBeLessThan(0.02);
    expect(before.background).toBe(after.background);
  });

  it('wraps times outside a day', () => {
    expect(skyAt(1440 + 12 * 60)).toEqual(skyAt(12 * 60));
    expect(skyAt(-60).background).toBe(skyAt(23 * 60).background);
  });

  it('gives a unit sun direction that is above the horizon', () => {
    for (let h = 0; h < 24; h += 0.5) {
      const [x, y, z] = skyAt(h * 60).sunDir;
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 5);
      expect(y).toBeGreaterThan(0);
    }
  });

  it('moves the sun from one side to the other during the day', () => {
    expect(Math.sign(skyAt(7 * 60).sunDir[0])).not.toBe(Math.sign(skyAt(17 * 60).sunDir[0]));
  });
});

describe('clockLabel', () => {
  it.each([
    [0, '12:00 AM'],
    [9 * 60 + 31, '9:31 AM'],
    [12 * 60, '12:00 PM'],
    [23 * 60 + 5, '11:05 PM'],
  ])('%i minutes is %s', (minutes, label) => expect(clockLabel(minutes)).toBe(label));
});
