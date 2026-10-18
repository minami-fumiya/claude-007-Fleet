import { IFleet } from './Fleet';
import { Formation } from './Formation';
import { BattleMode } from './Battle';
import { TimeOfDay, Weather } from './Weather';
import { Objective } from './Campaign';

export interface IBattleInitData {
  playerFleet: IFleet;
  enemyFleet: IFleet;
  mapKey: string;
  formation?: Formation;
  mode?: BattleMode;
  weather?: Weather;
  time?: TimeOfDay;
  /** Historical scenario and the side (index into its `sides`) the player commands */
  scenario?: { id: string; side: number };
  /** Campaign area this battle is for (absent for free battles) */
  areaId?: string;
  objective?: Objective;
  /** Captain id per player fleet slot (same indices as playerFleet.slots) */
  captainIds?: (string | null)[];
}

export interface ICaptainReport {
  name: string;
  level: number;
  gained: number;
  leveledUp: boolean;
  /** Already at the top level before this battle: the results show no XP gain */
  maxed?: boolean;
}

export interface IBattleResultData {
  victory: boolean;
  score: number;
  turnsElapsed: number;
  enemiesSunk: number;
  enemiesTotal: number;
  /** Player ships still afloat at the end of the battle */
  survivors: number;
  fleetSize: number;
  durationSec: number;
  captainReports?: ICaptainReport[];
  /** Resources gained / spent replacing aircraft, already formatted */
  reward?: string;
  cost?: string;
  /** Campaign / scenario line, e.g. "海域攻略: 南洋前哨  初回報酬 …" */
  campaign?: string;
  /** Medals awarded in this battle */
  medals?: string[];
  /** Merit line, e.g. "戦功 +115  ·  昇進: 少尉 → 中尉" (#36) */
  merit?: string;
  /** Captains who joined, e.g. "新しい艦長: 坂井 悟 (砲術)" (#44) */
  recruits?: string;
  /** Scene the "back" button returns to (default: the home port) */
  returnScene?: string;
  /** Battle setup RETRY replays directly (scenarios); absent = back to the Fleet Builder */
  retry?: IBattleInitData;
}
