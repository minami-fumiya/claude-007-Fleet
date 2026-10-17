import { describe, it, expect } from 'vitest';
import { forceShips, inZone, placeAt, setupFor } from '@/systems/ScenarioSystem';
import { ShipRegistry } from '@/systems/ShipRegistry';
import { IScenario } from '@/types/Scenario';
import { IShipData } from '@/types/Ship';
import { Objective } from '@/types/Campaign';
import ijn from '@/data/ships/ijn.json';
import usn from '@/data/ships/usn.json';
import km from '@/data/ships/km.json';
import rn from '@/data/ships/rn.json';
import midway from '@/data/scenarios/midway.json';
import leyte from '@/data/scenarios/leyte-gulf.json';
import bismarck from '@/data/scenarios/bismarck-chase.json';

const registry = new ShipRegistry([...ijn.ships, ...usn.ships, ...km.ships, ...rn.ships] as IShipData[]);
const SCENARIOS = [midway, leyte, bismarck] as unknown as IScenario[];

describe('ScenarioSystem', () => {
  it('gives the player the side force and the AI the other', () => {
    const s = setupFor(SCENARIOS[0], 0)!;
    expect(s.player.nation).toBe('USN');
    expect(s.enemy.nation).toBe('IJN');
    expect(setupFor(SCENARIOS[0], 9)).toBeNull();
  });

  it('places points and tests zones in world pixels', () => {
    expect(placeAt({ x: 0.5, y: 0.25 }, 2000, 1000)).toEqual({ x: 1000, y: 250 });
    const zone = { x: 0.5, y: 0.5, r: 0.1 };
    expect(inZone(1000, 550, zone, 2000, 1000)).toBe(true);
    expect(inZone(1000, 650, zone, 2000, 1000)).toBe(false);
  });

  it.each(SCENARIOS)('$id: ships exist, positions match and side goals are consistent', (sc) => {
    for (const f of [sc.forces.A, sc.forces.B]) {
      expect(forceShips(f, registry)).toHaveLength(f.ships.length);
      expect(f.positions).toHaveLength(f.ships.length);
      expect(forceShips(f, registry).every((s) => s.nation === f.nation)).toBe(true);
    }
    for (let i = 0; i < sc.sides.length; i++) {
      const { side, enemy } = setupFor(sc, i)!;
      for (const t of side.targets ?? []) expect(enemy.ships, `${sc.id} target ${t}`).toContain(t);
      const needsZone = [Objective.Breakthrough, Objective.PreventEscape, Objective.Delay].includes(side.objective);
      expect(!!side.zone, `${sc.id} zone`).toBe(needsZone);
      const needsTargets = [Objective.SinkTargets, Objective.PreventEscape, Objective.Delay].includes(side.objective);
      expect((side.targets?.length ?? 0) > 0, `${sc.id} targets`).toBe(needsTargets);
    }
  });
});
