import { ShipClass } from './ShipClass';

/** Where a battle was fought (#177): 作戦 / 演習 / 史実. */
export type RecordMode = 'campaign' | 'exercise' | 'scenario';

/** The figures of one kind of battle (#177): the same as the career totals, without the medals. */
export interface IModeRecord {
  sorties: number;
  victories: number;
  perfectVictories: number;
  sunk: Partial<Record<ShipClass, number>>;
  damageDealt: number;
  bestDamage: number;
  shipsLost: number;
}

/** Wins and losses of one historical scenario by side (force A / B, #177). */
export interface IScenarioRecord {
  wins: Partial<Record<'A' | 'B', number>>;
  losses: Partial<Record<'A' | 'B', number>>;
}

/**
 * The admiral's career totals (戦績). The totals count campaign battles and exercises (historical scenarios are
 * exhibitions and stay out of them, so medals can't be farmed there); `byMode` splits every battle by kind from
 * 0.0.31 on (#177).
 */
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
  /** The same figures by kind of battle, from 0.0.31 (#177); older battles are only in the totals */
  byMode?: Partial<Record<RecordMode, IModeRecord>>;
  /** Historical scenario results by scenario id (#177) */
  scenarios?: Record<string, IScenarioRecord>;
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
