import { describe, expect, it } from 'vitest';
import { pickQuality } from './quality';

describe('pickQuality', () => {
  it('puts a 3 GB phone on Low', () => {
    expect(pickQuality({ deviceMemory: 3, hardwareConcurrency: 8 })).toBe('low');
  });

  it('puts a few-core device on Low', () => {
    expect(pickQuality({ deviceMemory: 8, hardwareConcurrency: 4 })).toBe('low');
  });

  it('puts a data-saver user on Low', () => {
    expect(pickQuality({ deviceMemory: 8, hardwareConcurrency: 8, saveData: true })).toBe('low');
  });

  it('starts on High when the browser hides its hardware', () => {
    expect(pickQuality({})).toBe('high');
  });

  it('lets the player override detection', () => {
    expect(pickQuality({ deviceMemory: 2, override: 'high' })).toBe('high');
    expect(pickQuality({ deviceMemory: 16, hardwareConcurrency: 16, override: 'low' })).toBe('low');
  });
});
