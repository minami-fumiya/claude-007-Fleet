import { IShipModifiers, IUpgradeData } from '@/types/Modifiers';
import { IShipData } from '@/types/Ship';
import { IResources, ITechNode } from '@/types/Progression';
import { combineModifiers } from './CustomizationSystem';
import { canAfford, pay } from './ResourceSystem';

/** Research tree (pure): prerequisites, costs, the fleet-wide bonus and which upgrades are unlocked. */

export function prerequisitesMet(node: ITechNode, done: string[]): boolean {
  return node.requires.every((r) => done.includes(r));
}

export function canResearch(node: ITechNode, done: string[], have: IResources): boolean {
  return !done.includes(node.id) && prerequisitesMet(node, done) && canAfford(have, node.cost);
}

/** Pays for and completes `node`. Returns null if it can't be researched now. */
export function research(node: ITechNode, done: string[], have: IResources): { done: string[]; resources: IResources } | null {
  if (!canResearch(node, done, have)) return null;
  const left = pay(have, node.cost);
  return left ? { done: [...done, node.id], resources: left } : null;
}

/** Bonus every player ship gets from finished research. */
export function researchModifiers(tree: ITechNode[], done: string[]): IShipModifiers {
  return combineModifiers(...tree.filter((n) => done.includes(n.id)).map((n) => n.effects));
}

/** Upgrades the player may fit: those without a requirement, or whose research is done. */
export function unlockedUpgrades(catalog: IUpgradeData[], done: string[]): IUpgradeData[] {
  return catalog.filter((u) => !u.requires || done.includes(u.requires));
}

/** Research that unlocks the fictional (planned-only) ships. */
export const FICTIONAL_TECH = 'fictional_ships';

/** Ships the player may build: historical ones, plus fictional ones once their research is done. */
export function availableShips(ships: IShipData[], done: string[]): IShipData[] {
  return done.includes(FICTIONAL_TECH) ? ships : ships.filter((s) => !s.fictional);
}

/** Depth of a node in the tree (0 = no prerequisites), for laying the tree out in columns. */
export function techTier(tree: ITechNode[], id: string, seen: Set<string> = new Set()): number {
  const node = tree.find((n) => n.id === id);
  if (!node || node.requires.length === 0 || seen.has(id)) return 0;
  seen.add(id);
  return 1 + Math.max(...node.requires.map((r) => techTier(tree, r, seen)));
}
