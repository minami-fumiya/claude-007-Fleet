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
  /** Node of a multi-battle campaign sortie (#53): battle number, battles in all, and whether it is the boss */
  sortie?: { node: number; battles: number; boss: boolean };
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
  /** The event that changed this battle's reward (#89), shown on its own line */
  event?: string;
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
  /** What the route held on the way to this battle (#53), e.g. "資源マス: 燃料 120 を回収" */
  route?: string;
  /** A won node before the boss (#53): the results offer 進撃 / 撤退 */
  advance?: boolean;
  /** Who drops out (大破) or what the route held, shown above 進撃 */
  advanceNote?: string;
  /** Battle setup RETRY replays directly (scenarios); absent = back to the Fleet Builder */
  retry?: IBattleInitData;
}
