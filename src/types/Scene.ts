import { IFleet } from './Fleet';

export interface IBattleInitData {
  playerFleet: IFleet;
  enemyFleet: IFleet;
  mapKey: string;
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
}
