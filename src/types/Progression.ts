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
}

/** One research project (src/data/tech-tree.json). */
export interface ITechNode {
  id: string;
  name: string;
  description: string;
  cost: Partial<IResources>;
  /** Research ids that must be finished first */
  requires: string[];
  /** Bonus to every player ship once researched */
  effects: Partial<IShipModifiers>;
}
