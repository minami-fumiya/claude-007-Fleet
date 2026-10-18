import { describe, it, expect } from 'vitest';
import {
  availableShips,
  branchNodes,
  branchProgress,
  BUILD_TECH,
  buildUnlocked,
  canResearch,
  FICTIONAL_TECH,
  prerequisitesMet,
  regenMultiplier,
  research,
  researchModifiers,
  romanLevel,
  TECH_BRANCHES,
  TECH_TREE,
  techTier,
  unlockedUpgrades,
} from '@/systems/ResearchSystem';
import { IShipData } from '@/types/Ship';
import { Nation } from '@/types/Nation';
import { ShipClass } from '@/types/ShipClass';
import { resources } from '@/systems/ResourceSystem';
import { ITechNode } from '@/types/Progression';
import { IUpgradeData } from '@/types/Modifiers';
import techTree from '@/data/tech-tree.json';
import upgrades from '@/data/upgrades.json';

const tree = techTree.tech as ITechNode[];
const rich = resources({ fuel: 9999, ammo: 9999, steel: 9999, bauxite: 9999 });
const node = (id: string): ITechNode => tree.find((n) => n.id === id)!;

describe('ResearchSystem', () => {
  it('needs prerequisites and resources', () => {
    expect(canResearch(node('gunnery_2'), [], rich)).toBe(false);
    expect(canResearch(node('gunnery_2'), ['gunnery_1'], rich)).toBe(true);
    expect(canResearch(node('gunnery_1'), [], resources())).toBe(false);
    expect(canResearch(node('gunnery_1'), ['gunnery_1'], rich)).toBe(false);
  });

  it('pays and records research', () => {
    const r = research(node('armor_1'), [], rich)!;
    expect(r.done).toEqual(['armor_1']);
    expect(r.resources.steel).toBe(9999 - 500);
    expect(research(node('armor_1'), r.done, r.resources)).toBeNull();
  });

  it('combines the effects of finished research', () => {
    expect(researchModifiers(tree, []).hpMul).toBe(1);
    expect(researchModifiers(tree, ['armor_1', 'damage_control_1']).hpMul).toBeCloseTo(1.1025);
  });

  it('locks upgrades behind their research', () => {
    const catalog = upgrades.upgrades as IUpgradeData[];
    const free = unlockedUpgrades(catalog, []).map((u) => u.id);
    expect(free).toContain('heavy_shells');
    expect(free).not.toContain('radar');
    expect(unlockedUpgrades(catalog, ['radar_1']).map((u) => u.id)).toContain('radar');
  });

  it('every requirement in the tree and catalog exists and the tree has no cycles', () => {
    const ids = new Set(tree.map((n) => n.id));
    for (const n of tree) for (const r of n.requires) expect(ids.has(r), `${n.id} -> ${r}`).toBe(true);
    for (const u of upgrades.upgrades as IUpgradeData[]) if (u.requires) expect(ids.has(u.requires), u.id).toBe(true);
    expect(techTier(tree, 'gunnery_1')).toBe(0);
    expect(techTier(tree, 'radar_1')).toBe(2);
  });
});

describe('fictional ships research', () => {
  const ship = (id: string, fictional?: boolean): IShipData => ({
    id, name: id, nation: Nation.IJN, shipClass: ShipClass.Battleship, hp: 1, armor: 1, speed: 1, weapons: [], spriteKey: id, fictional,
  });
  const ships = [ship('yamato'), ship('a150', true)];

  it('hides fictional ships until the research is done', () => {
    expect(availableShips(ships, []).map((s) => s.id)).toEqual(['yamato']);
    expect(availableShips(ships, [FICTIONAL_TECH]).map((s) => s.id)).toEqual(['yamato', 'a150']);
  });

  it('is a late node in the tech tree', () => {
    const tree = techTree.tech as ITechNode[];
    expect(tree.some((n) => n.id === FICTIONAL_TECH)).toBe(true);
    expect(techTier(tree, FICTIONAL_TECH)).toBeGreaterThanOrEqual(2);
  });
});


const total = (n: ITechNode): number => Object.values(n.cost).reduce<number>((a, b) => a + (b ?? 0), 0);

