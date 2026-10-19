import type { ISortieNode } from '@/systems/SortieMapSystem';
import { Formation } from './Formation';
import { Nation } from './Nation';

/** A campaign sortie in progress (#53), kept in the save so it survives closing the game (#138). */
export interface ISortieState {
  areaId: string;
  route: ISortieNode[];
  /** Route index of the battle being fought (or just fought) */
  at: number;
  nation: Nation;
  enemyNation: Nation;
  shipIds: string[];
  captainIds: (string | null)[];
  formation: Formation;
  /** The battle at `at` has been settled: what's left is to advance or retreat */
  fought?: boolean;
}
