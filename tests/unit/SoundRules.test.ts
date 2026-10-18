import { describe, it, expect } from 'vitest';
import { distanceGain, SoundThrottle } from '@/systems/SoundRules';

describe('SoundRules', () => {
  it('throttles repeats of the same kind only', () => {
    const t = new SoundThrottle();
    expect(t.tryPlay('gun', 0)).toBe(true);
    expect(t.tryPlay('gun', 30)).toBe(false);
    expect(t.tryPlay('explosion', 30)).toBe(true);
    expect(t.tryPlay('gun', 100)).toBe(true);
  });

  it('fades sound with distance', () => {
    expect(distanceGain(0)).toBe(1);
    expect(distanceGain(750, 1500)).toBeCloseTo(0.25);
    expect(distanceGain(1500, 1500)).toBe(0);
    expect(distanceGain(5000)).toBe(0);
  });
});
