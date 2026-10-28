import { describe, it, expect } from 'vitest';
import upgradesData from '@/data/upgrades.json';
import {
  availableShips,
  researchOrder,
  branchNodes,
  branchProgress,
  BUILD_TECH,
  buildUnlocked,
  canResearch,
  FICTIONAL_TECH,
  MID_BUILD_TECH,
  prerequisitesMet,
  rankMet,
  regenMultiplier,
  research,
  researchModifiers,
  romanLevel,
  TECH_BRANCHES,
  TECH_LEVELS,
  TECH_TREE,
  techTier,
  unlockedUpgrades,
} from '@/systems/ResearchSystem';
import { IShipData, ShipSubtype } from '@/types/Ship';
import { researchMedal } from '@/systems/MedalGate';
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
    // Research steel was cut by a fifth in 0.0.28 (#222): armor_1 costs 400.
    expect(r.resources.steel).toBe(9999 - 400);
    expect(research(node('armor_1'), r.done, r.resources)).toBeNull();
  });

  it('combines the effects of finished research', () => {
    expect(researchModifiers(tree, []).hpMul).toBe(1);
    expect(researchModifiers(tree, ['armor_1', 'damage_control_1']).hpMul).toBeCloseTo(node('armor_1').effects.hpMul! * node('damage_control_1').effects.hpMul!);
  });

  it('locks upgrades behind their research', () => {
    const catalog = upgrades.upgrades as IUpgradeData[];
    // Every upgrade the arsenal makes needs its research (#72); parts taken from enemies (#150) need none and are never opened by it.
    expect(unlockedUpgrades(catalog, [])).toEqual([]);
    expect(catalog.every((u) => typeof u.requires === 'string' || (u.dropFrom?.length ?? 0) > 0)).toBe(true);
    expect(unlockedUpgrades(catalog, ['gunnery_1']).map((u) => u.id)).toEqual(['heavy_shells']);
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

  it('has every branch, each with exactly one project at every level 1〜10 (#298)', () => {
    expect(TECH_BRANCHES.map((b) => b.id)).toEqual([
      'gunnery', 'torpedo', 'armor', 'damage_control', 'engine', 'radar', 'aa', 'aviation', 'asw', 'night', 'logistics', 'shipbuilding', 'shipbuilding_air',
    ]);
    for (const b of TECH_BRANCHES) {
      expect(branchNodes(tree, b.id).map((n) => n.level), b.id).toEqual(Array.from({ length: TECH_LEVELS }, (_, i) => i + 1));
    }
    for (const n of tree) expect(TECH_BRANCHES.some((b) => b.id === n.branch), n.id).toBe(true);
    expect(tree.length).toBe(TECH_BRANCHES.length * TECH_LEVELS);
  });

  it('ranks rise with the level, and every branch asks a medal of its field at level 5 and 10 (#298)', () => {
    for (const b of TECH_BRANCHES) {
      const nodes = branchNodes(tree, b.id);
      for (let i = 1; i < nodes.length; i++) expect(nodes[i].rank ?? 0, nodes[i].id).toBeGreaterThanOrEqual(nodes[i - 1].rank ?? 0);
      expect(nodes[0].rank, b.id).toBeLessThanOrEqual(2);
      expect(nodes[9].rank, b.id).toBeGreaterThanOrEqual(9);
      expect(researchMedal(nodes[4].id), nodes[4].id).toBeDefined();
      expect(researchMedal(nodes[9].id), nodes[9].id).toBeDefined();
    }
    const n = node('gunnery_6');
    expect(rankMet(n, (n.rank ?? 0) - 1)).toBe(false);
    expect(rankMet(n, n.rank)).toBe(true);
    expect(canResearch(n, ['gunnery_5'], rich, 1, undefined, 0)).toBe(false);
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
      for (const n of branchNodes(tree, b.id).filter((x) => x.level > 1)) {
        const sameBranch = n.requires.map(node).filter((r) => r.branch === b.id);
        expect(sameBranch.length, n.id).toBeGreaterThan(0);
      }
    }
  });

  it('shipbuilding: one project per 中分類 in two branches, no stat effect but the larger air wing (#260 #298)', () => {
    // By ship size (#341): the 水上艦 branch starts at 海防艦.
    expect(node('build_escort').requires).toEqual([]);
    expect(node(BUILD_TECH.cruiser).requires).toEqual(['build_aa_destroyer']);
    expect(node(BUILD_TECH.submarine).requires).toEqual([]);
    for (const [mid, id] of Object.entries(MID_BUILD_TECH)) {
      if (!id) continue;
      expect(['shipbuilding', 'shipbuilding_air'], mid).toContain(node(id).branch);
      expect(node(id).effects, id).toEqual({});
    }
    expect(new Set(Object.values(MID_BUILD_TECH).filter(Boolean)).size).toBe(Object.values(MID_BUILD_TECH).filter(Boolean).length);
    expect(researchModifiers(tree, Object.values(BUILD_TECH))).toEqual(researchModifiers(tree, []));
    const ship = (shipClass: ShipClass, subtype?: ShipSubtype) => ({ shipClass, subtype });
    expect(buildUnlocked(ship(ShipClass.Destroyer), [])).toBe(true);
    expect(buildUnlocked(ship(ShipClass.Destroyer, ShipSubtype.Escort), [])).toBe(false);
    expect(buildUnlocked(ship(ShipClass.Battleship), ['build_cruiser'])).toBe(false);
    expect(buildUnlocked(ship(ShipClass.Battleship), ['build_battleship'])).toBe(true);
    expect(buildUnlocked(ship(ShipClass.Battleship, ShipSubtype.FastBattleship), ['build_battleship'])).toBe(false);
    // Carriers come before the air research (#85).
    expect(node('aviation_1').requires).toContain('build_escort_carrier');
  });

  it('logistics research multiplies resource regeneration', () => {
    expect(regenMultiplier([])).toBe(1);
    // The three old levels' 1.1 × 1.15 × 1.2 spread over ten (#298).
    expect(regenMultiplier(tree.filter((n) => n.branch === 'logistics').map((n) => n.id))).toBeCloseTo(1.1 * 1.15 * 1.2, 2);
    expect(regenMultiplier(['logistics_1'])).toBeGreaterThan(1);
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
    expect(branchProgress(tree, 'gunnery', ['gunnery_1', 'gunnery_2', 'fire_control', 'armor_1'])).toEqual({ done: 2, total: branchNodes(tree, 'gunnery').length });
    expect([1, 2, 3, 4, 5, 10].map(romanLevel)).toEqual(['I', 'II', 'III', 'IV', 'V', 'X']);
  });
});

describe('the order research opens things (#340)', () => {
  it('refits follow it: 射撃指揮装置 (after 射撃管制) comes after the first-level ones', () => {
    const upgrades = (upgradesData as { upgrades: Array<{ id: string; requires?: string; nations?: string[]; dropFrom?: string[] }> }).upgrades.filter((u) => !u.nations && !u.dropFrom);
    const sorted = [...upgrades].sort((a, b) => researchOrder(a.requires ?? '') - researchOrder(b.requires ?? ''));
    expect(sorted[0].id).toBe('heavy_shells');
    expect(sorted.findIndex((u) => u.id === 'fire_director')).toBeGreaterThan(sorted.findIndex((u) => u.id === 'aa_guns'));
    expect(sorted[sorted.length - 1].id).toBe('radar');
    expect(researchOrder('gunnery_1')).toBeLessThan(researchOrder('fire_control'));
  });
});
