import { describe, expect, it } from 'vitest';
import {
  canScroll,
  clampScroll,
  isDrag,
  MAX_VELOCITY,
  maxScroll,
  releaseVelocity,
  scrollIntoView,
  stepInertia,
  TAP_THRESHOLD,
  thumbMetrics,
} from '@/utils/ScrollMath';

describe('ScrollMath', () => {
  it('limits the offset to the overflow of the content', () => {
    expect(maxScroll(1000, 400)).toBe(600);
    expect(maxScroll(300, 400)).toBe(0);
    expect(clampScroll(-50, 1000, 400)).toBe(0);
    expect(clampScroll(250, 1000, 400)).toBe(250);
    expect(clampScroll(900, 1000, 400)).toBe(600);
    expect(clampScroll(100, 300, 400)).toBe(0);
    expect(canScroll(1000, 400)).toBe(true);
    expect(canScroll(400, 400)).toBe(false);
  });

  it('tells a tap from a drag by distance moved', () => {
    expect(isDrag(0, TAP_THRESHOLD - 1)).toBe(false);
    expect(isDrag(3, 4)).toBe(false);
    expect(isDrag(0, TAP_THRESHOLD)).toBe(true);
    expect(isDrag(-20, 0)).toBe(true);
  });

  it('measures the release velocity from recent samples (finger up = content up)', () => {
    const samples = [
      { t: 0, y: 500 },
      { t: 900, y: 480 },
      { t: 950, y: 430 },
      { t: 1000, y: 380 },
    ];
    // only the last 100 ms count: 100 px up in 100 ms
    expect(releaseVelocity(samples, 1000)).toBeCloseTo(1);
    expect(releaseVelocity([{ t: 0, y: 0 }, { t: 10, y: 1000 }], 10)).toBe(-MAX_VELOCITY);
    expect(releaseVelocity([{ t: 0, y: 0 }], 0)).toBe(0);
    // a finger that rested before lifting does not fling
    expect(releaseVelocity(samples, 1500)).toBe(0);
  });

  it('glides with friction and stops', () => {
    let state = { offset: 0, velocity: 1, done: false };
    let frames = 0;
    while (!state.done && frames < 1000) {
      state = stepInertia(state.offset, state.velocity, 1000 / 60, 100000, 400);
      frames++;
    }
    expect(state.done).toBe(true);
    expect(state.velocity).toBe(0);
    // sum of a geometric series: v * frame / (1 - friction) ~= 333 px
    expect(state.offset).toBeGreaterThan(250);
    expect(state.offset).toBeLessThan(340);
  });

  it('stops the glide at the ends', () => {
    const top = stepInertia(10, -2, 16, 1000, 400);
    expect(top).toEqual({ offset: 0, velocity: 0, done: true });
    const bottom = stepInertia(590, 2, 16, 1000, 400);
    expect(bottom.offset).toBe(600);
    expect(bottom.done).toBe(true);
  });

  it('sizes and places the scrollbar thumb', () => {
    expect(thumbMetrics(0, 1000, 400, 400)).toEqual({ y: 0, h: 160 });
    expect(thumbMetrics(600, 1000, 400, 400)).toEqual({ y: 240, h: 160 });
    expect(thumbMetrics(300, 1000, 400, 400).y).toBeCloseTo(120);
    expect(thumbMetrics(0, 100000, 400, 400).h).toBe(24);
    expect(thumbMetrics(0, 300, 400, 400)).toEqual({ y: 0, h: 400 });
  });

  it('scrolls just enough to reveal an item', () => {
    expect(scrollIntoView(0, 100, 50, 1000, 400)).toBe(0);
    expect(scrollIntoView(0, 500, 50, 1000, 400)).toBe(150);
    expect(scrollIntoView(300, 200, 50, 1000, 400)).toBe(200);
    expect(scrollIntoView(0, 980, 50, 1000, 400)).toBe(600);
  });
});
