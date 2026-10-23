import { IShipModifiers } from './Modifiers';

/** The four base resources (fuel, ammunition, steel, bauxite). */
export interface IResources {
  fuel: number;
  ammo: number;
  steel: number;
  bauxite: number;
}

/** A ship under repair in a dock. */
export interface IDockJob {
  shipId: string;
  /** Epoch ms when the repair finishes */
  endsAt: number;
  /** Base whose dock it is in (#145); the current base when absent */
  base?: string;
}

/** Items that finish a repair or a build at once (#143). */
export interface IItems {
  /** 高速修理材 */
  fastRepair: number;
  /** 高速建造材 */
  fastBuild: number;
  /** 艦長教本 (#199): a captain's XP +DUPLICATE_CAPTAIN_XP, used on whom the player chooses */
  captainBook: number;
  /** 訓練教範 (#305): a ship's proficiency +10, used on the refit screen */
  trainingManual: number;
}

/**
 * ゴールド and the shop (#183): the admiral's purse, shared by every nation. Earned in battles, first clears, quests,
 * sweeps and with medals; spent in the shop. No real money buys any of it.
 */
export interface IWallet {
  gold: number;
  /** Lifetime gold earned (medals read it) */
  earned: number;
  /** Shop purchases of the current game day, by shop entry id; `day` is the game day they belong to */
  shop: { day: number; bought: Record<string, number> };
}

/** Research branches (系統) of the tech tree, in display order. */
export type TechBranch =
  | 'gunnery'
  | 'torpedo'
  | 'armor'
  | 'damage_control'
  | 'engine'
  | 'radar'
  | 'aa'
  | 'aviation'
  | 'asw'
  | 'night'
  | 'logistics'
  | 'shipbuilding'
  /** 建造 (空母・潜水艦), split off the surface ships in 0.0.42 (#298): ten levels each */
  | 'shipbuilding_air';

/** One research project (src/data/tech-tree.json). */
export interface ITechNode {
  id: string;
  name: string;
  description: string;
  /** Branch the project belongs to, and its level (1 = I … 10 = X, one project a level: #298) within the branch */
  branch: TechBranch;
  level: number;
  /** Rank index the project needs (#298): 准尉 for the first levels up to 中将 for level 10 */
  rank?: number;
  cost: Partial<IResources>;
  /** Research ids that must be finished first */
  requires: string[];
  /** Bonus to every player ship once researched */
  effects: Partial<IShipModifiers>;
  /** Logistics: multiplies the natural resource regeneration (see `regenMultiplier`) */
  regenMul?: number;
}
