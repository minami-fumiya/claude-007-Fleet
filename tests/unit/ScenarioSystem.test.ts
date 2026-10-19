import { describe, it, expect } from 'vitest';
import { forceShips, inZone, placeAt, scenarioMonth, scenariosIn, setupFor, sortScenarios } from '@/systems/ScenarioSystem';
import { ALL_SCENARIOS } from '@/data/scenarios';
import { BATTLE_WORLD } from '@/systems/BattleLayout';
import { ShipRegistry } from '@/systems/ShipRegistry';
import { IScenario } from '@/types/Scenario';
import { IShipData } from '@/types/Ship';
import { Objective } from '@/types/Campaign';
import ijn from '@/data/ships/ijn.json';
import usn from '@/data/ships/usn.json';
import km from '@/data/ships/km.json';
import rn from '@/data/ships/rn.json';
import rm from '@/data/ships/rm.json';
import { onIsland, resolveMap } from '@/systems/MapSystem';
import { IMapData } from '@/types/Map';
import openSea from '@/data/maps/open-sea.json';
import archipelago from '@/data/maps/archipelago.json';
import strait from '@/data/maps/strait.json';
import atoll from '@/data/maps/atoll.json';
import convoyRoute from '@/data/maps/convoy-route.json';

const registry = new ShipRegistry([...ijn.ships, ...usn.ships, ...km.ships, ...rn.ships, ...rm.ships] as IShipData[]);
const SCENARIOS: IScenario[] = sortScenarios(ALL_SCENARIOS);
const MAPS = new Map(([openSea, archipelago, strait, atoll, convoyRoute] as IMapData[]).map((m) => [m.id, m]));

describe('ScenarioSystem', () => {
  it('gives the player the side force and the AI the other', () => {
    const midway = SCENARIOS.find((x) => x.id === 'midway')!;
    const s = setupFor(midway, 0)!;
    expect(s.player.nation).toBe('USN');
    expect(s.enemy.nation).toBe('IJN');
    expect(setupFor(midway, 9)).toBeNull();
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

  it('thirteen scenarios, oldest first, each in a theater, at most 8 ships a side; the big battles at 6 or more (#71)', () => {
    expect(SCENARIOS).toHaveLength(13);
    expect(new Set(SCENARIOS.map((x) => x.id)).size).toBe(13);
    const months = SCENARIOS.map((x) => scenarioMonth(x.date));
    expect(months.every((m) => m > 193900)).toBe(true);
    expect(months).toEqual([...months].sort((a, b) => a - b));
    for (const sc of SCENARIOS) {
      expect(sc.theater, sc.id).toBeDefined();
      for (const f of [sc.forces.A, sc.forces.B]) expect(f.ships.length, sc.id).toBeLessThanOrEqual(8);
    }
    for (const id of ['midway', 'guadalcanal', 'leyte-gulf']) {
      const sc = SCENARIOS.find((x) => x.id === id)!;
      expect(Math.min(sc.forces.A.ships.length, sc.forces.B.ships.length), id).toBeGreaterThanOrEqual(6);
    }
    expect(scenariosIn(SCENARIOS, 'pacific').length).toBeGreaterThanOrEqual(6);
    expect(scenariosIn(SCENARIOS, 'all')).toHaveLength(13);
  });

  it('fleets where both sides must sink the other are within a factor of two in hull strength', () => {
    const strength = (ids: string[]): number => ids.reduce((sum, id) => {
      const s = registry.byId(id)!;
      return sum + s.hp * (1 + s.armor / 100);
    }, 0);
    for (const sc of SCENARIOS.filter((x) => x.sides.every((s) => s.objective === Objective.SinkTargets))) {
      const r = strength(sc.forces.A.ships) / strength(sc.forces.B.ships);
      expect(r, sc.id).toBeGreaterThan(0.5);
      expect(r, sc.id).toBeLessThan(2);
    }
  });
});
