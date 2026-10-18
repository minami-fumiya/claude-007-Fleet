import { ShipClass } from './ShipClass';

/** The admiral's career totals (戦績). */
export interface IServiceRecord {
  sorties: number;
  victories: number;
  /** Victories without losing a ship */
  perfectVictories: number;
  /** Enemy ships sunk, by class */
  sunk: Partial<Record<ShipClass, number>>;
  damageDealt: number;
  /** Most damage dealt in one battle */
  bestDamage: number;
  shipsLost: number;
  /** Medal ids awarded so far */
  medals: string[];
}

/** What one battle adds to the record. */
export interface IBattleRecordInput {
  victory: boolean;
  /** Class of each enemy warship sunk */
  sunkClasses: ShipClass[];
  damageDealt: number;
  shipsLost: number;
}

export interface IMedal {
  id: string;
  name: string;
  description: string;
}
