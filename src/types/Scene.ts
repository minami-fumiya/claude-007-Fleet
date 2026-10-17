import { IFleet } from './Fleet';
import { Formation } from './Formation';
import { BattleMode } from './Battle';
import { TimeOfDay, Weather } from './Weather';

export interface IBattleInitData {
  playerFleet: IFleet;
  enemyFleet: IFleet;
  mapKey: string;
  formation?: Formation;
  mode?: BattleMode;
  weather?: Weather;
  time?: TimeOfDay;
  /** Captain id per player fleet slot (same indices as playerFleet.slots) */
  captainIds?: (string | null)[];
}

export interface ICaptainReport {
  name: string;
  level: number;
  gained: number;
  leveledUp: boolean;
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
}
