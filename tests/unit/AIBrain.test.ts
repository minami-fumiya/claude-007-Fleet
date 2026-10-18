import { describe, it, expect } from 'vitest';
import { AIMode, chooseTarget, FLAGSHIP_PRIORITY, decide, IAISelf, IAITarget, isEngageable, scoreTarget, submarineWantsDive, TACTICS } from '@/systems/AIBrain';
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

describe('nation tactics', () => {
  it('has a profile for every nation', () => {
    for (const nation of Object.values(Nation)) expect(TACTICS[nation], nation).toBeDefined();
  });

  it('SU fights closer and longer than RM, which keeps the range open', () => {
    const su = TACTICS[Nation.SU];
    const rm = TACTICS[Nation.RM];
    expect(su.preferredRangeFraction).toBeLessThan(rm.preferredRangeFraction);
    expect(su.retreatHpFraction).toBeLessThan(rm.retreatHpFraction);
    const hurt = { ...self, hpFraction: 0.3 };
    expect(decide(hurt, [t(300)], su).mode).toBe(AIMode.Engage);
    expect(decide(hurt, [t(300)], rm).mode).toBe(AIMode.Retreat);
  });
});

describe('AIBrain fire distribution (#34)', () => {
  /** Player fleet in line ahead: the flagship battleship leads, three escorts follow. */
  const fleet = (): IAITarget[] => [
    t(300, { shipClass: ShipClass.Battleship, priority: FLAGSHIP_PRIORITY }),
    t(390, { shipClass: ShipClass.Cruiser }),
    t(480, { shipClass: ShipClass.Destroyer }),
    t(570, { shipClass: ShipClass.Destroyer }),
  ];
  const enemies: IAISelf[] = [-120, -40, 40, 120].map((y) => ({ x: -500, y, hpFraction: 1, maxRange: 900, hasDepthCharges: false }));

  /** Each enemy decides in turn, seeing how many of its side already attack each target. */
  function assign(nation: Nation, spread = true): number[] {
    const targets = fleet();
    const counts = targets.map(() => 0);
    for (const e of enemies) {
      const view = targets.map((x, i) => (spread ? { ...x, attackers: counts[i] } : x));
      const pick = chooseTarget(e, view, TACTICS[nation]);
      counts[view.indexOf(pick!)]++;
    }
    return counts;
  }

  it('without the crowd penalty every enemy piles onto the leading flagship', () => {
    expect(assign(Nation.USN, false)[0]).toBe(4);
  });

  it.each([Nation.IJN, Nation.USN, Nation.RN, Nation.FR, Nation.SU, Nation.RM])('%s never puts most of its fleet on the flagship', (nation) => {
    const counts = assign(nation);
    expect(counts[0]).toBeLessThanOrEqual(2);
    expect(counts.filter((c) => c > 0).length).toBeGreaterThanOrEqual(2);
  });

  it('KM still gangs up more than the others', () => {
    const km = Math.max(...assign(Nation.KM));
    const usn = Math.max(...assign(Nation.USN));
    expect(km).toBeGreaterThanOrEqual(usn);
  });

  it('the crowd penalty lowers a target score per other attacker', () => {
    const a = t(300);
    expect(scoreTarget(self, { ...a, attackers: 2 }, USN)).toBeCloseTo(scoreTarget(self, a, USN) - 2 * USN.crowdPenalty);
  });
});
