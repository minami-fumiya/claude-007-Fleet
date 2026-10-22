import { describe, it, expect } from 'vitest';
import { bauxiteCarriersPerHour, ECONOMY, hourBudget, steelBuildsPerHour, steelToFuel } from '@/systems/EconomyModel';
import { RESOURCE_KEYS } from '@/systems/ResourceSystem';

/**
 * Economy targets (#222), checked at every release's balance review (#223, `npm run balance` prints the figures).
 * A typical hour of each stage comes from src/data/economy.json.
 */
describe('economy (#222)', () => {
  for (const phase of ECONOMY.phases) {
    describe(phase.label, () => {
      const b = hourBudget(phase);

      it('earns at least 80% of what it spends, in every resource (before building)', () => {
        for (const k of RESOURCE_KEYS) {
          if (b.totalOut[k] === 0) continue;
          expect(b.totalIn[k], `${phase.id} ${k}`).toBeGreaterThanOrEqual(b.totalOut[k] * 0.8);
        }
      });

      it('quests pay 30〜50% of what battles do in fuel and ammo (#180)', () => {
        for (const k of ['fuel', 'ammo'] as const) {
          const share = b.income.quest[k] / b.income.battle[k];
          expect(share, `${phase.id} ${k}`).toBeGreaterThanOrEqual(0.3);
          expect(share, `${phase.id} ${k}`).toBeLessThanOrEqual(0.5);
        }
      });

      it("saves the steel for at least one of the stage's ships an hour", () => {
        expect(steelBuildsPerHour(b), phase.id).toBeGreaterThanOrEqual(1);
      });

      const builds = (k: 'fuel' | 'ammo' | 'steel'): number => (b.buildCost[k] > 0 ? b.net[k] / b.buildCost[k] : Infinity);

      it('steel is not the resource that stops building (#296: it kept up with only half of fuel in 0.0.38)', () => {
        // Builds per hour each resource's surplus pays for; steel must keep up with 80% of fuel and ammo.
        expect(steelBuildsPerHour(b), phase.id).toBeGreaterThanOrEqual(0.8 * Math.min(builds('fuel'), builds('ammo')));
      });

      it('earns about 250 gold an hour (#321: 200〜350; it had fallen to about 190)', () => {
        expect(b.gold, phase.id).toBeGreaterThanOrEqual(200);
        expect(b.gold, phase.id).toBeLessThanOrEqual(350);
      });

      it('bauxite builds a carrier an hour where the stage builds one (#321: 0.49 in 0.0.39)', () => {
        expect(bauxiteCarriersPerHour(b), phase.id).toBeGreaterThanOrEqual(1);
      });

      it('no resource piles up past three times the scarcest one, in builds (#296)', () => {
        const all = (['fuel', 'ammo', 'steel'] as const).map(builds);
        expect(Math.max(...all), phase.id).toBeLessThanOrEqual(3 * Math.min(...all));
      });
    });
  }

  it('covers the early, middle and late game; the late game builds a carrier, and the bases discount building (#321)', () => {
    expect(ECONOMY.phases.map((p) => p.id)).toEqual(['early', 'mid', 'late']);
    expect(ECONOMY.phases[2].carrier).toBeDefined();
    expect(ECONOMY.phases[2].baseBuildMul).toBeLessThan(1);
    // The shop turns surplus steel into fuel at a loss (it is a way out, not a mill).
    expect(steelToFuel()).toBeGreaterThan(0);
    expect(steelToFuel()).toBeLessThan(1000);
  });
});
