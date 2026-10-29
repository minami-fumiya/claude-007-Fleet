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

/** The best battle of a scenario from one side (#200): a win first, then more sunk, then fewer lost. */
export interface IScenarioBest {
  victory: boolean;
  sunk: number;
  lost: number;
}

/** Wins and losses of one historical scenario by side (force A / B, #177), and each side's best (#200). */
export interface IScenarioRecord {
  wins: Partial<Record<'A' | 'B', number>>;
  losses: Partial<Record<'A' | 'B', number>>;
  best?: Partial<Record<'A' | 'B', IScenarioBest>>;
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
  /** 通算の記録 (#92): figures from 0.0.51 on, counted like the totals (作戦と演習) */
  career?: ICareerStats;
  /** 称号 (#92): the id of the title shown beside the admiral's rank, if one is picked */
  title?: string;
}

/** 通算の記録 (#92): what the player's ships did over every battle since 0.0.51. */
export interface ICareerStats {
  /** Distance sailed by the player's ships, in nautical miles */
  distanceNm: number;
  shellsFired: number;
  shellHits: number;
  torpedoesFired: number;
  torpedoHits: number;
  chargesDropped: number;
  planesDown: number;
  damageTaken: number;
  /** Seconds of battle in all, the longest battle, and the quickest win (0 = none yet) */
  battleSec: number;
  longestSec: number;
  fastestWinSec: number;
  /** Most enemy ships sunk in one battle */
  mostSunk: number;
}

/** What one battle adds to the record. */
export interface IBattleRecordInput {
  victory: boolean;
  /** Class of each enemy warship sunk */
  sunkClasses: ShipClass[];
  damageDealt: number;
  shipsLost: number;
  /** What the ships did this battle (#92); the sums and bests are worked out by the record */
  career?: Partial<Omit<ICareerStats, 'longestSec' | 'fastestWinSec' | 'mostSunk'>>;
}

export interface IMedal {
  id: string;
  name: string;
  description: string;
}
