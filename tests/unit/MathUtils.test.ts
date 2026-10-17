import { describe, it, expect } from 'vitest';
import { angleBetween, distanceBetween, clamp, stickVector, wrapDegrees, rotateTowardsDegrees } from '@/utils/MathUtils';

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

describe('stickVector', () => {
  it('returns zero for no offset', () => expect(stickVector(0, 0, 50).magnitude).toBe(0));
  it('returns zero inside dead zone', () => expect(stickVector(5, 0, 50, 0.15).magnitude).toBe(0));
  it('clamps beyond radius to magnitude 1', () => {
    const v = stickVector(200, 0, 50);
    expect(v.magnitude).toBeCloseTo(1);
    expect(v.x).toBeCloseTo(1);
    expect(v.y).toBeCloseTo(0);
  });
  it('keeps direction for diagonal input', () => {
    const v = stickVector(-100, -100, 50);
    expect(v.x).toBeCloseTo(-Math.SQRT1_2);
    expect(v.y).toBeCloseTo(-Math.SQRT1_2);
  });
  it('returns zero for non-positive radius', () => expect(stickVector(10, 10, 0).magnitude).toBe(0));
});

describe('wrapDegrees', () => {
  it('wraps 270 to -90', () => expect(wrapDegrees(270)).toBe(-90));
  it('wraps -270 to 90', () => expect(wrapDegrees(-270)).toBe(90));
  it('keeps 180', () => expect(wrapDegrees(180)).toBe(180));
});

describe('rotateTowardsDegrees', () => {
  it('snaps when within step', () => expect(rotateTowardsDegrees(10, 15, 10)).toBe(15));
  it('limits rotation to max step', () => expect(rotateTowardsDegrees(0, 90, 10)).toBe(10));
  it('takes shortest arc across 180', () => expect(rotateTowardsDegrees(170, -170, 5)).toBe(175));
});
