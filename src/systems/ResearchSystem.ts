import { researchMedal } from './MedalGate';
import { IShipModifiers, IUpgradeData } from '@/types/Modifiers';
import { IShipData, ShipSubtype } from '@/types/Ship';
import { MidClass, midClass } from './ShipKind';
import { IResources, ITechNode, TechBranch } from '@/types/Progression';
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
  { id: 'shipbuilding', name: '水上艦' },
  { id: 'shipbuilding_air', name: '空母・潜水' },
];

/**
 * Where a project falls in the order research opens up (#340): how many projects lead to it, then its branch in
 * display order, then its level. 砲術研究 I (nothing before it) comes before 射撃管制 (after 砲術研究 I).
 */
export function researchOrder(techId: string, tree: readonly ITechNode[] = TECH_TREE): number {
  const depth = (id: string, seen: Set<string> = new Set()): number => {
    const node = tree.find((n) => n.id === id);
    if (!node || seen.has(id)) return 0;
    seen.add(id);
    return 1 + Math.max(0, ...node.requires.map((r) => depth(r, seen)));
  };
  const node = tree.find((n) => n.id === techId);
  if (!node) return Number.MAX_SAFE_INTEGER;
  const branch = TECH_BRANCHES.findIndex((b) => b.id === node.branch);
  return depth(techId) * 10_000 + Math.max(0, branch) * 100 + (node.level ?? 0);
}

/** Levels a branch runs through (#298): each has exactly one project at every level. */
export const TECH_LEVELS = 10;

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
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

/** Shipbuilding research ids of the plain kinds (no stat effect; they gate which ships can be built). */
export const BUILD_TECH = {
  cruiser: 'build_cruiser',
  battleship: 'build_battleship',
  carrier: 'build_carrier',
  submarine: 'build_submarine',
} as const;

/**
 * Research needed to build each 中分類 (#260 #298): one project per kind in the two shipbuilding branches; plain
 * destroyers need none.
 */
export const MID_BUILD_TECH: Record<MidClass, string | undefined> = {
  Battleship: BUILD_TECH.battleship,
  [ShipSubtype.FastBattleship]: 'build_fast_battleship',
  [ShipSubtype.BattleCruiser]: 'build_battlecruiser',
  [ShipSubtype.AviationBattleship]: 'build_aviation_battleship',
  [ShipSubtype.HeavyCruiser]: 'build_heavy_cruiser',
  [ShipSubtype.LightCruiser]: BUILD_TECH.cruiser,
  [ShipSubtype.AACruiser]: 'build_aa_cruiser',
  Destroyer: undefined,
  [ShipSubtype.LeaderDestroyer]: 'build_leader_destroyer',
  [ShipSubtype.AADestroyer]: 'build_aa_destroyer',
  [ShipSubtype.EscortDestroyer]: 'build_escort_destroyer',
  [ShipSubtype.Escort]: 'build_escort',
  FleetCarrier: BUILD_TECH.carrier,
  [ShipSubtype.ArmoredCarrier]: 'build_armored_carrier',
  [ShipSubtype.LightCarrier]: 'build_light_carrier',
  [ShipSubtype.EscortCarrier]: 'build_escort_carrier',
  Submarine: BUILD_TECH.submarine,
  [ShipSubtype.LargeSubmarine]: 'build_large_submarine',
  [ShipSubtype.SubmarineCarrier]: 'build_submarine_carrier',
};

/** Whether a ship of this kind may be built with `done` research. */
export function buildUnlocked(ship: Pick<IShipData, 'shipClass' | 'subtype'>, done: string[]): boolean {
  const need = MID_BUILD_TECH[midClass(ship)];
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

/** Whether the medal the project needs (#169) is held; `medals` undefined skips the check (tests of costs alone). */
export function medalMet(node: Pick<ITechNode, 'id'>, medals?: readonly string[]): boolean {
  const need = researchMedal(node.id);
  return !need || !medals || medals.includes(need);
}

/** Whether the admiral's rank (index) reaches the project's (#298); an undefined rank skips the check (tests of costs alone). */
export function rankMet(node: Pick<ITechNode, 'rank'>, rankIndex?: number): boolean {
  return rankIndex === undefined || rankIndex >= (node.rank ?? 0);
}

/** `costMul` is the current base's research multiplier (#88); `medals` the admiral's (#169); `rankIndex` theirs (#298). */
export function canResearch(node: ITechNode, done: string[], have: IResources, costMul = 1, medals?: readonly string[], rankIndex?: number): boolean {
  return !done.includes(node.id) && prerequisitesMet(node, done) && medalMet(node, medals) && rankMet(node, rankIndex) && canAfford(have, scaleCost(node.cost, costMul));
}

/** Pays for and completes `node`. Returns null if it can't be researched now. */
export function research(node: ITechNode, done: string[], have: IResources, costMul = 1, medals?: readonly string[], rankIndex?: number): { done: string[]; resources: IResources } | null {
  if (!canResearch(node, done, have, costMul, medals, rankIndex)) return null;
  const left = pay(have, scaleCost(node.cost, costMul));
  return left ? { done: [...done, node.id], resources: left } : null;
}

/** Bonus every player ship gets from finished research. */
export function researchModifiers(tree: ITechNode[], done: string[]): IShipModifiers {
  return combineModifiers(...tree.filter((n) => done.includes(n.id)).map((n) => n.effects));
}

/** Upgrades the player may fit: those without a requirement, or whose research is done. */
export function unlockedUpgrades(catalog: IUpgradeData[], done: string[]): IUpgradeData[] {
  // Parts taken from enemies (#150) are never opened by research.
  return catalog.filter((u) => !u.dropFrom && (!u.requires || done.includes(u.requires)));
}

/** 架空艦計画 (#309): planned ships and designs cost less (ShipyardSystem.PLANNED_COST_MUL) and designs go a step further (DesignSystem.designTier). */
export const FICTIONAL_TECH = 'fictional_ships';

/** Depth of a node in the tree (0 = no prerequisites), for laying the tree out in columns. */
export function techTier(tree: ITechNode[], id: string, seen: Set<string> = new Set()): number {
  const node = tree.find((n) => n.id === id);
  if (!node || node.requires.length === 0 || seen.has(id)) return 0;
  seen.add(id);
  return 1 + Math.max(...node.requires.map((r) => techTier(tree, r, seen)));
}
