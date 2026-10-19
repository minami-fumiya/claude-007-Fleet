import { IShipModifiers, IUpgradeData } from '@/types/Modifiers';
import { IShipData } from '@/types/Ship';
import { IResources, ITechNode, TechBranch } from '@/types/Progression';
import { ShipClass } from '@/types/ShipClass';
import { combineModifiers } from './CustomizationSystem';
import { canAfford, pay, scaleCost } from './ResourceSystem';
import techTree from '@/data/tech-tree.json';

/** The game's tech tree (src/data/tech-tree.json). */
export const TECH_TREE = techTree.tech as ITechNode[];

/** Branches in display order with their tab labels. */
export const TECH_BRANCHES: ReadonlyArray<{ id: TechBranch; name: string }> = [
  { id: 'gunnery', name: '砲術' },
  { id: 'torpedo', name: '水雷' },
  { id: 'armor', name: '装甲' },
  { id: 'damage_control', name: '応急' },
  { id: 'engine', name: '機関' },
  { id: 'radar', name: '電探' },
  { id: 'aa', name: '対空' },
  { id: 'aviation', name: '航空' },
  { id: 'asw', name: '対潜' },
  { id: 'night', name: '夜戦' },
  { id: 'logistics', name: '補給' },
  { id: 'shipbuilding', name: '建造' },
];

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
export function romanLevel(level: number): string {
  return ROMAN[level] ?? String(level);
}

/** Nodes of one branch, by level (ties keep data order). */
export function branchNodes(tree: ITechNode[], branch: TechBranch): ITechNode[] {
  return tree.filter((n) => n.branch === branch).sort((a, b) => a.level - b.level);
}

/** Finished / total nodes of a branch. */
export function branchProgress(tree: ITechNode[], branch: TechBranch, done: string[]): { done: number; total: number } {
  const nodes = branchNodes(tree, branch);
  return { done: nodes.filter((n) => done.includes(n.id)).length, total: nodes.length };
}

/** Shipbuilding research ids (no stat effect; they gate which classes can be built). */
export const BUILD_TECH = {
  cruiser: 'build_cruiser',
  battleship: 'build_battleship',
  carrier: 'build_carrier',
  submarine: 'build_submarine',
} as const;

/** Research needed to build a class (destroyers need none). */
export const BUILD_TECH_FOR: Partial<Record<ShipClass, string>> = {
  [ShipClass.Cruiser]: BUILD_TECH.cruiser,
  [ShipClass.Battleship]: BUILD_TECH.battleship,
  [ShipClass.Carrier]: BUILD_TECH.carrier,
  [ShipClass.Submarine]: BUILD_TECH.submarine,
};

export function buildUnlocked(shipClass: ShipClass, done: string[]): boolean {
  const need = BUILD_TECH_FOR[shipClass];
  return !need || done.includes(need);
}

/** Multiplier on natural resource regeneration from finished logistics research (1 = none). */
export function regenMultiplier(done: string[], tree: ITechNode[] = TECH_TREE): number {
  return tree.reduce((m, n) => (done.includes(n.id) && n.regenMul ? m * n.regenMul : m), 1);
}

/** Research tree (pure): prerequisites, costs, the fleet-wide bonus and which upgrades are unlocked. */

export function prerequisitesMet(node: ITechNode, done: string[]): boolean {
  return node.requires.every((r) => done.includes(r));
}

/** `costMul` is the current base's research multiplier (#88). */
export function canResearch(node: ITechNode, done: string[], have: IResources, costMul = 1): boolean {
  return !done.includes(node.id) && prerequisitesMet(node, done) && canAfford(have, scaleCost(node.cost, costMul));
}

/** Pays for and completes `node`. Returns null if it can't be researched now. */
export function research(node: ITechNode, done: string[], have: IResources, costMul = 1): { done: string[]; resources: IResources } | null {
  if (!canResearch(node, done, have, costMul)) return null;
  const left = pay(have, scaleCost(node.cost, costMul));
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
