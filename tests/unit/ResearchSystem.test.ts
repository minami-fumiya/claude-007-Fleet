import { describe, it, expect } from 'vitest';
import { availableShips, canResearch, FICTIONAL_TECH, research, researchModifiers, techTier, unlockedUpgrades } from '@/systems/ResearchSystem';
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

