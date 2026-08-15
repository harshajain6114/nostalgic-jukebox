import { describe, it, expect } from 'vitest';
import { sampleFromExchange, estimateOffset, elapsedAt } from './clock';

describe('sampleFromExchange', () => {
  it('computes zero offset for a symmetric exchange', () => {
    const s = sampleFromExchange({ t0: 1000, t1: 1050, t2: 1050, t3: 1100 });
    expect(s.offset).toBe(0);
    expect(s.rtt).toBe(100);
  });
  it('detects a server clock ahead by 500ms', () => {
    const s = sampleFromExchange({ t0: 1000, t1: 1550, t2: 1550, t3: 1100 });
    expect(s.offset).toBe(500);
    expect(s.rtt).toBe(100);
  });
});

describe('estimateOffset', () => {
  it('returns 0 for no samples', () => { expect(estimateOffset([])).toBe(0); });
  it('averages low-rtt samples, downweights a jittery outlier', () => {
    const samples = [
      { offset: 200, rtt: 20 }, { offset: 210, rtt: 22 },
      { offset: 190, rtt: 21 }, { offset: 900, rtt: 400 },
    ];
    const result = estimateOffset(samples);
    expect(result).toBeGreaterThan(190);
    expect(result).toBeLessThan(220);
  });
});

describe('elapsedAt', () => {
  it('returns 0 at track start', () => { expect(elapsedAt(10_000, 10_000)).toBe(0); });
  it('MID-TRACK JOIN: returns correct elapsed time', () => {
    expect(elapsedAt(10_000, 47_500)).toBe(37_500);
  });
  it('clamps to 0 if now is before start', () => { expect(elapsedAt(10_000, 9_000)).toBe(0); });
  it('clamps to track duration for a very late joiner', () => {
    expect(elapsedAt(0, 500_000, 180_000)).toBe(180_000);
  });
});
