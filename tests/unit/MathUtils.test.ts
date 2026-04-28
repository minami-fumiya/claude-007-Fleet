import { describe, it, expect } from 'vitest';
import { angleBetween, distanceBetween, clamp } from '@/utils/MathUtils';

describe('clamp', () => {
  it('clamps below min', () => expect(clamp(-5, 0, 10)).toBe(0));
  it('clamps above max', () => expect(clamp(15, 0, 10)).toBe(10));
  it('passes value within range', () => expect(clamp(5, 0, 10)).toBe(5));
  it('passes value equal to min', () => expect(clamp(0, 0, 10)).toBe(0));
  it('passes value equal to max', () => expect(clamp(10, 0, 10)).toBe(10));
});

describe('distanceBetween', () => {
  it('calculates 3-4-5 triangle', () => expect(distanceBetween(0, 0, 3, 4)).toBe(5));
  it('returns 0 for same point', () => expect(distanceBetween(5, 5, 5, 5)).toBe(0));
  it('is commutative', () => {
    expect(distanceBetween(0, 0, 10, 10)).toBeCloseTo(distanceBetween(10, 10, 0, 0));
  });
});

describe('angleBetween', () => {
  it('returns 0 for rightward direction', () => {
    expect(angleBetween(0, 0, 1, 0)).toBeCloseTo(0);
  });
  it('returns PI/2 for downward direction', () => {
    expect(angleBetween(0, 0, 0, 1)).toBeCloseTo(Math.PI / 2);
  });
  it('returns PI for leftward direction', () => {
    expect(Math.abs(angleBetween(0, 0, -1, 0))).toBeCloseTo(Math.PI);
  });
  it('returns -PI/2 for upward direction', () => {
    expect(angleBetween(0, 0, 0, -1)).toBeCloseTo(-Math.PI / 2);
  });
});
