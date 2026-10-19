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
  | 'shipbuilding';

/** One research project (src/data/tech-tree.json). */
export interface ITechNode {
  id: string;
  name: string;
  description: string;
  /** Branch the project belongs to, and its level (1 = I … 5 = V) within the branch */
  branch: TechBranch;
  level: number;
  cost: Partial<IResources>;
  /** Research ids that must be finished first */
  requires: string[];
  /** Bonus to every player ship once researched */
  effects: Partial<IShipModifiers>;
  /** Logistics: multiplies the natural resource regeneration (see `regenMultiplier`) */
  regenMul?: number;
}