describe('tech tree breadth (Sprint 12)', () => {
  it('keeps every node id that existing saves reference', () => {
    const ids = new Set(tree.map((n) => n.id));
    for (const id of ['gunnery_1', 'gunnery_2', 'fire_control', 'torpedo_1', 'armor_1', 'engine_1', 'damage_control_1', 'radar_1', 'aa_1', 'fictional_ships']) {
      expect(ids.has(id), id).toBe(true);
    }
    expect(new Set(tree.map((n) => n.id)).size).toBe(tree.length);
    expect(TECH_TREE).toBe(tree);
  });

  it('has every branch, each with levels I to at least III and at most V', () => {
    expect(TECH_BRANCHES.map((b) => b.id)).toEqual([
      'gunnery', 'torpedo', 'armor', 'damage_control', 'engine', 'radar', 'aa', 'aviation', 'asw', 'night', 'logistics', 'shipbuilding',
    ]);
    for (const b of TECH_BRANCHES) {
      const nodes = branchNodes(tree, b.id);
      const levels = new Set(nodes.map((n) => n.level));
      expect(levels.has(1), b.id).toBe(true);
      expect(Math.max(...levels), b.id).toBeGreaterThanOrEqual(b.id === 'shipbuilding' ? 2 : 3);
      expect(Math.max(...levels), b.id).toBeLessThanOrEqual(5);
    }
    for (const n of tree) expect(TECH_BRANCHES.some((b) => b.id === n.branch), n.id).toBe(true);
    expect(tree.length).toBeGreaterThanOrEqual(35);
    expect(tree.length).toBeLessThanOrEqual(55);
  });

  it('the five combat branches go up to level V', () => {
    for (const b of ['gunnery', 'torpedo', 'armor', 'aa', 'aviation'] as const) {
      expect(Math.max(...branchNodes(tree, b).map((n) => n.level)), b).toBe(5);
    }
  });

  it('costs increase with the level inside every branch', () => {
    for (const b of TECH_BRANCHES) {
      const nodes = branchNodes(tree, b.id);
      for (const n of nodes) {
        for (const lower of nodes.filter((m) => m.level < n.level)) {
          expect(total(n), `${n.id} > ${lower.id}`).toBeGreaterThan(total(lower));
        }
      }
    }
  });

  it('every node is reachable by researching in order, and nothing requires a higher level of its own branch', () => {
    const done: string[] = [];
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const n of tree) {
        if (!done.includes(n.id) && prerequisitesMet(n, done)) {
          done.push(n.id);
          progressed = true;
        }
      }
    }
    expect(done.length).toBe(tree.length);
    for (const n of tree) {
      for (const r of n.requires) {
        const req = node(r);
        if (req.branch === n.branch) expect(req.level, `${n.id} -> ${r}`).toBeLessThan(n.level);
      }
    }
  });

  it('levels II+ need the previous level of the branch (a chain, not a free pick)', () => {
    for (const b of TECH_BRANCHES) {
      if (b.id === 'shipbuilding') continue;
      for (const n of branchNodes(tree, b.id).filter((x) => x.level > 1)) {
        const sameBranch = n.requires.map(node).filter((r) => r.branch === b.id);
        expect(sameBranch.length, n.id).toBeGreaterThan(0);
      }
    }
  });

  it('shipbuilding nodes have the shared ids, prerequisites and no stat effect', () => {
    expect(node(BUILD_TECH.cruiser).requires).toEqual([]);
    expect(node(BUILD_TECH.submarine).requires).toEqual([]);
    expect(node(BUILD_TECH.battleship).requires).toEqual(['build_cruiser']);
    expect(node(BUILD_TECH.carrier).requires).toEqual(['build_cruiser']);
    for (const id of Object.values(BUILD_TECH)) {
      expect(node(id).branch).toBe('shipbuilding');
      expect(node(id).effects).toEqual({});
    }
    expect(researchModifiers(tree, Object.values(BUILD_TECH))).toEqual(researchModifiers(tree, []));
    expect(buildUnlocked(ShipClass.Destroyer, [])).toBe(true);
    expect(buildUnlocked(ShipClass.Battleship, ['build_cruiser'])).toBe(false);
    expect(buildUnlocked(ShipClass.Battleship, ['build_cruiser', 'build_battleship'])).toBe(true);
  });

  it('logistics research multiplies resource regeneration', () => {
    expect(regenMultiplier([])).toBe(1);
    expect(regenMultiplier(['logistics_1'])).toBeCloseTo(1.1);
    expect(regenMultiplier(['logistics_1', 'logistics_2', 'logistics_3'])).toBeCloseTo(1.1 * 1.15 * 1.2);
    expect(regenMultiplier(['gunnery_1', 'unknown'])).toBe(1);
    // Only logistics nodes carry a regeneration bonus.
    for (const n of tree) if (n.regenMul !== undefined) expect(n.branch, n.id).toBe('logistics');
  });

  it('new branches use the new modifiers', () => {
    const all = researchModifiers(tree, tree.map((n) => n.id));
    expect(all.airPowerMul).toBeGreaterThan(1);
    expect(all.planesAdd).toBe(1);
    expect(all.rearmMul).toBeLessThan(1);
    expect(all.sonarMul).toBeGreaterThan(1);
    expect(all.depthChargeMul).toBeGreaterThan(1);
    expect(all.nightAimMul).toBeLessThan(1);
    expect(all.nightVisionMul).toBeGreaterThan(1);
  });

  it('reports branch progress and roman levels', () => {
    expect(branchProgress(tree, 'gunnery', ['gunnery_1', 'fire_control', 'armor_1'])).toEqual({ done: 2, total: branchNodes(tree, 'gunnery').length });
    expect(['I', 'II', 'III', 'IV', 'V'].map((_, i) => romanLevel(i + 1))).toEqual(['I', 'II', 'III', 'IV', 'V']);
  });
});
