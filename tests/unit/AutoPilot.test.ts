import { describe, it, expect } from 'vitest';
import {
  headingTo,
  pickTarget,
  hitTestTarget,
  inRange,
  engageSteer,
  waypointSteer,
} from '@/systems/AutoPilot';

const bounds = { width: 720, height: 1280 };
const MARGIN = 60;

describe('headingTo', () => {
  it('is 0 for straight up (north)', () => expect(headingTo({ x: 0, y: 0 }, { x: 0, y: -10 })).toBeCloseTo(0));
  it('is 90 for east', () => expect(headingTo({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(90));
  it('is 180 for south', () => expect(headingTo({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(180));
});

describe('pickTarget', () => {
  const a = { x: 100, y: 0, alive: true };
  const b = { x: 50, y: 0, alive: true };
  const dead = { x: 1, y: 0, alive: false };

  it('picks the nearest live candidate', () => expect(pickTarget({ x: 0, y: 0 }, [a, b, dead])).toBe(b));
  it('keeps a live locked target even if farther', () => expect(pickTarget({ x: 0, y: 0 }, [a, b], a)).toBe(a));
  it('falls back to nearest when the lock is dead', () => {
    expect(pickTarget({ x: 0, y: 0 }, [a, b], { ...dead })).toBe(b);
  });
  it('returns null when nobody is alive', () => expect(pickTarget({ x: 0, y: 0 }, [dead])).toBeNull());
});

describe('hitTestTarget', () => {
  const e1 = { x: 100, y: 100, alive: true };
  const e2 = { x: 130, y: 100, alive: true };

  it('hits the nearest candidate within radius', () => expect(hitTestTarget({ x: 125, y: 100 }, [e1, e2], 50)).toBe(e2));
  it('misses outside the radius', () => expect(hitTestTarget({ x: 300, y: 300 }, [e1, e2], 50)).toBeNull());
  it('ignores dead candidates', () => {
    expect(hitTestTarget({ x: 100, y: 100 }, [{ ...e1, alive: false }], 50)).toBeNull();
  });
});

describe('inRange', () => {
  it('is true at exactly the range', () => expect(inRange({ x: 0, y: 0 }, { x: 300, y: 400 }, 500)).toBe(true));
  it('is false beyond the range', () => expect(inRange({ x: 0, y: 0 }, { x: 300, y: 401 }, 500)).toBe(false));
});

describe('engageSteer', () => {
  const self = { x: 360, y: 900 };

  it('closes in at full throttle when far', () => {
    const s = engageSteer(self, { x: 360, y: 200 }, 400, bounds, MARGIN);
    expect(s.throttle).toBe(1);
    expect(s.headingDeg).toBeCloseTo(0);
  });

  it('backs away when too close', () => {
    const s = engageSteer(self, { x: 360, y: 800 }, 400, bounds, MARGIN);
    expect(s.headingDeg).toBeCloseTo(180);
    expect(s.throttle).toBeLessThan(1);
  });

  it('circles the target inside the engage band', () => {
    const s = engageSteer(self, { x: 360, y: 500 }, 400, bounds, MARGIN);
    expect(s.headingDeg).toBeCloseTo(90);
  });

  it('steers back to the centre near an edge', () => {
    const s = engageSteer({ x: 20, y: 640 }, { x: 360, y: 200 }, 400, bounds, MARGIN);
    expect(s.headingDeg).toBeCloseTo(90);
  });
});

describe('waypointSteer', () => {
  it('returns null once arrived', () => expect(waypointSteer({ x: 0, y: 0 }, { x: 5, y: 0 }, 20)).toBeNull());
  it('heads for the waypoint at full throttle when far', () => {
    const s = waypointSteer({ x: 0, y: 0 }, { x: 500, y: 0 }, 20)!;
    expect(s.headingDeg).toBeCloseTo(90);
    expect(s.throttle).toBe(1);
  });
  it('slows down near the waypoint', () => {
    const s = waypointSteer({ x: 0, y: 0 }, { x: 30, y: 0 }, 20)!;
    expect(s.throttle).toBeLessThan(1);
    expect(s.throttle).toBeGreaterThanOrEqual(0.3);
  });
});
