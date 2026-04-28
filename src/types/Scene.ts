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
}
