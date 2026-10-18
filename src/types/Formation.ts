export enum Formation {
  /** 単縦陣 */
  LineAhead = 'LineAhead',
  /** 複縦陣 */
  DoubleLine = 'DoubleLine',
  /** 輪形陣 */
  Circle = 'Circle',
  /** 梯形陣 (#59) */
  Echelon = 'Echelon',
  /** 単横陣 (#59) */
  LineAbreast = 'LineAbreast',
  /** 警戒陣: a vanguard ahead of the flagship, the rest astern (#59) */
  Vanguard = 'Vanguard',
}

export interface IFormationSlotOffset {
  forward: number;
  right: number;
}

export interface IFormationConfig {
  formation: Formation;
  name: string;
  slotOffsets: IFormationSlotOffset[];
}
