import { describe, it, expect } from 'vitest';
import { AIMode, chooseTarget, decide, IAISelf, IAITarget, isEngageable, scoreTarget, submarineWantsDive, TACTICS } from '@/systems/AIBrain';
import { Nation } from '@/types/Nation';
import { ShipClass } from '@/types/ShipClass';

const self: IAISelf = { x: 0, y: 0, hpFraction: 1, maxRange: 500, hasDepthCharges: false };
const t = (x: number, over: Partial<IAITarget> = {}): IAITarget => ({
  x,
  y: 0,
  alive: true,
  hpFraction: 1,
  shipClass: ShipClass.Cruiser,
  submerged: false,
  detected: true,
  ...over,
});
const KM = TACTICS[Nation.KM];
const USN = TACTICS[Nation.USN];

describe('AIBrain target choice', () => {
  it('ignores dead and undetected targets', () => {
    expect(isEngageable(self, t(100, { alive: false }))).toBe(false);
    expect(isEngageable(self, t(100, { submerged: true, detected: false }))).toBe(false);
    expect(chooseTarget(self, [t(100, { alive: false })], KM)).toBeNull();
  });

  it('only hunters with depth charges go after a detected submerged boat', () => {
    const sub = t(100, { submerged: true, shipClass: ShipClass.Submarine });
    expect(isEngageable(self, sub)).toBe(false);
    expect(isEngageable({ ...self, hasDepthCharges: true }, sub)).toBe(true);
  });

  it('prefers the nearer of two equal targets', () => {
    const near = t(100);
    const far = t(800);
    expect(chooseTarget(self, [far, near], USN)).toBe(near);
  });

  it('KM focuses fire on a damaged ship over a slightly nearer healthy one', () => {
    const healthy = t(200);
    const damaged = t(320, { hpFraction: 0.2 });
    expect(chooseTarget(self, [healthy, damaged], KM)).toBe(damaged);
  });

  it('values battleships above destroyers', () => {
    expect(scoreTarget(self, t(300, { shipClass: ShipClass.Battleship }), USN)).toBeGreaterThan(
      scoreTarget(self, t(300, { shipClass: ShipClass.Destroyer }), USN),
    );
  });

  it('sticks with the current target unless another is clearly better', () => {
    const current = t(300);
    const slightlyBetter = t(260);
    expect(chooseTarget(self, [current, slightlyBetter], USN, current)).toBe(current);
    const muchBetter = t(20, { hpFraction: 0.1 });
    expect(chooseTarget(self, [current, muchBetter], USN, current)).toBe(muchBetter);
  });
});

describe('AIBrain decisions', () => {
  it('engages at the nation preferred range', () => {
    const d = decide(self, [t(300)], TACTICS[Nation.IJN]);
    expect(d.mode).toBe(AIMode.Engage);
    expect(d.preferredRange).toBe(250);
    expect(decide(self, [t(300)], USN).preferredRange).toBeGreaterThan(d.preferredRange);
  });

  it('retreats to a longer range when badly damaged', () => {
    const d = decide({ ...self, hpFraction: 0.2 }, [t(300)], USN);
    expect(d.mode).toBe(AIMode.Retreat);
    expect(d.preferredRange).toBeGreaterThan(500 * USN.preferredRangeFraction);
  });

  it('hunts a detected submarine by running over it', () => {
    const hunter = { ...self, hasDepthCharges: true };
    const d = decide(hunter, [t(300, { submerged: true, shipClass: ShipClass.Submarine })], USN);
    expect(d.mode).toBe(AIMode.Hunt);
    expect(d.preferredRange).toBe(0);
  });

  it('returns no target when nothing is engageable', () => {
    expect(decide(self, [], KM).target).toBeNull();
  });
});

describe('submarineWantsDive', () => {
  it('stays up when no enemy is near', () => {
    expect(submarineWantsDive(2000, 1, false)).toBe(false);
  });

  it('dives when enemies close in with enough air', () => {
    expect(submarineWantsDive(400, 1, false)).toBe(true);
    expect(submarineWantsDive(400, 0.3, false)).toBe(false);
  });

  it('surfaces before the air runs out', () => {
    expect(submarineWantsDive(400, 0.5, true)).toBe(true);
    expect(submarineWantsDive(400, 0.1, true)).toBe(false);
  });
});
