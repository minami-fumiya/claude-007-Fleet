import { describe, it, expect } from 'vitest';
import { forceShips, inZone, placeAt, setupFor } from '@/systems/ScenarioSystem';
import { BATTLE_WORLD } from '@/systems/BattleLayout';
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
import guadalcanal from '@/data/scenarios/guadalcanal.json';
import northCape from '@/data/scenarios/north-cape.json';
import { onIsland, resolveMap } from '@/systems/MapSystem';
import { IMapData } from '@/types/Map';
import openSea from '@/data/maps/open-sea.json';
import archipelago from '@/data/maps/archipelago.json';
import strait from '@/data/maps/strait.json';

const registry = new ShipRegistry([...ijn.ships, ...usn.ships, ...km.ships, ...rn.ships] as IShipData[]);
const SCENARIOS = [midway, leyte, bismarck, guadalcanal, northCape] as unknown as IScenario[];
const MAPS = new Map(([openSea, archipelago, strait] as IMapData[]).map((m) => [m.id, m]));

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
      expect(new Set(f.ships).size, `${sc.id} repeats a ship`).toBe(f.ships.length);
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

  it.each(SCENARIOS)('$id: ships and zones start at sea in both layouts', (sc) => {
    const data = MAPS.get(sc.map);
    expect(data, sc.map).toBeDefined();
    // BattleScene's world (the same square in both orientations)
    for (const [w, h] of [[BATTLE_WORLD.w, BATTLE_WORLD.h]]) {
      const map = resolveMap(data!, w, h);
      for (const f of [sc.forces.A, sc.forces.B]) {
        for (const p of f.positions) expect(onIsland(map, p.x * w, p.y * h, 40), `${sc.id} ${p.x},${p.y}`).toBe(false);
      }
      for (const side of sc.sides) {
        if (side.zone) expect(onIsland(map, side.zone.x * w, side.zone.y * h), `${sc.id} zone`).toBe(false);
      }
    }
  });
});

